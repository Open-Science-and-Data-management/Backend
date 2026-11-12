# Spec: draft-integrity

**Map:** `docs/specs/SPEC.md` (module id `draft-integrity` — increment หลัง M4) · **Depends on:** `dmp-lifecycle` (tables + contracts), `ai` (thread kind/content)
**ADR ที่เกี่ยว:** 0003 (hybrid data model — TD-3 ขยายเงื่อนไข), 0020 (whole-draft save), **0031 (integrity boundary — decision ชุดนี้)**

> **Status: Complete (2026-11-12)** — constraint D1–D5 บังคับบน Postgres, drift-guard + integration test เขียว (plan: `plan-draft-integrity.md`)

## Objective
ทำให้ JSONB draft-shaped columns ทุกคอลัมน์มี **CHECK constraint ระดับ Postgres** เป็นด่านสุดท้ายของรูปร่างข้อมูล — ของเสียระดับบน (key มั่ว, ชนิดก้อนผิด) เข้า DB ไม่ได้ แม้ผ่าน path ที่ไม่ผ่าน Zod (query ตรง, bug, migration) — คงสถาปัตยกรรม ADR-0003 (JSONB เดิม, ไม่ normalize, ไม่ใช้ extension) และรูป API ทุก endpoint ไม่เปลี่ยนแปลง

**Assumptions (ยืนยันแล้วใน session):**
1. dev DB เป็น mock data — ล้างแล้ว migrate ใหม่ได้ ไม่ต้อง migration แก้ข้อมูลเดิม
2. drizzle-orm 0.45.4 รองรับ `check()` ใน `pgTable`
3. ไม่พึ่ง Postgres extension (เช่น pg_jsonschema) — image คือ `postgres:18-alpine` มาตรฐาน

## Commands
```bash
pnpm db:generate            # ออก migration จาก check() ใน schema
pnpm db:migrate             # apply (dev DB ล้างก่อน: drop + up + seed)
pnpm typecheck && pnpm lint
pnpm test -- tests/unit     # drift-guard test รวมอยู่
pnpm test -- tests/integration
```

## Project Structure
```
src/database/schema/index.ts       → เพิ่ม check() ต่อคอลัมน์ + export key-set constants
src/database/migrations/XXXX_*.sql → migration ออกโดย drizzle-kit (drop ไม่มี — dev ล้าง)
tests/unit/draft-integrity.test.ts → drift-guard: เทียบ key-set SQL vs contracts/engine
tests/integration/schema.test.ts   → เพิ่มกรณี: write ผิดกฎ → constraint ตี
docs/specs/SPEC-draft-integrity.md → spec นี้
```

## Code Style
ประกาศตามแบบ schema เดิม — constraint ทุกตัวตั้งชื่อชัด มี comment อ้าง ADR:

```ts
// D1 — draft keys ต้องอยู่ใน dmpSchema (ADR-0031) — {} ว่างผ่าน (แผนใหม่)
const draftKeys = [
  "dmp_id", "project_id", "title", "description", "language",
  "alternate_identifier", "begin_date", "end_date", "ethical_issues_exist",
  "ethical_issues_description", "ethical_issues_report",
  "indigenous_considerations", "contributor", "cost", "dataset", "schema_version",
] as const;
export const DRAFT_KEYS = draftKeys; // drift-guard test อ่านตัวนี้

check("dmps_draft_object_keys", sql`
  ${t.draft} = '{}'::jsonb
  or (jsonb_typeof(${t.draft}) = 'object'
      and exists (select 1 from jsonb_object_keys(${t.draft}) k
                  where k not in (...16 keys...)) = false)
`);
```

## Testing Strategy
- **unit (ไม่มี DB)** — `tests/unit/draft-integrity.test.ts`: เทียบ `DRAFT_KEYS` กับ `Object.keys(dmpSchema.shape)`, key-set FieldChange กับ `diff-draft.ts`, approver keys, content key-set ต่อ `kind` กับ literal ใน `ai.service.ts` (137/141/155/249) — test ตาย = Zod/SQL/engine คลาดเคลื่อน
- **integration (Postgres จริง, `describe.skipIf(!dbReady)`)** — insert แถวผิดกฎต่อกฎ D1–D5 (key มั่ว, ชนิดผิด, content ผสม kind) ต้องโดน constraint; ของถูกกฎทุกกฎผ่าน; cleanup ตาม convention ทำใน `beforeAll/afterAll`
- **ไม่เพิ่ม e2e** — API รูปเดิมทุก endpoint, flow e2e เดิมคือตัวพิสูจน์ว่า path ปกติไม่โดน constraint

## Boundaries
- **Always:** ประกาศ constraint ใน `schema/index.ts` (ไม่เขียน SQL migration มือ), key-set export เป็น constant ตัวเดียวที่ SQL กับ test ใช้ร่วมกัน, violation = 500 (ไม่ catch แปลง 400)
- **Ask first:** แก้กฎให้ลึกกว่านี้ (เช็ค enum ระดับบน, ตรวจ `target`), ยก `FieldChange` ขึ้น `contracts/`, enforce ก้อนที่จด known gaps (`response_snapshot`, `affiliation`)
- **Never:** normalize JSONB เป็นตาราง, พึ่ง extension, บังคับ required field ระดับบนใน DB (draft เริ่ม `{}` ได้), แก้ API shape

## Success Criteria
1. `pnpm db:migrate` สำเร็จบน DB ที่ล้างแล้ว; constraint D1–D5 ปรากฏใน `\d dmps`, `\d dmp_versions`, `\d ai_thread_entries`
2. Integration test: ทุกกรณีผิดกฎ (≥ 1 ต่อกฎ) โดน constraint violation; ทุกกรณีถูกกฎผ่าน
3. Drift-guard unit test ผ่าน และ**จับ drift จริงได้** (แก้ `dmpSchema` เพิ่ม key ลอย ๆ → test ตาย)
4. `pnpm lint`, `pnpm typecheck`, `pnpm test` เต็มผ่าน — e2e เดิม 18 flows ไม่แตก
5. ADR-0031 + SPEC.md map อัปเดตแล้ว; `dmps.md` มี note รูป draft/snapshot ที่ DB บังคับ

## Open Questions
- (ไม่มี — ตัดสินใจครบจาก grilling session; ข้อ 1–2 ใน preview ยอมรับแล้วว่าเป็น drift ที่ต้องการ)
