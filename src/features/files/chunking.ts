// chunking — pure functions; ตัดตาม heading/ย่อหน้า pack ถึง ~target token (overlap %) จาก config.toml
// ไม่แตะ DB/HTTP — เรียกตรงจาก service ได้, test-first ที่ tests/unit/files/chunking
import type { ExtractedField } from "./form-extract.js";
import { ff2569Template, type Ff2569Template, type TemplateChunkGroup, type TemplateOption } from "./templates/ff2569.js";

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
  tableMaxTokens: number; // cap chunk ตาราง — เกิน → แตก part i/n ตัดที่ขอบแถว (Rev 2, D7)
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
  field_ids: string[]; // canonical จาก template — chunk กลุ่ม = field ทุกตัวในกลุ่ม, field เดี่ยว = [id] (Rev 2, D2)
  section_id: string;
  enum_value?: string; // canonical จาก w14:checked — field เดี่ยวเท่านั้น; ใช้ filter ตอน search (research §Q8)
  part?: number; // คำตอบ/กลุ่มยาวแตกหลายก้อน — ก้อนที่ i (1-based)
  parts?: number;
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

/**
 * ตารางเต็ม markdown ก้อนเดียวถ้า ≤ cap; เกิน → part i/n ตัดที่ขอบแถว (header ติดทุก part) — ห้ามตัดกลางแถว (Rev 2, D7)
 */
function tableParts(question: string, headers: string[], rows: string[][], cap: number): string[] {
  const full = `${question}\n${tableMarkdown(headers, rows)}`;
  if (tokens(full).length <= cap) return [full];
  const groups: string[][][] = [];
  let cur: string[][] = [];
  for (const row of rows) {
    if (cur.length > 0 && tokens(`${question}\n${tableMarkdown(headers, [...cur, row])}`).length > cap) {
      groups.push(cur);
      cur = [];
    }
    cur.push(row);
  }
  if (cur.length > 0) groups.push(cur);
  return groups.map((g, i) => `${question} (${String(i + 1)}/${String(groups.length)})\n${tableMarkdown(headers, g)}`);
}

/**
 * fields → chunks (fast path FF2569 — Rev 2, D2/D3/D6/D7):
 * - field ใน chunkGroup → chunk เดียวของทั้งกลุ่ม: heading_path "section > label", เนื้อหา "คำถาม\nคำตอบ"
 *   เรียงตามลำดับเอกสาร คั่น "\n\n", meta.field_ids ครบทุก field ในกลุ่ม; รวมยาวเกิน targetTokens →
 *   part i/n ตัดก่อนเปิด field ใหม่ (ห้ามตัดกลาง field)
 * - field นอกกลุ่ม → chunk ต่อ field เหมือนเดิม แต่ meta เป็น field_ids: [id]
 * - ตาราง → chunk เดียวตารางเต็ม markdown (ไม่มี row-chunk); ยาวเกิน tableMaxTokens → part i/n ตัดที่ขอบแถว
 * - enum/bool → label ที่ติ๊กเท่านั้น + meta.enum_value (field เดี่ยว); ตัวเลือกไม่ติ๊ก = boilerplate ไม่เข้า index
 * - คำตอบว่าง / anchor จัดลำดับ (repeat-heading) → ไม่เกิด chunk เปล่า (SPEC §Edge)
 * - image → chunk จาก VLM caption ที่ service เติม (Task 7); ไม่มี caption → ไม่เกิด chunk
 * `overlapPercent` ไม่ใช้: คำถาม prefix ทำหน้าที่บริบทร่วมแทน overlap ของ generic path
 */
