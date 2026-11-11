// unit — expandToSections: pack ต่อ heading_path (SPEC ff2569 Rev 2, D11)
// parts รวมกลับบล็อกเดียว, meta รูปแบบใหม่/เก่า/generic ผ่านหมด ไม่ crash, ลำดับตาม chunk แรกของกลุ่ม, ซ้ำตาเป๊ะรวมครั้งเดียว
import { describe, expect, it } from "vitest";
import { expandToSections, type RetrievalChunk } from "@/features/files/retrieval.js";

const HEADING = "ส่วนที่ 3 แผนงาน: แผนการดำเนินงานโครงการ > แผนการดำเนินงาน (Gantt รายเดือน พร้อมร้อยละของกิจกรรม)";

function chunk(over: Partial<RetrievalChunk>): RetrievalChunk {
  return {
    chunk_index: 0,
    content: "เนื้อหา",
    heading_path: HEADING,
    meta: { template_version: "FF2569", field_ids: ["work_plan"], section_id: "s3_plan" },
    ...over,
  };
}

describe("expandToSections (unit)", () => {
  it("pack ต่อ heading_path — chunk หลายก้อนของหัวข้อเดียวรวมเป็นบล็อกเดียว คั่น \\n\\n", () => {
    const blocks = expandToSections([
      chunk({ chunk_index: 0, content: "คำถาม\n| ปีที่ | กิจกรรม |" }),
      chunk({ chunk_index: 1, content: "คำถาม\nปีที่ 1: ศึกษา" }),
    ]);
    expect(blocks).toEqual([{ heading: HEADING, content: "คำถาม\n| ปีที่ | กิจกรรม |\n\nคำถาม\nปีที่ 1: ศึกษา" }]);
  });

  it("คำตอบยาวแตก part i/n — รวมกลับบล็อกเดียวตามลำดับ part", () => {
    const h = "ส่วนที่ 2 ข้อมูลโครงการ > หลักการและเหตุผล/ปัญหา/โจทย์การวิจัยและพัฒนานวัตกรรม";
    const blocks = expandToSections([
      chunk({ content: "หลักการ (1/2)\nครึ่งแรก", heading_path: h, meta: { template_version: "FF2569", field_ids: ["rationale"], section_id: "s2_project", part: 1, parts: 2 } }),
      chunk({ content: "หลักการ (2/2)\nครึ่งหลัง", heading_path: h, meta: { template_version: "FF2569", field_ids: ["rationale"], section_id: "s2_project", part: 2, parts: 2 } }),
    ]);
    expect(blocks).toEqual([{ heading: h, content: "หลักการ (1/2)\nครึ่งแรก\n\nหลักการ (2/2)\nครึ่งหลัง" }]);
  });

  it("meta รูปแบบใหม่ (field_ids array) — chunk ไม่ถูกตัด pack ตามปกติ", () => {
    const blocks = expandToSections([
      chunk({ content: "ส่วนที่ 1 ข้อมูลทั่วไป > ข้อมูลทั่วไป", meta: { template_version: "FF2569", field_ids: ["plan_type", "research_type"], section_id: "s1_general" } }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe("ส่วนที่ 1 ข้อมูลทั่วไป > ข้อมูลทั่วไป");
  });

  it("meta เก่า (field_id เดี่ยว — ข้อมูลก่อน migration Rev 2) → ถือเป็น generic ไม่ crash ไม่ถูกตัด", () => {
    const blocks = expandToSections([
      chunk({ content: "ข้อมูลเก่า field เดี่ยว", meta: { template_version: "FF2569", field_id: "rationale", section_id: "s2_project", parent_chunk_index: 0 } }),
      chunk({ content: "ข้อมูลเก่า row", meta: { template_version: "FF2569", field_id: "work_plan", section_id: "s3_plan", table_row: 3, parent_chunk_index: 0 } }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toContain("ข้อมูลเก่า field เดี่ยว");
    expect(blocks[0]?.content).toContain("ข้อมูลเก่า row"); // ไม่มี parent-expansion — ทุก chunk ถูก pack
  });

  it("heading_path null (generic path) → บล็อกไม่มีหัวข้อ เนื้อหาซ้ำเป๊ะรวมครั้งเดียว", () => {
    const blocks = expandToSections([
      chunk({ content: "ย่อหน้าก้อนแรก", heading_path: null, meta: null }),
      chunk({ content: "ย่อหน้าก้อนแรก", heading_path: null, meta: null }),
      chunk({ content: "ย่อหน้าถัดไป", heading_path: null, meta: null }),
    ]);
    expect(blocks).toEqual([{ heading: null, content: "ย่อหน้าก้อนแรก\n\nย่อหน้าถัดไป" }]);
  });

  it("meta ผิดรูป (ไม่ใช่ object / field_ids ไม่ใช่ array ของ string) → ไม่ crash pack ตามปกติ", () => {
    const blocks = expandToSections([
      chunk({ content: "meta เป็น string", meta: "garbage" }),
      chunk({ content: "field_ids ผิดชนิด", meta: { field_ids: 3, section_id: "s1" } }),
      chunk({ content: "meta null", meta: null }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.content).toBe("meta เป็น string\n\nfield_ids ผิดชนิด\n\nmeta null");
  });

  it("ลำดับบล็อกตาม chunk แรกของกลุ่ม — คนละ heading แยกบล็อก", () => {
    const h1 = "ส่วนที่ 1 ข้อมูลทั่วไป > ประเภทของการวิจัย";
    const blocks = expandToSections([
      chunk({ content: "ประเภทของการวิจัย: การวิจัยประยุกต์ (Applied Research)", heading_path: h1 }),
      chunk({ content: "ท้ายเอกสาร", heading_path: null }),
      chunk({ content: "อีก section", heading_path: "ส่วนที่ 4 > ผลกระทบ (Expected Impacts) ที่คาดว่าจะเกิดขึ้น" }),
    ]);
    expect(blocks.map((b) => b.heading)).toEqual([h1, null, "ส่วนที่ 4 > ผลกระทบ (Expected Impacts) ที่คาดว่าจะเกิดขึ้น"]);
  });
});
