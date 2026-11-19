# System Architecture — uni-backend

> เอกสารอธิบาย (not an ADR) — เราย่อเนื้อหาจาก [arc42.md](arc42.md) และ [ADR ทั้งหมด](../decisions/) มาเล่าเป็นเรื่องเดียว: ระบบนี้ออกแบบแบบไหน ทำไมถึงเลือกแบบนั้น และแลกมาด้วยต้นทุนอะไร รายละเอียดเต็มของแต่ละหัวข้ออยู่ในเอกสารที่อ้างไว้เสมอ

---

## 1. สถาปัตยกรรมระบบคืออะไร

สถาปัตยกรรม = **ระบบมีส่วนไหนบ้าง + ส่วนต่าง ๆ เชื่อมกันอย่างไร + การตัดสินใจที่ถ้าทำผิดแล้วแก้ยาก** เปรียบเหมือนแปลนบ้าน — ถ้าวาดผิดตั้งแต่แปลน ทีหลังต้องรื้อซึ่งแพงกว่าการคิดให้ดีตั้งแต่ต้นเสมอ เอกสารฉบับนี้จึงไม่ได้เล่าว่า "โค้ดอยู่ไฟล์ไหน" แต่เล่าว่า:

1. ระบบมีส่วนไหนบ้าง (เล่าจากภาพกว้างไปภาพใกล้)
2. แต่ละส่วนถูกเลือกเพราะอะไร — มันแก้ปัญหาอะไรให้เรา
3. ทางเลือกอื่นถูกตัดทิ้งเพราะอะไร
4. เรายอมแลกต้นทุนอะไร เพื่อได้การเลือกนั้นมา

ทุกการตัดสินระดับสถาปัตยกรรมของโปรเจกต์นี้จดไว้เป็น ADR (Architecture Decision Record) ใน [`docs/decisions/`](../decisions/) — เมื่อไรเห็นตัวเลข ADR-xxxx ในเอกสารนี้ แปลว่ามีลิงก์ไปยังเหตุผลฉบับเต็ม

---

## 2. ระบบนี้ทำอะไร (โจทย์ที่สถาปัตยกรรมต้องตอบ)

Backend ของแพลตฟอร์มบริหารงานวิจัยระดับสถาบัน: นักวิจัยเขียน **DMP (Data Management Plan)** ตามมาตรฐาน maDMP v3.0, ส่งแผน institutional ให้กรรมการตรวจ → อนุมัติแล้วระบบสร้าง lifecycle tasks ให้อัตโนมัติ, มี AI assistant ช่วยร่าง, แจ้งเตือน และ export มาตรฐานสากล

โจทย์สี่ข้อนี้คือสิ่งที่กำหนดรูปร่างของสถาปัตยกรรมทั้งหมด:

| โจทย์ | ผลต่อการออกแบบ |
| --- | --- |
| **ประวัติห้ามหาย** (preservation) — ไม่มีทางลบแผน, submit พร้อมกันสองคนเป็นไปไม่ได้, fix ที่ตกไปต้องถูกจด | กฎสำคัญ ๆ ต้องเป็น constraint ของฐานข้อมูลโดยตรง ไม่ใช่แค่เช็คในโค้ด; version/diff engine เป็น pure functions ที่ test-first |
| **Scale รู้ค่าล่วงหน้า** — ~200 ผู้ใช้/วัน, peak ~2,000 (TC-1) | เครื่องเดียวพอ — ตัด Redis และระบบ distributed ทิ้งจากเส้นทางหลัก |
| **ต้องแชร์ contract กับ frontend** (repo แยก, ไม่มี monorepo — TC-4) | zod schema ชุดเดียวเป็น source of truth; FE generate client จาก `GET /openapi-json` ตอน runtime |
| **ความเสี่ยงจริงคือความถูกต้อง ไม่ใช่ความเร็ว** (TC-3 — จุดที่ช้าจริงคือ network: OpenRouter/Postgres) | เลือกภาษาที่ logic ถูกต้องและดูแลง่าย มากกว่าภาษาที่เร็วกว่า |

---

## 3. ภาพกว้างสุด: ระบบอยู่ตรงไหนของโลก

