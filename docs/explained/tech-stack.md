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

**คืออะไร:** Node คือโปรแกรมที่ทำให้เรารัน JavaScript บนเครื่อง server ได้ ส่วน `tsx` คือตัวที่ทำให้เราเขียนไฟล์ TypeScript แล้วรันได้ทันที — ไม่ต้องแปลงเป็น JavaScript เป็นไฟล์ใหม่ก่อน มันแปลงใน memory ชั่วขณะแล้วรันเลย

**เหตุผล:**
- Node 24 ใหม่พอสำหรับ ESM (ระบบ import ไฟล์แบบมาตรฐาน `import ... from`) และ API สมัยใหม่ — เราบังคับเวอร์ชันนี้ไว้ใน `engines` ของ package.json
- ปกติโปรเจกต์ TypeScript ต้อง "build" ก่อนรันทุกครั้ง (แก้โค้ด → build → รัน → ลองใหม่) เราตัดขั้นตอน build ทิ้ง เหลือแค่แก้โค้ด → รัน (`pnpm dev` รันตรงเลย) ทำให้ลองไอเดียได้เร็ว และไม่มีปัญหา "ไฟล์ build ในเครื่องผมกับบน server ไม่เหมือนกัน"
- เปิดใช้ `verbatimModuleSyntax` ทำให้ import แต่ละอันชัดเจนว่าเอาอะไรมาจากไหน และถ้าวันหนึ่งต้องรวมไฟล์เป็น bundle เดียว (tree-shake — ตัดโค้ดที่ไม่ได้ใช้ออก) ก็ทำได้

### NestJS 12 + Express

**คืออะไร:** NestJS คือ framework ที่บังคับโครงสร้างโค้ดเป็น module/controller/service พร้อมระบบ DI (dependency injection — แทนที่จะสร้าง object ที่ต้องใช้เองในแต่ละที่ เราประกาศว่า "อยากได้อะไร" ใน constructor แล้วระบบส่งมาให้)

**เหตุผล:**
- ระบบนี้มี 9 feature modules และ flow ซับซ้อน (DMP draft → submit → review → task generation) ถ้าไม่มีโครงสร้างบังคับ แต่ละคนจะวางโค้ดไม่เหมือนกัน — CON-1 จึงกำหนดว่าทุก feature ต้องมีชุดไฟล์ quartet เดียวกัน (module/service/repository/controller)
- มี DI ทำให้ integration test ง่าย: ฉีด dependency จริงผ่าน `moduleRef` ได้เลย ไม่ต้องทำ mock ปลอม ๆ
- ใต้ NestJS ใช้ Express เป็นตัวรับ HTTP เพราะเรียบง่าย ecosystem เยอะ และ SSE (แจ้ง event แบบ push หา browser) ใช้ API ของ Express ตรง ๆ — นอกจาก SSE เราไม่ใช้ RxJS stream เลย

### Drizzle ORM + PostgreSQL 18

**คืออะไร:** Drizzle คือ ORM ที่ให้เขียน query เป็นโค้ด TypeScript แต่คิดแบบ SQL เป๊ะ ๆ (SQL-first) — TypeScript เช็คให้ว่าชื่อคอลัมน์/type ที่ query ถูกต้องตั้งแต่ตอนเขียนโค้ด Postgres คือฐานข้อมูลหลักที่เก็บทุกอย่าง

