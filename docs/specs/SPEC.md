# Spec: Backend — ระบบติดตามความคืบหน้าโครงการวิจัย (v1)

**Status:** Draft — รอ human review
**อ้างอิง:** [`docs/architecture/arc42.md`](docs/architecture/arc42.md) · [`docs/architecture/dev-plan.md`](docs/architecture/dev-plan.md) · [`docs/architecture/dev-dependencies.md`](docs/architecture/dev-dependencies.md) · ADR-0001–0029

---

## Capability Map (Phase 0)

| Module id | Responsibility | Depends on | = Milestone |
| --- | --- | --- | --- |
| `foundation` | Tooling, contracts (zod), DB schema 13 ตาราง + migrations, domain-engine (pure functions), domain profiles + field policy (port จาก FE) | — | M1 (S0.1–S0.12) |
| `accounts` | users (sign-up researcher, profile, provisioning, quota fields) + auth (sign-in, refresh rotation, guards, argon2id) | `foundation` | M1 (S1.1–S1.2) |
| `projects-files` | projects + members + delete protection; files upload/download + docx parse + RAG chunk/embed | `foundation`, `accounts` | M2 |
| `dmp-lifecycle` | dmps draft/submit/finalize/versions/decisions/minor-edits/rebase, reviews read model, tasks + evidence + reopen offers, notifications | `foundation`, `accounts`, `projects-files` | M3 |
| `ai` | ReAct loop, tools 4 ตัว, SSE streaming, quota + idempotency, thread | `dmp-lifecycle`, `projects-files` (RAG), `accounts` (โควตา) | M4 |

**Build order:** `foundation` → `accounts` → `projects-files` → `dmp-lifecycle` → `ai`
**Dependency direction:** ทางเดียว ไม่มี cycle — cross-feature เรียกผ่าน service inject ตรง, I/O ภายนอกผ่าน ports (`FileStorage`, `NotificationPublisher`, `AiClient`, `MailSender`)
**แต่ละ module มี spec ของตัวเอง:** `docs/specs/SPEC-<module-id>.md` (เขียนหลัง SPEC.md นี้ผ่านการ review)

## Objective

Backend (NestJS, modular monolith) สำหรับนักวิจัย/กรรมการ เขียนและติดตาม DMP ตาม maDMP v3.0: ร่างแผน → ส่งอนุมัติ (institutional) หรือ self-finalize (independent) → เมื่อแผนมีผลระบบสร้าง tasks ให้ทำพร้อม evidence และ progress — โดย**ห้ามสูญเสียสิ่งที่ผู้ใช้บันทึกไว้เด็ดขาด** (preservation) และ FE ใช้ contract ชุดเดียวกับ BE (zod source of truth)

**Success มองจากผู้ใช้:** นักวิจัยสมัคร→สร้างโครงการ→อัปโหลด proposal→เขียนแผน (มี AI ช่วย)→ส่งอนุมัติ→กรรมการตัดสิน→tasks เกิด→ทำงานจนเสร็จ; ทุก flow มี e2e test คุ้มกัน (18 flows)

## Tech Stack

| สิ่ง | ค่า | เหตุผล |
| --- | --- | --- |
| ภาษา/framework | TypeScript strict + NestJS (node v24, pnpm) | แชร์ type กับ FE ผ่าน zod (ADR-0004) |
| DB | PostgreSQL 18 + Drizzle (migrations เป็น SQL files) | JSONB + partial unique index บังคับ constraint ระดับ DB (ADR-0003) |
| Contract | zod → OpenAPI (`@asteasolutions/zod-to-openapi` + `@nestjs/swagger`) serve ที่ `GET /openapi-json` | FE generate client จาก runtime spec (ADR-0010, TC-4) |
| Auth | JWT access 15 นาที + refresh httpOnly cookie rotation + family reuse detection; password argon2id | ADR-0006/0016/0029 |
| AI | เขียน ReAct loop เอง บน `AiClient` port → OpenRouter (system key) | ADR-0005/0018, TC-6 |
| Embedding | `@huggingface/transformers` v3 บน onnxruntime-node, `multilingual-e5-large-instruct` (1024 dims), fallback e5-small ผ่าน config | ADR-0028/0025 |
| Testing | Vitest (unit test-first บน engine) + supertest e2e ต่อ Postgres จริง | Quality Goal 1–2 |
| Deploy target | docker-compose VM เดียว (Caddy + app + Postgres + MailPit dev) | TC-1/TC-2 |

