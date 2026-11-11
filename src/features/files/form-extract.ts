// form-extract — pure functions: raw OOXML blocks → FF2569 fields ต่อ template schema (CON-2: ไม่แตะ DB/HTTP)
// matching เป็นแบบ tolerant: ไม่ใช้เลขข้อในเอกสาร (ซ้ำ/หาย/เพี้ยน — รายงาน §1.1) แต่ใช้ similarity ของข้อความคำถาม
// + claimed-set ตามลำดับ template ทำให้ deterministic และกันการแย่งย่อหน้ากันเอง
import type { RawFormDocument } from "./docx-form.js";
import { ff2569Template, type Ff2569Template, type TemplateField } from "./templates/ff2569.js";

export type FieldType = TemplateField["type"];

export interface ExtractedField {
  fieldId: string; // child ของ repeated field ใช้ "subactivity[1].concept"
  sectionId: string;
  type: FieldType;
  question: string;
  value: string | null; // คำตอบข้อความ (text/long_text/list) — enum ไม่ใส่ข้อความตัวเลือกที่ไม่ติ๊ก
  enumValue: string | null; // canonical value ของ enum จาก w14:checked (negation-aware)
  table: string[][] | null; // แถวข้อมูล (ไม่รวม header)
  imageRid: string | null; // r:embed ของรูปใน field แบบ image
  /** caption จาก VLM — service เติมหลัง extract (SPEC ff2569 Task 7); extractor เป็น pure function ไม่ตั้งค่านี้ */
  caption?: string;
  matched: boolean; // false = หาคำถามในเอกสารไม่เจอ (miss)
}

export interface ExtractResult {
  fields: ExtractedField[];
  misses: string[]; // fieldId ที่ match คำถามไม่ได้
}

// ── normalization & similarity ───────────────────────────────────────────────
// ตัดตัวเลข/วรรณยุกต์ประจาก/สัญลักษณ์ — เลขข้อหายไปจากการเทียบโดยธรรมชาติ (ห้ามแมตช์เลขข้อ — SPEC Boundaries)
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[0-9\s\p{P}\p{S}]/gu, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** Dice coefficient ของ character bigrams — เหมาะกับไทยที่ไม่มีช่องว่างระหว่างคำ */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

/** containment ถือว่าแมตช์เกือบสมบูรณ์ (หัวข้อในเอกสารมี prefix เลขข้อ/เครื่องหมาย);
 *  ย่อหน้ายาว (คำตอบ/คำอธิบาย) เทียบด้วย sliding window ยาว ~1.3×คำถาม กัน dilution ของ bigram;
 *  เนื้อในวงเล็บของคำถาม (เช่น "(ภาษาอังกฤษ)") เป็นตัวแยกคู่คำถามพี่น้อง — เจอในบรรทัด +bonus */
function similarity(question: string, text: string): number {
  const q = norm(question);
  const t = norm(text);
  if (!q) return 0;
  if (t.includes(q)) return 0.98;
  let score = 0;
  if (t.length <= q.length * 1.6) score = dice(q, t);
  else {
    const w = Math.max(8, Math.ceil(q.length * 1.3));
    const step = Math.max(1, Math.ceil(w / 2));
    for (let j = 0; j < t.length; j += step) {
      score = Math.max(score, dice(q, t.slice(j, j + w)));
      if (j + w >= t.length) break;
    }
  }
  for (const m of question.matchAll(/\([^)]+\)/g)) {
    const p = norm(m[0].slice(1, -1)); // m[0] = "(…)" — ตัดวงเล็บออก
    if (p.length >= 4 && t.includes(p)) score += 0.2; // discriminator เช่น "(ภาษาอังกฤษ)"
  }
  return score;
}

// ── anchors ──────────────────────────────────────────────────────────────────
interface Anchor {
  fieldId: string;
  sectionId: string;
  type: FieldType;
  question: string;
  options?: { value: string; labels: string[] }[];
  tableColumns?: string[];
  answerMarker?: string;
  isRepeatHeading?: boolean;
}