**เหตุผล:**
- ข้อมูลระบบนี้ผูกกันเป็นตารางชัดเจน (users/projects/dmps/reviews/tasks โยงกันด้วย FK) ดังนั้นกฎความถูกต้อง (constraint) ควรบังคับที่ Postgres เลย ไม่ใช่พึ่งโค้ด app อย่างเดียว — DB ปฏิเสธข้อมูลเสียได้ไม่ว่าโค้ดเขียนยังไง
- Draft ของ DMP (มาตรฐาน maDMP v3.0) มีโครงสร้างซ้อน ๆ กันและเปลี่ยนรูปแบบได้ → เก็บเป็น JSONB (คอลัมน์ JSON ที่ Postgres จัดการเก่ง) ส่วนข้อมูลที่ query บ่อยหรือมี constraint เก็บเป็นคอลัมน์ปกติ — Drizzle ใช้ทั้งสองแบบแล้วยัง type-safe อยู่
- Repository เราเขียนเป็น plain function ที่รับ `Db` เข้ามา ไม่ผูกกับ class → เทสตรงไปตรงมา ไม่มี magic ซ่อนอยู่
- ทุก ID เป็น UUID v7 ที่ backend สร้างเอง (CON-5) — ข้อดีคือเรียงตามเวลาได้ และไม่ผูกว่า client ต้องเป็นตัวสร้าง ID
- `drizzle-kit generate` สร้าง migration เป็นไฟล์ SQL → เปิดดูและตรวจได้ทีละบรรทัดก่อนรัน

### Zod

**คืออะไร:** Zod คือ library ที่ให้เราเขียน "schema" อธิบายรูปร่างของข้อมูล (ฟิลด์ไหนต้องมี, type อะไร) แล้วใช้ schema นั้นตรวจข้อมูลตอนรันจริง พร้อมกันนั้น TypeScript ก็ได้ type มาให้ใช้ฟรี ๆ จาก schema เดียวกัน

**เหตุผล:**
- "Single source of truth" (CON-3): เขียน schema ครั้งเดียวใน `src/shared/contracts/` แล้วได้ใช้ 3 อย่าง — ตรวจข้อมูลตอน runtime, ได้ TypeScript type ตอน compile, และ generate OpenAPI (เอกสาร API) ผ่าน zod-to-openapi → API contract ไม่มีทางต่างจากโค้ดจริง เพราะมันคือโค้ดชิ้นเดียวกัน
- ข้อมูลที่เข้ามาทุกทาง (HTTP body, config.toml, env) ต้องผ่าน Zod; ถ้าข้อมูลผิด error แรกที่เจอจะกลายเป็น `400 field_invalid` พร้อม JSON-pointer `param` บอกว่าฟิลด์ไหนผิด — client ได้รูปแบบ error เดิมเสมอ
- Frontend (React 19) สามารถ reuse schema/shape เดียวกันได้ผ่าน API contract ใน `docs/frontend-api/dmps.md`

### JWT + AuthGuard (global)

**คืออะไร:** JWT คือ token ที่ server ออกให้ตอน login แล้ว client แนบมากับทุก request เพื่อพิสูจน์ว่า "ใคร" — เรียกว่า stateless เพราะ server ไม่ต้องจำ session ไว้ใน memory/database ข้อมูลยืนยันอยู่ใน token เอง ส่วน AuthGuard เป็นด่านตรวจที่ติดตั้ง global คือครอบทุก route อัตโนมัติ route ไหนอยากให้คนไม่ login เข้าได้ ต้องประกาศ `@Public()` เอง

**เหตุผล:**
- Secure-by-default: ลืมคิดเรื่อง security บน endpoint ใหม่ = ยังปลอดภัยอยู่ เพราะมันถูกปิดไว้ก่อนแล้ว เปิดเฉพาะที่ประกาศไว้ชัด ๆ
- Stateless → ไม่ต้อง lookup session ทุก request, scale แนวนอนได้ง่าย (เพิ่ม server เครื่องใหม่ได้เลย ไม่ต้องแชร์ session store)
- `JWT_SECRET` ถ้าไม่มีใน env แอปจะดังตอน start ทันที (fail-fast) — ไม่มีทางรันขึ้นมาเงียบ ๆ ด้วย secret ค่า default ที่ใครก็เดาได้

### Error Envelope + List Envelope (ADR-0014 / ADR-0015)

**คืออะไร:** Error ทุกอันที่ client เห็น ถูก global filter (`ErrorEnvelopeFilter`) จัดรูปเป็น `{error:{type,code,message,param?}}` เท่านั้น ส่วน list ทุกอัน (รายการ dmp, task ฯลฯ) มีรูปร่างตายตัว `{object:"list",data,has_more,total_count}`