```
┌─────────────┐  HTTPS REST/JSON + SSE   ┌──────────────────────────────┐
│  Frontend   │ ────────────────────────▶ │  uni-backend (NestJS 1 proc) │
│ React 19    │ ◀──────────────────────── │      VM เดียว + Caddy TLS    │
│ (repo แยก)  │     JWT bearer header     └───────┬──────────┬───────────┘
└─────────────┘                                   │ SQL      │ HTTPS
                                                  ▼          ▼
                                          ┌───────────┐  ┌────────────┐
                                          │ Postgres  │  │ OpenRouter │ (AI, system key)
                                          │ (Drizzle) │  └────────────┘
                                          └───────────┘  ┌────────────┐
                                                 │       │    SMTP    │ (reset password)
                                                 ▼       └────────────┘
                                          ┌─────────────┐
                                          │ Disk volume │ (ไฟล์ผ่าน FileStorage port)
                                          └─────────────┘
```

ประเด็นสำคัญของภาพนี้: อะไรที่เปลี่ยนได้เอง (Postgres, disk, SMTP, OpenRouter) ทั้งหมดถูกแยกออกจาก business logic ด้วย **port** (interface) — อธิบายในหมวด 5

---

## 4. การตัดสินระดับบนสุดสามข้อ

สามข้อนี้แก้กลับยากที่สุด จึงตัดสินก่อน และเป็นเหตุผลเบื้องหลังของทุกอย่างที่เหลือ

### 4.1 Modular monolith — โปรแกรมเดียว แบ่งโมดูลภายใน (ADR-0001)

**ปัญหาที่ตอบ:** flow approve → สร้าง tasks แรก → แจ้งเตือน ต้องสำเร็จพร้อมกันทั้งชุดหรือไม่สำเร็จเลย (transaction เดียว) — ถ้าแยก microservices ธุรกรรมข้ามเครือข่ายต้องพึ่ง saga/outbox pattern ซึ่งซับซ้อนเกินจำเป็นที่ scale นี้

**ทำไมจึงเลือก:**
- ผู้ใช้ ~200/วัน, peak ~2,000 — instance เดียวเพิ่มสเปกเครื่อง (scale แนวตั้ง) ก็รองรับได้สบาย
- notification push และ AI SSE stream อ่าน event จาก in-process event bus — ตัด Redis ออกทั้งเส้นทาง
- "modular" ทำให้ได้ขอบเขตโมดูลชัดเจน (9 features) โดยไม่เสียความเรียบง่ายของ process เดียว

**ทางเลือกที่ปฏิเสธ:** microservices (transactional flow ยาก/แพง), serverless (cold start + state ของ SSE ไม่เหมาะ)

**ต้นทุนที่ยอมรับ:** release = restart สั้น ๆ หนึ่งครั้ง (มี downtime เล็กน้อยทุก deploy); เงื่อนไขที่ติดมาคือ storage/notification/AI ต้องอยู่หลัง port เสมอ เผื่อวันที่ต้อง scale ออกจริง (สลับ disk→S3, in-process bus→Redis โดยไม่แตะ domain logic)

### 4.2 TypeScript + NestJS (ADR-0004)

**ปัญหาที่ตอบ:** ต้องแชร์ type/contract กับ frontend (React 19 + TS) ให้เป็นชุดเดียวจริง ๆ และระบบมี SSE เป็นหัวใจของ AI streaming

**ทำไมจึงเลือก:**
- zod schema กลางตัวเดียวทำได้สามอย่าง: ตรวจข้อมูลตอน runtime, infer type ตอน compile, และ generate OpenAPI — ทำครบใน ecosystem เดียว
- Node event loop จัดการ SSE connection ค้างหลายพันรายการได้ in-the-box; JSON เป็นจุดแข็งของภาษา (draft ทั้งแผนคือ JSON ตลอดสาย)
- NestJS บังคับโครงสร้าง (module/controller/service + DI) — ระบบมี lifecycle ซับซ้อน ต้องการโครงสร้างที่ "บังคับ" ไม่ใช่ข้อตกลงปากเปล่า (CON-1: ทุก feature มี quartet เดียวกัน)

