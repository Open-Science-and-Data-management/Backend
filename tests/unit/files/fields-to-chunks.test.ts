// unit — fieldsToChunks: fields → chunk (SPEC ff2569 Rev 2, D2/D3/D6/D7)
// acceptance: field ใน group → 1 chunk (heading_path "section > label", field_ids ครบ), ตารางเต็ม 1 chunk,
//             ตารางยาว > cap → part i/n ตัดที่ขอบแถว, กลุ่มยาว → ตัดที่ขอบ field, field นอกกลุ่มพฤติกรรมเดิม
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fieldsToChunks, type ChunkWithMeta } from "@/features/files/chunking.js";
import { parseDocxForm } from "@/features/files/docx-form.js";
import { extractFields, type ExtractedField } from "@/features/files/form-extract.js";
import { ff2569Template, type Ff2569Template } from "@/features/files/templates/ff2569.js";

const fixture = readFile(fileURLToPath(new URL("../../fixtures/ff2569-proposal.docx", import.meta.url)));

const CFG = { targetTokens: 30, overlapPercent: 0, tableMaxTokens: 60 };

// synthetic template เล็ก — fieldsToChunks อิงเฉพาะ sections/fields/chunkGroups (min-count ของ zod ผูกกับ template จริง)
const TPL: Ff2569Template = {
  version: "FF2569",
  sections: [
    { id: "s0_header", title: "หัวฟอร์ม" },
    { id: "s1_general", title: "ส่วนที่ 1 ข้อมูลทั่วไป" },
    { id: "s2_project", title: "ส่วนที่ 2 ข้อมูลโครงการ" },
  ],
  fields: [
    { fieldId: "fund_type", sectionId: "s0_header", question: "ประเภททุน", type: "text" },
    { fieldId: "fiscal_year", sectionId: "s0_header", question: "ปีงบประมาณ", type: "text" },
    { fieldId: "institution", sectionId: "s0_header", question: "ชื่อหน่วยงาน", type: "text" },
    {
      fieldId: "yearly_budget",
      sectionId: "s1_general",
      question: "ปีงบประมาณและงบประมาณรายปีของโครงการ",
      type: "table",
      tableColumns: ["ปีงบประมาณ", "งบประมาณ (บาท)"],
    },
    {
      fieldId: "research_type",
      sectionId: "s1_general",
      question: "ประเภทของการวิจัย",
      type: "enum",
      options: [
        { value: "basic_research", labels: ["การวิจัยพื้นฐาน (Basic Research)"] },
        { value: "applied_research", labels: ["การวิจัยประยุกต์ (Applied Research)"] },
      ],
    },
    {
      fieldId: "work_plan",
      sectionId: "s2_project",
      question: "คำถามของ work_plan",
      type: "table",
      tableColumns: ["ปีที่", "กิจกรรม", "รายละเอียด"],
    },
    {
      fieldId: "other_enum",
      sectionId: "s2_project",
      question: "คำถามของ other_enum",
      type: "enum",
      options: [
        { value: "basic_research", labels: ["การวิจัยพื้นฐาน (Basic Research)"] },
        { value: "applied_research", labels: ["การวิจัยประยุกต์ (Applied Research)"] },
      ],
    },
    {
      fieldId: "subactivity",
      sectionId: "s2_project",
      question: "แนวคิด ทฤษฎี และสมมติฐานงานวิจัยและพัฒนานวัตกรรม — กิจกรรมย่อยที่ N",
      type: "text",
      repeats: 3,
      children: [{ fieldId: "concept", question: "แนวคิด", type: "long_text" }],
    },
  ],
  chunkGroups: [
    { id: "s0_header", label: "ข้อมูลหัวฟอร์ม", fieldIds: ["fund_type", "fiscal_year", "institution"] },
    { id: "g_enum", label: "ข้อมูลทั่วไป", fieldIds: ["research_type"] },
  ],
} as unknown as Ff2569Template;