**เหตุผล:**
- Client เขียน error handling ครั้งเดียวใช้ได้ทั้งแอป เพราะ error ทุกชนิดมีหน้าตาเหมือนกัน (สไตล์เดียวกับ Stripe)
- โค้ดที่ throw `ApiError(...)` ไม่ต้องจัด format error เอง — กันปัญหา message/code ปนกันไม่เหมือนกันระหว่างจุดต่าง ๆ ในโค้ด
- มี pattern กลางเดียว → สื่อสารกับ FE ผ่าน `docs/frontend-api/dmps.md` ได้แบบ deterministic (หน้าตา API ทายได้แน่นอน)

### Domain Engine (`src/shared/domain-engine/`) — pure functions

**คืออะไร:** Logic ที่ต้องให้ผลเดิมเสมอเมื่อ input เดิม (deterministic) เช่น classify major/minor, diff, validate, fold, carry, task-generator — เขียนเป็น pure function คือ function ที่ไม่อ่าน/แก้อะไรนอกตัวเอง ให้คำตอบจาก input เท่านั้น รวมกันอยู่ใน `src/shared/domain-engine/`

**เหตุผล:**
- นี่คือความเสี่ยงสำคัญที่สุดของระบบ: การตัดสินว่า version เป็น major/minor และการ generate task ต้องได้ผลเดิมทุกครั้ง — pure function test ได้ง่ายมาก เพราะเรียกแล้วเทียบคำตอบ ไม่ต้องมี DB หรือ Nest เข้ามาเกี่ยว
- Boundary ถูก lint บังคับจริง (ห้าม import `@nestjs/*`, DB driver, HTTP client) → กัน side effect หลุดเข้ามาโดยบังเอิญ ไม่ใช่แค่ขอร้องกันไว้ (CON-2)
- เพราะ logic เครื่องคำนวณอยู่ใน domain-engine service เหลือหน้าที่ orchestrate (เรียงลำดับการทำงาน) อย่างเดียว repository อ่าน/เขียนข้อมูลอย่างเดียว — layering ชัด: controller → service → domain → repository

### SSE (Server-Sent Events) สำหรับ notification

**คืออะไร:** ช่องทางให้ server ดันข้อมูลไปหา browser ได้เองแบบทางเดียว (server → browser เท่านั้น) โดยใช้ HTTP ปกติ ไม่ต้องติดตั้ง protocol ใหม่

**เหตุผล:**
- Notification (เช่น review อนุมัติ/ปฏิเสธ) เป็น one-way อยู่แล้ว — browser ไม่ต้องตอบอะไรกลับ ใช้ WebSocket (รองรับสองทาง) ถือว่าล้นเกินจำเป็น
- ใช้ HTTP ปกติ → ผ่าน proxy/auth middleware เดิมได้เลย ฝั่งโค้ดใช้ discriminated union ใน `src/shared/contracts/envelope.ts` ทำให้ event แต่ละชนิด type-safe ทั้งสองฝั่ง (ส่งผิดชนิด compile ไม่ผ่าน)

### Embedding ด้วย ONNX Runtime (TransformersEmbedding)

**คืออะไร:** รัน model embedding (แปลงข้อความเป็นตัวเลข vector เพื่อค้นหาความหมายคล้ายกัน) ในเครื่อง server เราเอง ไม่ยิงไป cloud — ใช้ทำ RAG (ค้นเนื้อหาที่เกี่ยวข้องมาให้ LLM อ้างอิง) กับไฟล์/เนื้อหาที่ upload และ extract จาก docx

**เหตุผล:**
- Local inference = ข้อมูลวิจัยไม่ต้องออกนอกระบบ (ต่างจาก LLM generation ที่ส่งข้อความไป OpenRouter)
- เครื่องที่มี NVIDIA GPU ใช้ CUDA/fp16 EP ก่อน (EP คือ execution provider ตัวขับ GPU — ต้องติดตั้งเองหลัง `pnpm install` เพราะ license ไม่แถมมาใน npm package) เครื่องไม่มี GPU → fallback ไป CPU/q8 อัตโนมัติ — ทำให้ CI ที่ไม่มี GPU ก็รันได้

### MailPit (dev SMTP)