**ทางเลือกที่ปฏิเสธ:** **Go** — เร็วกว่าชัดเจน (goroutine ~KB/connection) แต่ต้องนิยาม type สองครั้งสองฝั่ง และ raw performance ไม่ใช่ตัวตัดสินที่ scale นี้ (TC-3); **Python/FastAPI** — เหตุผลเดียวกัน

**ต้นทุนที่ยอมรับ:** ความเร็ว raw ต่ำกว่า Go (R-4, ความเสี่ยง Low) — ถ้าวันหนึ่งกลายเป็นคอขวด จุดแก้คือ topology (เพิ่ม instance) ไม่ใช่เปลี่ยนภาษา

### 4.3 PostgreSQL แบบผสม: relational + JSONB (ADR-0003)

**ปัญหาที่ตอบ:** draft ของแผนเป็น JSON nested ลึกตาม maDMP v3.0 (datasets → distributions, contributors, costs) แต่ requirement เรียกร้องให้ constraint สำคัญถูก enforce เป็น constraint จริง

**ทำไมจึงเลือกแบบผสม:**
- **Working draft = JSONB ก้อนเดียวต่อ DMP** — ระบบ diff/validate/fold/carry ทำงานกับ JSON ทั้งก้อนตาม entity id อยู่แล้ว การฉีกเป็นตารางย่อย (DATASET/DISTRIBUTION/CONTRIBUTOR/COST) จะซ้ำซ้อนกับโครงสร้างที่ engine ใช้จริง
- **DMP_VERSION = ตารางจริง (แถวต่อเวอร์ชัน)** — เพื่อให้ Postgres บังคับ constraint เอง:
  - `UNIQUE (dmp_id, number)` — เลขเวอร์ชันไม่ซ้ำ
  - partial unique `UNIQUE (dmp_id) WHERE status='pending'` — submit พร้อมกันสอง request **เป็นไปไม่ได้ เพราะฐานข้อมูลปฏิเสธเอง** ไม่ใช่แค่เช็คใน logic ของ app
- Entity ที่มี lifecycle จริง (users, credentials, projects, tasks, files, notifications, ai_thread_entries, reopen_offers, idempotency_keys) เป็นตาราง relational — รวม 13 ตาราง

**ทางเลือกที่ปฏิเสธ:** normalize ทั้งหมด (ฉีก draft เป็นหลายตาราง — ยิ่งซับซ้อนกับ diff engine), document DB ทั้งหมด (เสีย constraint ระดับ DB ซึ่งห้ามหายตาม preservation)

**ต้นทุนที่ยอมรับ:** query ที่ต้องเจาะเข้า draft ใช้ JSONB operator ช้ากว่าคอลัมน์ปกติ — ยอมได้เพราะความถี่ต่ำ (TD-3); ถ้าวันหนึ่งต้อง normalize จริง จะแตะเฉพาะ repository layer เพราะ domain engine ทำงานกับ JSON อย่างเดียว

---

## 5. ซูมเข้ามา: โครงสร้างภายใน process เดียว

### 5.1 Layering — controller บาง → service → domain / repository

```
HTTP/SSE request
   │
   ▼
┌────────────────────────────────────────────────────────────────┐
│ controller (บางมาก — รับ request, @CurrentUser() claims)        │
│    ▼                                                           │
│ service (use-case: Zod validate, role check, ธุรกรรม Drizzle)   │
│    ├──▶ domain-engine (pure functions — ห้ามแตะ DB/HTTP/NestJS) │
│    ├──▶ repository (plain Drizzle functions รับ Db)             │
│    └──▶ ports/ (interface) ──▶ adapters/                        │
│          FileStorage ──▶ DiskStorage (volume)                   │
│          NotificationPublisher ──▶ SsePublisher + InProcessEventBus │
│          AiClient ──▶ OpenRouterClient (system key)             │
│          MailSender ──▶ SmtpMailer (SMTP; dev = MailPit)        │
└────────────────────────────────────────────────────────────────┘
```

