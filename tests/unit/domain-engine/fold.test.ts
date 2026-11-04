import { describe, expect, it } from "vitest";
import { foldMinor } from "@shared/domain-engine/fold-minor.js";
import { dmpDraftSchema } from "@shared/contracts/dmp.js";
import type { z } from "zod";

type Draft = z.output<typeof dmpDraftSchema>;
type DraftWithDataset = Draft & { dataset: NonNullable<Draft["dataset"]> };

const snapshot = (): DraftWithDataset =>
  dmpDraftSchema.parse({
    title: "Rice DMP",
    description: "Approved description",
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
    ],
  }) as DraftWithDataset;

const working = (): DraftWithDataset => {
  const s = snapshot();
  return {
    ...s,
    description: "Typo fixed description", // minor
    dataset: [{ ...s.dataset[0], title: "Reads (raw)" }], // minor
  };
};

describe("foldMinor", () => {
  it("fold ลง snapshot ที่ clone — input ไม่ถูกแตะ (pending snapshot freeze)", () => {
    const before = snapshot();
    const beforeJson = JSON.stringify(before);
    const result = foldMinor(before, working(), [
      {
        path: "description",
        target: { field: "description", op: "set" },
        label: "Description",
        from: "Approved description",
        to: "Typo fixed description",
        edit_type: "minor",
      },
    ]);
    expect(JSON.stringify(before)).toBe(beforeJson); // แตะ pending snapshot ไม่ได้
    expect(result.snapshot.description).toBe("Typo fixed description");
  });

  it("minor_edits จดครบทุกฟิลด์ที่ fold", () => {
    const result = foldMinor(snapshot(), working(), [
      {
        path: "description",
        target: { field: "description", op: "set" },
        label: "Description",
        from: "Approved description",
        to: "Typo fixed description",
        edit_type: "minor",
      },
      {
        path: "dataset[0].title",
        target: { list: "dataset", id: "d-1", field: "title", op: "set" },
        label: "Research output 1: Title",
        from: "Reads",
        to: "Reads (raw)",
        edit_type: "minor",
      },
    ]);
    expect((result.snapshot.dataset ?? [])[0].title).toBe("Reads (raw)");
    expect(result.minorEdits).toHaveLength(2);
    expect(result.minorEdits.map((c) => c.path).sort()).toEqual([
      "dataset[0].title",
      "description",
    ]);
  });

  it("major ไม่ถูก fold (ผู้เรียกส่งมาผิด ก็ตัดออกเอง)", () => {
    const result = foldMinor(snapshot(), working(), [
      {
        path: "description",
        target: { field: "description", op: "set" },
        label: "Description",
        from: "a",
        to: "b",
        edit_type: "minor",
      },
      {
        path: "end_date",
        target: { field: "end_date", op: "set" },
        label: "End date",
        from: "2026-12-31",
        to: "2027-12-31",
        edit_type: "major",
      },
    ]);
    expect(result.minorEdits).toHaveLength(1);
    expect(result.snapshot.end_date).toEqual(new Date("2026-12-31T00:00:00.000Z"));
  });

  it("entry ที่หายไปจาก snapshot → fold ไม่ได้ แต่ยังถือว่าจดใน minor_edits เฉพาะอันสำเร็จ", () => {
    const gone = snapshot();
    gone.dataset = [];
    const result = foldMinor(gone, working(), [
      {
        path: "dataset[0].title",
        target: { list: "dataset", id: "d-1", field: "title", op: "set" },
        label: "Research output 1: Title",
        from: "Reads",
        to: "Reads (raw)",
        edit_type: "minor",
      },
    ]);
    expect(result.minorEdits).toHaveLength(0);
  });
});