const f = (over: Partial<ExtractedField> & { fieldId: string }): ExtractedField => ({
  sectionId: "s1_general",
  type: "text",
  question: `คำถามของ ${over.fieldId}`,
  value: null,
  enumValue: null,
  table: null,
  imageRid: null,
  matched: true,
  ...over,
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(" ");

describe("fieldsToChunks — กฎพื้นฐาน (field นอกกลุ่ม)", () => {
  it("คำตอบสั้น — 1 chunk, คำถามขึ้นหัว chunk, heading_path = ส่วน > คำถาม, meta.field_ids = [id]", () => {
    const chunks = fieldsToChunks([f({ fieldId: "title_th", value: "ระบบตรวจสอบคุณภาพผลผลิต" })], CFG, TPL);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.startsWith("คำถามของ title_th\n")).toBe(true);
    expect(chunks[0].heading_path).toBe("ส่วนที่ 1 ข้อมูลทั่วไป > คำถามของ title_th");
    expect(chunks[0].meta).toEqual({
      template_version: "FF2569",
      field_ids: ["title_th"],
      section_id: "s1_general",
    });
  });

  it("คำตอบว่าง (null / ว่างเปล่า / enum ไม่ติ๊ก / anchor จัดลำดับ) — ไม่เกิด chunk", () => {
    const chunks = fieldsToChunks(
      [
        f({ fieldId: "a", value: null }),
        f({ fieldId: "b", value: "   " }),
        f({ fieldId: "c", type: "enum", enumValue: null }),
        f({ fieldId: "subactivity" }), // repeat-heading anchor — ไม่มีคำตอบของตัวเอง
      ],
      CFG,
      TPL,
    );
    expect(chunks).toEqual([]);
  });

  it("คำตอบยาวเกิน target — แตก part i/n, ทุกก้อน prefix คำถาม, เนื้อหาครบไม่หาย", () => {
    const chunks = fieldsToChunks([f({ fieldId: "rationale", type: "long_text", value: words(75) })], CFG, TPL);
    expect(chunks.length).toBe(3); // 30+30+15
    chunks.forEach((c, i) => {
      expect(c.content.split("\n")[0]).toBe(`คำถามของ rationale (${String(i + 1)}/3)`);
      expect(c.meta.part).toBe(i + 1);
      expect(c.meta.parts).toBe(3);
    });
    expect(chunks.flatMap((c) => c.content.split("\n").slice(1).join(" ").split(/\s+/)).filter((w) => w.startsWith("w"))).toEqual(
      words(75).split(/\s+/),
    );
  });

  it("enum นอกกลุ่ม — เนื้อหาเป็น label ที่ติ๊กเท่านั้น, meta.enum_value canonical", () => {
    const solo = fieldsToChunks([f({ fieldId: "other_enum", type: "enum", enumValue: "applied_research" })], CFG, TPL);
    expect(solo).toHaveLength(1);
    expect(solo[0].content).toBe("คำถามของ other_enum: การวิจัยประยุกต์ (Applied Research)");
    expect(solo[0].meta.enum_value).toBe("applied_research");
  });

  it("ตารางเต็ม — 1 chunk markdown ครบทั้งตาราง (ไม่มี row-chunk), meta.field_ids = [id]", () => {
    const chunks = fieldsToChunks(
      [
        f({
          fieldId: "yearly_budget",
          type: "table",
          table: [
            ["2569", "500000"],
            ["", ""],
            ["2570", "700000"],
          ],
        }),
      ],
      CFG,
      TPL,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(
      "ปีงบประมาณและงบประมาณรายปีของโครงการ\n| ปีงบประมาณ | งบประมาณ (บาท) |\n| 2569 | 500000 |\n|  |  |\n| 2570 | 700000 |",
    );
    expect(chunks[0].meta.field_ids).toEqual(["yearly_budget"]);
    expect(chunks[0].heading_path).toBe("ส่วนที่ 1 ข้อมูลทั่วไป > ปีงบประมาณและงบประมาณรายปีของโครงการ");
  });

  it("ตารางยาวเกิน tableMaxTokens — part i/n ตัดที่ขอบแถว, header ติดทุก part, แถวไม่หาย", () => {
    const rows = Array.from({ length: 20 }, (_, i) => [`ปี ${String(2560 + i)}`, words(6), words(4)]);
    const chunks = fieldsToChunks([f({ fieldId: "work_plan", type: "table", table: rows })], { ...CFG, tableMaxTokens: 60 }, TPL);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.meta.part).toBe(i + 1);
      expect(c.meta.parts).toBe(chunks.length);
      expect(c.content.split("\n")[0]).toBe(`คำถามของ work_plan (${String(i + 1)}/${String(chunks.length)})`);
      expect(c.content).toContain("| ปีที่ | กิจกรรม | รายละเอียด |"); // header ติดทุก part
      expect(c.content.split("\n").slice(2).every((l) => l.startsWith("| "))).toBe(true); // ไม่ตัดกลางแถว
    });
    const bodyCells = chunks.flatMap((c) => c.content.split("\n").slice(2).join("\n").match(/ปี \d+/g) ?? []);
    expect(bodyCells).toHaveLength(20); // ทุกแถวครบ
  });

  it("child ของ repeated field — heading_path มี parent question พร้อมเลขรอบ (นอกกลุ่ม)", () => {
    const chunks = fieldsToChunks(
      [f({ fieldId: "subactivity[2].concept", sectionId: "s2_project", type: "long_text", value: "แนวคิดย่อย" })],
      CFG,
      TPL,
    );
    expect(chunks[0].heading_path).toBe(
      "ส่วนที่ 2 ข้อมูลโครงการ > แนวคิด ทฤษฎี และสมมติฐานงานวิจัยและพัฒนานวัตกรรม — กิจกรรมย่อยที่ 2 > แนวคิด",
    );
    expect(chunks[0].meta.field_ids).toEqual(["subactivity[2].concept"]);
  });

  it("image มี caption จาก VLM — 1 chunk คำถาม prefix, caption trim; ไม่มี/ว่าง → ไม่เกิด chunk (Task 7)", () => {
    const withCaption = fieldsToChunks(
      [f({ fieldId: "solo_image", sectionId: "s2_project", type: "image", imageRid: "rId15", caption: "  แผนภาพกรอบการวิจัย 3 ชั้น  " })],
      CFG,
      TPL,
    );
    expect(withCaption).toHaveLength(1);
    expect(withCaption[0].content).toBe("คำถามของ solo_image\nแผนภาพกรอบการวิจัย 3 ชั้น");
    expect(withCaption[0].meta.field_ids).toEqual(["solo_image"]);

    expect(fieldsToChunks([f({ fieldId: "a", type: "image", imageRid: "r1" })], CFG, TPL)).toHaveLength(0);
    expect(fieldsToChunks([f({ fieldId: "b", type: "image", imageRid: "r1", caption: "   " })], CFG, TPL)).toHaveLength(0);
  });

  it("chunk_index ต่อเนื่องตามลำดับ field ในเอกสาร", () => {
    const chunks = fieldsToChunks([f({ fieldId: "a", value: "x" }), f({ fieldId: "b", value: "y" })], CFG, TPL);
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1]);
  });
});