**ทำแบบนี้เพราะ:**
- **controller บาง** — logic ทั้งหมดอยู่ใน service ซึ่ง test เรียกใช้ตรง ๆ ได้ ไม่ต้องผ่าน HTTP
- **domain engine เป็น pure functions** (CON-2, บังคับด้วย lint — `shared/domain-engine/` ห้าม import `@nestjs/*`, DB driver, HTTP client): diff → classify → fold → carry → rebase → validate → task-generator คือ **ความเสี่ยงอันดับ 2 ของระบบ** ฟังก์ชันที่ deterministic ทำให้ test-first ได้จริง (เขียน scenario ก่อนโค้ด) โดยไม่ต้องมี DB
- **repository เป็น plain function รับ `Db`** ไม่ผูก class — ไม่มี magic, DI-free, test ง่าย
- **ทุก I/O ที่อาจเปลี่ยน implementation ในอนาคตต้องผ่าน port** (ADR-0002) — กติกานี้คือสิ่งที่ทำให้การตัดสิน 4.1 (monolith) ไม่กลายเป็นกับดัก: สลับ disk→S3 หรือ in-process bus→Redis ได้โดยไม่แตะ domain logic

การเชื่อมข้าม feature ใช้ direct service inject เป็นค่า default (`DmpsService` inject `TasksService`) — **ไม่มี event bus ทั่วไป**; `InProcessEventBus` มีอยู่แค่ภายใน adapter ของ `NotificationPublisher` เพื่อ push หลัง commit สำเร็จเท่านั้น

### 5.2 Feature modules — 9 features ตาม noun

`src/features/`: auth, users, projects, files, dmps, reviews, tasks, notifications, ai, exports (+meta) — ทุก feature มี quartet `<name>.module/service/repository/controller.ts` เดียวกัน (CON-1) โค้ดที่ใช้ร่วมหลาย feature อยู่ `src/shared/` (contracts, domain-engine, domain-profiles, ports, adapters, config)

**จัดตาม feature ไม่ใช่ตาม layer (controller/ ทั้งหมด, service/ ทั้งหมด) เพราะ:** แผน DMP lifecycle กระจายความรับผิดชอบชัดเจนตาม resource — เปลี่ยนแต่ละ resource ได้โดยไม่กระทบอื่น; การหาโค้ดของ use-case หนึ่งจบในโฟลเดอร์เดียว

### 5.3 Contract ชุดเดียว: zod → OpenAPI → FE generate (CON-3, ADR-0010)

`src/shared/contracts/` เป็น **source of truth เดียว** ของรูปร่าง API:

- validate ทุก boundary ตอน runtime (HTTP body, config.toml, env) — error แรกกลายเป็น `400 field_invalid` พร้อม JSON-pointer `param` ชี้ลง draft ให้ FE ทำ "คลิกไปแก้จุดนั้น" ได้
- infer TypeScript type ตอน compile
- generate OpenAPI spec เสิร์ฟที่ `GET /openapi-json` ตอน runtime — FE อีก repo รัน script generate client เอง (สอดคล้อง TC-4 ไม่มี monorepo, spec ไม่ commit ลง repo)

ผลที่ตามมา: แก้ schema ที่เดียว BE validation, BE type, FE type เปลี่ยนตามทั้งหมด (QS-5) — แลกกับวินัยที่ต้องรักษา: zod schema ต้องเป็น source of truth จริง ห้ามแก้รูปร่างข้ามสองฝั่งด้วยมือ (TD-4)

### 5.4 Cross-cutting ที่ผูกกับเหตุผลโดยตรง

