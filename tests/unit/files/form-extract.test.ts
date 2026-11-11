// unit — extractFields: raw blocks → FF2569 fields ต่อ template บน fixture จริง (SPEC ff2569, Task 3)
// acceptance: miss = 0, ทุก field มีค่าหรือ null ชัดเจน, enum ถูก canonical, subactivity ×3
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDocxForm } from "@/features/files/docx-form.js";
import { extractFields } from "@/features/files/form-extract.js";
import { ff2569Template } from "@/features/files/templates/ff2569.js";

const fixture = readFile(fileURLToPath(new URL("../../fixtures/ff2569-proposal.docx", import.meta.url)));

describe("extractFields (fixture FF2569)", () => {
  it("match ได้ครบ — miss list = 0 และทุก field ใน template มีผลลัพธ์", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    expect(r.misses).toEqual([]);
    const ids = r.fields.map((f) => f.fieldId);
    for (const f of ff2569Template.fields) {
      if (f.repeats) {
        for (let i = 1; i <= f.repeats; i++)
          for (const c of f.children ?? []) expect(ids).toContain(`${f.fieldId}[${String(i)}].${c.fieldId}`);
      } else expect(ids).toContain(f.fieldId);
    }
    for (const f of r.fields) {
      const resolved = f.value !== null || f.enumValue !== null || f.table !== null || f.imageRid !== null;
      // field ที่ว่างจริงใน fixture: ไม่มีตาราง/ไม่ติ๊ก/ผู้วิจัยไม่กรอก/heading จัดลำดับ
      const emptyOk: Record<string, true> = {
        yearly_budget: true, research_standards: true, previous_results_summary: true,
        other_funding_detail: true, budget_summary: true, pi_experience: true, subactivity: true,
      };
      if (!resolved) expect(emptyOk[f.fieldId], `${f.fieldId} ควรมีค่า`).toBe(true);
    }
  });

  it("enum จาก w14:checked → canonical value ถูกต้อง (negation-aware)", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    const get = (id: string) => {
      const f = r.fields.find((x) => x.fieldId === id);
      if (!f) throw new Error(`missing field ${id}`);
      return f;
    };
    expect(get("plan_type").enumValue).toBe("technology_development");
    expect(get("research_type").enumValue).toBe("applied_research");
    expect(get("major_project").enumValue).toBe("not_submitted"); // ติ๊ก "ไม่ได้ยื่นขอ..." → option ตรงข้าม
    expect(get("sub_plan").enumValue).toBe("supporting_factors");
    expect(get("project_nature").enumValue).toBe("new_project"); // "ไม่เป็น Multi-Year" ต้องไม่กลายเป็น multi_year_promised
    expect(get("other_funding").enumValue).toBe("not_applied");
    expect(get("research_standards").enumValue).toBeNull(); // £ เป็น glyph ไม่ใช่ content control — ไม่มี checked
  });

  it("subactivity ×3 — โครงซ้ำครบ 3 ก้อน พร้อมคำตอบจริง", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    const subs = [1, 2, 3].map((i) => r.fields.filter((f) => f.fieldId.startsWith(`subactivity[${String(i)}].`)));
    expect(subs.map((s) => s.length)).toEqual([5, 5, 5]);
    const pick = (sub: number, child: string) => {
      const f = subs[sub - 1]?.find((x) => x.fieldId === `subactivity[${String(sub)}].${child}`);
      if (!f) throw new Error(`missing subactivity[${String(sub)}].${child}`);
      return f.value ?? "";
    };
    expect(pick(1, "theory")).toContain("Machine Learning");
    expect(pick(2, "concept")).toContain("องค์ความรู้");
    expect(pick(3, "references")).toContain("O’Reilly");
  });

  it("ตารางผูก field ถูกต้อง — header จาก template tableColumns", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    const get = (id: string) => {
      const f = r.fields.find((x) => x.fieldId === id);
      if (!f) throw new Error(`missing field ${id}`);
      return f;
    };
    const team = get("research_team").table;
    if (!team) throw new Error("research_team table should exist");
    expect(team.some((row) => row.some((c) => c.includes("รวิภัทร")))).toBe(true);
    expect(get("work_plan").table?.length).toBe(20); // Gantt
    expect(get("expected_outputs").table?.length).toBe(5);
    expect(get("yearly_budget").table).toBeNull(); // โครงการใหม่ ไม่มีตารางงบรายปี
    expect(get("previous_results").table?.length).toBe(2);
  });

  it("คำตอบสำคัญถูกต้อง + boilerplate (ตัวเลือกไม่ติ๊ก/คำสั่งฟอร์ม/หัวข้อส่วน) ไม่ติด value", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    const get = (id: string) => {
      const f = r.fields.find((x) => x.fieldId === id);
      if (!f) throw new Error(`missing field ${id}`);
      return f;
    };
    expect(get("title_th").value).toBe("บูรณาการเทคโนโลดิจิตอลเพื่อยกระดับสู่นวัตกรรมหลังการเก็บเกี่ยวอย่างชาญฉลาด");
    expect(get("title_en").value).toBe("Integrating Digital Technologies to Elevate into Smart Post-Harvest Innovations");
    expect(get("fiscal_year").value).toContain("2569");
    expect(get("institution").value).toContain("สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง");
    expect(get("executive_summary").value).toContain("โครงการนี้มีแนวคิด");
    expect(get("keywords_en").value).toContain("Computer Vision");
    expect(get("framework_description").value).toContain("จากรูปข้างต้น");
    for (const f of r.fields) {
      if (f.value === null) continue;
      expect.soft(f.value).not.toMatch(/[☒☐£]/); // ตัวเลือกไม่ติ๊ก
      expect.soft(f.value).not.toMatch(/^ส่วนที่/); // หัวข้อส่วน
      expect.soft(f.value).not.toContain("........."); // placeholder จุดไข่ปลา
      expect.soft(f.value).not.toMatch(/^แสดงรายละเอียด|^ใส่|^หมายเหตุ/); // คำสั่งฟอร์ม
    }
  });

  it("image กับรูปกรอบการวิจัยผูกถูก field", async () => {
    const doc = await parseDocxForm(await fixture);
    const r = extractFields(doc);
    const fw = r.fields.find((f) => f.fieldId === "research_framework");
    expect(fw?.imageRid).toBe("rId15");
  });
});

