# Tech Stack ของ uni-backend — คืออะไร และทำไมถึงเลือกใช้

> เอกสารอธิบายเชิงบรรยาย (not an ADR) — เหตุผลเชิงสถาปัตยกรรมที่ถาวรกว่านี้อยู่ใน `docs/decisions/`

## ภาพรวม

| Layer | เทคโนโลยี | บทบาท |
|---|---|---|
| Runtime | Node.js ≥ 24 | รัน TypeScript ตรง ๆ ผ่าน tsx |
| Framework | NestJS 12 + Express | โครงสร้าง DI/controller/service |
| ORM | Drizzle ORM | query แบบ type-safe บน Postgres |
| Database | PostgreSQL 18 | เก็บข้อมูลหลักทั้งหมด (13 tables) |
| Validation | Zod | ตรวจข้อมูลทุก boundary + นิยาม API contract |
| Auth | JWT | bearer token, `AuthGuard` แบบ global |
| API Docs | Swagger (`@apidevtools` + zod-to-openapi) | `/api-docs`, `/openapi-json` |
| Email (dev) | MailPit (SMTP :1025, UI :8025) | จำลอง mail server ใน docker-compose |
| AI / Embedding | TransformersEmbedding (ONNX Runtime, CUDA→CPU fallback) | สร้าง embedding สำหรับ RAG |
| Test | Vitest 3 + supertest | unit / integration / e2e 3 ระดับ |
| Lint | typescript-eslint `strictTypeChecked` | คุณภาพโค้ด + บังคับ boundary ของ domain-engine |
| CI | GitHub Actions | lint+typecheck+unit แล้ว e2e กับ Postgres service |

## เทคโนโลยีแต่ละตัว — คืออะไร และเหตุผล

### Node.js ≥ 24 + tsx (ESM, ไม่มี build step)

**คืออะไร:** Node เป็น JavaScript runtime ฝั่ง server; `tsx` รันไฟล์ TypeScript ได้ทันทีโดย transpile ใน memory

**เหตุผล:**
- Node 24 ใหม่พอสำหรับ native ESM และ API สมัยใหม่ (`engines` บังคับ)
- ตัด build step ออก = dev loop เร็ว (`pnpm dev` รันตรง), ไม่มีปัญหา build artifact ต่าง env
- ESM + `verbatimModuleSyntax` ทำให้ import ชัดเจน และ tree-shake ได้ถ้าอนาคตต้อง bundle

### NestJS 12 + Express

**คืออะไร:** Framework ระดับ application ที่จัดโครงสร้างเป็น module/controller/service พร้อม DI container

**เหตุผล:**
- ระบบมีหลาย feature module (9 modules) และ lifecycle ซับซ้อน (DMP draft → submit → review → task generation) — ต้องการโครงสร้างบังคับ เพื่อไม่ให้แต่ละคนจัดวางต่างกัน (CON-1: ทุก feature มี quartet เดียวกัน)
- DI แบบ constructor injection ทำให้ integration test ฉีด dependency จริงผ่าน `moduleRef` ได้โดยไม่ต้อง mock
- เลือก Express เป็น underlying adapter เพราะเรียบง่าย, ecosystem เยอะ, และ SSE ใช้ API ของ Express ตรง ๆ (ไม่ใช้ RxJS stream ยกเว้น SSE)

### Drizzle ORM + PostgreSQL 18

**คืออะไร:** Drizzle เป็น ORM แบบ SQL-first ที่ให้ type-safe query; Postgres เป็น relational database หลัก

**เหตุผล:**
- ข้อมูลของระบบเป็น relational ชัดเจน (users/projects/dmps/reviews/tasks ผูกกันด้วย FK) — constraint ควรอยู่ที่ Postgres ไม่ใช่แค่ app layer
- Draft ของ DMP (maDMP v3.0) มีโครงสร้าง nested แปรปรวน → เก็บเป็น JSONB, ส่วนที่ query บ่อย/มี constraint เก็บเป็นคอลัมน์ปกติ — Drizzle รองรับทั้งสองแบบอย่าง type-safe
- Repository เป็น plain function ที่รับ `Db` (ไม่ผูก class) → test ง่าย, ไม่มี magic
- ID เป็น UUID v7 ที่ backend mint เอง (CON-5) — เรียงตามเวลาได้ และไม่ผูกกับ client
- `drizzle-kit generate` ทำ migration เป็นไฟล์ SQL ตรวจรายได้

