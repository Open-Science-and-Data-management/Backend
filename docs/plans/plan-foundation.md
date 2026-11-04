# Implementation Plan: foundation

**Spec:** [`../specs/SPEC-foundation.md`](../specs/SPEC-foundation.md) · **Map:** [`../specs/SPEC.md`](../specs/SPEC.md) · **Status:** Approved specs, รอ implement
**Task list target:** checklist ในไฟล์นี้ (user-designated — ไม่ใช้ `tasks/todo.md`)

## Overview
ฐานรากทุก module: tooling + dev compose + contracts (zod) + DB 13 ตาราง + domain-engine test-first + registry port จาก Frontend. จบด้วย engine ครบ 7 functions มี test คุ้ม — โดยยังไม่มี endpoint ใด ๆ

## Architecture Decisions
- Engine เป็น pure functions ใน `shared/domain-engine/` — ห้าม `@nestjs/*`/DB/HTTP (lint บังคับ — CON-2)
- zod ใน `shared/contracts/` เป็น source of truth เดียว (CON-3, ADR-0010)
- Config ผ่าน `config.toml` อ่านโดย loader จุดเดียว (§8.7)
- Registry port จาก FE read-only (ADR-0026/0027) — ปิด TC-5
- Dev DB = compose `postgres:18-alpine` + MailPit; migrations เป็น SQL files (drizzle-kit)

## Task List

### Phase 1: Tooling + Infra
- [x] **Task 1: Scaffold tooling** — pnpm workspace, TS strict, eslint รวม boundary rule, vitest, `config.toml` skeleton, `.env.example`, `docs/` คงเดิม
  - Acceptance: `pnpm lint`/`pnpm test` รันเขียว (ว่าง); eslint rule บล็อก import ผิดใน `shared/domain-engine/` (test ด้วย fixture ปลอม)
  - Verify: `pnpm lint && pnpm test`
  - Files: `package.json`, `tsconfig.json`, `eslint.config.*`, `vitest.config.ts`, `config.toml`, `.env.example` (S)
  - Deps: none
- [ ] **Task 2: Dev compose + drizzle wiring** — `docker-compose.dev.yml` (postgres:18-alpine + MailPit), drizzle-kit config, scripts `db:migrate/generate/seed`
  - Acceptance: migrate up/down สำเร็จบน container สะอาด
  - Verify: `docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate`
  - Files: `docker-compose.dev.yml`, `drizzle.config.ts`, `src/database/` (S)
  - Deps: 1 · ⚠️ ต้อง `sudo systemctl enable --now docker` ก่อน

### Checkpoint: Infra
- [ ] compose + migrate รันได้จากคำสั่งใน spec; lint boundary ทำงาน

### Phase 2: Contracts + Schema
- [x] **Task 3: Port contracts (zod)** — draft schema (maDMP v3.0), task/checklist/evidence enum, error envelope, SSE events, list envelope — จาก `Frontend/src/schemas/**` + `docs/frontend-api/`
  - Acceptance: unit test ที่ port มา (รวมของ FE ที่เทียบได้) เขียว; type ทุก schema export ใช้ได้จาก feature อื่น
  - Verify: `pnpm test -- tests/unit/contracts` (XS–S ต่อไฟล์ schema, รวม M)
  - Files: `shared/contracts/**`, `tests/unit/contracts/` (M)
  - Deps: 1
- [x] **Task 4: DB schema 13 ตาราง** — ตาม arc42 §5.3 พร้อม constraint ทั้งหมด + seeds ว่างสำหรับ e2e
  - Acceptance: migration สร้างครบ; integration test ยิง insert ซ้ำ/ขนานแล้ว Postgres ปฏิเสธ (`UNIQUE (dmp_id, number)`, partial unique pending, PK คู่)
  - Verify: `pnpm test -- tests/integration/schema`
  - Files: `src/database/schema/**`, `tests/integration/schema.ts` (L → แตกเป็น 2–3 commit ย่อยใน task เดียว)
  - Deps: 2

### Phase 3: Registry (port จาก FE)
- [ ] **Task 5: Port domain profiles** — 8 profiles (generic + 7 domains) เข้า `shared/domain-profiles/`
  - Acceptance: validate `domain_metadata` ตาม profile จริงผ่าน/ไม่ผ่านถูกต้อง (test จาก FE)
  - Verify: `pnpm test -- tests/unit/domain-engine/profiles`
  - Files: `shared/domain-profiles/**`, `tests/unit/domain-engine/profiles.test.ts` (M)
  - Deps: 3
