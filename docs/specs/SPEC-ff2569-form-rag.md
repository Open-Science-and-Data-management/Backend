# Spec: FF2569 Form-Aware Ingestion (spec:ff2569-form-rag)

> Ground-truth analysis: `docs/research/ff2569-form-rag-structure.md` (structure facts, template quirks, 14 design decisions Q1–Q14 จาก grilling session)

## Objective

อัปโหลดเอกสาร Full Proposal FF2569 (docx ฟอร์มตายตัว) เข้าระบบ RAG เดิม โดย chunk ตามโครงสร้างฟอร์ม (field-level) แทน generic paragraph packing ซึ่งปัจจุบัน **หลุดตารางทั้ง 11 เงียบ ๆ** (`parseDocxBlocks` regex เฉพาะ `h1-3|p`) และไม่มี heading (`heading_path = null` ทุก chunk)

**User story**: นักวิจัยอัปโหลดไฟล์ → ระบบ map เนื้อหาเข้า field ของฟอร์มอย่างถูกต้อง → `read_proposal` / AI tools ดึงบริบทต่อ field ได้แม่นยำ (คำถามของฟอร์มติดทุก chunk) → เอกสารที่ไม่ใช่ FF2569 ยังอัปโหลดได้ปกติผ่าน fallback + FE รู้ว่า fallback

**Acceptance criteria**
1. เอกสาร FF2569 ที่มีอยู่ (fixture) ถูก chunk ต่อ field — ทุก canonical field ID ปรากฏ, ไม่มี boilerplate (ตัวเลือกที่ไม่ติ๊ก) เข้า index, ตารางครบ 11 เป็น row-chunks พร้อม header context
2. Checkbox state มาจาก `w14:checked` (OOXML) ไม่ใช่ glyph guessing
3. enum field ลง `meta` jsonb ได้ filter; `heading_path` อ่านได้ เช่น `"ส่วนที่ 1 > ข้อ 9 คำสำคัญ"`
4. เอกสารอื่น → generic path เดิม + `fallback: true` ใน upload response + log
5. Retrieval เดิม (`FilesService.retrieve` flat top-k) ไม่เปลี่ยนพฤติกรรม; เพิ่ม parent-expansion helper สำหรับ AI tools
6. Golden QA วัด hit@k/MRR ผ่าน threshold ที่กำหนด (S5)

## Tech Stack

- NestJS 12 + Express, Drizzle/Postgres, Zod, ESM + tsx (ไม่มี build step)
- `jszip` + XML parser (สำหรับ OOXML ตรง — **ตรวจ dependency ที่มีอยู่ก่อน**, ห้ามเพิ่มโดยไม่ถาม)
- mammoth คงไว้สำหรับ fallback path เดิม
- Embedding เดิม: `TransformersEmbedding` (multilingual-e5-large, 1024 dims) — ไม่แตะ
- VLM caption: OpenRouter (model slug ตั้งใน `config.toml`)

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate            # หลังมี migration meta jsonb
pnpm test -- tests/unit/files
pnpm test -- tests/integration
pnpm test -- tests/e2e
pnpm typecheck && pnpm lint
```

## Project Structure

```
src/features/files/
  docx.ts                     → เดิม (fallback); เพิ่ม parseDocxForm (OOXML → raw blocks)
  form-extract.ts             → FF2569Document (paragraphs/tables/checkbox/images) → fields ต่อ schema
  chunking.ts                 → เดิม blocksToChunks คงไว้; เพิ่ม fieldsToChunks
  files.service.ts            → เส้นทาง upload: schema match → fast path / fallback + response flag
  retrieval.ts  (หรือใน service) → parent-expansion helper
  templates/ff2569.ts         → schema + Zod types, template_version "FF2569", canonical English field IDs
src/database/migrations/      → +1 migration: file_chunks.meta jsonb
tests/unit/files/             → schema, extractor, fieldsToChunks (pure, ไม่แตะ DB)
tests/integration/            → golden QA hit@k/MRR กับ fixture ไฟล์จริง
tests/e2e/                    → upload FF2569 ผ่าน fast path; docx ธรรมดา fallback + flag
tests/fixtures/               → ข้อเสนอโครงการ FF2569.docx (copy)
```

## Code Style

ตาม repo: service (use case) → pure function → repository (plain Drizzle taking `Db`); Zod ทุก boundary; comment ไทย อ้าง ADR

```ts
// form-extract — pure functions; แปลง raw OOXML blocks → FF2569 fields ต่อ schema; ไม่แตะ DB/HTTP (CON-2)
export function extractFields(doc: Ff2569RawDocument, schema: Ff2569Template): Ff2569Fields {
  // checkbox จาก w14:checked — deterministic ไม่ใช้ glyph
}