// ── synthetic (Rev 2, D8): ตำแหน่งรูปใน s2 ยืดหยุ่น ──────────────────────────
import type { RawFormDocument } from "@/features/files/docx-form.js";

function syntheticDoc(paras: string[], images: Array<[string, number]> = []): RawFormDocument {
  return {
    paragraphs: paras,
    paragraphBlocks: paras.map((_, i) => i),
    tables: [],
    tableBlocks: [],
    checkboxes: [],
    images: images.map(([rid]) => rid),
    imageBlocks: images.map(([, block]) => block),
    rels: {},
  };
}

const S2_Q = {
  summary: "บทสรุปข้อเสนอโครงการ",
  framework: "กรอบการวิจัย/พัฒนา (แผนภาพ)",
  description: "จากรูปข้างต้น คำอธิบายกรอบการวิจัย/พัฒนา (Input–Process–Output)",
  methodology: "ระเบียบวิธีวิจัยและวิธีการดำเนินการวิจัย", // s2 field ถัดไปหลัง framework_description
};

describe("extractFields — D8 image ตำแหน่งยืดหยุ่นใน s2", () => {
  // เอาเฉพาะ field s2 ที่เกี่ยว (extractFields ใช้ tpl ตามลำดับ anchor — ไม่งั้น anchor s0/s1 เดิน cursor เกินก่อน)
  const tpl = {
    ...ff2569Template,
    fields: ff2569Template.fields.filter((f) => ["executive_summary", "research_framework", "framework_description"].includes(f.fieldId)),
  };

  it("รูปวางหลัง text อธิบาย (นอก window ของคำถาม image) → ยังได้ imageRid", () => {
    const doc = syntheticDoc(
      [
        "หัวข้ออื่น",
        S2_Q.summary,
        "บทสรุปบางอย่าง",
        S2_Q.framework,
        S2_Q.description,
        "คำอธิบายกรอบการวิจัย Input–Process–Output เป็นต้น",
        // รูปมาหลังย่อหน้าอธิบาย — หลุด window ของ research_framework (จบที่คำถาม framework_description)
      ],
      [["rId99", 6]],
    );
    const r = extractFields(doc, tpl);
    const fw = r.fields.find((f) => f.fieldId === "research_framework");
    expect(fw?.imageRid).toBe("rId99");
    expect(r.misses.filter((m) => m === "research_framework" || m === "framework_description")).toEqual([]);
  });

  it("รูปวางก่อน text อธิบาย (ใน window ตัวเอง) → ผูกปกติ และ post-pass ไม่แย่งรูปอื่น", () => {
    const doc = syntheticDoc(
      [
        S2_Q.summary,
        S2_Q.framework,
        // รูปใน window ของ research_framework (ก่อนคำถาม framework_description)
        S2_Q.description,
        "คำอธิบายกรอบการวิจัย",
        "ระเบียบวิธีบางอย่าง",
      ],
      [["rId10", 2], ["rId11", 5]], // rId11 อยู่ท้ายสุด — ถูกผูกก่อนแล้ว (window) ไม่มี field ไปแย่ง
    );
    const r = extractFields(doc, tpl);
    const fw = r.fields.find((f) => f.fieldId === "research_framework");
    expect(fw?.imageRid).toBe("rId10"); // ผูกใน window ตัวเองก่อน ไม่ถูก post-pass เปลี่ยน
  });
});
