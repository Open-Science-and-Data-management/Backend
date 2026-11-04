// foldMinor — pure (CON-2): บันทึกการแก้เล็กลง snapshot ของ version in force
// + จด minor_edits; pending snapshot ไม่ถูกแตะ (arc42 flow #8/#9)
// delta: ต้องมี working draft เป็นแหล่งค่าใหม่ — FieldChange เก็บ from/to
// เป็นข้อความสำหรับคนอ่าน ไม่ใช่ค่าดิบ
import type { DmpDraftInput } from "@shared/contracts/index.js";
import { applyChanges, type FieldChange } from "./diff-draft.js";

export interface FoldResult {
  /** snapshot ใหม่ (clone) — ตัวเดิมไม่ถูกแตะ */
  snapshot: DmpDraftInput;
  /** รายการ minor edits ที่ fold สำเร็จ — จดลง dmp_versions.minor_edits */
  minorEdits: FieldChange[];
}

export function foldMinor(
  snapshot: DmpDraftInput,
  working: DmpDraftInput,
  changes: FieldChange[],
): FoldResult {
  const minorChanges = changes.filter((c) => c.edit_type !== "major");
  const { plan, applied } = applyChanges(snapshot, working, minorChanges);
  return { snapshot: plan, minorEdits: applied };
}
