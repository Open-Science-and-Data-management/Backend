// retrieval — pure helpers บน chunks ที่อ่านจาก DB (SPEC ff2569 Task 8, research §Q14)
// retrieve() เดิมคงพฤติกรรม flat top-k (ADR-0025); helper นี้สำหรับ consumer ที่ต้องการ section เต็ม (read_proposal)
// ไม่แตะ DB/HTTP (CON-2) — caller อ่าน rows จาก repository แล้ว map เข้ามาเอง
import type { ChunkMeta } from "./chunking.js";

export interface RetrievalChunk {
  chunk_index: number;
  content: string;
  heading_path: string | null;
  /** jsonb จาก DB — fast path เก็บ ChunkMeta, generic path เป็น null */
  meta: unknown;
}

export interface SectionBlock {
  heading: string | null;
  content: string;
}

/** meta จาก jsonb → ChunkMeta เมื่อรูปร่างตรง — ข้อมูลเก่า/meta เพี้ยนถือเป็น generic ไม่ crash */
function asFormMeta(meta: unknown): ChunkMeta | null {
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  return typeof m.field_id === "string" && typeof m.section_id === "string" ? (meta as ChunkMeta) : null;
}

/**
 * parent-expansion (research §Q14): row-chunk ของตารางที่ parent (ตารางเต็ม — meta.parent_chunk_index,
 * research §Q5) อยู่ในชุดเดียวกัน → ตัดทิ้ง เพราะ parent มีเนื้อหาครบแล้ว; parent หาย → คง row-chunk ไว้ ไม่ตัดข้อมูล
 * แล้ว pack ต่อ heading_path → section เต็ม หนึ่งบล็อกต่อหัวข้อ (คำตอบยาวแตก part i/n ก็รวมกลับเป็นบล็อกเดียว)
 * ลำดับบล็อก = ลำดับ chunk แรกของกลุ่ม; เนื้อหาซ้ำตาเป๊ะใน section เดียวกันรวมครั้งเดียว
 */
export function expandToSections(chunks: RetrievalChunk[]): SectionBlock[] {
  const indexes = new Set(chunks.map((c) => c.chunk_index));
  const blocks: { heading: string | null; parts: string[] }[] = [];
  const byHeading = new Map<string | null, { heading: string | null; parts: string[] }>();
  for (const c of chunks) {
    const meta = asFormMeta(c.meta);
    if (meta?.parent_chunk_index !== undefined && indexes.has(meta.parent_chunk_index)) continue;
    const acc = byHeading.get(c.heading_path);
    if (acc === undefined) {
      const fresh = { heading: c.heading_path, parts: [c.content] };
      byHeading.set(c.heading_path, fresh);
      blocks.push(fresh);
    } else if (!acc.parts.includes(c.content)) {
      acc.parts.push(c.content);
    }
  }
  return blocks.map(({ heading, parts }) => ({ heading, content: parts.join("\n\n") }));
}