describe("fieldsToChunks — chunkGroup (Rev 2, D2/D3/D6)", () => {
  const g0 = (over: Partial<ExtractedField> & { fieldId: string }) => f({ sectionId: "s0_header", ...over });

  it("field ในกลุ่ม → chunk เดียว: heading_path = section > label, เนื้อหาคั่น \\n\\n ตามลำดับเอกสาร, field_ids ครบ", () => {
    const chunks = fieldsToChunks(
      [
        g0({ fieldId: "fund_type", value: "ทุนวิจัยพื้นฐาน" }),
        g0({ fieldId: "fiscal_year", value: "2569" }),
        g0({ fieldId: "institution", value: "มหาวิทยาลัยเทคโนโลยี" }),
      ],
      CFG,
      TPL,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading_path).toBe("หัวฟอร์ม > ข้อมูลหัวฟอร์ม");
    expect(chunks[0].content).toBe("ประเภททุน\nทุนวิจัยพื้นฐาน\n\nปีงบประมาณ\n2569\n\nชื่อหน่วยงาน\nมหาวิทยาลัยเทคโนโลยี");
    expect(chunks[0].meta.field_ids).toEqual(["fund_type", "fiscal_year", "institution"]);
    expect(chunks[0].meta.section_id).toBe("s0_header");
  });

  it("กลุ่มยาวเกิน target — part i/n ตัดก่อนเปิด field ใหม่ (ไม่ตัดกลาง field), ทุก part หัวเป็นคำถาม", () => {
    const chunks = fieldsToChunks(
      [
        g0({ fieldId: "fund_type", value: words(20) }),
        g0({ fieldId: "fiscal_year", value: words(25) }),
        g0({ fieldId: "institution", value: words(20) }),
      ],
      { ...CFG, targetTokens: 30 },
      TPL,
    );
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.meta.part).toBe(i + 1);
      expect(c.meta.parts).toBe(chunks.length);
      expect(c.meta.field_ids).toEqual(["fund_type", "fiscal_year", "institution"]);
    });
    // ทุก part ขึ้นต้นด้วยคำถามของ field (บรรทัดแรก = คำถาม ไม่ใช่คำตอบครึ่ง ๆ)
    for (const c of chunks) {
      const firstLine = c.content.split("\n")[0];
      expect(["ประเภททุน", "ปีงบประมาณ", "ชื่อหน่วยงาน"]).toContain(firstLine);
    }
    // เนื้อหาครบไม่หาย
    expect(chunks.flatMap((c) => c.content.split(/\s+/)).filter((w) => w.startsWith("w")).length).toBe(65);
  });

  it("field ในกลุ่มบางตัวว่าง → เฉพาะ field ที่มีเนื้อหาอยู่ใน chunk, field_ids ยังครบทั้งกลุ่ม", () => {
    const chunks = fieldsToChunks(
      [g0({ fieldId: "fund_type", value: "ทุนวิจัย" }), g0({ fieldId: "fiscal_year" }), g0({ fieldId: "institution", value: "มอ." })],
      CFG,
      TPL,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).not.toContain("ปีงบประมาณ\n"); // field ว่างไม่ถูก render
    expect(chunks[0].content).toContain("ประเภททุน");
    expect(chunks[0].content).toContain("ชื่อหน่วยงาน");
    expect(chunks[0].meta.field_ids).toEqual(["fund_type", "fiscal_year", "institution"]);
  });

  it("enum ในกลุ่ม — label ที่ติ๊กเข้าเนื้อหากลุ่ม, ตัวเลือกไม่ติ๊กไม่ปรากฏ", () => {
    const chunks = fieldsToChunks([f({ fieldId: "research_type", type: "enum", enumValue: "applied_research" })], CFG, TPL);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading_path).toBe("ส่วนที่ 1 ข้อมูลทั่วไป > ข้อมูลทั่วไป");
    expect(chunks[0].content).toContain("ประเภทของการวิจัย: การวิจัยประยุกต์ (Applied Research)");
    expect(chunks[0].content).not.toContain("การวิจัยพื้นฐาน");
    expect(chunks[0].meta.field_ids).toEqual(["research_type"]);
  });

  it("ทุก field ในกลุ่มว่าง → ไม่เกิด chunk เปล่า", () => {
    const chunks = fieldsToChunks([g0({ fieldId: "fund_type" }), g0({ fieldId: "fiscal_year" })], CFG, TPL);
    expect(chunks).toEqual([]);
  });

  it("กลุ่ม + field นอกกลุ่มปนกัน — chunk_index ต่อเนื่อง", () => {
    const chunks = fieldsToChunks(
      [f({ fieldId: "solo", value: "x" }), g0({ fieldId: "fund_type", value: "ทุน" }), f({ fieldId: "solo2", value: "y" })],
      CFG,
      TPL,
    );
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1, 2]);
  });
});

