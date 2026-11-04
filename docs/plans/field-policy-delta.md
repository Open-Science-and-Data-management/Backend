# Field policy delta — FE (canonical, ADR-0027) vs arc42 §8.3 sample

Port จาก `Frontend/src/config/field-policy.ts` เป็น canonical (`src/shared/domain-profiles/field-policy.ts`)
ตาม ADR-0027 (FE จดเป็นข้อมูล, backend ใช้ตัดสิน — ชุดเดียวกันทั้งสองฝั่ง)
arc42 §8.3 เขียน sample ไว้ก่อน port — ต่างกัน 4 จุด ตามด้านล่าง

| # | จุด | arc42 §8.3 sample | FE canonical (port แล้ว) | สรุป |
|---|---|---|---|---|
| 1 | ethical issues | `ethical_issues_description` = major | `ethical_issues_exist` = major, `description` = minor | ยึด FE — การตัดสินว่า "มีประเด็นจริยธรรม" เปลี่ยนสาระแผน, การเขียนคำอธิบายเพิ่มเติมเป็นการเรียบเรียง |
| 2 | preservation/distribution | ไม่อยู่ใน major list | `preservation.repository`, `preservation.duration`, `distribution.license` = major | ยึด FE — เป็นคำมั่นเรื่องที่เก็บ/นานแค่ไหน/แบ่งปันอย่างไร = สาระ |
| 3 | contributor list | add/remove = minor (default) | `contributor` list = major | ยึด FE — "ผู้รับผิดชอบข้อมูลเปลี่ยน" ต้องกลับไขปลอดใหม่; FE test `one account, one contributor` ยืนยัน |
| 4 | รูปร่าง | wildcard paths (`/datasets/*/access`) | map ต่อ entity (`dmpFieldPolicy`, `datasetFieldPolicy`, `planListPolicy`) + entity id | ยึด FE — engine (diff/classify) จับคู่ด้วย entity id ตาม entity แล้ว lookup ที่ map; wildcard path ยังใช้ได้ตอน expose `GET /field-policy` เป็น projection |

**ผล:** FE canonical ชนะทุกจุด (ADR-0026 TC-5 ปิดแล้ว) — arc42 §8.3 ควรแก้ sample ให้ตรง (แยก task เอกสาร)
