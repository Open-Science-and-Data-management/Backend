// unit — parseDocxForm: อ่าน OOXML ตรงบน fixture FF2569 จริง — ตาราง/checkbox state/รูป ครบตามที่วิเคราะห์ไว้
// (11 ตาราง, 154 checkbox content control, 2 drawing — docs/research/ff2569-form-rag-structure.md §1)
import { assert, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseDocxForm, readDocxImage } from "@/features/files/docx-form.js";

const fixture = readFile(fileURLToPath(new URL("../../fixtures/ff2569-proposal.docx", import.meta.url)));

describe("parseDocxForm (fixture FF2569)", () => {
  it("ได้ตารางครบ 11 ตาราง — แถวเป็น cell text รวมตารางคณะผู้วิจัย", async () => {
    const doc = await parseDocxForm(await fixture);
    expect(doc.tables).toHaveLength(11);
    const teamRow = doc.tables.flatMap((t) => t.rows).find((r) => r.some((c) => c.includes("รวิภัทร")));
    expect(teamRow).toBeDefined();
    assert(teamRow);
    expect(teamRow.some((c) => c.includes("วิศวกรรมเกษตร"))).toBe(true);
    const ganttTable = doc.tables.find((t) => t.rows.some((r) => r.some((c) => c.includes("กิจกรรมย่อยที่ 1"))));
    expect(ganttTable).toBeDefined();
  });

  it("ได้ checkbox ครบ 154 จุด — state มาจาก w14:checked ไม่ใช่ glyph", async () => {
    const doc = await parseDocxForm(await fixture);
    // 154 ที่ grep เคยนับ = open+close tag คูณสอง — checkbox จริง = 77 content controls
    expect(doc.checkboxes).toHaveLength(77);
    // ติ๊ก: แผนงาน "การพัฒนาวิทยาศาสตร์เทคโนโลยี" + ประเภท "การวิจัยประยุกต์ (Applied Research)"
    expect(doc.checkboxes.some((c) => c.checked && c.label.includes("การพัฒนาวิทยาศาสตร์เทคโนโลยี"))).toBe(true);
    expect(doc.checkboxes.some((c) => c.checked && c.label.includes("(Applied Research)"))).toBe(true);
    // ไม่ติ๊ก: แผนงาน "การวิจัยพื้นฐาน (Basic research)" (มี option นี้ใน s1 เท่านั้น)
    expect(doc.checkboxes.some((c) => !c.checked && c.label.includes("Basic research"))).toBe(true);
    // label ไม่ติด glyph ติดหลงเหลือ
    for (const c of doc.checkboxes) expect(c.label).not.toMatch(/[☒☐☑£]/);
  });

  it("ได้ย่อหน้า body ตามลำดับ — รวมหัวข้อและเนื้อหายาว, ข้อความในตารางไม่ปนใน paragraphs", async () => {
    const doc = await parseDocxForm(await fixture);
    expect(doc.paragraphs.length).toBeGreaterThan(80);
    const text = doc.paragraphs.join("\n");
    expect(text).toContain("บทสรุปข้อเสนอโครงการ");
    expect(text).toContain("บูรณาการเทคโนโลดิจิตอล"); // title_th
    // ข้อความเฉพาะในตาราง (ชื่อนักวิจัย) ห้ามอยู่ใน paragraphs
    expect(text).not.toContain("รวิภัทร");
  });

  it("ได้รูปภาพ (rIds) และ rels map rId → target ไฟล์ media", async () => {
    const doc = await parseDocxForm(await fixture);
    expect(doc.images.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(doc.rels).length).toBeGreaterThan(0);
    for (const rId of doc.images) expect(doc.rels[rId], `missing rel for ${rId}`).toMatch(/media\//);
  });

  it("decode HTML entities และ deterministic", async () => {
    const buf = await fixture;
    const a = await parseDocxForm(buf);
    const b = await parseDocxForm(buf);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const all = [...a.paragraphs, ...a.tables.flatMap((t) => t.rows.flat())].join(" ");
    expect(all).not.toMatch(/&amp;|&lt;|&gt;/);
  });
});

describe("readDocxImage (SPEC ff2569 Task 7)", () => {
  it("รูป png ใน fixture → data URI base64 ถอดได้", async () => {
    const buf = await fixture;
    const doc = await parseDocxForm(buf);
    const target = Object.values(doc.rels).find((t) => t.endsWith(".png"));
    assert(target);
    const uri = await readDocxImage(buf, target);
    assert(uri !== null);
    expect(uri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64").byteLength).toBeGreaterThan(0);
  });

  it("ฟอร์แมตที่ VLM ไม่รองรับ (emf) และ entry หาย → null — caller ข้าม caption", async () => {
    const buf = await fixture;
    expect(await readDocxImage(buf, "media/diagram.emf")).toBeNull();
    expect(await readDocxImage(buf, "media/missing.png")).toBeNull();
  });
});
