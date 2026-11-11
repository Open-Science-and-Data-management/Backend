# Spec: FF2569 Form-Aware Ingestion (spec:ff2569-form-rag)

> Ground-truth analysis: `docs/research/ff2569-form-rag-structure.md` (structure facts, template quirks, 14 design decisions Q1–Q14 จาก grilling session)
>
> **Rev 2 (2026-11-11) — chunk grouping + embedding model**: ดู [§Revision 2](#revision-2--chunk-grouping--embedding-model-2026-11-11) — ตัดสินใจจาก grilling session ครั้งที่ 2; ส่วนอื่นยังอ้างอิง Rev 1 ยกเว้นที่ Rev 2 เขียนทับ

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

## Revision 2 — chunk grouping + embedding model (2026-11-11)

ตัดสินใจจาก grilling session ครั้งที่ 2 (ผู้ใช้ตอบครบทุกข้อ) — เขียนทับ acceptance criteria และกติกาบางข้อของ Rev 1 ตามที่ระบุด้านล่าง

### Objective (Rev 2)

chunk จาก fast path FF2569 แยกกันเกินจำเป็น — ตารางถูกแตก row-chunk ทำให้ context ขาด และ text ในหัวข้อเดียวกันกระจายหลาย chunk ทำให้ `read_proposal` ต้องประกบหลายก้อน อีกทั้ง context 512 ของ e5 ไม่พอกับตารางใหญ่ ผู้ใช้ต้องการให้ text ทั้งหมดของแต่ละหัวข้อ (ตารางรวมอยู่ด้วย) อยู่ใน chunk เดียวกัน และคุณภาพ caption รูปจาก VLM ต้องครอบคลุม OCR/diagram/description

### การตัดสินใจ (จาก grilling — ทั้งหมดผู้ใช้ตอบรับแล้ว)

| # | การตัดสินใจ |
|---|---|
| D1 | กลไกรวม chunk = ประกาศ `chunkGroups` ใหม่ใน `templates/ff2569.ts` (single source of truth) — group ระบุ `fieldIds` + `label` |
| D2 | เลิกแตก row-chunk **ทุกตาราง** — ทั้งตารางอยู่ chunk เดียว (เกิน cap → part i/n); ลบ `table_row` / `parent_chunk_index` จาก `ChunkMeta` และลบ parent-expansion ใน `retrieval.ts` |
| D3 | meta ของ chunk รวมเก็บ field ครบ → `field_id: string` → `field_ids: string[]` (chunk เดี่ยว = array 1 ตัว) |
| D4 | Group ที่ประกาศ (heading_path = `section > label`):<br>• s0: `fund_type, fiscal_year, institution` → label `ข้อมูลหัวฟอร์ม`<br>• s1: ทุก field ยกเว้น `oecd_field`, `research_team` → label `ข้อมูลทั่วไป`<br>• s2: `research_framework` + `framework_description` → label `รูปภาพ` |
| D5 | ตารางไม่ group เพิ่ม — work_plan, research_area, benefit_area, equipment, collaborating_orgs, expected_outputs, output_to_outcome เป็น chunk เดี่ยวต่อ field เพราะเลิก row-chunk แล้วตอบ requirement |
| D6 | chunk รวมยาวเกิน target → แบ่ง part i/n โดย**ตัดที่ขอบเขต field ก่อน** (ไม่ตัดกลาง field); ทุก part heading_path เดียวกัน → `expandToSections` ประกบกลับได้ |
| D7 | ตาราง cap ด้วย knob ใหม่ `files.rag.chunkTableMaxTokens = 4096` (Qwen3 รับ 32k แต่คุม precision ของ cosine) — เกิน → part i/n |
| D8 | s2 ยืดหยุ่นตำแหน่งรูป: รูปใดๆ ใน s2 (ระหว่าง heading ส่วนที่ 2 → ส่วนที่ 3) ที่ไม่ผูก field อื่น → `research_framework.imageRid` |
| D9 | VLM prompt เดียวครบ 3 เงื่อนไข: มี text → OCR ให้ครบ; diagram → เขียน flow mermaid ถ้าทำได้ ไม่ได้ใช้ ASCII; ไม่มี text → บรรยายสิ่งที่เห็น |
| D10 | เปลี่ยน embedding model เป็น `Qdrant/Qwen3-Embedding-0.6B-onnx` (context 32k, 1024 dims, Apache-2.0) — ดู ADR-0031; adapter แก้ pooling (last-token) + prefix ตาม model card; chunks เก่า re-embed อัตโนมัติผ่าน `embedding_model` mismatch — **ไม่มี migration** |
| D11 | chunk เก่าใน DB ไม่ backfill — regenerate ตอนอัปโหลดใหม่ (supersede ลบของเก่าอยู่แล้ว); รูปแบบ meta ใหม่ไม่ทำให้ retrieval เก่า crash (parent-expansion ถูกลบแล้ว) |

### หัวข้อที่ผู้ใช้ระบุ (mapping → template)

| หัวข้อเดิม (แยกกัน) | พฤติกรรมใหม่ |
|---|---|
| หัวฟอร์ม > * | รวม 3 field เป็น chunk เดียว `… > ข้อมูลหัวฟอร์ม` |
| ส่วนที่ 1 > เกือบทั้งหมด | รวมเป็น chunk เดียว `… > ข้อมูลทั่วไป` (ยกเว้น OECD, คณะผู้วิจัย) |
| ส่วนที่ 1 > สาขา OECD | chunk เดียว ตารางเต็ม (ไม่แตกแถว) |
| ส่วนที่ 1 > รายละเอียดคณะผู้วิจัย | chunk เดียว ตารางเต็ม |
| ส่วนที่ 2 > กรอบการวิจัย/พัฒนา (แผนภาพ) + คำอธิบาย (Input–Process–Output) | รวม image caption + text → chunk เดียว `ส่วนที่ 2 ข้อมูลโครงการ > รูปภาพ` (text นี้ไม่มีหัวข้อตายตัวในเอกสารจริง) |
| ส่วนที่ 3 > work_plan / research_area / benefit_area / equipment / collaborating_orgs | chunk เดียวต่อ field ตารางเต็ม |
| ส่วนที่ 4 > expected_outputs, output_to_outcome | chunk เดียวต่อ field ตารางเต็ม |

### Acceptance criteria (Rev 2 — เขียนทับข้อ 1, 5 ของ Rev 1)

1. FF2569 fixture: กลุ่ม s0 / s1 / s2 ให้ chunk ตาม D4 ครบ — heading_path ถูกต้อง, `meta.field_ids` ครบทุก field ใน group, ไม่มี row-chunk เหลืออยู่ (`table_row`/`parent_chunk_index` ถูกลบจาก type ด้วย)
2. ตารางทุกตัว = chunk เดียวเต็มตาราง เว้นแต่ยาวเกิน `chunkTableMaxTokens` → part i/n ที่ heading_path เดียวกัน
3. `expandToSections` ยังประกบ part i/n ครบและ pack ต่อ heading_path — parent-expansion ถูกลบ (ไม่มี reference ค้าง)
4. VLM caption: fixture รูปมี text → OCR ครบใน chunk; diagram → มี flow block; ไม่มี text → มีคำบรรยาย
5. Embedding model ใหม่: upload → embed สำเร็จ (CUDA fp16 ก่อน CPU q8), 1024 dims, chunk เก่า re-embed เมื่อ retrieve
6. Golden QA คงวัด hit@5/MRR ด้วย heading_path ขึ้นต้นด้วยชื่อ section (ไม่เปลี่ยนวิธีตัดสิน) — ผ่าน threshold เดิม

### Boundaries (Rev 2 — แก้จาก Rev 1)

- **Always**: แก้ spec ก่อน behavior (กฎเดิม); Zod ทุก boundary; heading_path ของ group มาจาก template เท่านั้น ห้าม hardcode ใน parser/chunking
- **Ask first**: แก้ค่า `chunkTableMaxTokens` / `embeddingModel` ใน `config.toml`, เปลี่ยน label ของ group
- **Never** (แก้): ~~แตะ `TransformersEmbedding`~~ → เปลี่ยนเป็น *แตะ pooling/prefix ของ adapter โดยไม่ยึด model card ของรุ่นที่ config ระบุ*; กฎ "upload ต้องไม่ fail จาก VLM" และ "embedding ไม่นับ quota" คงเดิม

### Testing (Rev 2 — เขียนทับ assertion เดิมที่ pin พฤติกรรมเก่า)

- `tests/unit/files/fields-to-chunks.test.ts`: ลบ assertion row-chunks (>30 row-chunks/parent linkage), เพิ่ม — group → chunk เดียว + `field_ids` ครบ; ตาราง → chunk เดียวเต็ม; ตารางยาว > cap → part i/n; ตัดที่ขอบ field; heading_path group ถูกต้อง
- `tests/unit/files/retrieval.test.ts`: ลบ case parent-expansion; คง part i/n merge + dedupe + ลำดับ block
- `tests/e2e/files.test.ts`: content ของ chunk รูปไม่ขึ้นต้น `"กรอบการวิจัย/พัฒนา (แผนภาพ)"` แล้ว — ให้ assert heading_path = `ส่วนที่ 2 ข้อมูลโครงการ > รูปภาพ` + caption อยู่ใน chunk เดียวกับ text อธิบาย
- Integration embedding: model ใหม่ 1024 dims + normalize; **ต้องรันด้วย model จริง** (CI fallback CPU q8 เหมือนเดิม)

### Success Criteria (Rev 2)

1. `pnpm lint && pnpm typecheck && pnpm test` เขียวทั้ง 3 tier บน Postgres จริง
2. อัปโหลด FF2569 fixture ใหม่: ทุกหัวข้อในตาราง §หัวข้อที่ผู้ใช้ระบุ ให้ chunk กลุ่ม/เดี่ยวตามสเปก; `read_proposal` คืน text ครบทั้งหัวข้อใน block เดียว
3. Embedding: `files.rag.embeddingModel = Qdrant/Qwen3-Embedding-0.6B-onnx`, dims 1024, re-embed เก่าทำงานอัตโนมัติ
4. Golden QA hit@5 ไม่ต่ำกว่า threshold เดิม (ถ้าต่ำลง รายงานก่อนปรับ threshold)
5. ไม่มี dead code เหลือ: `table_row`, `parent_chunk_index`, parent-expansion, e5 prefix/pooling logic

### Open Questions (Rev 2)

1. ความเสี่ยงคุณภาพไทย: Qwen3-0.6B มี Thai-MTEB 68.39 (≈ e5-large-instruct 67.69) แต่ไม่มีคะแนน SEA-BED — ยอมรับแลก context 32k แล้ว ให้ golden-qa เป็นตัวตัดสินจริง (ผู้ใช้รับทราบแล้วใน grilling)