export function fieldsToChunks(
  fields: ExtractedField[],
  config: ChunkConfig,
  tpl: Ff2569Template = ff2569Template,
): ChunkWithMeta[] {
  const sectionTitle = new Map(tpl.sections.map((s) => [s.id, s.title]));
  const info = expandTemplate(tpl);
  // chunkGroup (Rev 2, D4) — fieldId → group; overlap ตรวจตั้งแต่ template schema (superRefine) แล้ว
  const groupOf = new Map<string, TemplateChunkGroup>();
  for (const g of tpl.chunkGroups ?? []) for (const fid of g.fieldIds) groupOf.set(fid, g);
  const chunks: ChunkWithMeta[] = [];

  /** เนื้อหา field เป็นบล็อกเดียว ("คำถาม\nคำตอบ" หรือ "คำถาม: label") — null = ไม่มีอะไรให้ index (กฎว่างเดิม) */
  const renderBlock = (f: ExtractedField): string | null => {
    const fi = info.get(f.fieldId);
    const question = fi?.question ?? f.question;
    if (f.type === "enum" || f.type === "bool") {
      if (f.enumValue === null) return null; // ไม่มีอะไรติ๊ก — ไม่มีคำตอบให้ index
      return `${question}: ${enumLabel(f.enumValue, fi?.options)}`;
    }
    if (f.type === "image") {
      if (f.caption === undefined || f.caption.trim() === "") return null; // caption จาก VLM (service เติม — Task 7)
      return `${question}\n${f.caption.trim()}`;
    }
    if (f.table !== null && f.table.length > 0) return `${question}\n${tableMarkdown(fi?.tableColumns ?? [], f.table)}`;
    if (f.value === null || f.value.trim().length === 0) return null;
    return `${question}\n${f.value}`;
  };

  const headingPathFor = (f: ExtractedField): string => {
    const fi = info.get(f.fieldId);
    const question = fi?.question ?? f.question;
    const section = sectionTitle.get(f.sectionId) ?? f.sectionId;
    return fi?.parentQuestion
      ? [section, fi.parentQuestion.replace("ที่ N", `ที่ ${String(fi.parentRound)}`), question].join(" > ")
      : [section, question].join(" > ");
  };

  const push = (content: string, headingPath: string, meta: ChunkMeta) => {
    chunks.push({ chunk_index: chunks.length, content, heading_path: headingPath, meta });
  };

  // buffer ของ group เรียงตาม field ตัวแรกที่เจอในเอกสาร
  interface GroupAcc { group: TemplateChunkGroup; sectionId: string; blocks: string[] }
  const groupAcc = new Map<string, GroupAcc>();

  for (const f of fields) {
    const g = groupOf.get(f.fieldId);
    if (g !== undefined) {
      let acc = groupAcc.get(g.id);
      if (acc === undefined) {
        acc = { group: g, sectionId: f.sectionId, blocks: [] };
        groupAcc.set(g.id, acc);
      }
      const block = renderBlock(f);
      if (block !== null) acc.blocks.push(block);
      continue;
    }

    // field นอกกลุ่ม — พฤติกรรมเดิม, meta เป็น field_ids: [id]
    const fi = info.get(f.fieldId);
    const base = { template_version: tpl.version, field_ids: [f.fieldId], section_id: f.sectionId };
    const headingPath = headingPathFor(f);

    if (f.type === "enum" || f.type === "bool") {
      const block = renderBlock(f);
      if (block === null) continue; // ไม่มีอะไรติ๊ก — ไม่มีคำตอบให้ index
      push(block, headingPath, { ...base, enum_value: f.enumValue ?? undefined });
      continue;
    }
    if (f.type === "image") {
      const block = renderBlock(f);
      if (block === null) continue;
      push(block, headingPath, base);
      continue;
    }

    if (f.table !== null && f.table.length > 0) {
      // ตาราง → chunk เดียวตารางเต็ม markdown; ยาวเกิน cap → part i/n ตัดที่ขอบแถว (Rev 2, D7)
      const question = fi?.question ?? f.question;
      const parts = tableParts(question, fi?.tableColumns ?? [], f.table, config.tableMaxTokens);
      parts.forEach((content, i) => {
        push(content, headingPath, parts.length === 1 ? base : { ...base, part: i + 1, parts: parts.length });
      });
      continue;
    }

    if (f.value === null || f.value.trim().length === 0) continue;
    const parts = splitParts(f.value, config.targetTokens);
    if (parts.length === 1) {
      push(`${fi?.question ?? f.question}\n${f.value}`, headingPath, base);
    } else {
      parts.forEach((part, i) => {
        push(`${fi?.question ?? f.question} (${String(i + 1)}/${String(parts.length)})\n${part}`, headingPath, {
          ...base,
          part: i + 1,
          parts: parts.length,
        });
      });
    }
  }

  // กลุ่ม → chunk เดียว (หรือ part i/n ตัดก่อนเปิด field ใหม่ — ห้ามตัดกลาง field)
  for (const acc of groupAcc.values()) {
    if (acc.blocks.length === 0) continue; // ทุก field ในกลุ่มว่าง — ไม่เกิด chunk เปล่า
    const headingPath = `${sectionTitle.get(acc.sectionId) ?? acc.sectionId} > ${acc.group.label}`;
    const base = { template_version: tpl.version, field_ids: [...acc.group.fieldIds], section_id: acc.sectionId };
    const parts: string[] = [];
    let cur: string[] = [];
    let curTokens = 0;
    for (const block of acc.blocks) {
      const t = tokens(block).length;
      if (cur.length > 0 && curTokens + t > config.targetTokens) {
        parts.push(cur.join("\n\n"));
        cur = [];
        curTokens = 0;
      }
      cur.push(block);
      curTokens += t;
    }
    if (cur.length > 0) parts.push(cur.join("\n\n"));
    parts.forEach((content, i) => {
      push(content, headingPath, parts.length === 1 ? base : { ...base, part: i + 1, parts: parts.length });
    });
  }
  return chunks;
}
