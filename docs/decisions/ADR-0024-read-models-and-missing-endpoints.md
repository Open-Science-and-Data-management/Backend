# ADR-0024: Read models ตามหน้าจอ + เติม endpoints ที่ขาดจาก frontend contract

## Status
Accepted

## Date
2026-10-26

## Context
จาก grilling session — arc42 ออกแบบ write path (14 flows) ละเอียด แต่เงียบเรื่อง read/aggregation endpoints ที่ frontend ใช้วาดหน้าจอ (reviews queue shape, project progress, members, file lifecycle, stat cards, AI thread lifecycle) รวมถึงกฎ domain ของ tasks ที่ยังไม่ได้เขียนลงเอกสาร

## Decision
1. **Reviews เป็น read model**: `GET /reviews` — aggregate บาง ๆ ที่ join dmps+versions ให้ตรงรูปที่หน้าจอต้องใช้ (`days_waiting`, `changes_summary`, timeline, filter `decided_by=me`, sort) — **ADR-0007 คงเดิม**: queue ยังเป็น global ไม่มี assignment เพียงเปลี่ยนรูปร่างคำตอบเป็น review card
2. **กฎ domain ของ tasks เขียนลง spec ตาม FE**: `use_complete`, `output_locked`, evidence requirement 3 ระดับ (`declared` / `evidence_linked` / `system_verified` ตาม stage/plan_mode), status enum เพิ่ม `cancelled`
3. **ไฟล์**: จำกัด **25 MB ฝั่ง server** (ย้อนหมายเหตุ 20 MB ใน Consequences ของ ADR-0022 — backend มีเหตุผลจริงด้าน memory/timeout), MIME .docx ไม่ถูกต้อง → `400`, proposal parse ไม่ได้ → `422`; เติม `GET /files` (list + filter purpose), `POST /files/{id}/archive` + กฎ "ไฟล์ evidence ลบไม่ได้ archive เท่านั้น", `DELETE /files/{id}` + `409 file_in_use`
4. **Notifications**: `unread_count` ใน list + `DELETE /notifications/{id}` + `DELETE /notifications` — notification คือ UX ไม่ใช่ record จึงไม่อยู่ใต้ preservation
5. **Projects read aggregates**: `GET /projects/{id}/members` (entity `project_members` มีอยู่แล้ว — ขาดแค่ expose), Progress object ระดับ project (`overall/done/total/overdue`), ฟิลด์ card บน list (`file_count`, `member_count`, `awaiting_review`, `include=progress,researcher`), status `done`
6. **ตัด `PATCH /projects/{id}`** — การผูก proposal ให้ `POST /ai/analyze-proposal` เป็น side effect (ตั้ง `proposal_file_id` เอง) ตาม intent เดียวที่มีใน UI; **คง `DELETE /projects/{id}`** ไว้เพราะ flow #13 ใช้ตรวจกติกา preservation
7. **DMP endpoints ที่เติม**: `POST /dmps` (สร้างแผน + กติกา author + `draft_revision: 0`), `GET /dmps/{id}`, `POST /dmps/{id}/draft/discard` (กติกา `never_submitted` → archive), list ฝั่ง researcher (archived filter, `q`, `sort`)
8. **การสร้าง task**: รับ `POST /tasks` (สร้างเอง — ได้เฉพาะตอนแผนมี version in force, อยู่ใต้ preservation เหมือน task ที่ระบบสร้าง) และ `POST /dmps/{id}/tasks/generated` พร้อม mode `add|replace` — replace ที่ชน task ที่มีงานบันทึกเดินตามกติกา preservation (cancel จด `cancelled_from` + เสนอ reopen) ไม่มีการลบเงียบ ๆ
9. **AI ที่เหลือ**: `GET /ai/quota` (+`resets_at`, usage แยกช่องตาม ADR-0023), thread `PUT` decision (accepted/rejected/stale + `409 proposal_settled`), thread `clear` + `adopt`, paging ข้อความ `before/limit` + กฎ hidden/kept
10. **`GET /users/username-available`** — read ตัวเดียวสำหรับหน้าสมัคร

## Consequences
- ตาราง endpoint ใน arc42 5.2 ยึด **frontend contract เป็น source of truth ของ paths** (ตัด prefix `/v1` ตาม ADR-0017) — arc42 ไม่ทำสำเนารายการ endpoint เต็มอีก
- arc42 เพิ่มตาราง `reopen_offers` และ `idempotency_keys`; `users` เพิ่ม `quota_resets_at`; `file_records` เพิ่ม `archived_at` (ADR-0022); `ai_thread_entries.scope` เป็น nullable dmp + `unscoped` (ADR-0023)
- sequence-diagrams เพิ่ม flows ฝั่ง read/lifecycle เสริม (refresh token, notification lifecycle, AI chat/thread, file upload/archive)
