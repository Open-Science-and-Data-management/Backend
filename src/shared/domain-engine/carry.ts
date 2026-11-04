// carryEdits + rebaseWorkingCopy — pure (CON-2)
// QS-2: ทุก fix จด carried หรือ dropped — ไม่มีการหายเงียบ (arc42 flow #9)
// delta: rebaseWorkingCopy ต้องรู้ basedOn (snapshot ที่ working copy แต่งมาจาก)
// เพื่อแยก "แก้ของผู้ใช้" ออกจาก "สิ่งที่ committee ตัดสินไปแล้ว"
import type { DmpDraftInput } from "@shared/contracts/index.js";
import { applyChanges, diffDraft, type FieldChange } from "./diff-draft.js";

export interface CarryResult {
  /** fix ที่ตามไปได้ — จดลง carried_minor_edits */
  carried: FieldChange[];
  /** fix ที่ตกไป (entity ถูกลบ) — จดลง dropped_minor_edits */
  dropped: FieldChange[];
  /** newSnapshot + carried fixes (clone; input ไม่ถูกแตะ) */
  snapshot: DmpDraftInput;
}

/**
 * ตอน approve: replay การแก้ของ pending version (basedOn → currentInForce)
 * ลงบน newSnapshot โดยจับคู่ด้วย entity id เสมอ
 */
export function carryEdits(
  basedOn: DmpDraftInput,
  currentInForce: DmpDraftInput,
  newSnapshot: DmpDraftInput,
): CarryResult {
  const changes = diffDraft(currentInForce, basedOn);
  const { plan, applied, skipped } = applyChanges(newSnapshot, currentInForce, changes);
  return { carried: applied, dropped: skipped, snapshot: plan };
}

/**
 * หลัง approve: working copy ของนักวิจัย (แต่งจาก basedOn เดิม)
 * → เหลือเฉพาะการแก้ที่ยังไม่บันทึก/ส่ง ต่อท้าย newSnapshot
 */
export function rebaseWorkingCopy(
  draft: DmpDraftInput,
  newSnapshot: DmpDraftInput,
  basedOn: DmpDraftInput,
): DmpDraftInput {
  const userEdits = diffDraft(draft, basedOn);
  const { plan } = applyChanges(newSnapshot, draft, userEdits);
  return plan;
}
