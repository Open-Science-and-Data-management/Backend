# Implementation Plan: FF2569 Form-Aware Ingestion (spec:ff2569-form-rag)

> Spec: `docs/specs/SPEC-ff2569-form-rag.md` · Analysis: `docs/research/ff2569-form-rag-structure.md`
> Task list: `tasks/todo.md` (default target — repo convention เก็บ plan ที่ docs/plans/ แต่ไม่มี convention ทับ task list)

## Overview

เพิ่ม fast path การ ingest เอกสารฟอร์ม FF2569: parse OOXML ตรง (checkbox `w14:checked`, ตาราง `w:tbl`, รูป) → extract fields ต่อ template schema → chunk ระดับ field (คำถามติดทุก chunk, ตารางแตก row-chunks, boilerplate ตัด) → เก็บ `meta jsonb` ที่ `file_chunks` → retrieval เดิมไม่แตะ + parent-expansion ให้ AI tools  เอกสารที่ไม่ตรง schema → fallback generic เดิม + `form_parsed: false` ใน upload response

## Architecture Decisions

- **Template-driven** (Q1/Q11): schema อยู่ `src/features/files/templates/ff2569.ts` — parser/extractor ไม่ hardcode เลขข้อ; เลขข้อในเอกสารซ้ำ/เพี้ยน ใช้ canonical ID จาก schema เท่านั้น
- **OOXML ตรง ไม่ใช่ mammoth** (Q3): mammoth generic path พิสูจน์แล้วว่าหลุดตารางทั้ง 11 (`parseDocxBlocks` regex `h1-3|p`); checkbox state อ่านจาก `w14:checked` deterministic
- **XML ผ่าน `jszip` + block scanner**: แยก `<w:p>…</w:p>` / `<w:tbl>…</w:tbl>` บน document.xml ที่ flatten — **เพิ่ม dependency `jszip` ต้องได้อนุมัติ** (boundary: Ask first)
- **meta jsonb ไม่สร้างตารางใหม่** (Q12): `ChunkInsert.meta` optional — generic path ส่ง `undefined` ได้, consumer เดิมไม่แตก
- **Fallback = เส้นทางปกติ** (Q13): schema match ล้มเหลวไม่ใช่ error — ตอบ `form_parsed: false` + warn log (response-only, ไม่เก็น DB)
- **VLM caption best-effort** (Q10): config `[files.rag] vlmModel` (default `google/gemini-2.5-flash` ให้ตรง `[ai.models].default`), quota หมด/ยิงพลาด → skip caption + warn, upload ไม่ fail; นับเข้าโควตาผู้อัปโหลดผ่าน reconcile เดิม (ADR-0023)

## Task List

### Phase 1: Foundation
- [ ] Task 1: FF2569 fixture + template schema (`templates/ff2569.ts`)
- [ ] Task 2: OOXML raw extractor `parseDocxForm` (jszip + block scanner)

### Checkpoint: Foundation
- [x] `pnpm test -- tests/unit/files` เขียว (template ครบ field, extractor นับ 11 ตาราง / 77 checkbox control บน fixture)
- [x] `pnpm typecheck` เขียว

### Phase 2: Core Extraction & Chunking
- [x] Task 3: `form-extract.ts` — fields extractor (tolerant matching, boilerplate แยก, enum mapping)
- [x] Task 4: `fieldsToChunks` — field chunks + table row-chunks + meta/heading_path
- [x] Task 5: migration `file_chunks.meta jsonb` + repo/contract/docs

### Checkpoint: Core
- [x] unit ครบ: ทุก field ID มี chunk, 0 boilerplate ใน index, คำตอบว่างไม่เกิด chunk, คำตอบยาวแตก part i/n
- [x] `pnpm db:migrate` สำเร็จ + `tests/integration/schema.test.ts` เขียว + `tests/unit/contracts/contracts.test.ts` เขียว

### Phase 3: Wiring & Retrieval
- [x] Task 6: upload fast path + fallback flag (`files.service.ts`, config knob, `docs/api/files.md`, e2e)
- [x] Task 7: VLM caption best-effort (config-gated, mock client ใน test) — model = `qwen/qwen3-vl-30b-a3b-instruct` (ผู้ใช้เลือก, ต่างจาก default เดิมที่วางไว้)
- [ ] Task 8: parent-expansion helper + `read_proposal` ใช้ section เต็ม
- [ ] Task 9: golden QA integration suite (hit@5/MRR threshold)

### Checkpoint: Complete
- [ ] `pnpm lint && pnpm typecheck && pnpm test` เขียวทั้งชุด (e2e บน Postgres จริง)
- [ ] FF fixture: `form_parsed: true`, chunks มี meta/heading_path ครบ; `proposal-sample.docx`: fallback `form_parsed: false` พฤติกรรม chunks เดิม (regression)
- [ ] Golden QA hit@5 ≥ 0.8

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| regex/block scanner บน document.xml เพี้ยนกับ docx ที่เครื่องมืออื่นเขียน | High | fixture-based unit กับไฟล์จริง + fallback ปลอดภัย (match ล้ม → generic path) |
| `jszip` เป็น dependency ใหม่ (ผ่าน transitive ของ mammoth อยู่แล้วแต่ import ตรงต้องประกาศ) | Low | ขออนุมัติในรอบ approve plan นี้ |
| VLM ภาพบน OpenRouter (`image_url` message) อาจไม่รองรับใน `OpenRouterClient` ปัจจุบัน | Med | Task 7 config-gated — ปิดได้โดยไม่กระทบ fast path; ขยาย client เฉพาะจุด |
| n=1 template ไม่ครอบเอกสารเวอร์ชันอื่น | Med | tolerant matching (หัวข้อ fuzzy, ไม่แมตช์เลขข้อ) + fallback ต่อ subactivity ที่หาไม่เจอ |
| embedding ใหม่ทับ chunk เก่า (`embedding_model` mismatch re-embed) | Low | ไม่แตะ embedding stack — chunks ใหม่ถูก supersede โดย `insertWithChunks` เดิมอยู่แล้ว |

## Open Questions

- (ตัดสินใจแล้วในแผนนี้ รอยืนยันตอน approve): เพิ่ม `jszip`; config knob `[files.rag] vlmModel`; flag ชื่อ `form_parsed` response-only