describe("fieldsToChunks — checkpoint Core บน fixture FF2569", () => {
  const chunksP = (async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    return { fields: r.fields, chunks: fieldsToChunks(r.fields, { targetTokens: 450, overlapPercent: 10, tableMaxTokens: 4096 }) };
  })();

  it("ทุก field ที่มีคำตอบถูกคลุมโดย meta.field_ids ของ chunk บางก้อน", async () => {
    const { fields, chunks } = await chunksP;
    const withContent = fields
      .filter((x) => x.value !== null || x.enumValue !== null || (x.table !== null && x.table.length > 0))
      .map((x) => x.fieldId);
    const indexed = new Set(chunks.flatMap((c) => c.meta.field_ids));
    expect(withContent.filter((id) => !indexed.has(id))).toEqual([]);
    // คำตอบว่าง → คำถามของ field นั้นไม่ปรากฏในเนื้อหา chunk ใด (group อาจอ้าง id ไว้ใน field_ids แต่ไม่ render)
    const allContent = chunks.map((c) => c.content).join("\n");
    for (const empty of ["yearly_budget", "previous_results_summary", "budget_summary", "pi_experience", "research_standards", "subactivity", "research_framework"]) {
      const q = fields.find((x) => x.fieldId === empty)?.question ?? "";
      expect(allContent.includes(q), `empty field ${empty} ไม่ควรถูก render`).toBe(false);
    }
  });

  it("คำถามของฟอร์มติดทุก chunk — บรรทัดแรกขึ้นต้นด้วยคำถามของ field ตัวแรกที่มีเนื้อหา", async () => {
    const { fields, chunks } = await chunksP;
    const questionOf = new Map(fields.map((x) => [x.fieldId, x.question]));
    const sectionTitles = new Map(ff2569Template.sections.map((s) => [s.id, s.title]));
    for (const c of chunks) {
      const firstQ = c.meta.field_ids.map((id) => questionOf.get(id) ?? "").find((q) => q !== "" && c.content.startsWith(q));
      expect(firstQ, `chunk ${String(c.chunk_index)} ไม่มีคำถามนำหน้า: ${c.content.slice(0, 40)}`).toBeDefined();
      expect(c.heading_path?.startsWith(sectionTitles.get(c.meta.section_id) ?? "\u0000")).toBe(true);
    }
  });

  it("0 boilerplate — label ของตัวเลือกที่ไม่ติ๊ก (plan_type/research_type) ไม่ปรากฏใน index", async () => {
    const { chunks } = await chunksP;
    for (const c of chunks) {
      expect(c.content).not.toContain("การวิจัยพื้นฐาน (Basic research)"); // plan_type: ติ๊ก technology_development
      expect(c.content).not.toContain("การวิจัยพื้นฐาน (Basic Research)"); // research_type: ติ๊ก applied_research
    }
  });

  it("ตารางทุกตัว → chunk เต็มตารางเดียว — header ครบ, ไม่มี table_row/parent_chunk_index (Rev 2: ลบ row-chunk)", async () => {
    const { chunks } = await chunksP;
    const tables = chunks.filter((c) => c.content.includes("\n|"));
    expect(tables.length).toBeGreaterThanOrEqual(10); // ตารางที่ match ครบ ~11 (ยกเว้น yearly_budget ที่ว่าง)
    for (const c of chunks) {
      expect(c.meta).not.toHaveProperty("table_row");
      expect(c.meta).not.toHaveProperty("parent_chunk_index");
    }
    const gantt = tables.find((c) => c.content.includes("| ปีที่ | กิจกรรม |"));
    expect(gantt).toBeDefined();
    expect((gantt?.content.match(/\n\|/g) ?? []).length).toBeGreaterThanOrEqual(20); // แถว Gantt อยู่ครบใน chunk เดียว
    expect(gantt?.meta.field_ids).toEqual(["work_plan"]);
  });

  it("enum ที่ติ๊กเข้าเนื้อหากลุ่ม — technology_development/applied_research/not_submitted ปรากฏ", async () => {
    const { chunks } = await chunksP;
    const all = chunks.map((c) => c.content).join("\n");
    expect(all).toContain("การพัฒนาวิทยาศาสตร์เทคโนโลยี (Technology Development)");
    expect(all).toContain("การวิจัยประยุกต์ (Applied Research)");
    expect(all).toContain("ไม่ได้ยื่นขอ");
  });

  it("กลุ่ม s0/s1/s2_image เกิด chunk ตาม template FF2569 จริง — heading_path ใช้ label ของกลุ่ม", async () => {
    const { chunks } = await chunksP;
    const labels = chunks.map((c) => c.heading_path?.split(" > ").slice(1).join(" > ") ?? "");
    expect(labels).toContain("ข้อมูลหัวฟอร์ม");
    expect(labels.filter((l) => l === "ข้อมูลทั่วไป").length).toBeGreaterThanOrEqual(1); // s1 ยาว → มี part ต่อเนื่อง
    expect(labels).toContain("รูปภาพ"); // s2_image group เกิดเมื่อ framework_description มีค่า
    const s1Parts = chunks.filter((c) => c.heading_path === "ส่วนที่ 1 ข้อมูลทั่วไป > ข้อมูลทั่วไป");
    expect(s1Parts.length).toBeGreaterThanOrEqual(1);
    if (s1Parts.length > 1) {
      for (const [i, c] of s1Parts.entries()) {
        expect(c.meta.part).toBe(i + 1);
        expect(c.meta.parts).toBe(s1Parts.length);
      }
    }
  });
});
