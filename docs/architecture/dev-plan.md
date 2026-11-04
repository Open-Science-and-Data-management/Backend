# Development Plan — Backend

**Date:** 2026-11-04 **Status:** Accepted (จาก grilling session 2026-11-04)
**อ้างอิง:** [`arc42.md`](arc42.md) · [`dev-dependencies.md`](dev-dependencies.md) · [ADR-0026](../decisions/ADR-0026-tc5-port-profiles-and-task-generator.md) · [ADR-0027](../decisions/ADR-0027-field-policy-canonical-from-frontend.md) · [ADR-0028](../decisions/ADR-0028-embedding-runtime-and-model.md) · [ADR-0029](../decisions/ADR-0029-argon2id.md) · [`../research/thai-embedding-models.md`](../research/thai-embedding-models.md)

## หลักการทำงาน

- **No waterfall** — แบ่งงานเป็น **slice ราย function**, ทำ **ทีละอย่างจนจบ** (โค้ด + test + run ผ่าน) ก่อนขึ้น slice ถัดไป; slice เรียงตาม dependency จริงของ `dev-dependencies.md` เท่านั้น
- **Test-first บังคับบน domain-engine** (CON-2, Quality Goal 2) — เขียน test เป็น scenario ก่อนโค้ดทุก function; slice อื่นมี acceptance ชัดเช่นกัน
- **Milestone = ประตู e2e** — จบระลอกด้วย e2e ต่อ Postgres จริงตามหมวด 8.8 ของ arc42; "เสร็จ" วัดจาก e2e เขียว ไม่ใช่ diff

## สภาพแวดล้อม dev

| สิ่ง | ค่า |
| --- | --- |
| Runtime | node v24, pnpm, TypeScript strict (CON-6) |
| DB dev | docker compose: `postgres:18-alpine` + MailPit (dev only) — migrations เป็น SQL files ผ่าน drizzle-kit |
| ⚠️ เตรียมเครื่อง | docker CLI ติดตั้งแล้วแต่ **daemon ยังไม่รัน** — ต้องรัน `sudo systemctl enable --now docker` ก่อน slice S0.2 |
| Lint boundary | eslint `no-restricted-imports`: `shared/domain-engine/` ห้าม `@nestjs/*` + ห้าม DB/HTTP (CON-2) |
| CI (GitHub Actions) | สองขั้น — stage 1 ตั้งแต่ M1: lint + unit; stage 2 เมื่อถึง M3: e2e + postgres service container |
| Config | `config.toml` (tunable) + `.env` (secrets เท่านั้น — TC-7) |

## สิ่งที่ port จาก repo Frontend (read-only reference — OC-2)

| ไปยัง backend | จาก Frontend | ADR |
| --- | --- | --- |
| `shared/contracts/` (draft/task/evidence/enums, error envelope, SSE events, list envelope) | `src/schemas/**` + `docs/frontend-api/` | — |
| `shared/domain-profiles/` (8 profiles: generic + 7 domains) | `src/schemas/dataset/domain-profiles.ts` | ADR-0026 |
| field policy registry (major trigger / permission / locked) | `src/config/field-policy.ts` | ADR-0027 |
| task generator semantics (STAGE_PLAN) | `src/api/aiApi.ts` | ADR-0026 |

## Milestones และ Slices

### M1 — ฐานราก + บัญชี (ระลอก 0–1) — gate: e2e flow #1 เขียว + CI stage 1 เขียว

