// retrieval — pure helpers บน chunks ที่อ่านจาก DB (SPEC ff2569 Rev 2, D11)
// retrieve() เดิมคงพฤติกรรม flat top-k (ADR-0025); helper นี้สำหรับ consumer ที่ต้องการ section เต็ม (read_proposal)
// ไม่แตะ DB/HTTP (CON-2) — caller อ่าน rows จาก repository แล้ว map เข้ามาเอง
// Rev 2: meta ใหม่ {field_ids:[…]} — ไม่มี parent-expansion อีก (ตาราง = chunk เดียวต่อตาราง, D7);
// meta รูปร่างไหนก็ pack เหมือนกัน (ข้อมูลเก่า field_id เดี่ยวทำงานเป็น generic ตามธรรมชาติ ไม่ crash)

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

/**
 * pack ต่อ heading_path → section เต็ม หนึ่งบล็อกต่อหัวข้อ (คำตอบยาว/กลุ่มยาวแตก part i/n ก็รวมกลับเป็นบล็อกเดียว)
 * ลำดับบล็อก = ลำดับ chunk แรกของกลุ่ม; เนื้อหาซ้ำตาเป๊ะใน section เดียวกันรวมครั้งเดียว
 */
export function expandToSections(chunks: RetrievalChunk[]): SectionBlock[] {
  const blocks: { heading: string | null; parts: string[] }[] = [];
  const byHeading = new Map<string | null, { heading: string | null; parts: string[] }>();
  for (const c of chunks) {
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