| เรื่อง | การออกแบบ | เหตุผล (ADR) |
| --- | --- | --- |
| **Auth** | JWT access 15 นาที + refresh token ใน httpOnly cookie แบบ rotation 14 วัน + token-family reuse detection; password เป็น argon2id; `AuthGuard` ติด global, เปิดเฉพาะ `@Public()` | secure-by-default — ลืมใส่ guard บน endpoint ใหม่ = ยังปลอดภัย; argon2id เบี่ยงจาก ERD (SHA-256) อย่างมีเจตนา (ADR-0006, 0016, 0029) |
| **Error** | Envelope เดียวทั้ง API สไตล์ Stripe `{error:{type,code,message,param?}}` ผ่าน global filter เดียว; `throw ApiError(...)` ไม่ format ที่ throw site; `400`/`422`/`409` แยกหน้าที่ชัด | FE เขียน error handling ครั้งเดียวใช้ทั้งแอป; error code catalog ของ FE เป็น canonical เพราะ FE switch บน string เหล่านี้ (ADR-0014) |
| **List** | Cursor pagination สไตล์ Stripe `{object:"list",data,has_more,total_count}` | รูปแบบเดียวกันทุก list endpoint (ADR-0015) |
| **Real-time** | SSE เฉพาะ AI streaming (`status`/`tool`/`delta`/`proposal`/`done\|error`); notification เป็น polling ~60 วิ ไม่มี push; FE ใช้ fetch + ReadableStream | EventSource แนบ Authorization header ไม่ได้ และ AI action เป็น POST (ADR-0008, 0013, 0018) |
| **ID** | UUID v7 ที่ backend mint เสมอ | เรียงตามเวลาได้, ตัดปัญหา collision ข้ามแผนของระบบเดิม (ADR-0012) |
| **Optimistic concurrency** | ทุก PUT draft แนบ `draft_revision` — ไม่ตรง → `409 draft_conflict` พร้อมฝัง draft ปัจจุบันกลับมาให้ client rebase ทันที | ป้องกันงานแก้ถูกทับ — สิ่งที่ preservation ห้ามให้เกิด (ADR-0020) |
| **Preservation** | ไม่มีทางลบแผน (archive เท่านั้น); task ที่มีงานบันทึกลบไม่ได้ (cancel + จดเหตุผล); fix ที่ merge ไม่ได้ถูกจด `dropped_minor_edits` ไม่หายเงียบ ๆ | Quality Goal อันดับ 1 — ทุกกฎมี e2e test คุ้มกัน (arc42 §8.5) |
| **AI** | เขียน ReAct loop เองบน `AiClient` port; tools อ่านอย่างเดียว; ทุกผลลัพธ์เป็นข้อเสนอ ไม่เขียนทับ draft; `Idempotency-Key` + replay 24 ชม.; quota ต่อผู้ใช้ | ควบคุม SSE event ให้ตรง spec เป๊ะ — จึงไม่ใช้ LangChain; RAG embed in-process ด้วย ONNX (Qwen3-Embedding, CUDA→CPU fallback) ไม่มี pgvector — cosine ตรง ๆ ฝั่ง app ~1 ms ที่ขนาดเอกสารเดียว (ADR-0005, 0018, 0023, 0025, 0028) |

---

## 6. Testing — ทำไมไม่ mock

โครงสร้าง test สะท้อนสถาปัตยกรรมโดยตรง (Vitest 3, สามระดับ):

| ระดับ | ทดสอบอะไร | ทำไมแบบนี้ |
| --- | --- | --- |
| `tests/unit/` | pure functions ของ domain-engine + logic ราย feature | pure function test ได้โดยไม่มี DB — test-first ได้จริงเพราะ engine เป็น pure |
| `tests/integration/` | schema constraints, services ผ่าน moduleRef | Postgres จริง — จับ bug ระดับ constraint/SQL ที่ mock จับไม่ได้ |
| `tests/e2e/` | supertest ผ่าน `AppModule` จริง ต่อ Postgres จริง ครบ 18 flows | milestone gate ของ CI — ทุกกฎ preservation มี e2e คุ้มกัน (QS-8) |

นโยบาย **ไม่มี mock**: test ต้องจับ bug ที่เกิดจริง (constraint, transaction, SQL) ไม่ใช่ความถูกต้องของ mock เอง — DB suites gate ด้วย `describe.skipIf(!dbReady)` หลัง probe `select 1`; `maxWorkers: 3` ตามขีดจำกัด connection ของ Postgres local

---

## 7. Deployment — VM เดียว docker-compose

```
VM เดียว
├── caddy      — TLS termination + reverse proxy
├── app        — NestJS 1 process (node 24, tsx รันตรง ไม่มี build step)
├── postgres   — 13 tables + JSONB draft
├── MailPit    — dev เท่านั้น (SMTP catch-all ดู mail ใน UI :8025)
└── volumes    — ไฟล์ + DB (backup: pg_dump ตามรอบ + snapshot — หน้าที่ ops)
```