| Slice | Scope | Acceptance |
| --- | --- | --- |
| S0.1 | Tooling scaffold: pnpm workspace, TS strict, eslint boundary, vitest, `.env.example`, `config.toml` skeleton | `pnpm lint` + `pnpm test` รันเขียว (ว่าง) |
| S0.2 | Dev compose (postgres + MailPit) + drizzle-kit wiring | migrate up/down สำเร็จบน container สะอาด |
| S0.3 | Port contracts (zod) — draft, task, evidence enum, error envelope, SSE events, list envelope | unit test ที่ port มากับ schema เขียว |
| S0.4 | Drizzle schema 13 ตาราง + constraints (`UNIQUE (dmp_id, number)`, partial unique pending, PK คู่) | migration + seeds; test ยิง insert ซ้ำ/ขนานแล้ว Postgres ปฏิเสธเอง (QS-1) |
| S0.5 | Port domain profiles (8 profiles — ADR-0026) | test ตรวจ `domain_metadata` ผ่าน/ไม่ผ่านตาม profile จริง |
| S0.6 | Port field policy (ADR-0027) + เทียบ delta กับ sample เดิมใน arc42 §8.3 (จด delta ใน PR) | registry test เขียว; `GET /field-policy` ยังไม่ต้องมี |
| S0.7 | Engine `validateDraft` — test-first (กฎหมวด 3.3: วันย้อน, contact พอดี 1, contributor ลิงก์ซ้ำ, open ไม่มี license, domain_metadata) | test scenario ครบกฎ 3.3 เขียว, error path เป็น JSON pointer |
| S0.8 | Engine `diffDraft` — test-first (ยึด entity id) | `FieldChange[]` ถูกต้องบน fixtures ที่มี add/edit/remove/reorder |
| S0.9 | Engine `classify` — test-first (major ฟิลด์เดียว = ทั้งชุด major, listPolicies) | test ผ่าน field policy registry จริง (S0.6) |
| S0.10 | Engine `foldMinor` — test-first (fold ลง version in force + จด `minor_edits`) | scenario ขณะรอ pending (flow #8) เขียว |
| S0.11 | Engine `carryEdits` + `rebaseWorkingCopy` — test-first | scenario QS-2: ทุก fix จด carried/dropped ไม่มีหายเงียบ |
| S0.12 | Engine task generator (STAGE_PLAN — ADR-0026) | test จากต้นแบบ FE: 5 tasks ต่อ dataset, ข้าม share เมื่อ `access=closed` |
| S1.1 | `users`: sign-up (researcher only) + profile + argon2id (ADR-0029) | unit + integration (hash/verify) เขียว |
| S1.2 | `auth`: sign-in, refresh (httpOnly cookie + rotation + family reuse detection), sign-out, guards | **e2e flow #1 + #15 เขียว** → M1 จบ, ตั้ง CI stage 1 |

### M2 — โครงการ + ไฟล์ (ระลอก 2) — gate: e2e flow #2 + #18 เขียว

| Slice | Scope | Acceptance |
| --- | --- | --- |
| S2.1 | `projects` + members + ปฏิเสธลบเมื่อมีแผน | unit + e2e flow #2 เขียว |
| S2.2 | `files`: upload (25 MB, MIME .docx → 400, parse ไม่ได้ → 422) + download + archive/delete (`409 file_in_use`) | e2e flow #18 เขียว |
| S2.3 | RAG: chunk (heading/ย่อหน้า, ~450 token) + embed ด้วย transformers.js v3 / onnxruntime-node + `multilingual-e5-large-instruct` (ADR-0028), `embedding_model` mismatch → re-embed | integration: upload → `file_chunks` ครบ, query cosine top-5 ตรงตำแหน่ง; วัดเวลา embed ต่อไฟล์ — ถ้าเกิน ~15 วิ ใช้ fallback e5-small (สลับ config) |

### M3 — วงจรแผน DMP (ระลอก 3) — gate: e2e ครบ 18 flows ยกเว้น AI + CI stage 2 เขียว

| Slice | Scope | Acceptance |
| --- | --- | --- |
| S3.1 | `dmps` draft CRUD: PUT ทั้งก้อน + `draft_revision` → `409 draft_conflict` ฝัง draft ปัจจุบัน (ADR-0020) | e2e flow #4 เขียว (QS-3) |
| S3.2 | submit / finalize / freeze `plan_mode` / versions + decisions (approve → task generator → notifications ใน tx เดียว) | e2e flows #5–#7 เขียว (QS-1) |
| S3.3 | revisions + minor-edits + carry/drop/rebase + reject แล้ว status ยัง approved | e2e flows #8–#10 เขียว (QS-2, ADR-0021) |
| S3.4 | restore / archive / discard / ลบโครงการ-แผน protection | e2e flows #10, #13 เขียว |
| S3.5 | `reviews` read model (global queue, `days_waiting`, filter/sort) | e2e flow #6 มุมกรรมการเขียว |
| S3.6 | `tasks`: lifecycle + preservation rules + evidence (mode-conditional — ADR-0026) + reopen offers | e2e flows #12 + reopen-offers เขียว |
| S3.7 | `notifications`: rows ใน tx + polling + read/read_all/delete | e2e flow #16 เขียว → **CI stage 2 (e2e) เปิดใช้** → M3 จบ |

### M4 — AI (ระลอก 4) — gate: e2e ครบ 18 flows

| Slice | Scope | Acceptance |
| --- | --- | --- |
| S4.1 | `AiClient` port + OpenRouter adapter (anti-corruption, TC-6) + mock server สำหรับ integration test | integration ผ่าน mock |
| S4.2 | ReAct loop + tools 4 ตัว (read_proposal, search_proposal, read_draft, read_domain_profiles) | integration ต่อ mock: tool call sequence ถูกต้อง |
| S4.3 | SSE events (`status`/`tool`/`delta`/`proposal`/`done|error` — ADR-0018) | e2e flow #3 เขียว |
| S4.4 | โควตา (pre-flight hint, reconcile cached 10%, reset รายเดือน) + Idempotency-Key replay 24 ชม. + thread persist | e2e flow #17 เขียว → **18 flows ครบ** → M4 จบ |

## ไม่อยู่ใน scope v1

- `exports` — deferred, FE ทำใน browser (ADR-0019)
- Email verification — ช่องที่ยอมรับไว้ (OC-4 / R-1)
- TD-1/2/3 ตาม arc42 §11.2