- [x] **Task 6: Port field policy + delta report** — `field-policy.ts` → registry canonical (ADR-0027); เทียบกับ sample arc42 §8.3
  - Acceptance: registry test เขียว; delta จดใน PR description
  - Verify: `pnpm test -- tests/unit/domain-engine/field-policy`
  - Files: `shared/domain-profiles/field-policy.ts`, tests (S)
  - Deps: 3

### Phase 4: Domain engine (test-first ทุก task)
- [x] **Task 7: `validateDraft`** — กฎหมวด 3.3 ครบ (วันย้อน, contact พอดี 1 + mbox, contributor ลิงก์ซ้ำ, open ไม่มี license, domain_metadata ต่อ profile), error เป็น JSON pointer
  - Acceptance: scenario test ครบกฎ; error path ชี้ตำแหน่งถูก
  - Verify: `pnpm test -- tests/unit/domain-engine/validate` (S)
  - Deps: 5
- [x] **Task 8: `diffDraft`** — เทียบ JSON tree ยึด entity id → `FieldChange[]`
  - Acceptance: add/edit/remove/reorder ตรวจจับถูก; entity id เป็นตัวจับคู่เสมอ
  - Verify: `pnpm test -- tests/unit/domain-engine/diff` (S)
  - Deps: 3
- [ ] **Task 9: `classify`** — major ฟิลด์เดียว = ทั้งชุด major; listPolicies (datasets add/remove = major, contributors/costs = minor)
  - Acceptance: ตัดสินตรง registry จริง (Task 6)
  - Verify: `pnpm test -- tests/unit/domain-engine/classify` (S)
  - Deps: 6, 8
- [x] **Task 10: `foldMinor`** — fold ลง snapshot ของ version in force + จด `minor_edits`
  - Acceptance: pending snapshot ไม่ถูกแตะ; minor_edits จดครบ
  - Verify: `pnpm test -- tests/unit/domain-engine/fold` (S)
  - Deps: 8
- [ ] **Task 11: `carryEdits` + `rebaseWorkingCopy`** — replay ตาม entity id, แยก carried/dropped
  - Acceptance: scenario QS-2 — ทุก fix จด carried หรือ dropped ไม่มีหายเงียบ; rebase เหลือเฉพาะแก้ที่ยังไม่บันทึก/ส่ง
  - Verify: `pnpm test -- tests/unit/domain-engine/carry` (M)
  - Deps: 8
- [ ] **Task 12: `generateTasks`** — STAGE_PLAN semantics (ADR-0026)
  - Acceptance: 5 tasks ต่อ dataset, ข้าม share เมื่อ `access=closed`, priority high/medium/medium/high/low (test จากต้นแบบ FE)
  - Verify: `pnpm test -- tests/unit/domain-engine/task-generator` (S)
  - Deps: 3

### Checkpoint: Complete (จบ foundation = ครึ่งแรก M1)
- [ ] Engine 7 functions + registry + contracts + schema มี test คุ้มครบ, `pnpm lint && pnpm test` เขียวทั้ง repo
- [ ] ทบทาน delta ของ field policy กับ human ก่อนขึ้น accounts

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| FE zod schemas อ้าง utilities ที่ไม่มีใน backend | Med | port แบบ copy-adapt รายไฟล์, ตัดส่วน render/UI ออก (registry เป็นข้อมูล ไม่ใช่ UI) |
| Drizzle constraint แปลจาก arc42 ผิด | High | test ยิง violation ตรง ๆ ทุก constraint ก่อนผ่าน task |
| transformers/ONNX ยังไม่เกี่ยว แต่ lockfile หนัก | Low | ติดตั้งเฉพาะ dep ที่ phase นี้ใช้ |

## Open Questions
- ~~delta ของ field policy กับ arc42 §8.3~~ — ตอบแล้ว: [`field-policy-delta.md`](field-policy-delta.md) (ยึด FE canonical ทั้ง 4 จุด ตาม ADR-0027; arc42 §8.3 ควรแก้ sample)
