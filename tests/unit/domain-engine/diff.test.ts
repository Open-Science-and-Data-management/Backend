import { describe, expect, it } from "vitest";
import {
  applyChanges,
  diffDraft,
  editTypeOf,

} from "@shared/domain-engine/diff-draft.js";
import { dmpDraftSchema } from "@shared/contracts/dmp.js";
import type { z } from "zod";

// Acceptance: add/edit/remove/reorder ตรวจจับถูก; entity id เป็นตัวจับคู่เสมอ

type Draft = z.output<typeof dmpDraftSchema>;
type DraftWithDataset = Draft & { dataset: NonNullable<Draft["dataset"]> };

const base = (): DraftWithDataset =>
  dmpDraftSchema.parse({
    title: "Rice DMP",
    description: "Old description",
    begin_date: "2026-01-01",
    end_date: "2026-12-31",
    ethical_issues_exist: false,
    contributor: [
      { contributor_id: "c-1", name: "A", role: "Researcher", is_contact: true },
      { contributor_id: "c-2", name: "B", role: "Analyst" },
    ],
    cost: [{ cost_id: "k-1", title: "Sequencing", value: 1000, currency_code: "THB" }],
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
        distribution: [
          { distribution_id: "dist-1", title: "Zenodo", data_access: "open", license: "CC-BY" },
        ],
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
  }) as DraftWithDataset;

describe("edit detection", () => {
  it("แก้ scalar ระดับแผน → set บนฟิลด์นั้น", () => {
    const b = base();
    const changes = diffDraft({ ...b, title: "New title" }, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      target: { field: "title", op: "set" },
      from: "Rice DMP",
      to: "New title",
    });
  });

  it("แก้ฟิลด์ major (access) → edit_type major", () => {
    const b = base();
    const d1 = { ...b.dataset[0], access: "closed" as const };
    const changes = diffDraft({ ...b, dataset: [d1, ...b.dataset.slice(1)] }, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "dataset[0].access",
      target: { list: "dataset", id: "d-1", field: "access", op: "set" },
      edit_type: "major",
    });
    expect(editTypeOf(changes)).toBe("major");
  });

  it("reorder dataset — จับคู่ด้วย id จึงไม่มี change", () => {
    const b = base();
    const changes = diffDraft({ ...b, dataset: [b.dataset[1], b.dataset[0]] }, b);
    expect(changes).toEqual([]);
  });

  it("reorder + แก้ในเดียวกัน — id ยังจับคู่ถูกตัว", () => {
    const b = base();
    const d1 = { ...b.dataset[0], title: "Renamed" };
    const changes = diffDraft({ ...b, dataset: [b.dataset[1], d1] }, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ target: { id: "d-1", field: "title" }, to: "Renamed" });
  });
});

describe("add / remove", () => {
  it("เพิ่ม dataset ใหม่ → op add (list policy major)", () => {
    const b = base();
    const added = { ...b.dataset[0], dataset_id: "d-new", title: "New set" };
    const changes = diffDraft({ ...b, dataset: [...b.dataset, added] }, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      target: { list: "dataset", id: "d-new", op: "add" },
      edit_type: "major",
    });
  });

  it("ลบ dataset → op remove ชี้ด้วย id", () => {
    const b = base();
    const changes = diffDraft(
      { ...b, dataset: b.dataset.filter((d) => d.dataset_id !== "d-2") },
      b,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ target: { list: "dataset", id: "d-2", op: "remove" } });
  });

  it("object field (preservation.repository) แก้ส่วน major → major; แก้ statement อย่างเดียว → minor", () => {
    const b = base();
    const d = b.dataset[0];
    const d2 = b.dataset[1];
    const repo = { ...d, preservation: { ...d.preservation, repository: "Zenodo" } };
    const statement = { ...d, preservation: { ...d.preservation, statement: "Keep 5 years" } };
    expect(editTypeOf(diffDraft({ ...b, dataset: [repo, d2] }, b))).toBe("major");
    expect(editTypeOf(diffDraft({ ...b, dataset: [statement, d2] }, b))).toBe("minor");
  });
});

describe("applyChanges (สำหรับ carry/rebase — Task 11)", () => {
  it("replay ตาม id; entry ที่ base ไม่มีแล้ว → skipped ไม่หายเงียบ", () => {
    const b = base();
    const working: Draft = {
      ...b,
      dataset: [{ ...b.dataset[0], title: "Renamed" }], // แก้ d-1 + ลบ d-2
    };
    const changes = diffDraft(working, b);
    expect(changes.map((c) => c.target?.op).sort()).toEqual(["remove", "set"].sort());

    // replay บน snapshot อื่นที่ยังมีทั้ง d-1, d-2
    const otherBase = base();
    const { plan, applied, skipped } = applyChanges(otherBase, working, changes);
    expect(skipped).toEqual([]);
    expect(applied.length).toBe(changes.length);
    // d-2 ถูกลบใน working → replay ทำให้ otherBase สูญ d-2 ด้วย
    expect((plan.dataset ?? []).map((d) => d.title)).toEqual(["Renamed"]);

    // แต่ถ้า base ใหม่ลบ d-1 ไปแล้ว การ set บน d-1 ต้อง skip
    const noD1: Draft = { ...otherBase, dataset: [otherBase.dataset[1]] };
    const again = applyChanges(noD1, working, changes);
    expect(again.applied.length).toBeLessThan(changes.length);
    expect(again.skipped.every((c) => c.target?.id === "d-1")).toBe(true);
  });

  it("ไม่แก้ input เดิม (pure)", () => {
    const b = base();
    const working = { ...b, title: "X" };
    applyChanges(b, working, diffDraft(working, b));
    expect(b.title).toBe("Rice DMP");
  });
});
