# ADR-0020: Save draft ด้วย PUT ทั้งก้อน + ตรวจเฉพาะรูปร่างตอน save

## Status
Accepted

## Date
2026-10-26

## Context
frontend contract ใช้ PATCH แบบ merge (`{draft_revision, patch}`) ขณะที่ domain engine เป็น pure function ที่รับ draft เต็มและ diff/validate/fold กับทั้ง tree เสมอ (ADR-0003) — นอกจากนี้ flow #4 เดิมตรวจกฎ 3.3 เต็มทุกครั้งที่ save ขณะที่ FE ต้องการ save ร่างครึ่ง ๆ ได้

## Decision
- `PUT /dmps/{id}/draft` — รับ draft **ทั้งก้อน** + `draft_revision` (ไม่ใช่ merge-patch: การ merge ฝั่ง server เพิ่มจุดผิดโดยไม่มีประโยชน์ที่ scale นี้ และ domain engine ไม่ต้องแตะ)
- `409 draft_conflict` ต้อง**ฝัง draft ปัจจุบัน**กลับมาใน error เพื่อให้ FE rebase ได้ทันที (ไม่ใช่แค่ "ให้โหลดใหม่")
- Save ตรวจเฉพาะ type/format (422 เฉพาะที่เก็บต่อไม่ได้) — กฎ completeness หมวด 3.3 ตรวจที่ submit/finalize เท่านั้น (ร่างครึ่ง ๆ ต้อง save ได้ — preservation)
- Endpoint `DELETE /dmps/{id}/draft/datasets/{ds}` ถูกแทนที่โดยการส่ง draft ที่ลบ output แล้วผ่าน PUT

## Consequences
- แก้ frontend contract จาก PATCH เป็น PUT (body เดิมของ store ส่งทั้งก้อนอยู่แล้ว)
- bandwidth สูงกว่า PATCH เล็กน้อย — ยอมรับที่ scale นี้
