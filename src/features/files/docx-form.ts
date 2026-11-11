// docx-form — OOXML parse ตรง (jszip) สำหรับเอกสารฟอร์ม: paragraphs / tables / checkbox state / images
// ไม่พึ่ง heading style (FF2569 ไม่มีเลย) และไม่เดาจาก glyph ☒/☐ — state มาจาก w14:checked เท่านั้น (SPEC §Objective)
import JSZip from "jszip";

export interface FormTable {
  rows: string[][];
}
// block = ordinal ของ block ในเอกสาร (นับทั้ง <w:p> และ <w:tbl> ตามลำดับ) — ใช้จับตำแหน่ง checkbox/รูปเทียบย่อหน้า
export interface FormCheckbox {
  label: string;
  checked: boolean;
  block: number;
}
export interface RawFormDocument {
  paragraphs: string[]; // ข้อความ body ตามลำดับ — ไม่รวมข้อความในตาราง
  paragraphBlocks: number[]; // block ordinal ของแต่ละย่อหน้า (ขนาดเท่า paragraphs)
  tables: FormTable[]; // ตามลำดับในเอกสาร
  tableBlocks: number[]; // block ordinal ของแต่ละตาราง
  checkboxes: FormCheckbox[]; // ทุกจุดในเอกสาร (body + ในตาราง) ตามลำดับ
  images: string[]; // r:embed rIds ตามลำดับ
  imageBlocks: number[]; // block ordinal ของแต่ละรูป
  rels: Record<string, string>; // rId → target (เช่น "media/image1.png")
}

// ── text helpers ─────────────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };

function decodeXml(s: string): string {
  let out = s;
  // double-encoded (&amp;amp;) พบจริงในเอกสาร — decode ซ้ำจนนิ่ง (กันวนไม่จบด้วย cap)
  for (let i = 0; i < 5 && /&(lt|gt|quot|apos|amp|#\d+|#[xX][0-9a-fA-F]+);/.test(out); i++) {
    out = out.replace(/&(lt|gt|quot|apos|amp|#\d+|#[xX][0-9a-fA-F]+);/g, (m, code: string) => {
      if (code.startsWith("#")) {
        const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
        return Number.isNaN(n) ? m : String.fromCodePoint(n);
      }
      return ENTITIES[`&${code};`] ?? m;
    });
  }
  return out;
}

/** ข้อความของ block XML = ต่อเฉพาะเนื้อหา <w:t>…</w:t> (เว้น <w:t/> ที่ปิดเอง — ไม่งั้น capture กิน markup ข้าม block) */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  return decodeXml(parts.join("")).replace(/\s+/g, " ").trim();
}

/** จับ checkbox ทั้งหมดใน block — state จาก w14:checked, label = ข้อความ block ตัด glyph ทิ้ง */
function checkboxesIn(xml: string, label: string): Omit<FormCheckbox, "block">[] {
  const out: Omit<FormCheckbox, "block">[] = [];
  // label ตัด glyph ☒/☐ ที่ฝังมากับ w:sym ออก — state จริงอยู่ที่ w14:checked เท่านั้น
  const clean = label.replace(/[☒☐☑□£]/g, " ").replace(/\s+/g, " ").trim();
  for (const m of xml.matchAll(/<w14:checkbox>[\s\S]*?<w14:checked w14:val="(\d)"/g)) out.push({ label: clean, checked: m[1] === "1" });
  return out;
}

// ── block scanner ────────────────────────────────────────────────────────────
const P_OPEN = /<w:p[\s/>]/g;
const TBL_OPEN = /<w:tbl[\s/>]/g;

/** หา index ปิดของ tag ที่รองรับซ้อน (นับ <tag กับ </tag>) */
function closeOf(xml: string, start: number, tag: string): number {
  const open = new RegExp(`<${tag}[\\s/>]`, "g");
  const close = `</${tag}>`;
  let depth = 0;
  open.lastIndex = start;
  for (let i = start; i < xml.length; ) {
    const o = open.lastIndex > 0 && open.lastIndex > i ? (open.lastIndex = i, open.exec(xml)) : open.exec(xml);
    const c = xml.indexOf(close, i);
    if (c === -1) return xml.length;
    if (o !== null && o.index < c) {
      depth += 1;
      i = o.index + o[0].length;
      open.lastIndex = i;
      continue;
    }
    depth -= 1;
    if (depth === 0) return c + close.length;
    i = c + close.length;
  }
  return xml.length;
}

