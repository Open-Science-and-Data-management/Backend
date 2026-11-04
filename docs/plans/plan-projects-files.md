# Implementation Plan: projects-files

**Spec:** [`../specs/SPEC-projects-files.md`](../specs/SPEC-projects-files.md) · **Depends on:** plan-accounts · **Gate:** e2e flow #2 + #18 เขียว

## Overview
โครงการวิจัย + สมาชิก + ไฟล์ (.docx parse ใน process) + การเตรียมความรู้เอกสาร (chunk → embed → เก็บ `file_chunks`) — ให้ ai module มาอ่านภายหลัง

## Architecture Decisions
- ไฟล์เป็นของ project ไม่ใช่ task (ADR-0022); proposal ผูกโดย analyze-proposal ภายหลัง — ตอนนี้ nullable (ADR-0024)
- I/O ไฟล์ผ่าน `FileStorage` port / DiskStorage adapter (ADR-0002)
- Embedding: transformers.js v3 บน onnxruntime-node + `multilingual-e5-large-instruct` 1024 dims (ADR-0028), ทำ in-process ตอน upload (ไม่มี background job), fail → 422 ทั้ง upload
- Retrieval: กรอง `file_id` ก่อน cosine ฝั่ง app, top-5, ไม่มี pgvector (ADR-0025)

## Task List

### Phase 1: Projects
- [ ] **Task 1: projects module + members** — CRUD + `project_members` (PK คู่) + การลบปฏิเสธเมื่อมีแผน
  - Acceptance: e2e flow #2 เขียว — สร้างโครงการ/สมาชิก/ลบไม่ได้เมื่อมีแผน (แผนยังไม่มีจริง — ใช้ fixture row ตรง dmps)
  - Verify: `pnpm test -- tests/e2e/projects` (M)
  - Files: `src/features/projects/**`, `tests/e2e/projects.ts` (M)
  - Deps: accounts จบ

### Phase 2: Files
- [ ] **Task 2: files module + FileStorage port** — upload (25 MB, MIME .docx → 400), download, archive, delete (`409 file_in_use` เมื่อถูกอ้างเป็น evidence)
  - Acceptance: e2e flow #18 เขียว; ไฟล์ evidence ลบไม่ได้ archive ได้เท่านั้น
  - Verify: `pnpm test -- tests/e2e/files` (M)
  - Files: `src/features/files/**`, `shared/ports/**`, `shared/adapters/DiskStorage/**` (M)
  - Deps: 1
- [ ] **Task 3: docx parse** — mammoth in-process, extracted text เก็บที่ `file_records`; parse ไม่ได้ → 422 ไม่ทิ้ง row ครึ่ง ๆ
  - Acceptance: upload fixture .docx ได้ extracted text ตรงเนื้อหา; ไฟล์เสีย → 422
  - Verify: `pnpm test -- tests/integration/files-parse` (S)
  - Files: `src/features/files/**`, `tests/fixtures/*.docx` (S)
  - Deps: 2

### Phase 3: RAG
- [ ] **Task 4: chunking** — ตัดตาม heading/ย่อหน้า แล้ว pack ถึง ~450 token (overlap 10%, ค่าจาก `config.toml`)
  - Acceptance: chunk ทุกอัน ≤ target+prefix; `heading_path`/`chunk_index` ถูกต้องกับ fixture เอกสารจริง
  - Verify: `pnpm test -- tests/unit/files/chunking` (S)
  - Files: `src/features/files/**` (S)
  - Deps: 3
- [ ] **Task 5: embedding adapter** — `Embedding` port + adapter transformers.js v3/onnxruntime-node, model จาก `config.toml` (`multilingual-e5-large-instruct`, quantized), prefix query/passage ตามตระกูล e5
  - Acceptance: embed 1 batch → vector 1024 dims, normalize แล้ว; runtime โหลด model จาก cache ที่เครื่อง dev/CI
  - Verify: `pnpm test -- tests/integration/embedding` (M)
  - Files: `shared/ports/**`, `shared/adapters/embedding/**`, `config.toml` (M)
  - Deps: 4 · พร้อมขนานกับ Task 6 ได้หลัง interface ตกลง
- [ ] **Task 6: upload pipeline + retrieval + lifecycle ของ chunks** — upload → parse → chunk → embed ใน transaction เดียว (fail → 422); retrieval กรอง `file_id` + cosine top-5; supersede → CASCADE; `embedding_model` ไม่ตรง → re-embed ทั้งไฟล์; ไฟล์เก่า backfill lazy
  - Acceptance: upload fixture จริง → chunks+embeddings ครบ; query ใกล้เคียงคืน chunk ถูกตำแหน่ง; แทนไฟล์ระเบิด chunks เก่า; จับเวลา — ถ้าเกิน ~15 วิ/ไฟล์ สลับ fallback e5-small ผ่าน config (ADR-0028)
  - Verify: `pnpm test -- tests/integration/rag` + จับเวลาจริง (M)
  - Files: `src/features/files/**`, `tests/integration/rag.ts` (M)
  - Deps: 5

### Checkpoint: M2 จบ
- [ ] e2e #2 + #18 เขียว, RAG pipeline ผ่านบน fixture จริงพร้อมเวลาที่วัดได้
- [ ] Review เวลา embed ต่อไฟล์กับ human — ตัดสินใช้โมเดลหลักหรือ fallback

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| onnxruntime native ใน CI | Med | cache onnxruntime + model ใน CI cache; integration test แบบ opt-in ถ้า runner ไม่ไหว |
| เวลา embed e5-large-instruct บน CPU เครื่อง dev | Med | วัดจริง Task 6 — fallback e5-small สลับผ่าน config ได้ทันที |
| mammoth แยก heading บาง template .docx ไม่ออก | Low | fixture จริงจากสถาบันมากกว่า 1 แบบ; chunk fallback ที่ย่อหน้า |

## Open Questions
- ชุด fixture .docx จริง (มาจากไหน กี่แบบ) — ถาม human ก่อน Task 3
