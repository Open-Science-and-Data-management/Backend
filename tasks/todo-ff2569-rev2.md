# Task List: FF2569 Rev 2 — Chunk Grouping + Embedding Model

> Plan: `docs/plans/plan-ff2569-rev2-chunking-embedding.md` · Spec: `docs/specs/SPEC-ff2569-form-rag.md` §Revision 2 · ADR-0031
> (Rev 1 list คงไว้ที่ `tasks/todo.md` — ไม่แตะ)

## Phase 1: Foundation

- [ ] Task R1: `chunkGroups` ใน template + config knob
  - Acceptance: `templates/ff2569.ts` เพิ่ม schema `chunkGroup { label, fieldIds }` + data ตาม D4 — s0: `[fund_type, fiscal_year, institution]` label `ข้อมูลหัวฟอร์ม`; s1: ทุก field ยกเว้น `oecd_field, research_team` label `ข้อมูลทั่วไป`; s2: `[research_framework, framework_description]` label `รูปภาพ`; Zod validate — fieldIds ต้องมีจริงใน fields, ห้ามซ้ำข้าม group, 1 field อยู่ 1 group เดียว; `config.toml` + `src/shared/config/index.ts` เพิ่ม `files.rag.chunkTableMaxTokens = 4096` (int positive)
  - Verify: `pnpm test -- tests/unit/files` (ff2569-template.test.ts: group ครบ, fieldIds valid, ไม่ overlap) + `pnpm typecheck`
  - Files: `src/features/files/templates/ff2569.ts`, `tests/unit/files/ff2569-template.test.ts`, `src/shared/config/index.ts`, `config.toml`
  - Depends: —
  - Scope: Small

- [ ] Task R2: extractor ยืดหยุ่นตำแหน่งรูปใน s2 (D8)
  - Acceptance: รูปที่อยู่ในช่วง section s2 (anchor แรก → สิ้นสุด section) ที่ field แบบ image จับไม่ได้ใน span ของตัวเอง → ผูกเป็น `research_framework.imageRid` (post-pass หลัง loop หลัก); รูปที่ผูก field อื่นไปแล้วไม่ถูกแย่ง
  - Verify: `pnpm test -- tests/unit/files` (form-extract.test.ts: รูปก่อน/หลัง text อธิบาย ได้ imageRid ทั้งคู่)
  - Files: `src/features/files/form-extract.ts`, `tests/unit/files/form-extract.test.ts`
  - Depends: —
  - Scope: Small

### Checkpoint: Foundation
- [ ] `pnpm test -- tests/unit/files` + `pnpm typecheck` เขียว

## Phase 2: Core Chunking

- [ ] Task R3: `fieldsToChunks` — group render + field_ids + เลิก row-chunks + cap ตาราง (D2/D3/D6/D7)
  - Acceptance: field ใน group → chunk เดียว heading_path `section > label`, เนื้อหา `คำถาม\nคำตอบ` เรียงตามลำดับเอกสาร คั่น `\n\n`, meta `field_ids` ครบทุก field; field นอก group คงพฤติกรรมเดิมแต่ meta เป็น `field_ids: [id]`; ตาราง → chunk เดียวตารางเต็ม markdown (ไม่มี row-chunk), ยาวเกิน `chunkTableMaxTokens` → part i/n ตัดที่ขอบแถว; กลุ่ม text รวมยาวเกิน `chunkTargetTokens` → part i/n ตัดก่อนเปิด field ใหม่ — ห้ามตัดกลาง field; enum/bool/image/ว่าง กฎเดิมคงอยู่; ลบ `table_row`/`parent_chunk_index` จาก `ChunkMeta` และกิ่ง row-chunk; `files.service.ts` ส่ง config ครบ (target + tableMax)
  - Verify: `pnpm test -- tests/unit/files` — fields-to-chunks.test.ts ลบ assertion row-chunks (>30 row-chunks/parent linkage) เขียนใหม่: group → 1 chunk + field_ids ครบ; ตารางเต็ม 1 chunk; ตารางยาว > cap → part i/n ขอบแถว; กลุ่มยาว → ตัดที่ขอบ field; heading_path กลุ่มถูกต้อง
  - Files: `src/features/files/chunking.ts`, `src/features/files/files.service.ts`, `tests/unit/files/fields-to-chunks.test.ts`
  - Depends: R1
  - Scope: Medium

- [ ] Task R4: `retrieval.ts` — ลบ parent-expansion + `asFormMeta` รูปแบบใหม่ (D2/D11)
  - Acceptance: ลบกลไก parent-expansion (`meta.parent_chunk_index` branch) ออก; `asFormMeta` เช็ค `field_ids` เป็น array ของ string (ข้อมูลเก่า `field_id` เดี่ยว → generic ไม่ crash); pack ต่อ heading_path / part i/n merge / dedupe คงเดิม; `read_proposal` (ai.tools) ไม่ต้องแก้ (signature ไม่เปลี่ยน)
  - Verify: `pnpm test -- tests/unit/files` — retrieval.test.ts ลบ case parent-expansion, เพิ่ม case meta แบบใหม่ + meta เก่า (field_id เดี่ยว) ผ่านเป็น generic; `grep parent_chunk_index src/` = 0 hit
  - Files: `src/features/files/retrieval.ts`, `tests/unit/files/retrieval.test.ts`
  - Depends: R3
  - Scope: Small

