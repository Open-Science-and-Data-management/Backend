// chunking — pure functions; ตัดตาม heading/ย่อหน้า pack ถึง ~target token (overlap %) จาก config.toml
// ไม่แตะ DB/HTTP — เรียกตรงจาก service ได้, test-first ที่ tests/unit/files/chunking
import type { ExtractedField } from "./form-extract.js";
import { ff2569Template, type Ff2569Template, type TemplateOption } from "./templates/ff2569.js";

export type DocxBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string };

export type Chunk = {
  chunk_index: number;
  content: string;
  heading_path: string | null;
};

export interface ChunkConfig {
  targetTokens: number;
  overlapPercent: number;
}

/** token estimate แบบ deterministic — นับ whitespace-delimited words */
function tokens(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function joinParagraphs(paras: string[]): string {
  return paras.join("\n\n");
}

/**
 * pack ย่อหน้าถึง ~targetTokens; เกิน → chunk ใหม่ heading เดิม
 * overlap = targetTokens * overlapPercent% ท้ายก้อนก่อน ต่อหัวก้อนใหม่
 * heading ไม่มีเนื้อหาตามหลัง → ไม่เกิด chunk เปล่า; heading_path เป็น "H1 > H2" ล่าสุด, null เมื่อไม่มี heading
 */
export function blocksToChunks(blocks: DocxBlock[], config: ChunkConfig): Chunk[] {
  const overlapTokens = Math.floor((config.targetTokens * config.overlapPercent) / 100);
  const stack: { level: number; text: string }[] = [];
  const chunks: Chunk[] = [];
  let paras: string[] = [];
  let count = 0;

  const flush = (carry: boolean) => {
    if (paras.length === 0) return;
    let content = joinParagraphs(paras);
    if (carry && chunks.length > 0 && overlapTokens > 0) {
      const prevTokens = tokens(chunks[chunks.length - 1].content);
      const overlap = prevTokens.slice(-overlapTokens).join(" ");
      if (overlap.length > 0) content = `${overlap}\n\n${content}`;
    }
    chunks.push({
      chunk_index: chunks.length,
      content,
      heading_path: stack.length === 0 ? null : stack.map((s) => s.text).join(" > "),
    });
    paras = [];
    count = 0;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      flush(false);
      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) stack.pop();
      stack.push({ level: block.level, text: block.text });
      continue;
    }
    const words = tokens(block.text);
    if (words.length === 0) continue;
    if (words.length > config.targetTokens) {
      // ย่อหน้ายาวเกิน target เอง — ตัดเป็นท่อน target โดยแยก chunk
      for (let i = 0; i < words.length; i += config.targetTokens) {
        flush(false);
        paras = [words.slice(i, i + config.targetTokens).join(" ")];
        flush(true);
      }
      continue;
    }
    if (count + words.length > config.targetTokens) flush(true);
    paras.push(block.text);
    count += words.length;
  }
  flush(false);
  return chunks;
}

// ── field-level chunking (fast path FF2569 — SPEC ff2569 Task 4) ────────────

/** meta jsonb ของ chunk จาก fast path — generic path ไม่มี meta (Task 5: `ChunkInsert.meta` optional) */
export interface ChunkMeta {
  template_version: string;
  field_id: string; // canonical จาก template — เลขข้อในเอกสารซ้ำ/เพี้ยน ห้ามใช้เป็น ID (templates/ff2569.ts)
  section_id: string;
  enum_value?: string; // canonical จาก w14:checked — ใช้ filter ตอน search (research §Q8)
  part?: number; // คำตอบยาวแตกหลายก้อน — ก้อนที่ i (1-based)
  parts?: number;
  table_row?: number; // แถวข้อมูล (0-based ไม่นับ header) ของ row-chunk
  parent_chunk_index?: number; // chunk ตารางเต็มของ row-chunk (research §Q5 — ทั้งตารางเป็น parent)
}

export type ChunkWithMeta = Chunk & { meta: ChunkMeta };

interface FieldInfo {
  question: string;
  options?: TemplateOption[];
  tableColumns?: string[];
  parentQuestion?: string; // คำถาม heading ของ repeated field — ต่อ heading_path ของ children
  parentRound?: number; // เลขรอบจาก fieldId "subactivity[2].concept"
}

/** template → lookup ต่อ fieldId — children ของ repeated field ขยายเหมือน buildAnchors */
function expandTemplate(tpl: Ff2569Template): Map<string, FieldInfo> {
  const map = new Map<string, FieldInfo>();
  for (const f of tpl.fields) {
    if (f.repeats && f.children) {
      for (let i = 1; i <= f.repeats; i++) {
        for (const c of f.children) {
          map.set(`${f.fieldId}[${String(i)}].${c.fieldId}`, {
            question: c.question,
            options: c.options,
            tableColumns: c.tableColumns,
            parentQuestion: f.question,
            parentRound: i,
          });
        }
      }
    } else {
      map.set(f.fieldId, { question: f.question, options: f.options, tableColumns: f.tableColumns });
    }
  }
  return map;
}

