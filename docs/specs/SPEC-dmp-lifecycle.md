# Spec: dmp-lifecycle

**Map:** `docs/specs/SPEC.md` · **Depends on:** `foundation`, `accounts`, `projects-files` · **Gate = จบ M3 (e2e 18 flows ยกเว้น AI + CI stage 2)**
**ADR ที่เกี่ยว:** 0020 (PUT ทั้งก้อน), 0021 (client เลือก minor/revisions), 0022 (checklist array + reopen offers), 0013 (notification polling), 0014/0015 (error/pagination), 0007 (global queue), 0026 (task generator + evidence mode-conditional)

## Objective
วงจรแผน DMP ครบ: ร่าง → ส่ง → ตัดสิน → มีผล → tasks — บนหลัก preservation (ไม่มีทางลบแผน, แก้ไม่หายเงียบ) และ atomic (approve → task generator → notifications ใน transaction Drizzle เดียว)

## Scope (slices)
S3.1 draft CRUD (PUT ทั้งก้อน + `draft_revision`) → S3.2 submit/finalize/versions/decisions → S3.3 revisions + minor-edits + carry/drop/rebase → S3.4 restore/archive/discard/protection → S3.5 reviews read model → S3.6 tasks + evidence + reopen offers → S3.7 notifications + เปิด CI stage 2

## Interfaces (boundary)
- Endpoints ยึด `docs/frontend-api/` (`/v1` ตัดทิ้ง): draft `PUT /dmps/{id}/draft` (409 `draft_conflict` ฝัง draft ปัจจุบัน), submit/finalize/minor-edits/revisions/archive/unarchive/restore/discard, `POST /dmps/{id}/versions/{n}/approve|reject`, `GET /reviews`, tasks endpoints (PATCH checklist array เต็ม, evidence PUT/DELETE, complete/cancel/reopen, `DELETE` เฉพาะ task ที่ยังไม่เริ่ม), reopen-offers accept/dismiss, `POST /dmps/{id}/tasks/generated`, notifications poll/read/read_all/delete
- เรียกใช้ foundation: engine functions + contracts + registries; meta endpoints `GET /domain-profiles`, `GET /field-policy`, `GET /openapi-json` serve จาก registry ชุดเดียว
- Notifications: 8 type, row สร้างใน transaction ของเหตุการณ์, poll ~60 วิ — ไม่มี stream (ADR-0013), `NotificationPublisher` port publish หลัง commit เท่านั้น
- Evidence requirement mode-conditional (ADR-0026): `rdm_deposit` บังคับเฉพาะ preserve/share ของแผน independent; institutional รับ `file|url` ชั่วคราว
- Task generator เรียกผ่าน engine — ผลลัพธ์ per-dataset × STAGE_PLAN

## Testing
- **Seam: HTTP boundary (หลัก)** — e2e ครบ flows #4–#13, #15–#16, #18 ต่อ Postgres จริง ที่ `tests/e2e/`
  - QS-1: submit ขนาน 2 request → Postgres ปฏิเสธ (partial unique)
  - QS-2: approve ขณะมี minor fixes → ทุก fix จด `carried_minor_edits`/`dropped_minor_edits` ไม่มีหายเงียบ
  - QS-3: draft conflict → 409 + draft ปัจจุบัน rebase ได้
  - reject แล้ว DMP.status ยัง approved, minor fixes คงอยู่กับ version in force (ADR-0021)
  - preservation: ลบโครงการที่มีแผน → ปฏิเสธ, archive ขณะมีผล → ปฏิเสธ, task ที่มีงานบันทึกลบไม่ได้, cancel จด reason + เสนอเปิดคืนทีละตัว
- unit ที่ `tests/unit/dmps/`, `tests/unit/tasks/`: กฎ status transition, restore rules (เวอร์ชัน pending restore ไม่ได้), progress คำนวณจาก checklist เสมอ

## Success Criteria
1. e2e ครบ 18 flows ยกเว้น AI เขียวต่อ Postgres จริง
2. ทุกกฎ preservation มี e2e คุ้มกัน (QS-8)
3. CI stage 2 (e2e + postgres service container) เขียว
4. `GET /openapi-json` ให้ spec ที่ FE generate client ได้ — contract ตรง `docs/frontend-api/` ทุกจุดที่แก้แล้ว (PUT draft)

## Out of Scope
AI endpoints ทั้งหมด (SPEC-ai), exports (ADR-0019 — FE ทำใน browser), admin provisioning/password reset (TD-1 รอ), task assignment ให้ contributor (TD-2)