/** แผน template → anchors ตามลำดับเอกสาร; repeated field (subactivity ×3) ขยายเป็น heading + children ต่อรอบ */
function buildAnchors(tpl: Ff2569Template): Anchor[] {
  const out: Anchor[] = [];
  for (const f of tpl.fields) {
    if (f.repeats && f.children) {
      out.push({ fieldId: f.fieldId, sectionId: f.sectionId, type: "text", question: f.question, isRepeatHeading: true });
      for (let i = 1; i <= f.repeats; i++) {
        for (const c of f.children) {
          out.push({
            fieldId: `${f.fieldId}[${String(i)}].${c.fieldId}`,
            sectionId: f.sectionId,
            type: c.type,
            question: c.question,
            options: c.options,
            tableColumns: c.tableColumns,
            answerMarker: c.answerMarker,
          });
        }
      }
    } else {
      out.push({
        fieldId: f.fieldId,
        sectionId: f.sectionId,
        type: f.type,
        question: f.question,
        options: f.options,
        tableColumns: f.tableColumns,
        answerMarker: f.answerMarker,
      });
    }
  }
  return out;
}

// ── enum resolution (negation-aware) ────────────────────────────────────────
const NEG = /^(?:ไม่ใช่|ไม่)/;
/** segments หลัก (≥4 chars หลัง norm) ของคำถามแบบตัดวงเล็บ — ใช้เช็คบรรทัดคำถามที่ถูกแทรกคำ */
function qCoreSegments(question: string): string[] {
  return norm(question.replace(/\([^)]*\)/g, " "))
    .split(/\s+/)
    .filter((s) => s.length >= 4);
}

interface OptionMatch {
  value: string;
  polarity: boolean; // true = ติ๊กตรง label, false = ติ๊กแบบปฏิเสธ ("ไม่...")
}

function matchOption(cbLabel: string, options: NonNullable<Anchor["options"]>): OptionMatch | null {
  const raw = norm(cbLabel);
  const negated = NEG.test(cbLabel.trim());
  if (negated) {
    // checkbox ขึ้นต้น "ไม่(ใช่)" — แมตช์แบบปฏิเสธก่อน (กัน substring "เป็น..." ⊆ "ไม่เป็น...")
    const stripped = norm(cbLabel.trim().replace(NEG, ""));
    let negBest: { value: string; len: number } | null = null;
    for (const o of options) {
      for (const l of o.labels) {
        const nl = norm(l);
        if (nl && stripped.includes(nl) && (!negBest || nl.length > negBest.len)) negBest = { value: o.value, len: nl.length };
      }
    }
    if (negBest) return { value: negBest.value, polarity: false };
  }
  // positive: label ของ option อยู่ใน label ของ checkbox (เลือก label ยาวสุดกัน "ได้ยื่นขอ" ⊆ "ไม่ได้ยื่นขอ")
  let best: { value: string; len: number } | null = null;
  for (const o of options) {
    for (const l of o.labels) {
      const nl = norm(l);
      if (nl && raw.includes(nl) && (!best || nl.length > best.len)) best = { value: o.value, len: nl.length };
    }
  }
  return best ? { value: best.value, polarity: true } : null;
}

function resolveEnum(
  checkboxes: RawFormDocument["checkboxes"],
  from: number,
  to: number,
  options: NonNullable<Anchor["options"]>,
): string | null {
  const hits: OptionMatch[] = [];
  for (const cb of checkboxes) {
    if (!cb.checked || cb.block <= from || cb.block >= to) continue;
    const m = matchOption(cb.label, options);
    if (m) hits.push(m);
  }
  const positive = hits.find((h) => h.polarity);
  if (positive) return positive.value;
  // มีแต่การปฏิเสธ และ enum นี้มี 2 ตัวเลือก → คืออีกตัว (เช่น "ไม่ได้ยื่นขอ..." → not_submitted)
  const negated = hits.find((h) => !h.polarity);
  if (negated && options.length === 2) return options.find((o) => o.value !== negated.value)?.value ?? null;
  return null;
}