**คืออะไร:** Mail server ปลอมสำหรับ dev — จับอีเมลที่ระบบส่งทั้งหมดไว้ แล้วเปิดดูในหน้าเว็บ UI ที่ port 8025 ได้เลย

**เหตุผล:**
- พัฒนา flow อีเมล (เช่นแจ้งผล review) ได้จริงทั้ง flow โดยไม่ส่ง mail จริงหาใคร และ config เดียวกับ production path (`SMTP_URL`) → โค้ดส่วนส่งเมลไม่ต่างระหว่าง dev กับ production

### Vitest 3 — 3 ระดับ, ไม่ mock

**คืออะไร:** Vitest คือ test runner ที่ทำงานกับ ESM/Vite ได้ลื่น — เราใช้แบ่ง test เป็น unit / integration / e2e 3 ระดับ

**เหตุผล:**
- **ไม่ mock** โดยนโยบาย (mock คือตัวปลอมแทน dependency จริง): unit ทดสอบ pure function ของ domain-engine ตรง ๆ, integration/e2e ยิง Postgres จริง (`describe.skipIf(!dbReady)` — สคริปต์จะ probe `select 1` ก่อน ถ้า DB ไม่ขึ้นข้าม suite นั้นไป) → test จับ bug ที่เกิดจริง (constraint, SQL, transaction) ไม่ใช่แค่ยืนยันความถูกต้องของตัว mock เอง
- `maxWorkers: 3` เพราะ Postgres local รับ connection ได้จำกัด — รัน test ขนานเกินนี้จะชนกัน
- supertest ยิงผ่าน `AppModule` จริง → e2e คือ milestone gate ของ CI (ผ่าน e2e = พร้อมปล่อย milestone)

### typescript-eslint `strictTypeChecked`

**คืออะไร:** ESLint rule-set ที่เข้มที่สุด โดยใช้ type information จาก compiler (ปกติ ESLint อ่านแค่ syntax ระดับตัวอักษร รุ่น type-aware จะเข้าใจว่าตัวแปรไหนเป็น type อะไร)

**เหตุผล:**
- จับ bug เชิง type ที่ `tsc` (compiler) ไม่จับ เช่น floating promise (promise ที่ลืม await แล้ว error หายเงียบ ๆ), unsafe any, misused promise
- เป็นกลไกบังคับสถาปัตยกรรมด้วย เช่น boundary ของ domain-engine ถูกบังคับผ่าน rule นี้ ไม่ใช่แค่ข้อตกลงปากเปล่า
- e2e/fixtures ที่ไม่ต้อง strict ปิด type-check เฉพาะจุด (`disableTypeChecked`)

### Docker Compose (dev) + GitHub Actions (CI)

**คืออะไร:** Compose คือไฟล์กำหนดว่า dev ต้องมี service อะไรบ้าง — ที่นี่คือ Postgres 18 + MailPit รันด้วยคำสั่งเดียว; CI (GitHub Actions) รัน lint+typecheck+unit เป็น stage 1 แล้ว stage 2 รัน e2e กับ Postgres 16 service

**เหตุผล:**
- `pnpm install` เสร็จต้องมี DB ให้ migrate ได้ทันที — ใช้ service container จริง ไม่ emulate (จำลอง DB ปลอม ๆ ที่มี behavior ต่างจากของจริง)
- CI mirror กับ dev workflow เดียวกัน (`db:migrate` → e2e) → ไม่มีสถานการณ์ "แต่ในเครื่องผม pass"

## สรุปหลักการเลือก

1. **Type-safety end-to-end:** Zod contract → Drizzle → strict TS — รู้ทันทีตอน compile เมื่อ API shape เปลี่ยน
2. **โครงสร้างบังคับ ไม่ใช่ข้อตกลง:** Nest module quartet, lint-enforced domain boundary, global guard/filter
3. **Real dependencies ใน test:** Postgres จริง, domain registry จริง — ไม่มี mock
4. **No build step:** tsx รันตรง, dev ไว, deploy ง่าย
5. **Spec-first:** แก้ behavior ต้องแก้ `docs/specs/` ก่อน, การตัดสินใจถาวรจดเป็น ADR
