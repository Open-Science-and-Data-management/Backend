# Spec: foundation

**Map:** `docs/specs/SPEC.md` (capability map) · **Depends on:** — · **Gate = M1 ครึ่งแรก (S0.1–S0.12)**
**ADR ที่เกี่ยว:** 0003 (โมเดลข้อมูลผสม), 0002 (ports), 0010 (zod→OpenAPI), 0011 (field policy), 0012 (UUID v7), 0026 (port จาก FE), 0027 (field policy canonical), 0028 (embedding runtime)

## Objective
วางฐานรากที่ทุก module พึ่งพา: tooling, contracts (zod source of truth), DB schema 13 ตาราง + constraints, domain-engine pure functions (หัวใจความถูกต้องของ version/diff — Quality Goal 2), และ registry ที่ port จาก repo Frontend (domain profiles + field policy + task generator semantics)

## Scope (slices)
S0.1 tooling → S0.2 dev compose + migrations → S0.3 contracts → S0.4 DB schema → S0.5 domain profiles → S0.6 field policy → S0.7 `validateDraft` → S0.8 `diffDraft` → S0.9 `classify` → S0.10 `foldMinor` → S0.11 `carryEdits` + `rebaseWorkingCopy` → S0.12 task generator

## Interfaces (ที่ module อื่นจะเรียกใช้)
- **Contracts (zod):** draft schema (maDMP v3.0 shape), task/checklist/evidence enum (`none|file|url|rdm_deposit`), error envelope, SSE event shapes (`status/tool/delta/proposal/done/error`), list envelope (Stripe v1) — source of truth เดียว
- **Domain-engine (pure, ไม่แตะ DB/HTTP — lint บังคับ):**
  - `validateDraft(draft, profiles) → errors: [{path(JSON pointer), code, message}]`
  - `diffDraft(draft, baseSnapshot) → FieldChange[]` (ยึด entity id)
  - `classify(changes, fieldPolicy) → "minor" | "major"` (major ฟิลด์เดียว = ทั้งชุด major)
  - `foldMinor(snapshot, changes) → {snapshot', minorEdits}`
  - `carryEdits(basedOn, currentInForce, newSnapshot) → {carried, dropped}`
  - `rebaseWorkingCopy(draft, newSnapshot) → draft'`
  - `generateTasks(outputsInForce) → Task[]` — STAGE_PLAN semantics: ต่อ dataset 1 task ต่อ 5 stage (collect/process/analyse/preserve/share), ข้าม share เมื่อ `access=closed` (ADR-0026)
- **DB:** 13 ตารางตาม arc42 §5.3 — constraint บังคับที่ Postgres: `UNIQUE (dmp_id, number)`, partial unique `WHERE status='pending'`, PK คู่ `(project_id, user_id)`
- **Registry:** 8 domain profiles + field policy (`isMajorTrigger/permission/locked` — port จาก FE, ADR-0026/0027)

## Testing
- **Seam: domain-engine pure functions** — test-first เป็น scenario ก่อนโค้ด; fixtures จาก registry ที่ port จริง (ไม่ใช่ค่าสมมติ); ที่ `tests/unit/domain-engine/`
- **Seam: DB constraints** — integration test ยิง insert ขนาน/ซ้ำแล้ว Postgres ปฏิสนธิเอง (QS-1) ที่ `tests/integration/`
- Prior art: FE prototype tests (เช่น 1 task ต่อ stage → 5 ต่อ dataset)

## Success Criteria
1. `pnpm lint` + `pnpm test` เขียว; eslint บล็อก `@nestjs/*`/DB/HTTP ใน domain-engine ได้จริง
2. migrate up/down สำเร็จบน compose (`postgres:18-alpine`) สะอาด
3. Engine ทั้ง 7 functions มี test scenario ครบกฎ preservation (QS-2, QS-4) และกฎหมวด 3.3
4. Registry port แล้ว validate ทั้ง 8 profiles ผ่าน — delta กับ arc42 §8.3 จดใน PR

## Out of Scope
Endpoints ทั้งหมด, auth/guards, การ serve registry ผ่าน `GET /domain-profiles`/`GET /field-policy` (จะทำใน dmp-lifecycle/meta), embedding runtime (อยู่ projects-files)

## Open Questions
Delta ระหว่าง field policy ของ FE กับ sample ใน arc42 §8.3 — สรุปตอน S0.6