// ── main ─────────────────────────────────────────────────────────────────────
const STRONG = 0.5; // แมตช์คำถามชัดเจน
const WEAK = 0.24; // tolerant: หัวข้อเพี้ยน/ย่อ — ยอมรับแต่คำตอบอาจว่าง
const WINDOW = 24; // คำถามถัดไปอยู่ไม่ไกล — ค้นภายใน ~24 block (กัน weak match กระโดดข้ามส่วน)

const BOILERPLATE_ANSWER =
  /^\s*(?:[☒☐£]\s*|ส่วนที่\s*\d+|แสดงรายละเอียด|ใส่|กรอก|หมายเหตุ)/; // ตัวเลือก/หัวข้อส่วน/คำสั่งฟอร์ม — ไม่ใช่คำตอบ

/** ตัด boilerplate: บรรทัด placeholder "………", marker ภาษาหน้าคำตอบ, หัวข้อส่วน, คำสั่งของฟอร์ม */
function cleanAnswer(text: string): string {
  const dots = (text.match(/\./g) ?? []).length;
  if (dots > text.length * 0.15) return "";
  if (BOILERPLATE_ANSWER.test(text)) return "";
  return text
    .replace(/^\((?:ภาษาไทย|ภาษาอังกฤษ)\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFields(doc: RawFormDocument, tpl: Ff2569Template = ff2569Template): ExtractResult {
  const anchors = buildAnchors(tpl);
  // จับคู่ text+block ครั้งเดียว — เข้าถึงแบบ object ไม่ต้อง assert
  const paras = doc.paragraphs.map((text, i) => ({ text, block: doc.paragraphBlocks[i] ?? -1 }));
  const tables = doc.tables.map((t, i) => ({ rows: t.rows, block: doc.tableBlocks[i] ?? -1 }));
  const images = doc.images.map((rid, i) => ({ rid, block: doc.imageBlocks[i] ?? -1 }));
  // sequential cursor: field ใน template เรียงตามเอกสาร → หาคำถามถัดจาก cursor เสมอ (กันแย่งย่อหน้าย้อนหลัง)
  interface Matched {
    anchor: Anchor;
    block: number; // block ordinal ของย่อหน้าคำถาม
    selfAnswer: boolean; // match ไปโดนย่อหน้าคำตอบตรง ๆ (คำถามไม่อยู่ในย่อหน้า)
    markerAnswer?: string; // คำตอบจาก answerMarker — ใช้เป็นค่าตรง ๆ แทน window
  }
  const matches: Matched[] = [];
  const misses: string[] = [];
  let cursor = -1;

  for (const a of anchors) {
    // 1) answerMarker: หาบรรทัดคำตอบก่อน แล้ว claim บรรทัดคำถามที่อยู่หน้า marker (กัน window ก่อนหน้าล้ำเข้ามา)
    if (a.answerMarker) {
      const markerText = a.answerMarker;
      const marker = paras.find((p) => p.block > cursor && p.block <= cursor + WINDOW && p.text.trimStart().startsWith(markerText));
      if (!marker) {
        if (process.env.FF_EXTRACT_DEBUG) console.error(`[miss-marker] ${a.fieldId} cursor=${String(cursor)}`);
        misses.push(a.fieldId);
        continue;
      }
      const raw = marker.text;
      const markerAnswer = raw.trimStart().startsWith(a.answerMarker) ? raw.trimStart().slice(a.answerMarker.length).trim() : raw;
      const qBlock = paras.find((p) => {
        if (p.block <= cursor || p.block >= marker.block) return false;
        const tn2 = norm(p.text);
        const seg = qCoreSegments(a.question);
        const qLike = tn2.includes(norm(a.question)) || tn2.includes(norm(a.question.replace(/\([^)]*\)/g, " "))) || (seg.length > 0 && seg.every((s) => tn2.includes(s)));
        return qLike && similarity(a.question, p.text) >= STRONG;
      });
      cursor = marker.block;
      matches.push({ anchor: a, block: qBlock ? qBlock.block : marker.block, selfAnswer: false, markerAnswer });
      continue;
    }
    // 2) similarity match ปกติ
    let best: { text: string; block: number } | null = null;
    let bestScore = 0;
    for (const p of paras) {
      if (p.block <= cursor || p.block > cursor + WINDOW) continue;
      const score = similarity(a.question, p.text);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best || bestScore < WEAK) {
      if (process.env.FF_EXTRACT_DEBUG) console.error(`[miss] ${a.fieldId} best=${bestScore.toFixed(2)} cursor=${String(cursor)}`);
      misses.push(a.fieldId);
      continue; // ไม่ advance cursor — field ถัดไปยังค้นจากเดิม
    }
    cursor = best.block;
    const text = best.text;
    if (process.env.FF_EXTRACT_DEBUG) console.error(`[match] ${a.fieldId} block=${String(cursor)} :: ${text.slice(0, 70)}`);
    // บรรทัดคำถาม: มีคำถามทั้งก้อน / core (ตัดวงเล็บ) อยู่ในบรรทัด / ขึ้นต้นด้วย prefix คำถามแล้ว similarity รวมสูง;
    // หัวข้อสั้นที่ dice รวมสูงก็นับ (เช่น "ทฤษฎีที่เกี่ยวข้อง:" กับคำถาม "แนวคิด ทฤษฎีที่เกี่ยวข้อง")
    const qn = norm(a.question);
    const qCore = norm(a.question.replace(/\([^)]*\)/g, " "));
    const tn = norm(text);
    const full = dice(qn, tn);
    // ทุก segment หลักของ core (≥4 chars) อยู่ในบรรทัด → บรรทัดคำถาม (คำถามถูกตัดแทรกคำ เช่น "คำสำคัญ … keywords … กำหนดไม่เกิน คำ")
    const segments = qCore.split(/\s+/).filter((s) => s.length >= 4);
    const isQuestionLine =
      tn.includes(qn) ||
      tn.includes(qCore) ||
      (segments.length > 0 && segments.every((s) => tn.includes(s))) ||
      (tn.startsWith(qn.slice(0, 12)) && full >= STRONG) ||
      (full >= 0.7 && tn.length <= Math.max(qn.length, 25));
    matches.push({ anchor: a, block: cursor, selfAnswer: !isQuestionLine });
  }

  // เรียงตามตำแหน่ง — คำตอบของ anchor คือย่อหน้าระหว่างคำถามของมันกับคำถาม anchor ถัดไป
  const byBlock = [...matches].sort((x, y) => x.block - y.block);
  const windowEnd = new Map<Matched, number>();
  byBlock.forEach((m, i) => {
    windowEnd.set(m, byBlock[i + 1]?.block ?? Number.POSITIVE_INFINITY);
  });

  function windowTexts(m: Matched): string[] {
    const end = windowEnd.get(m) ?? Number.POSITIVE_INFINITY;
    return paras.filter((p) => p.block > m.block && p.block < end).map((p) => p.text);
  }

  const usedTables = new Set<number>();
  const fields: ExtractedField[] = [];
  for (const m of matches) {
    const a = m.anchor;
    const end = windowEnd.get(m) ?? Number.POSITIVE_INFINITY;
    let value: string | null = null;
    let enumValue: string | null = null;
    let table: string[][] | null = null;
    let imageRid: string | null = null;

    if ((a.type === "enum" || a.type === "bool") && a.options) {
      enumValue = resolveEnum(doc.checkboxes, m.block, end, a.options);
    } else if (a.type === "table" && a.tableColumns) {
      // หาตารางใน window — เทียบ header ของตารางกับ tableColumns ของ template (เฉลี่ย per-column dice)
      let bestTable: { rows: string[][]; block: number } | null = null;
      let bestScore = 0;
      for (const [ti, t] of tables.entries()) {
        if (usedTables.has(ti)) continue;
        if (t.block <= m.block || t.block >= end) continue;
        const header = t.rows[0] ?? [];
        const score =
          a.tableColumns.length === 0
            ? 0
            : a.tableColumns.reduce((acc, col) => {
                let colBest = 0;
                for (const h of header) colBest = Math.max(colBest, similarity(col, h));
                return acc + colBest;
              }, 0) / a.tableColumns.length;
        if (score > bestScore) {
          bestScore = score;
          bestTable = t;
        }
      }
      if (bestTable && bestScore >= STRONG) {
        usedTables.add(tables.indexOf(bestTable));
        table = bestTable.rows.slice(1);
      }
    } else if (a.type === "image") {
      const img = images.find((im) => im.block > m.block && im.block < end);
      if (img) imageRid = img.rid;
    } else if (a.isRepeatHeading) {
      // heading ของ repeated field เป็นแค่ anchor จัดลำดับ — ไม่ผลิตค่า (คำตอบอยู่ที่ children)
    } else {
      // text / long_text / list — คำตอบคือ window; marker → ใช้บรรทัดที่จับได้; ถ้า match ไปโดนบรรทัดคำตอบเอง (self) ใช้บรรทัดนั้น
      const selfText = paras.find((p) => p.block === m.block)?.text;
      const texts =
        m.markerAnswer !== undefined ? [m.markerAnswer] : m.selfAnswer && selfText !== undefined ? [selfText] : windowTexts(m);
      const cleaned = texts.map(cleanAnswer).filter((t) => t.length > 0);
      if (cleaned.length > 0) value = cleaned.join("\n");
    }

    fields.push({
      fieldId: a.fieldId,
      sectionId: a.sectionId,
      type: a.type,
      question: a.question,
      value,
      enumValue,
      table,
      imageRid,
      matched: true,
    });
  }

  // ── post-pass (Rev 2, D8): รูปในช่วง section ของ field แบบ image ที่จับไม่ได้ใน window ของตัวเอง ──
  // รูปบางใบวางก่อน/หลังย่อหน้าคำอธิบาย (นอก window คำถาม→คำถามถัดไป) → ผูกเป็น imageRid ของ field แบบ image ตัวแรกที่ match;
  // ช่วง = block คำถามของ field → สิ้นสุด section (block คำถามแรกของ section ถัดไป); รูปที่ผูก field อื่นไปแล้วไม่ถูกแย่ง
  const matchByAnchor = new Map(matches.map((m) => [m.anchor, m]));
  const imageAnchors = anchors.filter((a) => a.type === "image" && matchByAnchor.has(a));
  const boundRids = new Set(fields.map((f) => f.imageRid).filter((r) => r !== null));
  for (const imgAnchor of imageAnchors) {
    const imgField = fields.find((f) => f.fieldId === imgAnchor.fieldId);
    if (!imgField || imgField.imageRid !== null) continue;
    const start = matchByAnchor.get(imgAnchor)!.block;
    const anchorIdx = anchors.indexOf(imgAnchor);
    const nextSectionBlock = anchors
      .slice(anchorIdx + 1)
      .filter((a) => a.sectionId !== imgAnchor.sectionId && matchByAnchor.has(a))
      .map((a) => matchByAnchor.get(a)!.block)
      .sort((x, y) => x - y)[0];
    const end = nextSectionBlock ?? Number.POSITIVE_INFINITY;
    const loose = images.find((im) => im.block > start && im.block < end && !boundRids.has(im.rid));
    if (loose) {
      imgField.imageRid = loose.rid;
      boundRids.add(loose.rid);
    }
  }

  return { fields, misses };
}
