# Task List: FF2569 Form-Aware Ingestion

> Plan: `docs/plans/plan-ff2569-form-rag.md` · Spec: `docs/specs/SPEC-ff2569-form-rag.md`

## Phase 1: Foundation

- [x] Task 1: FF2569 fixture + template schema
  - Acceptance: `src/features/files/templates/ff2569.ts` export template (`template_version: "FF2569"`) ครบทุก section/field ตาม spec §2 — Zod types, canonical English field IDs, enum values, ข้อความคำถาม (ต่อ field), โครง `subactivity[1..3]` เป็น array
  - Acceptance: fixture `tests/fixtures/ff2569-proposal.docx` (copy จาก docs/research)
  - Verify: `pnpm test -- tests/unit/files` (test ใหม่ `ff2569-template.test.ts`: field IDs unique, enum values ครบ, ทุก field มี question text) + `pnpm typecheck`
  - Files: `src/features/files/templates/ff2569.ts`, `tests/unit/files/ff2569-template.test.ts`, `tests/fixtures/ff2569-proposal.docx`
  - Scope: Small

- [x] Task 2: OOXML raw extractor `parseDocxForm`
  - Acceptance: อ่าน document.xml ผ่าน jszip → raw blocks `{paragraphs, tables (รวม state cell), checkboxes พร้อม w14:checked, images}` — deterministic, ไม่ใช้ glyph guessing
  - Acceptance: block scanner แยก `<w:p>` / `<w:tbl>` ที่ flatten ได้ถูกต้อง ไม่พึ่ง heading style
  - Verify: `pnpm test -- tests/unit/files` (test: บน fixture — ตาราง = 11, checkbox = 154, ตัวอย่าง state ☒ ถูกอ่านเป็น true)
  - Files: `src/features/files/docx-form.ts` (ใหม่), `tests/unit/files/docx-form.test.ts`, `package.json` (เพิ่ม `jszip`)
  - Depends: Task 1 (fixture), อนุมัติ dependency `jszip`
  - Scope: Medium

### Checkpoint: Foundation
- [x] `pnpm test -- tests/unit/files` + `pnpm typecheck` เขียว
- [x] ตรวจ fixture counts: 11 ตาราง / 77 checkbox content control (154 tag)

## Phase 2: Core Extraction & Chunking

- [x] Task 3: fields extractor (`form-extract.ts`)
  - Acceptance: raw blocks + template → `Ff2569Fields` — tolerant matching (หัวข้อ fuzzy, ไม่ใช้เลขข้อตรง), checkbox → enum canonical values, boilerplate (ตัวเลือกไม่ติ๊ก/หมายเหตุฟอร์ม) แยกออกจากคำตอบ, subactivity ×3 จับเป็น array, ส่วนที่ match ไม่ได้ → รายงาน per-block miss
  - Verify: `pnpm test -- tests/unit/files` (fixture: ทุก field มีค่าหรือ null ชัดเจน, enum `plan_type = technology_development`, `subactivity.length === 3`, miss list = 0)
  - Files: `src/features/files/form-extract.ts`, `tests/unit/files/form-extract.test.ts`
  - Depends: Tasks 1-2
  - Scope: Medium

- [x] Task 4: `fieldsToChunks`
  - Acceptance: fields → chunks — 1 chunk ต่อ field, คำถาม prefix ทุก chunk, คำตอบยาว > targetTokens แตก part i/n, ตาราง → row-chunks (header + ชื่อตารางติดทุกแถว, ทั้งตาราง = parent), `heading_path = "ส่วนที่ N > …"`, meta `{template_version, section_id, field_id, parent_chunk_index, enum fields}`, คำตอบว่าง → ไม่เกิด chunk
  - Verify: `pnpm test -- tests/unit/files` — ทุก field ID ปรากฏ, 0 boilerplate, empty/no-chunk, part i/n
  - Files: `src/features/files/chunking.ts` (+type `ChunkWithMeta`), `tests/unit/files/fields-to-chunks.test.ts` (ใหม่ แยกจาก chunking.test.ts — synthetic + checkpoint บน fixture)
  - Depends: Tasks 1, 3
  - Scope: Medium

- [x] Task 5: migration `file_chunks.meta jsonb` + repo/contract/docs
  - Acceptance: คอลัมน์ `meta jsonb` nullable ที่ `file_chunks`; `ChunkInsert.meta`, `chunksOfFile` คืน meta; `FileResponse` contract ไม่เปลี่ยนในข้อนี้
  - Verify: `pnpm db:generate && pnpm db:migrate` + `pnpm test -- tests/integration/schema.test.ts` + `pnpm test -- tests/unit/contracts`
  - Files: `src/database/schema/index.ts`, `src/database/migrations/*` (drizzle-kit), `src/features/files/files.repository.ts`, `docs/api/files.md` (หมายเหตุ meta)
  - Depends: — (parallel กับ Tasks 3-4 ได้)
  - Scope: Medium