/** canonical enum value → label ตัวแรกตาม template (ข้อความไทยในเอกสาร) — ไม่เจอคืนค่า canonical */
function enumLabel(value: string, options: TemplateOption[] | undefined): string {
  return options?.find((o) => o.value === value)?.labels[0] ?? value;
}

/** คำตอบยาว > targetTokens → ตัดตามขอบเขตคำ (token model เดียวกับ blocksToChunks) */
function splitParts(text: string, targetTokens: number): string[] {
  const words = tokens(text);
  if (words.length <= targetTokens) return [text];
  const parts: string[] = [];
  for (let i = 0; i < words.length; i += targetTokens) parts.push(words.slice(i, i + targetTokens).join(" "));
  return parts;
}

function tableMarkdown(headers: string[], rows: string[][]): string {
  const lines = [`| ${headers.join(" | ")} |`];
  for (const row of rows) {
    lines.push(`| ${row.map((c) => c.trim().replace(/\s+/g, " ")).join(" | ")} |`);
  }
  return lines.join("\n");
}

/** row-chunk = คำถาม + คู่ header:value เฉพาะช่องที่มีข้อมูล (header เกิน tableColumns → ชื่อ generic) */
function rowContent(question: string, headers: string[], row: string[]): string {
  const pairs: string[] = [];
  for (const [ci, cell] of row.entries()) {
    const v = cell.trim();
    if (v.length === 0) continue;
    pairs.push(`${headers[ci] ?? `คอลัมน์ ${String(ci + 1)}`}: ${v}`);
  }
  return [question, ...pairs].join("\n");
}

/**
 * fields → chunks ต่อ field (fast path FF2569 — SPEC ff2569 Task 4):
 * - คำถามของฟอร์มติดทุก chunk — บริบท retrieval สำคัญกว่าคำตอบเดี่ยว ๆ (research §Q4)
 * - คำตอบยาว > targetTokens → แตก part i/n ทุกก้อน prefix คำถาม (meta.part/parts)
 * - ตาราง → parent chunk (ตารางเต็ม markdown) + row-chunks แนบ header ทุกแถว (research §Q5)
 * - enum/bool → label ที่ติ๊กเท่านั้นเข้าเนื้อหา + meta.enum_value canonical; ตัวเลือกที่ไม่ติ๊ก = boilerplate ไม่เข้า index
 * - คำตอบว่าง / anchor จัดลำดับ (repeat-heading) → ไม่เกิด chunk เปล่า (SPEC §Edge)
 * - image → ยังไม่ chunk — รอ VLM caption (Task 7)
 * `overlapPercent` ไม่ใช้: คำถาม prefix ทำหน้าที่บริบทร่วมแทน overlap ของ generic path
 */
export function fieldsToChunks(
  fields: ExtractedField[],
  config: ChunkConfig,
  tpl: Ff2569Template = ff2569Template,
): ChunkWithMeta[] {
  const sectionTitle = new Map(tpl.sections.map((s) => [s.id, s.title]));
  const info = expandTemplate(tpl);
  const chunks: ChunkWithMeta[] = [];

  for (const f of fields) {
    const fi = info.get(f.fieldId);
    const question = fi?.question ?? f.question;
    const section = sectionTitle.get(f.sectionId) ?? f.sectionId;
    const headingPath = fi?.parentQuestion
      ? [section, fi.parentQuestion.replace("ที่ N", `ที่ ${String(fi.parentRound)}`), question].join(" > ")
      : [section, question].join(" > ");
    const base = { template_version: tpl.version, field_id: f.fieldId, section_id: f.sectionId };
    const push = (content: string, meta: ChunkMeta) => {
      chunks.push({ chunk_index: chunks.length, content, heading_path: headingPath, meta });
    };

    if (f.type === "enum" || f.type === "bool") {
      if (f.enumValue === null) continue; // ไม่มีอะไรติ๊ก — ไม่มีคำตอบให้ index
      push(`${question}: ${enumLabel(f.enumValue, fi?.options)}`, { ...base, enum_value: f.enumValue });
      continue;
    }
    if (f.type === "image") continue;

    if (f.table !== null && f.table.length > 0) {
      const headers = fi?.tableColumns ?? [];
      const parentIndex = chunks.length;
      push(`${question}\n${tableMarkdown(headers, f.table)}`, base);
      for (const [ri, row] of f.table.entries()) {
        const content = rowContent(question, headers, row);
        if (content === question) continue; // แถวว่างทั้งแถว — ไม่เกิด chunk เปล่า
        push(content, { ...base, table_row: ri, parent_chunk_index: parentIndex });
      }
      continue;
    }

    if (f.value === null || f.value.trim().length === 0) continue;
    const parts = splitParts(f.value, config.targetTokens);
    if (parts.length === 1) {
      push(`${question}\n${f.value}`, base);
    } else {
      parts.forEach((part, i) => {
        push(`${question} (${String(i + 1)}/${String(parts.length)})\n${part}`, {
          ...base,
          part: i + 1,
          parts: parts.length,
        });
      });
    }
  }
  return chunks;
}