function parseTable(tblXml: string, checkboxes: FormCheckbox[], block: number, tableBlocks: number[]): FormTable {
  const rows: string[][] = [];
  for (const tr of tblXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)) {
    const cells: string[] = [];
    for (const tc of tr[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)) {
      const cellText = textOf(tc[0]);
      for (const cb of checkboxesIn(tc[0], cellText)) checkboxes.push({ ...cb, block });
      cells.push(cellText);
    }
    rows.push(cells);
  }
  tableBlocks.push(block);
  return { rows };
}

// ── images ───────────────────────────────────────────────────────────────────
/** mime ที่ VLM บน OpenRouter รับจริง — emf/wmf (vector metafile ของ Word) ไม่รองรับ → null (ข้าม caption) */
function imageMime(ext: string): string | null {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return null;
  }
}

/** อ่านรูปจาก docx (target จาก rels เช่น "media/image1.png" เทียบ word/) → data URI สำหรับ image_url;
 *  ฟอร์แมตที่ VLM ไม่รองรับ หรือ entry หาย → null (caller ข้าม caption ตาม SPEC §Edge) */
export async function readDocxImage(data: Buffer, target: string): Promise<string | null> {
  const mime = imageMime(target.split(".").pop()?.toLowerCase() ?? "");
  if (mime === null) return null;
  const path = target.startsWith("/") ? target.slice(1) : `word/${target}`;
  const zip = await JSZip.loadAsync(data);
  const entry = zip.file(path);
  if (entry === null) return null;
  return `data:${mime};base64,${await entry.async("base64")}`;
}

/** parse .docx → RawFormDocument — throw เมื่อไฟล์ไม่ใช่ docx/ไม่มี document.xml (caller จัด 422 เอง) */
export async function parseDocxForm(data: Buffer): Promise<RawFormDocument> {
  const zip = await JSZip.loadAsync(data);
  const docFile = zip.file("word/document.xml");
  if (docFile === null) throw new Error("not a docx: missing word/document.xml");
  const xml = await docFile.async("string");
  const rels: Record<string, string> = {};
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (relsFile !== null) {
    const relsXml = await relsFile.async("string");
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2];
  }

  const bodyStart = xml.indexOf("<w:body>");
  const bodyEnd = xml.lastIndexOf("</w:body>");
  const body = bodyStart === -1 ? xml : xml.slice(bodyStart + 8, bodyEnd === -1 ? xml.length : bodyEnd);

  const paragraphs: string[] = [];
  const paragraphBlocks: number[] = [];
  const tables: FormTable[] = [];
  const tableBlocks: number[] = [];
  const checkboxes: FormCheckbox[] = [];
  const images: string[] = [];
  const imageBlocks: number[] = [];
  let block = 0;

  let i = 0;
  while (i < body.length) {
    P_OPEN.lastIndex = i;
    TBL_OPEN.lastIndex = i;
    const pMatch = P_OPEN.exec(body);
    const tblMatch = TBL_OPEN.exec(body);
    const nextP = pMatch?.index ?? Number.POSITIVE_INFINITY;
    const nextTbl = tblMatch?.index ?? Number.POSITIVE_INFINITY;
    if (nextP === Number.POSITIVE_INFINITY && nextTbl === Number.POSITIVE_INFINITY) break;

    if (nextTbl < nextP) {
      const end = closeOf(body, nextTbl, "w:tbl");
      tables.push(parseTable(body.slice(nextTbl, end), checkboxes, block, tableBlocks));
      i = end;
      block += 1;
      continue;
    }
    const end = body.indexOf("</w:p>", nextP);
    const pEnd = end === -1 ? body.length : end + 6;
    const pXml = body.slice(nextP, pEnd);
    const text = textOf(pXml);
    for (const blip of pXml.matchAll(/<a:blip[^>]*r:embed="([^"]+)"/g)) {
      images.push(blip[1]);
      imageBlocks.push(block);
    }
    for (const cb of checkboxesIn(pXml, text)) checkboxes.push({ ...cb, block });
    if (text.length > 0) {
      paragraphs.push(text);
      paragraphBlocks.push(block);
    }
    i = pEnd;
    block += 1;
  }

  return { paragraphs, paragraphBlocks, tables, tableBlocks, checkboxes, images, imageBlocks, rels };
}
