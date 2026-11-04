// classify — pure (CON-2): major ฟิลด์เดียว = ทั้งชุด major
// คำตัดสินรายฟิลด์ (isMajorTrigger / listPolicies) ถูกกำหนดโดย field-policy
// ตอน diffDraft สร้าง FieldChange — classify รวมผลเป็นคำตัดสินของชุด
import type { FieldChange } from "./diff-draft.js";

export function classify(changes: FieldChange[]): "minor" | "major" {
  return changes.some((c) => c.edit_type === "major") ? "major" : "minor";
}
