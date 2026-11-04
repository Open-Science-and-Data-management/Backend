import { describe, expect, it } from "vitest";
import { classify } from "@shared/domain-engine/classify.js";
import type { FieldChange } from "@shared/domain-engine/diff-draft.js";

const change = (over: Partial<FieldChange>): FieldChange => ({
  path: "x",
  label: "x",
  from: "a",
  to: "b",
  edit_type: "minor",
  ...over,
});

// classify รวมคำตัดสินรายฟิลด์ของ diffDraft (ซึ่งตัดสินจาก registry จริง
// — field-policy.ts, จด delta ไว้ที่ docs/plans/field-policy-delta.md)

describe("classify", () => {
  it("ชุดการแก้ทั้งหมด minor → minor", () => {
    const changes = [
      change({ target: { field: "description", op: "set" } }),
      change({ target: { field: "sensitive_data", op: "set" } }),
    ];
    expect(classify(changes)).toBe("minor");
  });

  it("major ฟิลด์เดียว = ทั้งชุด major", () => {
    const changes = [
      change({ target: { field: "description", op: "set" } }),
      change({ target: { field: "end_date", op: "set" }, edit_type: "major" }),
    ];
    expect(classify(changes)).toBe("major");
  });

  it("listPolicies — dataset add/remove = major; cost = minor; contributor = major (registry จริง)", () => {
    expect(
      classify([change({ target: { list: "dataset", op: "add" }, edit_type: "major" })]),
    ).toBe("major");
    expect(
      classify([change({ target: { list: "dataset", op: "remove" }, edit_type: "major" })]),
    ).toBe("major");
    expect(classify([change({ target: { list: "cost", op: "add" } })])).toBe("minor");
    expect(classify([change({ target: { list: "cost", op: "remove" } })])).toBe("minor");
    expect(
      classify([change({ target: { list: "contributor", op: "add" }, edit_type: "major" })]),
    ).toBe("major");
  });

  it("changes ว่าง → minor", () => {
    expect(classify([])).toBe("minor");
  });
});