### Zod

**คืออะไร:** Library ตรวจความถูกต้องของข้อมูลแบบ schema-first พร้อม infer type เป็น TypeScript

**เหตุผล:**
- "Single source of truth" (CON-3): schema เดียวใน `src/shared/contracts/` ใช้ทั้ง validate ที่ runtime, infer type ตอน compile และ generate OpenAPI ผ่าน zod-to-openapi → contract ไม่หลุดจากโค้ดจริง
- ทุก boundary (HTTP body, config.toml, env) ผ่าน Zod; error แรกถูกแปลงเป็น `400 field_invalid` พร้อม JSON-pointer `param` — message สำหรับ client สม่ำเสมอ
- Frontend (React 19) สามารถ reuse schema/shape เดียวกันได้ผ่าน API contract ใน `docs/frontend-api/dmps.md`

### JWT + AuthGuard (global)

**คืออะไร:** Token แบบ stateless สำหรับยืนยันตัวตน; guard ติดตั้งระดับ global ทุก route, route สาธารณะประกาศ `@Public()`

**เหตุผล:**
- Secure-by-default: ลืมใส่ guard บน endpoint ใหม่ = ยังปลอดภัย (ปิดไว้ก่อน, เปิดเฉพาะที่ประกาศ)
- Stateless → ไม่ต้อง lookup session ทุก request, scale แนวนอนได้ง่าย
- `JWT_SECRET` fail-fast ตอน bootstrap — ไม่มีทางรันขึ้นด้วย secret ค่า default

### Error Envelope + List Envelope (ADR-0014 / ADR-0015)

**คืออะไร:** Error ทุกอันถูก global filter (`ErrorEnvelopeFilter`) จัดรูปเป็น `{error:{type,code,message,param?}}`; list ทุกอันเป็น `{object:"list",data,has_more,total_count}`

**เหตุผล:**
- Client เขียน error handling ครั้งเดียวใช้ได้ทั้งแอป (สไตล์ Stripe)
- `throw ApiError(...)` ที่ throw site ไม่ต้อง format — กัน message/code ปนกันระหว่างจุดต่าง ๆ
- Pattern กลางเดียว → ผ่าน `docs/frontend-api/dmps.md` สื่อสารกับ FE ได้แบบ deterministic

### Domain Engine (`src/shared/domain-engine/`) — pure functions

**คืออะไร:** Logic ที่ deterministic ทั้งหมด (classify major/minor, diff, validate, fold, carry, task-generator) อยู่กันเป็นชุด pure function

**เหตุผล:**
- ตัดความเสี่ยงสำคัญของระบบ: การ classify version และ generate task ต้องให้ผลเดิมเสมอ — pure function = test ได้ไม่ต้อง DB, ไม่ต้อง Nest
- Boundary ถูก lint บังคับ (ห้าม import `@nestjs/*`, DB driver, HTTP client) → กัน side effect หลุดเข้ามาโดยบังเอิญ (CON-2)
- ทำให้ service เหลือหน้าที่ orchestrate เท่านั้น, repository อ่าน/เขียนข้อมูลเท่านั้น — layering ชัด: controller → service → domain → repository

### SSE (Server-Sent Events) สำหรับ notification

**คืออะไร:** ช่องทาง push จาก server → browser แบบ one-way บน HTTP ปกติ

**เหตุผล:**
- Notification (เช่น review อนุมัติ/ปฏิเสธ) เป็น one-way อยู่แล้ว — WebSocket ล้นเกินจำเป็น
- ใช้ HTTP ปกติ → ผ่าน proxy/auth middleware เดิมได้; ฝั่งโค้ดใช้ discriminated union ใน `src/shared/contracts/envelope.ts` ให้ event แต่ละชนิด type-safe ทั้งสองฝั่ง