## Commands

```
pnpm install                       # ติดตั้ง
pnpm dev                           # รัน app ต่อ Postgres ใน compose
docker compose up -d               # รัน Postgres 18 + MailPit (dev) — ต้องเปิด docker daemon ก่อน
pnpm lint                          # eslint (รวม boundary rule: domain-engine ห้าม @nestjs/* / DB / HTTP)
pnpm lint --fix
pnpm test                          # vitest run ทั้งหมด
pnpm test -- tests/unit            # unit เท่านั้น (โฟลเดอร์รายหน่วย)
pnpm test -- tests/e2e             # supertest ต่อ Postgres จริง (ต้องมี compose รันอยู่)
pnpm db:migrate                    # drizzle-kit migrate
pnpm db:generate                   # drizzle-kit generate จาก schema
pnpm db:seed                       # seeds สำหรับ dev/e2e
```

## Project Structure

```
src/
├── features/
│   ├── auth/ users/ projects/ files/ dmps/ tasks/
│   ├── notifications/ ai/ exports(deferred)/ reviews(read model)
├── shared/
│   ├── domain-engine/         # pure functions — ห้าม import @nestjs/*, ห้าม DB/HTTP (lint บังคับ)
│   ├── domain-profiles/       # 8 profiles + field policy registry (port จาก FE — ADR-0026/0027)
│   ├── contracts/             # zod schemas = source of truth (draft, error envelope, SSE, list)
│   ├── ports/                 # FileStorage, NotificationPublisher, AiClient, MailSender
│   ├── adapters/              # DiskStorage, SsePublisher+InProcessEventBus, OpenRouterClient, SmtpMailer
│   └── config/                # loader — จุดเดียวที่อ่าน config.toml
├── database/                  # drizzle schema + migrations (SQL) + seeds
tests/
├── unit/                      # โฟลเดอร์รายหน่วย ไม่ mirror ต้นทาง
│   ├── domain-engine/         # test-first บน engine (diff/classify/…)
│   ├── dmps/ tasks/ auth/ …   # unit ราย feature ตามชื่อหน่วย
├── integration/               # Postgres, disk, mock OpenRouter, SMTP
├── e2e/                       # supertest ต่อ Postgres จริง — 18 flows
└── fixtures/                  # draft JSON, .docx, แผนตัวอย่าง
docs/                          # arc42, decisions (ADR), frontend-api, research, dev-plan, specs
config.toml / .env.example
```

## Code Style

Feature-driven ตาม project-dna (CON-1): โฟลเดอร์ตัวพิมพ์เล็ก, 1 NestJS module ต่อ 1 feature, layering บังคับ:

```
controller (HTTP/SSE — บาง) → service (use-case, transaction Drizzle เดียวต่อ flow)
  → domain/ (pure functions) → repository (Drizzle)
  → ports/ (interface) → adapters/ (implementation จริง)
```

- ID ทุก entity เป็น UUID v7 mint โดย backend เสมอ (CON-5); วันที่ไม่มีเวลาเก็บ `YYYY-MM-DD` แยกจาก timestamp (CON-4)
- Error ใช้ envelope เดียวสไตล์ Stripe: `{ error: { type, code, message, param? } }` — `code` จาก catalog ของ FE, `param` เป็น JSON pointer เฉพาะ error ที่ชี้ draft; 400=ผิดรูป, 422=ไม่ผ่านกฎ, 409=สถานะขัดกัน (ADR-0014)
- List endpoints: cursor pagination สไตล์ Stripe v1 (ADR-0015); draft save เป็น PUT ทั้งก้อน + `draft_revision` (ADR-0020)
- ตัวอย่างรูปแบบที่ดี: pure function รับ JSON ล้วน + registry, คืนผลลัพธ์ใหม่ — `classify(changes, fieldPolicy): "minor" | "major"` ไม่อ่าน DB/สภาพแวดล้อม