### Checkpoint: Core
- [x] unit ครบตาม Task 3-4 acceptance
- [x] migration สำเร็จ + schema/contracts เขียว

## Phase 3: Wiring & Retrieval

- [x] Task 6: upload fast path + fallback flag
  - Acceptance: `files.service.ts` สาขา docx: schema match → form chunks (`meta` ครบ) / match ล้ม → generic `blocksToChunks` เดิม + warn log; response เพิ่ม `form_parsed: boolean` (response-only); e2e: FF fixture → `form_parsed: true`, `proposal-sample.docx` → `form_parsed: false` + chunks พฤติกรรมเดิม (regression)
  - Verify: `pnpm test -- tests/integration/files-parse.test.ts` + `pnpm test -- tests/e2e/files.test.ts`
  - Files: `src/features/files/files.service.ts`, `src/shared/config/index.ts` + `config.toml` (knob `[files.rag] template`), `src/shared/contracts/files.ts` (หรือไฟล์ contract ที่ FileResponse อยู่), `docs/api/files.md`, `tests/e2e/files.test.ts`
  - Depends: Tasks 4-5
  - Scope: Medium

- [x] Task 7: VLM caption best-effort
  - Acceptance: config `[files.rag] vlmModel` (ค่าว่าง = ปิด) — ตั้ง `qwen/qwen3-vl-30b-a3b-instruct` ตามผู้ใช้เลือก; caption รูปตอน ingest → text chunk ของ field นั้น; quota หมด/ยิงพลาด → skip + warn, upload ไม่ fail; นับเข้าโควตาผู้อัปโหลด (reconcile เดิม ADR-0023)
  - Done: port `AiMessage` รับ image parts + `AiCompleteParams.model` override (`ai-client.ts`, OpenRouter adapter, MockAiClient); `readDocxImage` (docx-form, png/jpeg/gif/webp — emf/wmf → null); `ExtractedField.caption` + image branch ใน `fieldsToChunks`; `captionImages` ใน files.service (AI_CLIENT provider ใน FilesModule — import AiModule ไม่ได้เพราะ AiModule → FilesModule)
  - Verify: unit 258 เขียว (mock-client multipart, readDocxImage, image-chunk) + `tests/e2e/files.test.ts` 5/5 (override AI_CLIENT เป็น mock — research_framework ได้ chunk caption + quota = 132/call บน Postgres จริง)
  - Files: `src/shared/ports/ai-client.ts`, `src/shared/adapters/open-router/open-router-client.ts`, `src/shared/adapters/mock-ai/mock-ai-client.ts`, `src/shared/config/index.ts` + `config.toml`, `src/features/files/{docx-form,form-extract,chunking,files.service,files.module}.ts`, tests
  - Depends: Task 6
  - Scope: Medium

- [x] Task 8: parent-expansion helper + `read_proposal`
  - Acceptance: helper ขยาย hit → chunks ทั้ง section (ผ่าน `meta.parent_chunk_index`); `read_proposal` (ai.tools) ใช้ helper — `FilesService.retrieve` เดิมยังคงพฤติกรรม flat top-k เป๊ะ
  - Verify: `pnpm test -- tests/integration/rag.test.ts` (เพิ่ม case: expand ได้ section เต็ม, retrieve เดิม output เท่าเดิม)
  - Files: `src/features/files/files.service.ts` (หรือ `retrieval.ts`), `src/features/ai/ai.tools.ts`, `tests/integration/rag.test.ts`
  - Depends: Tasks 5-6
  - Scope: Medium

- [x] Task 9: golden QA suite
  - Acceptance: ~30-50 QA ครอบทุก section ของ FF fixture (คำถามเชิง field + เชิงเนื้อหา) วัด hit@5/MRR ผ่าน `FilesService.retrieve` — รายงาน metric ใน output
  - Verify: `pnpm test -- tests/integration` — suite เขียวที่ threshold hit@5 ≥ 0.8
  - Files: `tests/integration/rag-golden.test.ts` (ใหม่), fixture QA data file
  - Depends: Task 6
  - Scope: Medium

### Checkpoint: Complete
- [x] `pnpm lint && pnpm typecheck && pnpm test` เขียว (milestone gate = e2e green ตาม repo)
- [x] FF fixture: `form_parsed: true` + meta/heading_path ครบ; generic docx: fallback + regression-safe
- [x] Golden QA hit@5 ≥ 0.8 — 0.955 (MRR 0.890)