### Embedding ด้วย ONNX Runtime (TransformersEmbedding)

**คืออะไร:** รัน model embedding ในเครื่อง (local inference) เพื่อทำ RAG กับไฟล์/เนื้อหาที่ upload และ extract (docx)

**เหตุผล:**
- Local inference = ข้อมูลวิจัยไม่ต้องออกนอกระบบ (แตกต่างจาก LLM generation ที่ใช้ OpenRouter)
- เครื่องที่มี NVIDIA GPU ใช้ CUDA/fp16 EP ก่อน (ต้องติดตั้ง EP เองหลัง `pnpm install` เพราะ license ไม่แถมใน npm), ไม่มี GPU → fallback CPU/q8 อัตโนมัติ — CI ไม่มี GPU ก็รันได้

### MailPit (dev SMTP)

**คืออะไร:** Fake SMTP server สำหรับ dev — จับ mail ที่ระบบส่ง ดูได้ใน UI :8025

**เหตุผล:**
- พัฒนา flow อีเมล (เช่นแจ้งผล review) ได้จริงโดยไม่ส่ง mail จริงหาใคร, config เดียวกับ production path (`SMTP_URL`)

### Vitest 3 — 3 ระดับ, ไม่ mock

**คืออะไร:** Test runner ที่เข้ากันกับ ESM/Vite; ใช้แบ่ง unit / integration / e2e

**เหตุผล:**
- **ไม่ mock** โดยนโยบาย: unit ทดสอบ pure function ของ domain-engine ตรง ๆ, integration/e2e ยิง Postgres จริง (`describe.skipIf(!dbReady)` หลัง probe `select 1`) → test จับ bug ที่เกิดจริง (constraint, SQL, transaction) ไม่ใช่ความถูกต้องของ mock เอง
- `maxWorkers: 3` เพราะ Postgres local รับ connection ได้จำกัด
- supertest ยิงผ่าน `AppModule` จริง → e2e คือ milestone gate ของ CI

### typescript-eslint `strictTypeChecked`

**คืออะไร:** ESLint rule-set เข้มสุดที่ใช้ type information จาก compiler

**เหตุผล:**
- จับ bug เชิง type ที่ `tsc` ไม่จับ (floating promise, unsafe any, misused promise)
- เป็นกลไกบังคับสถาปัตยกรรม เช่น boundary ของ domain-engine ไม่ใช่แค่ข้อตกลงปากเปล่า
- e2e/fixtures ที่ไม่ต้อง strict ปิด type-check เฉพาะจุด (`disableTypeChecked`)

### Docker Compose (dev) + GitHub Actions (CI)

**คืออะไร:** Compose รอ Postgres 18 + MailPit สำหรับ dev; CI รัน lint+typecheck+unit แล้ว stage 2 รัน e2e กับ Postgres 16 service

**เหตุผล:**
- `pnpm install` แล้วต้องมี DB ให้ migrate ได้ทันที — ใช้ service container จริง ไม่ emulate
- CI mirror กับ dev workflow เดียวกัน (`db:migrate` → e2e) → ไม่มี "แต่ในเครื่องผม pass"

## สรุปหลักการเลือก

1. **Type-safety end-to-end:** Zod contract → Drizzle → strict TS — รู้ทันทีตอน compile เมื่อ API shape เปลี่ยน
2. **โครงสร้างบังคับ ไม่ใช่ข้อตกลง:** Nest module quartet, lint-enforced domain boundary, global guard/filter
3. **Real dependencies ใน test:** Postgres จริง, domain registry จริง — ไม่มี mock
4. **No build step:** tsx รันตรง, dev ไว, deploy ง่าย
5. **Spec-first:** แก้ behavior ต้องแก้ `docs/specs/` ก่อน, การตัดสินใจถาวรจดเป็น ADR
