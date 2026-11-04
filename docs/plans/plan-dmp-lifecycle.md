# Implementation Plan: dmp-lifecycle

**Spec:** [`../specs/SPEC-dmp-lifecycle.md`](../specs/SPEC-dmp-lifecycle.md) · **Depends on:** plan-projects-files · **Gate:** e2e 18 flows ยกเว้น AI + CI stage 2

## Overview
วงจรแผน DMP ครบ (draft → submit → ตัดสิน → มีผล → tasks) + reviews read model + notifications — ทุกกฎ preservation มี e2e คุ้ม; approve → task generator → notifications atomic ใน transaction เดียว

## Architecture Decisions
- Draft save เป็น PUT ทั้งก้อน + `draft_revision` → `409 draft_conflict` ฝัง draft ปัจจุบัน (ADR-0020, แก้ FE contract แล้ว)
- Client เลือก endpoint minor-edits/revisions เอง (ADR-0021); reject แล้ว status ยัง approved
- Constraint บังคับที่ Postgres (partial unique pending) — application ไม่ต้อง lock เอง
- Checklist เป็น array เต็มบน task, progress คำนวณเสมอ; reopen offers เป็น entity (ADR-0022)
- Notification = row ใน tx + poll (ADR-0013); error/pagination ตาม ADR-0014/0015

## Task List

### Phase 1: Draft
- [ ] **Task 1: dmps module + draft CRUD** — `POST/GET /dmps`, `GET /dmps/{id}`, `PUT /dmps/{id}/draft` + `draft_revision` + discard
  - Acceptance: 409 `draft_conflict` พร้อม draft ปัจจุบัน; save ตรวจเฉพาะ type/format (422 พร้อม JSON pointer); locked field ปฏิเสธ
  - Verify: `pnpm test -- tests/e2e/drafts` (flow #4 — QS-3) (M)
  - Files: `src/features/dmps/**`, `tests/e2e/drafts.ts` (M)
  - Deps: projects-files จบ
- [ ] **Task 2: submit + finalize + versions** — freeze `plan_mode`, version #1 (pending snapshot), partial unique บังคับขนาน; independent finalize ทันที + task generator ใน tx เดียว
  - Acceptance: e2e flows #5–#7 เขียว; QS-1 (submit ขนาน 2 request หนึ่งตัวถูก Postgres ปฏิเสธ); tasks ชุดแรกเกิดครบตาม STAGE_PLAN
  - Verify: `pnpm test -- tests/e2e/submit-finalize` (M)
  - Files: `src/features/dmps/**` (M)
  - Deps: 1
- [ ] **Task 3: decisions (approve/reject) + carry/drop/rebase** — approve → active_version + task generator + notifications ใน tx เดียว; reject → status ยัง approved; approve revision → carryEdits/rebase
  - Acceptance: e2e flows #6, #8–#9 เขียว; QS-2 — ทุก minor fix จด carried/dropped
  - Verify: `pnpm test -- tests/e2e/revisions` (L → แตก commit ย่อย: approve/reject ก่อน แล้ว carry/rebase)
  - Files: `src/features/dmps/**` (M)
  - Deps: 2

### Phase 2: Lifecycle ที่เหลือ
- [ ] **Task 4: restore/archive/discard/ลบโครงการ** — restore เวอร์ชัน pending ไม่ได้; archive ปฏิเสธขณะมีผล; ลบโครงการที่มีแผนปฏิเสธ
  - Acceptance: e2e flows #10, #13 เขียว
  - Verify: `pnpm test -- tests/e2e/lifecycle` (M)
  - Files: `src/features/dmps/**`, `src/features/projects/**` (S–M)
  - Deps: 3
- [ ] **Task 5: reviews read model** — `GET /reviews` (global queue, `days_waiting`, `changes_summary`, filter `decided_by=me`, sort)
  - Acceptance: e2e มุมกรรมการของ flow #6 เขียว — รูปร่างตรง contract, pagination Stripe v1
  - Verify: `pnpm test -- tests/e2e/reviews` (S)
  - Files: `src/features/reviews/**` (S)
  - Deps: 3

### Phase 3: Tasks + Notifications
- [ ] **Task 6: tasks module** — lifecycle (complete/cancel/reopen/delete เฉพาะยังไม่เริ่ม), PATCH checklist array เต็ม, evidence polymorphic + requirement mode-conditional, cancel จด reason/output, reopen offers accept/dismiss
  - Acceptance: e2e flows #12 + reopen-offers เขียว; task ที่มีงานบันทึกลบไม่ได้; progress จาก checklist เสมอ
  - Verify: `pnpm test -- tests/e2e/tasks` (L → commit ย่อย: lifecycle → evidence → reopen)
  - Files: `src/features/tasks/**`, `tests/e2e/tasks.ts` (M)
  - Deps: 3
- [ ] **Task 7: notifications + meta endpoints + CI stage 2** — rows ใน tx, poll/read/read_all/delete; `GET /domain-profiles`, `GET /field-policy`, `GET /openapi-json` (zod→OpenAPI); เปิด CI e2e
  - Acceptance: e2e flow #16 เขียว; openapi spec generate client ได้; CI stage 2 เขียว
  - Verify: `pnpm test -- tests/e2e/notifications`, ทดลอง generate client จาก spec (M)
  - Files: `src/features/notifications/**`, `src/shared/contracts/openapi/**`, `.github/workflows/**` (M)
  - Deps: 4, 5, 6

### Checkpoint: M3 จบ
- [ ] e2e ครบ 17 flows (ทุก flow ยกเว้น AI) เขียวต่อ Postgres จริง; CI stage 2 เขียว
- [ ] ทบทวน preservation checklist กับ human (QS-1, QS-2, QS-3, QS-8 ผ่านครบ)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| carry/rebase edge cases มากที่สุดของระบบ | High | engine มี unit test จาก foundation แล้ว — e2e ครอบเฉพาะเส้นทาง; แตก commit ย่อย approve/reject ก่อน carry |
| JSON pointer path ไม่ตรงกับที่ FE คาด | Med | test คาด path ตรงตาม pointer ของ draft schema |
| e2e suite ยาวขึ้นเรื่อย ๆ | Low | แยกไฟล์ตาม flow, ใช้ seeds/fixtures กลาง |

## Open Questions
- `changes_summary` ของ reviews — สรุปยังไงให้ FE แสดงพอ (ดูจาก contract ตอน Task 5)
