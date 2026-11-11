// unit — ff2569 template: โครง schema ครบ สม่ำเสมอ และผ่าน Zod validation ของตัวเอง
import { describe, expect, it } from "vitest";
import { FF2569_TEMPLATE_VERSION, ff2569Template, ff2569TemplateSchema } from "@/features/files/templates/ff2569.js";

describe("ff2569Template", () => {
  const { sections, fields } = ff2569Template;
  const sectionIds = new Set(sections.map((s) => s.id));

  it("template_version = FF2569", () => {
    expect(FF2569_TEMPLATE_VERSION).toBe("FF2569");
    expect(ff2569Template.version).toBe("FF2569");
  });

  it("field IDs unique และเป็น snake_case", () => {
    const ids = fields.map((f) => f.fieldId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("ทุก field มี sectionId ที่ประกาศใน sections, question text, และ type ที่รู้จัก", () => {
    const types = ["text", "long_text", "list", "enum", "bool", "table", "image"];
    expect(fields.length).toBeGreaterThan(25);
    for (const f of fields) {
      expect(sectionIds.has(f.sectionId), `field ${f.fieldId}: unknown section ${f.sectionId}`).toBe(true);
      expect(f.question.trim().length, `field ${f.fieldId}: missing question`).toBeGreaterThan(0);
      expect(types, `field ${f.fieldId}: bad type`).toContain(f.type);
    }
  });

  it("enum field ต้องมี options ≥ 2 พร้อม canonical value + labels สำหรับ match", () => {
    for (const f of fields.filter((f) => f.type === "enum")) {
      expect(f.options?.length ?? 0, `enum ${f.fieldId} missing options`).toBeGreaterThanOrEqual(2);
      for (const o of f.options!) {
        expect(o.value).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(o.labels.length, `enum ${f.fieldId}/${o.value} missing labels`).toBeGreaterThan(0);
      }
    }
  });

  it("table field ต้องมี tableColumns ≥ 1", () => {
    for (const f of fields.filter((f) => f.type === "table")) {
      expect(f.tableColumns?.length ?? 0, `table ${f.fieldId} missing columns`).toBeGreaterThan(0);
    }
  });

  it("subactivity เป็นก้อนโครงซ้ำ — ประกาศครั้งเดียว ไม่ hardcode ทั้ง 3 ก้อน", () => {
    const sa = fields.find((f) => f.fieldId === "subactivity");
    expect(sa).toBeDefined();
    expect(sa?.repeats).toBe(3);
    expect(sa?.children?.length ?? 0).toBeGreaterThan(2);
    const childIds = sa?.children?.map((c) => c.fieldId) ?? [];
    expect(new Set(childIds).size).toBe(childIds.length);
  });

  it("ครอบครัวหัวข้อหลักทั้ง 4 ส่วน — แผนงาน/ข้อมูลโครงการ/แผนการดำเนินงาน/ผลผลิต", () => {
    const titles = sections.map((s) => s.title).join("\n");
    expect(titles).toContain("ข้อมูลทั่วไป");
    expect(titles).toContain("ข้อมูลโครงการ");
    expect(titles).toContain("แผน");
    expect(titles).toContain("ผลผลิต");
  });

  it("ผ่าน Zod validation ของตัวเอง", () => {
    const parsed = ff2569TemplateSchema.safeParse(ff2569Template);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? []).slice(0, 400)).toBe(true);
  });
});
