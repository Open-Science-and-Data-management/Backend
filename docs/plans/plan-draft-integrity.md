# Implementation Plan: draft-integrity

**Spec:** [`../specs/SPEC-draft-integrity.md`](../specs/SPEC-draft-integrity.md) · **ADR:** [0031](../decisions/ADR-0031-draft-jsonb-integrity-constraints.md) · **Depends on:** plan-dmp-lifecycle, plan-ai (จบแล้ว) · **Gate:** constraint D1–D5 บังคับจริงบน Postgres + drift-guard จับ drift ได้ + suite เต็มเขียว

## Overview
เพิ่ม CHECK constraint ระดับ Postgres บน JSONB draft-shaped columns ทั้ง 3 ตาราง (`dmps`, `dmp_versions`, `ai_thread_entries`) เป็นด่านสุดท้ายของรูปร่างข้อมูล (ADR-0031) — ประกาศผ่าน Drizzle `check()` ใน `schema/index.ts`, key-set เป็น constant ที่ SQL กับ drift-guard test ใช้ร่วมกัน, ไม่แตะ API ไม่ normalize ไม่ใช้ extension

## Architecture Decisions
- คง JSONB เดิมทั้งหมด — constraint เบา แค่ typeof + top-level key-set (ADR-0031 ขยาย TD-3 ของ ADR-0003)
- Key-set เป็น `export const` จาก `schema/index.ts` — จุดเดียว SQL/test อ่านร่วม; drift = unit test ตาย
- Violation → 500 ผ่าน `ErrorEnvelopeFilter` (bug signal) — ไม่แปลง 400
- `target` ของ FieldChange และ `response_snapshot`/`affiliation` ไม่ enforce — known gaps จดใน ADR
- dev DB เป็น mock — ล้าง (drop schema) + migrate + seed ใหม่ แทนการเขียน migration แก้ข้อมูล

## Task List

### Phase 1: Constraints ใน schema (foundation)
- [x] **Task 1: `dmps.draft` (กฎ D1)** — export `DRAFT_KEYS` (16 keys จาก `dmpSchema`) + `check("dmps_draft_object_keys", ...)` — object เปล่าผ่าน, key ต้อง ∈ DRAFT_KEYS
  - Acceptance: `pnpm db:generate` ออก migration ที่มี check นี้; typecheck/lint ผ่าน
  - Verify: `pnpm db:generate` + อ่าน SQL ที่ได้; `pnpm typecheck`
  - Files: `src/database/schema/index.ts`, `src/database/migrations/*_draft_integrity.sql` (M: 2)
  - Deps: —
- [x] **Task 2: `dmp_versions` (กฎ D1+D2+D3+D4)** — `snapshot` ใช้กฎ D1 (share helper เดียวกับ Task 1), `based_on_snapshot` nullable, 4 คอลัมน์ FieldChange[] เช็ค `null OR array of object(path,label,from,to:string)`, `decision_approver` เช็ค `null OR object(key ⊆ APPROVER_KEYS, value:string)`
  - Acceptance: migration ออกครบ 7 constraint ของตาราง; ไม่มี SQL วนซ้ำที่ไม่จำเป็น
  - Verify: `pnpm db:generate` + อ่าน SQL; `pnpm typecheck`
  - Files: `src/database/schema/index.ts`, `src/database/migrations/*_draft_integrity.sql` (M: 2)
  - Deps: 1
- [x] **Task 3: `ai_thread_entries.content` (กฎ D5 — แยกตาม kind)** — user → `{text, section}` หรือ `{action, direction}` (ห้ามผสม), assistant → `{action, text, proposal, stale_reason}` + ต้องมี `action`, event → `{action, usage, dmp_id}` + ต้องมี `action`; ฐานร่วม `jsonb_typeof = 'object'`
  - Acceptance: constraint เขียนเป็น SQL CASE ตาม `kind`; typecheck/lint ผ่าน
  - Verify: `pnpm db:generate` + อ่าน SQL; `pnpm typecheck && pnpm lint`
  - Files: `src/database/schema/index.ts`, `src/database/migrations/*_draft_integrity.sql` (S: 2)
  - Deps: 1

### Checkpoint: Constraints ครบ
- [x] migration apply สำเร็จบน DB ที่ล้างแล้ว (`drop schema public cascade` → `pnpm db:migrate` → `pnpm db:seed`)
- [x] `\d` แสดง constraint D1–D5 ครบทั้ง 3 ตาราง
- [x] `pnpm typecheck && pnpm lint` เขียว

