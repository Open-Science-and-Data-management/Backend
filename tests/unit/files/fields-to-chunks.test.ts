// unit — fieldsToChunks: fields → chunk ต่อ field (SPEC ff2569 Task 4)
// checkpoint Core: ทุก field ที่มีคำตอบมี chunk (คำถาม prefix ทุกก้อน), 0 boilerplate,
//                  คำตอบว่างไม่เกิด chunk, คำตอบยาวแตก part i/n, ตารางเป็น parent + row-chunks
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fieldsToChunks, type ChunkWithMeta } from "@/features/files/chunking.js";
import { parseDocxForm } from "@/features/files/docx-form.js";
import { extractFields, type ExtractedField } from "@/features/files/form-extract.js";
import { ff2569Template, type Ff2569Template } from "@/features/files/templates/ff2569.js";

const fixture = readFile(fileURLToPath(new URL("../../fixtures/ff2569-proposal.docx", import.meta.url)));

const CFG = { targetTokens: 30, overlapPercent: 0 };

// synthetic template เล็ก — fieldsToChunks อิงเฉพาะ sections/fields (min-count ของ zod ผูกกับ template จริง)
const TPL: Ff2569Template = {
  version: "FF2569",
  sections: [
    { id: "s1_general", title: "ส่วนที่ 1 ข้อมูลทั่วไป" },
    { id: "s2_project", title: "ส่วนที่ 2 ข้อมูลโครงการ" },
  ],
  fields: [
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
      fieldId: "subactivity",
      sectionId: "s2_project",
      question: "แนวคิด ทฤษฎี และสมมติฐานงานวิจัยและพัฒนานวัตกรรม — กิจกรรมย่อยที่ N",
      type: "text",
      repeats: 3,
      children: [{ fieldId: "concept", question: "แนวคิด", type: "long_text" }],
    },
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
const bodyOf = (c: ChunkWithMeta) => c.content.split("\n").slice(1).join("\n");

describe("fieldsToChunks — กฎพื้นฐาน", () => {
  it("คำตอบสั้น — 1 chunk, คำถามขึ้นหัว chunk, heading_path = ส่วน > คำถาม, meta ครบ", () => {
    const chunks = fieldsToChunks([f({ fieldId: "title_th", value: "ระบบตรวจสอบคุณภาพผลผลิต" })], CFG, TPL);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.startsWith("คำถามของ title_th\n")).toBe(true);
    expect(chunks[0].heading_path).toBe("ส่วนที่ 1 ข้อมูลทั่วไป > คำถามของ title_th");
    expect(chunks[0].meta).toEqual({
      template_version: "FF2569",
      field_id: "title_th",
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
    expect(chunks.flatMap((c) => bodyOf(c).split(/\s+/))).toEqual(words(75).split(/\s+/));
  });

  it("enum — เนื้อหาเป็น label ที่ติ๊กเท่านั้น, meta.enum_value canonical, ตัวเลือกไม่ติ๊กไม่ปรากฏ", () => {
    const chunks = fieldsToChunks([f({ fieldId: "research_type", type: "enum", enumValue: "applied_research" })], CFG, TPL);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("ประเภทของการวิจัย: การวิจัยประยุกต์ (Applied Research)");
    expect(chunks[0].meta.enum_value).toBe("applied_research");
    expect(chunks[0].content).not.toContain("การวิจัยพื้นฐาน");
  });

  it("ตาราง — parent (ตารางเต็ม) มาก่อน, row-chunks แนบ header ทุกแถว, ช่องว่าง/แถวว่างถูกข้าม", () => {
    const chunks = fieldsToChunks(
      [
        f({
          fieldId: "yearly_budget",
          type: "table",
          table: [
            ["2569", "500000"],
            ["", ""],
            ["2570", "", "หมายเหตุ"],
          ],
        }),
      ],
      CFG,
      TPL,
    );
    expect(chunks).toHaveLength(3); // parent + 2 row (แถวว่างถูกข้าม)
    expect(chunks[0].content).toContain("| ปีงบประมาณ | งบประมาณ (บาท) |");
    expect(chunks[0].content).toContain("| 2569 | 500000 |");
    const rows = chunks.slice(1);
    expect(rows.map((c) => c.meta.table_row)).toEqual([0, 2]);
    expect(rows.map((c) => c.meta.parent_chunk_index)).toEqual([0, 0]);
    expect(rows[0].content).toBe("ปีงบประมาณและงบประมาณรายปีของโครงการ\nปีงบประมาณ: 2569\nงบประมาณ (บาท): 500000");
    expect(rows[1].content).toContain("คอลัมน์ 3: หมายเหตุ"); // cell เกิน tableColumns → ชื่อ generic
  });

  it("child ของ repeated field — heading_path มี parent question พร้อมเลขรอบ", () => {
    const chunks = fieldsToChunks([f({ fieldId: "subactivity[2].concept", sectionId: "s2_project", type: "long_text", value: "แนวคิดย่อย" })], CFG, TPL);
    expect(chunks[0].heading_path).toBe("ส่วนที่ 2 ข้อมูลโครงการ > แนวคิด ทฤษฎี และสมมติฐานงานวิจัยและพัฒนานวัตกรรม — กิจกรรมย่อยที่ 2 > แนวคิด");
    expect(chunks[0].meta.field_id).toBe("subactivity[2].concept");
  });

  it("image มี caption จาก VLM — 1 chunk คำถาม prefix, caption trim; ไม่มี/ว่าง → ไม่เกิด chunk (Task 7)", () => {
    const withCaption = fieldsToChunks(
      [f({ fieldId: "research_framework", sectionId: "s2_project", type: "image", imageRid: "rId15", caption: "  แผนภาพกรอบการวิจัย 3 ชั้น  " })],
      CFG,
      TPL,
    );
    expect(withCaption).toHaveLength(1);
    expect(withCaption[0].content).toBe("คำถามของ research_framework\nแผนภาพกรอบการวิจัย 3 ชั้น");
    expect(withCaption[0].meta.field_id).toBe("research_framework");
    expect(withCaption[0].heading_path).toBe("ส่วนที่ 2 ข้อมูลโครงการ > คำถามของ research_framework");

    expect(fieldsToChunks([f({ fieldId: "a", type: "image", imageRid: "r1" })], CFG, TPL)).toHaveLength(0);
    expect(fieldsToChunks([f({ fieldId: "b", type: "image", imageRid: "r1", caption: "   " })], CFG, TPL)).toHaveLength(0);
  });

  it("chunk_index ต่อเนื่องตามลำดับ field ในเอกสาร", () => {
    const chunks = fieldsToChunks([f({ fieldId: "a", value: "x" }), f({ fieldId: "b", value: "y" })], CFG, TPL);
    expect(chunks.map((c) => c.chunk_index)).toEqual([0, 1]);
  });
});

describe("fieldsToChunks — checkpoint Core บน fixture FF2569", () => {
  const chunksP = (async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    return { fields: r.fields, chunks: fieldsToChunks(r.fields, { targetTokens: 450, overlapPercent: 10 }) };
  })();

  it("ทุก field ที่มีคำตอบมี ≥1 chunk — meta.field_id ครบตาม field ที่มีเนื้อหา", async () => {
    const { fields, chunks } = await chunksP;
    const withContent = new Set(
      fields.filter((x) => x.value !== null || x.enumValue !== null || (x.table !== null && x.table.length > 0)).map((x) => x.fieldId),
    );
    const indexed = new Set(chunks.map((c) => c.meta.field_id));
    expect([...withContent].filter((id) => !indexed.has(id))).toEqual([]);
    // คำตอบว่าง/anchor/image ก่อน caption → ไม่มี chunk (image รอ VLM caption — Task 7)
    for (const empty of ["yearly_budget", "previous_results_summary", "budget_summary", "pi_experience", "research_standards", "subactivity", "research_framework"]) {
      expect(indexed.has(empty)).toBe(false);
    }
  });

  it("คำถามของฟอร์มติดทุก chunk — บรรทัดแรกของ content ขึ้นต้นด้วยคำถามจาก template", async () => {
    const { fields, chunks } = await chunksP;
    const questionOf = new Map(fields.map((x) => [x.fieldId, x.question]));
    const sectionTitles = new Map(ff2569Template.sections.map((s) => [s.id, s.title]));
    for (const c of chunks) {
      expect(c.content.startsWith(questionOf.get(c.meta.field_id) ?? "")).toBe(true);
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

  it("ตารางเป็น row-chunks พร้อม header — ทุก row-chunk มี parent และคำถามติดทุกแถว", async () => {
    const { chunks } = await chunksP;
    const parents = chunks.filter((c) => c.meta.parent_chunk_index === undefined && c.meta.table_row === undefined && c.content.includes("\n|"));
    expect(parents.length).toBeGreaterThanOrEqual(10); // ตารางที่ match ครบ ~11 (ยกเว้น yearly_budget ที่ว่าง)
    const rows = chunks.filter((c) => c.meta.parent_chunk_index !== undefined);
    expect(rows.length).toBeGreaterThan(30); // Gantt 20 + OECD 6 + อื่น ๆ
    for (const r of rows) {
      const parent = chunks[r.meta.parent_chunk_index ?? -1]; // ปลอดภัย: parent chunk ถูก emit ก่อน row เสมอ
      expect(parent.meta.field_id).toBe(r.meta.field_id);
      expect(parent.content).toContain(r.meta.field_id === "work_plan" ? "| ปีที่ | กิจกรรม |" : "|");
      expect(r.content.startsWith(questionOf(r))).toBe(true);
    }
    function questionOf(c: ChunkWithMeta): string {
      return c.content.split("\n")[0];
    }
  });

  it("enum ลง meta ครบ — plan_type/research_type/major_project เป็น canonical ตาม extractor", async () => {
    const { chunks } = await chunksP;
    const enumOf = (id: string) => chunks.find((c) => c.meta.field_id === id)?.meta.enum_value;
    expect(enumOf("plan_type")).toBe("technology_development");
    expect(enumOf("research_type")).toBe("applied_research");
    expect(enumOf("major_project")).toBe("not_submitted");
  });
});