## Testing Strategy

| ระดับ | Seam | ทดสอบอะไร |
| --- | --- | --- |
| unit (Vitest, `tests/unit/`) | domain-engine pure functions — เรียกตรง | diff/classify/fold/carry/rebase/validate/task generator — test-first เป็น scenario ก่อนโค้ด (fixtures จาก registry ที่ port จริง) |
| integration (`tests/integration/`) | ports/adapters + DB | constraints ระดับ Postgres (QS-1), DiskStorage, mock OpenRouter, SMTP/MailPit, RAG embed |
| e2e (`tests/e2e/`) | HTTP/SSE boundary — supertest ต่อ Postgres จริง | พฤติกรรมทั้งหมดที่ผู้ใช้เห็น — 18 flows, ทุกกฎ preservation มี e2e คุ้มกัน (QS-8) |

- Coverage: engine ครบทุก branch ของกฎ preservation; e2e ครบ 18 flows เป็นประตูแต่ละ milestone
- กฎเทสที่ดี: ทดสอบพฤติกรรมภายนอกเท่านั้น (สิ่งที่ client เห็น) — ไม่ยึดโครงสร้างภายใน; prior art: FE prototype tests (`expect(tasks).toHaveLength(5)` ต่อ dataset) แปลเป็น engine fixtures

## Boundaries

- **Always:** เขียน test ก่อนโค้ดบน domain-engine; รัน `pnpm lint` + `pnpm test` ก่อน commit; ทุก flow ที่ต้อง atomic (approve → tasks → notifications) อยู่ใน transaction Drizzle เดียว; validation ปฏิเสธพร้อม JSON pointer; จดสิ่งที่ "ลบไม่ได้" เป็น archive/cancel พร้อมเหตุผล (preservation)
- **Ask first:** แก้ DB schema/migrations; เพิ่ม dependency ใหม่; แก้ CI config; เบี่ยงจาก ERD/contract ของ FE; แก้ค่าใน error code catalog
- **Never:** commit secrets (env เท่านั้น — TC-7); ลบแผน/task ที่มีงานบันทึก (archive/cancel เท่านั้น); import `@nestjs/*` หรือแตะ DB/HTTP ใน domain-engine; ให้ AI เขียนทับ draft อัตโนมัติ; แตะ draft โดยไม่เช็ค `draft_revision`

## Success Criteria

1. e2e ครบ 18 flows เขียวต่อ Postgres จริง — จบที่ flow #3 AI สตรีม SSE จบด้วย terminal event
2. QS-1–QS-8 ของ arc42 ผ่านครบ (submit ขนานถูก Postgres ปฏิเสธ, minor fix ไม่หายเงียบ, draft conflict 409 พร้อม rebase, สลับ adapter ไม่แตะ domain)
3. `GET /openapi-json` ให้ spec ที่ FE generate client สำเร็จ — zod เป็น source of truth จุดเดียว
4. CI เขียวสองขั้น (lint+unit ตั้งแต่ M1; e2e ตั้งแต่ M3)
5. ไม่มีการสูญเสียข้อมูลผู้ใช้ในทุก scenario ที่ e2e ครอบ

## Open Questions

1. ค่า TTL/พารามิเตอร์ argon2id ใน `config.json` — ใช้ OWASP minimum เป็น default หรือปรับ?
2. ชื่อ/รุ่น OpenRouter model ต่อ AI action (config `ai.models`) — ยังเปิดรอทดลองจริงตอน M4?
3. Seeds สำหรับ e2e — ใช้ fixture แผนจริงจาก FE (`fixtures/`) หรือสร้าง generator?
