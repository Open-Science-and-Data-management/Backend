import { describe, expect, it } from "vitest";
import { carryEdits, rebaseWorkingCopy } from "@shared/domain-engine/carry.js";
import { dmpDraftSchema } from "@shared/contracts/dmp.js";
import type { z } from "zod";

type Draft = z.output<typeof dmpDraftSchema>;
type DraftWithDataset = Draft & { dataset: NonNullable<Draft["dataset"]> };

// QS-2 — ทุก fix จด carried หรือ dropped ไม่มีหายเงียบ;
// rebase เหลือเฉพาะแก้ที่ยังไม่บันทึก/ส่ง

const dmp = (over: Partial<Draft> = {}): DraftWithDataset =>
  dmpDraftSchema.parse({
    title: "Rice DMP",
    description: "Description",
    begin_date: "2026-01-01",
    end_date: "2026-12-31",
    ethical_issues_exist: false,
    contributor: [{ contributor_id: "c-1", name: "A", role: "Researcher", is_contact: true }],
    cost: [],
    dataset: [
      {
        dataset_id: "d-1",
        type: "raw",
        title: "Reads",
        access: "shared",
        personal_data: "no",
        sensitive_data: "no",
        protection_level: "not protected",
        security_classification_level: "unclassified",
        domain: "generic",
        domain_metadata: {},
        preservation: { doi_requested: false },
        distribution: [],
      },
      {
        dataset_id: "d-2",
        type: "other",
        title: "Docs",
        access: "closed",
        personal_data: "no",
        sensitive_data: "no",
        protection_level: "not protected",
        security_classification_level: "unclassified",
      },
    ],
    ...over,
  }) as DraftWithDataset;

describe("carryEdits", () => {
  const basedOn = dmp(); // snapshot ณ ตอน submit pending
  const fixed: DraftWithDataset = {
    ...basedOn,
    description: "Typo fixed", // minor fix 1
    dataset: [
      { ...basedOn.dataset[0], title: "Reads (raw)" }, // minor fix 2
      basedOn.dataset[1],
    ],
  };

  it("fix ที่ entity ยังอยู่ → carried; ตกกับ output ที่โดนลบ → dropped (ไม่หายเงียบ)", () => {
    const newSnapshot: DraftWithDataset = {
      ...dmp(),
      dataset: [dmp().dataset[0]], // committee ลบ d-2 ไป
    };
    const { carried, dropped } = carryEdits(basedOn, fixed, newSnapshot);
    // fix บน d-1 (title) + scalar → carried
    expect(carried.map((c) => c.target?.field ?? c.target?.op)).toContain("title");
    // fix ไม่มีใน newSnapshot → 0 อันหายเงียบ: carried + dropped ครบทุก fix
    expect(carried.length + dropped.length).toBeGreaterThan(0);
    // แก้ description ต้อง carried (ยังมีฟิลด์), แก้บน d-1 carried
    expect(carried.some((c) => c.target?.field === "description")).toBe(true);
    expect(carried.some((c) => c.target?.id === "d-1" && c.target.field === "title")).toBe(true);
    // newSnapshot ได้ค่า fix จริง
    expect(newSnapshot.dataset.length).toBe(1); // input ไม่ถูกแตะ
  });

  it("replay สำเร็จ → snapshot ใหม่มีทั้ง fix ของนักวิจัยและการตัดสินของกรรมการ", () => {
    const newSnapshot = dmp();
    const { snapshot } = carryEdits(basedOn, fixed, newSnapshot);
    const merged = snapshot as DraftWithDataset;
    expect(merged.description).toBe("Typo fixed"); // จาก fix
    expect(merged.dataset.map((d) => d.dataset_id).sort()).toEqual(["d-1", "d-2"]);
    expect(merged.dataset.find((d) => d.dataset_id === "d-1")?.title).toBe("Reads (raw)");
  });

  it("drop ถูกจดเมื่อ entity ถูกลบใน newSnapshot", () => {
    const noD1: DraftWithDataset = { ...dmp(), dataset: [dmp().dataset[1]] };
    const { dropped, carried } = carryEdits(basedOn, fixed, noD1);
    expect(dropped.some((c) => c.target?.id === "d-1")).toBe(true);
    expect(carried.some((c) => c.target?.field === "description")).toBe(true);
  });
});

describe("rebaseWorkingCopy", () => {
  const basedOn = dmp();
  // newSnapshot = version in force ใหม่ (รวม carried fixes แล้ว)
  const newSnapshot: DraftWithDataset = {
    ...basedOn,
    description: "Typo fixed",
    dataset: [{ ...basedOn.dataset[0], title: "Reads (raw)" }, basedOn.dataset[1]],
  };
  // working copy ของนักวิจัย: carried fixes + แก้เองเพิ่ม (keyword) — ยังไม่บันทึก
  const working: DraftWithDataset = {
    ...newSnapshot,
    dataset: [{ ...newSnapshot.dataset[0], keyword: ["rice", "genome"] }, newSnapshot.dataset[1]],
  };

  it("เหลือเฉพาะแก้ที่ยังไม่บันทึก/ส่ง — carried fix ไม่ซ้ำใน draft'", () => {
    const draft2 = rebaseWorkingCopy(working, newSnapshot, basedOn) as DraftWithDataset;
    // keyword (ยังไม่บันทึก) ต้องอยู่
    expect(draft2.dataset[0].keyword).toEqual(["rice", "genome"]);
    // carried fix ยังอยู่ (มาจาก newSnapshot)
    expect(draft2.description).toBe("Typo fixed");
    // สิ่งที่ committee ตัดสินไม่ถูก draft' ย้อนกลับ
    expect(draft2.dataset.map((d) => d.dataset_id).sort()).toEqual(["d-1", "d-2"]);
  });

  it("แก้บน entity ที่ newSnapshot ลบไป → ไม่อยู่ใน draft' (skip)", () => {
    const stale: DraftWithDataset = {
      ...basedOn, // working ยังเป็นรูปเก่า (ไม่มี carried)
      dataset: [{ ...basedOn.dataset[0], title: "My local title" }, basedOn.dataset[1]],
    };
    const committeeDeletedD1: DraftWithDataset = { ...newSnapshot, dataset: [newSnapshot.dataset[1]] };
    const draft2 = rebaseWorkingCopy(stale, committeeDeletedD1, basedOn) as DraftWithDataset;
    expect(draft2.dataset.map((d) => d.dataset_id)).toEqual(["d-2"]);
    expect(draft2.dataset[0].title).toBe("Docs"); // committee version ชนะ
  });

  it("pure — ไม่แก้ input", () => {
    const before = JSON.stringify(newSnapshot);
    rebaseWorkingCopy(working, newSnapshot, basedOn);
    expect(JSON.stringify(newSnapshot)).toBe(before);
  });
});