### Phase 2: Tests (drift guard + บังคับจริง)
- [x] **Task 4: drift-guard unit test** — `tests/unit/draft-integrity.test.ts`: เทียบ `DRAFT_KEYS` ↔ `Object.keys(dmpSchema.shape)`, FieldChange key-set ↔ `diff-draft.ts`, `APPROVER_KEYS` ↔ รูปที่ approve endpoint เขียน, content key-set ↔ literal ใน `ai.service.ts` (137/141/155/249)
  - Acceptance: test เขียวตอนตรงกัน; **จับ drift จริง** — แก้ `dmpSchema` เพิ่ม key ลอย ๆ (ทดสอบชั่วคราว) → test ต้องตาย
  - Verify: `pnpm test -- tests/unit/draft-integrity.test.ts` (S: 1-2)
  - Files: `tests/unit/draft-integrity.test.ts` (S)
  - Deps: 1-3
- [x] **Task 5: integration constraint test** — `tests/integration/draft-integrity.test.ts` (`skipIf(!dbReady)`): insert ผิดกฎ ≥ 1 กรณี/กฎ (key มั่ว D1, element ไม่ใช่ object D3, content ผสม kind D5, approver value ไม่ string D4 ฯลฯ) → ต้อง constraint violation; ของถูกกฎทุกกฎ (รวม `draft = '{}'`) → ผ่าน; cleanup ตาม convention
  - Acceptance: ทุกกรณีผิดโดน, ทุกกรณีถูกผ่าน; suite อื่นไม่พัง
  - Verify: `pnpm test -- tests/integration/draft-integrity.test.ts` แล้ว `pnpm test` เต็ม
  - Files: `tests/integration/draft-integrity.test.ts` (S-M: 1)
  - Deps: 2-3, checkpoint 1

### Checkpoint: Tests
- [x] `pnpm test` ทั้งชุดเขียว (unit + integration + e2e เดิม 18 flows ไม่แตก)

### Phase 3: เอกสาร
- [x] **Task 6: เอกสารตามหลัง** — `docs/api/dmps.md` เพิ่ม note ว่า DB บังคับรูป draft/snapshot ระดับบน (key ⊆ dmpSchema) + อ้าง ADR-0031; `docs/specs/SPEC-draft-integrity.md` ติ๊กสถานะ; ตรวจว่า arc42 ไม่ต้องแก้ (โครงเดิม ไม่ใช่โครงสร้างใหม่)
  - Acceptance: ผู้อ่าน dmps.md รู้ว่า DB กัน key มั่วระดับบนแล้ว และรู้ข้อยกเว้น (`{}` ผ่าน, nested เป็นหน้าที่ Zod)
  - Verify: อ่านทวน diff; ไม่มี build/test ที่แตะ
  - Files: `docs/api/dmps.md`, `docs/specs/SPEC-draft-integrity.md` (XS: 2)
  - Deps: 5

### Checkpoint: Complete
- [x] Success Criteria ทั้ง 5 ข้อของ SPEC-draft-integrity.md ครบ
- [x] พร้อม review

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| drizzle-kit generate `check()` ไม่ครบ/SQL เพี้ยน | กฎไหนไม่ถูกบังคับเงียบ ๆ | Task 1–3 อ่าน SQL migration ทุกครั้ง + Task 5 พิสูจน์ด้วย insert จริง |
| SQL D5 (CASE ตาม kind) ซับซ้อนเกิน | constraint ผิดฝั่ง กันเกิน/ขาด | เขียน truth table ใน spec ก่อน SQL; integration test ครอบทั้ง 3 kind + 2 รูป user |
| แถว seed เดิมไม่ผ่านกฎใหม่ | migrate fail | dev DB ล้างก่อน (decision ที่รับแล้ว) — seed ใหม่ต้องผ่านตามเป็น smoke |
| CI Postgres 16 vs dev 18 | SQL ที่ใช้ได้เฉพาะ 18 จะพัง CI | ใช้เฉพาะ `jsonb_typeof`/`jsonb_object_keys` — มีทั้งสอง version (verify ที่ Task 5 ผ่านบน CI เอง) |

## Open Questions
- (ไม่มี — ตัดสินใจครบใน grilling session; known gaps ยอมรับโดยเจตนา)