### Checkpoint: Core
- [ ] unit fields-to-chunks + retrieval เขียวตาม acceptance ใหม่
- [ ] `grep -n "table_row\|parent_chunk_index" src/` = ไม่มี hit; `pnpm typecheck` เขียว

## Phase 3: Pipeline Models

- [ ] Task R5: VLM prompt 3 เงื่อนไข (D9)
  - Acceptance: prompt ใน `captionImages` เขียนใหม่ครบ — มี text → OCR ทั้งหมดให้ครบถ้วน; diagram → อธิบาย flow เป็น mermaid ถ้าโมเดลทำได้ ไม่ได้ใช้ ASCII; ไม่มี text → บรรยายสิ่งที่เห็น; ยังเป็นภาษาไทย, best-effort (quota/error/emf → skip + warn), quota นับต่อ uploader เหมือนเดิม
  - Verify: `pnpm test -- tests/unit/files` + `tests/e2e/files.test.ts` (mock client canned caption — e2e assertion ใหม่จาก R7 ผูกกับ prompt ไม่ได้ แต่ flow ไม่พัง)
  - Files: `src/features/files/files.service.ts`
  - Depends: — (parallel กับ R3/R4 ได้)
  - Scope: Small

- [ ] Task R6: embedding adapter Qwen3 + สลับ model (D10, ADR-0031)
  - Acceptance: **verify model card จริงก่อน** (`Qdrant/Qwen3-Embedding-0.6B-onnx` บน HF — pooling, prefix/instruction, dims=1024); `TransformersEmbedding` เปลี่ยนเป็น last-token pooling + instruction prefix เฉพาะ `embedQuery`, ลบ e5 prefix (`passage: `/`query: `) และ mean-pool ออกทั้งหมด; `config.toml` `embeddingModel = "Qdrant/Qwen3-Embedding-0.6B-onnx"`; comment ใน adapter อ้าง ADR-0031; re-embed เดิม (`embedding_model` mismatch) ไม่ต้องแก้ — ทำงานเอง
  - Verify: `pnpm test -- tests/integration` (embedding suite: dims 1024, normalize, query≠passage path ทำงาน; CI ตก fallback CPU/q8) — ครั้งแรกจะดาวน์โหลด model ~1.2 GB เข้า cache
  - Files: `src/shared/adapters/embedding/transformers-embedding.ts`, `config.toml`
  - Depends: — (parallel ได้ แต่ verify ผูกกับ checkpoint Models)
  - Scope: Medium

### Checkpoint: Models
- [ ] `pnpm test -- tests/e2e/files.test.ts` เขียว (upload FF fixture → meta `field_ids`, embed สำเร็จ)
- [ ] integration embedding suite เขียวบน model ใหม่

## Phase 4: Verify & Docs

- [ ] Task R7: assertion ใหม่ + docs + gate ครบ
  - Acceptance: e2e `files.test.ts` — chunk รูป assert heading_path `ส่วนที่ 2 ข้อมูลโครงการ > รูปภาพ` + caption กับ text อธิบายอยู่ chunk เดียว (ลบ assertion ขึ้นต้น `"กรอบการวิจัย/พัฒนา (แผนภาพ)"`); golden-qa คงวิธีตัดสิน (heading_path ขึ้นต้นชื่อ section) แล้วรันเทียบ metric เดิม (hit@5=0.977) — ต่ำกว่า 0.8 หยุดรายงาน; docs: `src/features/files/README.md` (chunking/meta/VLM/embedding), `docs/api/files.md` (chunk behavior + meta shape), `config.toml` comment, arc42 §8.7 config sample; ลบ doc ที่อ้าง row-chunks/parent-expansion
  - Verify: `pnpm lint && pnpm typecheck && pnpm test` เขียว 3 tier บน Postgres จริง (`docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate` ก่อน)
  - Files: `tests/e2e/files.test.ts`, `tests/integration/golden-qa.test.ts` (ถ้า assertion pin เก่า), `src/features/files/README.md`, `docs/api/files.md`, `config.toml`, `docs/architecture/arc42.md`
  - Depends: R2-R6
  - Scope: Medium

### Checkpoint: Complete
- [ ] `pnpm lint && pnpm typecheck && pnpm test` เขียวทั้ง 3 tier
- [ ] Golden QA hit@5 ≥ 0.8 ด้วย chunk ใหม่ (รายงาน metric เทียบ 0.977 เดิม)
- [ ] `grep -rn "parent_chunk_index\|table_row\|passage: " src/` = ไม่มี hit (dead code หมด)
- [ ] ไม่มี dependency ใหม่
