// unit — expandToSections: parent-expansion helper (SPEC ff2569 Task 8, research §Q14)
// row-chunk มี parent ในชุด → ตัด, parent หาย → คงไว้, pack ต่อ heading_path เป็น section เต็ม,
// parts รวมกลับบล็อกเดียว, meta เพี้ยนถือเป็น generic, ลำดับตาม chunk แรกของกลุ่ม
import { describe, expect, it } from "vitest";
import { expandToSections, type RetrievalChunk } from "@/features/files/retrieval.js";

const HEADING = "ส่วนที่ 3 แผนงาน: แผนการดำเนินงานโครงการ > แผนการดำเนินงาน (Gantt รายเดือน พร้อมร้อยละของกิจกรรม)";

const chunk = (over: Partial<RetrievalChunk> & Pick<RetrievalChunk, "content">): RetrievalChunk => ({
  chunk_index: 0,
  heading_path: null,
  meta: null,
  ...over,
});

const tableMeta = (over: Record<string, unknown>) => ({
  template_version: "FF2569",
  field_id: "work_plan",
  section_id: "s3_plan",
  ...over,
});

describe("expandToSections (unit)", () => {
  it("row-chunk ที่ parent (ตารางเต็ม) อยู่ในชุด → ตัดทิ้ง เหลือ section เดียวจาก parent", () => {
    const blocks = expandToSections([
      chunk({ chunk_index: 0, content: "คำถาม\n| ปีที่ | กิจกรรม |", heading_path: HEADING, meta: tableMeta({}) }),
      chunk({ chunk_index: 1, content: "คำถาม\nปีที่ 1: ศึกษา", heading_path: HEADING, meta: tableMeta({ table_row: 0, parent_chunk_index: 0 }) }),
      chunk({ chunk_index: 2, content: "คำถาม\nปีที่ 2: พัฒนา", heading_path: HEADING, meta: tableMeta({ table_row: 1, parent_chunk_index: 0 }) }),
    ]);
    expect(blocks).toEqual([{ heading: HEADING, content: "คำถาม\n| ปีที่ | กิจกรรม |" }]);
  });

  it("parent หาย (ข้อมูลเก่า/meta เพี้ยน) → row-chunks คงอยู่ ไม่ตัดข้อมูล", () => {
    const blocks = expandToSections([
      chunk({ chunk_index: 10, content: "คำถาม\nปีที่ 1: ศึกษา", heading_path: HEADING, meta: tableMeta({ table_row: 0, parent_chunk_index: 0 }) }),
      chunk({ chunk_index: 11, content: "คำถาม\nปีที่ 2: พัฒนา", heading_path: HEADING, meta: tableMeta({ table_row: 1, parent_chunk_index: 0 }) }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toContain("ปีที่ 1: ศึกษา");
    expect(blocks[0]?.content).toContain("ปีที่ 2: พัฒนา");
  });

  it("คำตอบยาวแตก part i/n → รวมกลับบล็อกเดียวต่อ heading_path เรียงตามลำดับ", () => {
    const h = "ส่วนที่ 2 ข้อมูลโครงการ > หลักการและเหตุผล/ปัญหา/โจทย์การวิจัยและพัฒนานวัตกรรม";
    const blocks = expandToSections([
      chunk({ content: "หลักการ (1/2)\nครึ่งแรก", heading_path: h, meta: tableMeta({ field_id: "rationale", part: 1, parts: 2 }) }),
      chunk({ content: "หลักการ (2/2)\nครึ่งหลัง", heading_path: h, meta: tableMeta({ field_id: "rationale", part: 2, parts: 2 }) }),
    ]);
    expect(blocks).toEqual([{ heading: h, content: "หลักการ (1/2)\nครึ่งแรก\n\nหลักการ (2/2)\nครึ่งหลัง" }]);
  });

  it("heading_path null (generic path) → บล็อกไม่มีหัวข้อ เนื้อหาซ้ำเป๊ะรวมครั้งเดียว", () => {
    const blocks = expandToSections([
      chunk({ content: "ย่อหน้าก้อนแรก" }),
      chunk({ content: "ย่อหน้าก้อนแรก" }),
      chunk({ content: "ย่อหน้าถัดไป" }),
    ]);
    expect(blocks).toEqual([{ heading: null, content: "ย่อหน้าก้อนแรก\n\nย่อหน้าถัดไป" }]);
  });

  it("meta ผิดรูป (ไม่ใช่ object / ไม่มี field_id) → ถือเป็น generic ไม่ crash ไม่ถูกตัด", () => {
    const blocks = expandToSections([
      chunk({ content: "row ตกหล่น", heading_path: HEADING, meta: "garbage" }),
      chunk({ content: "row ไม่ครบ", heading_path: HEADING, meta: tableMeta({ field_id: undefined, table_row: 3, parent_chunk_index: 0 }) }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toContain("row ตกหล่น");
    expect(blocks[0]?.content).toContain("row ไม่ครบ");
  });

  it("ลำดับบล็อก = ลำดับ chunk แรกของกลุ่ม (fast path ผสม generic)", () => {
    const h1 = "ส่วนที่ 1 ข้อมูลทั่วไป > ประเภทของการวิจัย";
    const blocks = expandToSections([
      chunk({ content: "ประเภทของการวิจัย: การวิจัยประยุกต์ (Applied Research)", heading_path: h1, meta: tableMeta({ field_id: "research_type", enum_value: "applied_research" }) }),
      chunk({ content: "ท้ายเอกสาร" }),
      chunk({ content: "อีก section", heading_path: "ส่วนที่ 4 > ผลกระทบ (Expected Impacts) ที่คาดว่าจะเกิดขึ้น" }),
    ]);
    expect(blocks.map((b) => b.content)).toEqual([
      "ประเภทของการวิจัย: การวิจัยประยุกต์ (Applied Research)",
      "ท้ายเอกสาร",
      "อีก section",
    ]);
    expect(blocks.map((b) => b.heading === null)).toEqual([false, true, false]);
  });
});