เหตุผล: ตรงกับ TC-1/TC-2 — เครื่องเดียว scale แนวตั้ง; ไม่มี kubernetes/cloud managed; release = restart สั้น ๆ ยอมรับได้ (R-3); migration เป็น SQL files commit ลง repo ตรวจรายได้ (drizzle-kit)

---

## 8. สรุป: ปัญหา → การออกแบบ → ทางเลือกที่ปฏิเสธ

| ปัญหา | การออกแบบที่ตอบ | ทางเลือกที่ปฏิเสธ + เหตุผล | ADR |
| --- | --- | --- | --- |
| transaction ข้าม use-case ต้อง atomic | modular monolith 1 process | microservices — saga ซับซ้อนเกินจำเป็นที่ scale นี้ | 0001 |
| type สองฝั่งต้องตรงกัน | TS + zod contract เดียว + FE generate จาก runtime spec | Go/Python — นิยาม type สองครั้ง, perf ไม่ใช่ตัวตัดสิน | 0004, 0010 |
| draft JSON nested + constraint ต้องจริง | hybrid: JSONB draft + relational versions/13 ตาราง | normalize ทั้งหมด / document DB ทั้งหมด | 0003 |
| version engine ต้องถูกต้องเสมอ | pure functions + lint boundary + test-first | logic ปนใน service (mock ต้องมาก่อน test) | CON-2 |
| I/O อาจต้องเปลี่ยน (S3, Redis push) | ports + adapters ทุกจุด | เรียก library ตรง ๆ จาก service | 0002 |
| งานแก้ถูกทับ / submit ซ้ำ | `draft_revision` optimistic + partial unique ที่ Postgres | lock แบบ pessimistic — ครอง connection ค้าง | 0020, 0031 |
| FE ต้องตอบสนอง error ได้ทุกจุด | envelope เดียว + JSON-pointer `param` | error ฟรีฟอร์มราย endpoint | 0014 |
| AI ต้อง stream ตาม spec | ReAct loop เอง + SSE event union ชัด | LangChain — ควบคุม event ยาก | 0005, 0018 |

---

## 9. ต้นทุนที่ยอมรับไว้ (โดยตั้งใจ)

| ต้นทุน | ผล | ทำไมยอม | ตัวเฝ้า |
| --- | --- | --- | --- |
| release = restart สั้น ๆ | downtime เล็กน้อยทุก deploy | ยอมได้ที่ scale นี้ | R-3 — ไม่พอจึงพิจารณา topology |
| raw perf ต่ำกว่า Go | ความเร็ว request ต่ำกว่าเล็กน้อย | คอขวดจริงคือ network ไม่ใช่ CPU | R-4 — แก้ที่ topology ไม่ใช่ภาษา |
| JSONB query ช้ากว่าคอลัมน์ | query ที่เจาะ draft | ความถี่ต่ำ; normalize ทีหลังแตะเฉพาะ repository | TD-3 |
| zod กลางเป็นข้อผูกมัด | แก้ contract ต้องผ่าน schema เดียว | นี่คือฟีเจอร์ ไม่ใช่บกพร่อง — แต่ต้องมีวินัยรักษา | TD-4 |
| email verification ยังไม่ทำ | สมัครด้วย email ใดก็ได้ | รับรู้และยอมรับชั่วคราว | OC-4 / R-1 |
| backup manual | พึ่ง runbook ของ ops | อยู่นอก scope ของ app | OC-3 / R-5 |

---

## 10. อ่านต่อ

| ต้องการ | ไปที่ |
| --- | --- |
| เหตุผลเต็มของการตัดสินข้อใดข้อหนึ่ง | [`docs/decisions/`](../decisions/) (ADR-0001–0031) |
| เอกสารสถาปัตยกรรมฉบับเต็ม 12 หมวด | [arc42.md](arc42.md) |
| ทำไมเลือกแต่ละเทคโนโลยี (รายตัว) | [../explained/tech-stack.md](../explained/tech-stack.md) |
| ระบบตอบสนองทีละขั้น | [sequence-diagrams.md](sequence-diagrams.md) |
| ภาพซูมแบบ C4 | [c4/README.md](c4/README.md) |
| โจทย์และกฎของระบบ | [requirement.md](requirement.md) |