// chunk: คำถามของฟอร์มติดทุก chunk — บริบท retrieval สำคัญกว่าคำตอบเดี่ยว ๆ
export function fieldsToChunks(fields: Ff2569Fields, config: ChunkConfig): ChunkWithMeta[] {
  // คำตอบยาว > targetTokens → แตกหลาย chunk ทุกก้อน prefix คำถาม + part i/n
}
```

Naming: files `<name>.service.ts` pattern; DB snake_case / TS camelCase / API snake_case; errors `ApiError` เข้า `ErrorEnvelopeFilter` เท่านั้น

## Testing Strategy

- Vitest 3, สาม tier ตาม repo (unit ไม่แตะ DB / integration กับ Postgres จริง / e2e supertest)
- **ไม่ mock**: integration/e2e ใช้ Postgres จริง + fixture docx จริง; `describe.skipIf(!dbReady)`; `maxWorkers: 3`
- Unit: schema ครบ field, extractor นับตาราง = 11 / checkbox = 154, `fieldsToChunks` — คำถาม prefix, boilerplate ถูกตัด, คำตอบยาวแตก part i/n
- Integration: golden QA (~30–50 คำถามครอบทุก section) วัด hit@k/MRR ผ่าน `FilesService.retrieve`
- E2e: อัปโหลด FF2569 → chunks มี `meta` และ `heading_path`; อัปโหลด docx ธรรมดา → `fallback: true` ใน response
- Edge ที่ต้องคุม: schema match ล้มเหลว (โครงเพี้ยน) → fallback; คำตอบว่าง → ไม่เกิด chunk เปล่า; VLM quota หมด → skip caption ไม่ fail

## Boundaries

- **Always**: spec-first (แก้ spec ก่อน behavior); Zod ทุก boundary; domain logic เป็น pure function; tolerant matching (template มี typo/เลขซ้ำ — ห้ามแมตช์เลขข้อตรง ๆ)
- **Ask first**: เพิ่ม dependency (jszip/XML parser), migration ที่แตะตารางอื่นนอกจากเพิ่มคอลัมน์ `meta`, เปลี่ยนพฤติกรรม `FilesService.retrieve` เดิม, model slug ของ VLM ใน `config.toml`
- **Never**: hardcode เลขข้อ/ชื่อหัวข้อใน parser, ให้ upload fail จาก VLM quota/ความผิดพลาดของ caption, นับ embedding local เข้า AI quota (นับเฉพาะ VLM OpenRouter call ต่อ uploader ผ่าน reconcile เดิม ADR-0023), แตะ `TransformersEmbedding` / pgvector migration

## Success Criteria

1. `pnpm test` เขียวทั้ง 3 tier บน Postgres จริง
2. FF2569 fixture: ทุก field ID ใน schema มี ≥1 chunk; 0 boilerplate-ตัวเลือกไม่ติ๊ก ใน index; ตารางทั้ง 11 เป็น row-chunks ที่ header ติดทุกแถว
3. Golden QA: hit@5 ≥ threshold ที่ตกลงตอน S5 (ตั้งเป้าเริ่มต้น ≥ 0.8, ปรับจากผลจริง)
4. เอกสารที่ไม่ใช่ฟอร์ม: อัปโหลดสำเร็จ, chunks เท่ากับพฤติกรรมเดิม (regression), response มี `fallback: true`
5. `pnpm lint && pnpm typecheck` เขียว; ไม่มี dependency ใหม่ที่ไม่ผ่านการถาม

## Open Questions

1. XML parser ตัวไหน — repo มี dependency ที่ parse XML อยู่แล้วหรือยัง (ตรวจ package.json ตอนเริ่ม S2; jszip เองไม่ parse)
2. VLM model slug + budget — ใช้ model ใดบน OpenRouter และ caption ตอน ingest หรือ lazy ตอน index ครั้งแรก
3. รูปแบบ field `fallback` ใน upload response — เพิ่มใน `file_records` เก็บถาวร หรือ response-only (ผมเสนอ: response-only + log, เก็บถาวรเมื่อ FE ต้องการแสดงย้อนหลัง)
