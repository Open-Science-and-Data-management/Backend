# Implementation Plan: FF2569 Rev 2 — Chunk Grouping + Embedding Model (spec:ff2569-form-rag §Revision 2)

> Spec: `docs/specs/SPEC-ff2569-form-rag.md` (§Revision 2) · ADR: `docs/decisions/ADR-0031-embedding-model-qwen3.md`
> Rev 1 plan: `docs/plans/plan-ff2569-form-rag.md` (shipped — golden QA hit@5=0.977) — ไฟล์เดิมไม่แตะ
> Task list: `tasks/todo-ff2569-rev2.md` (Rev 1 list คงไว้ที่ `tasks/todo.md` ตามคำสั่ง "write new plan")

## Overview

ยุบการแบ่ง chunk ของ fast path FF2569 ให้ text ทั้งหมดของแต่ละหัวข้อ (รวมตาราง) อยู่ chunk เดียว: เพิ่ม `chunkGroups` ใน template, เลิก row-chunks ทุกตาราง, `meta.field_id` → `field_ids[]`, ตาราง cap ด้วย `chunkTableMaxTokens = 4096`, รูปใน s2 ยืดหยุ่นตำแหน่ง, VLM prompt ครอบ OCR/diagram/description และเปลี่ยน embedding model เป็น `Qdrant/Qwen3-Embedding-0.6B-onnx` (32k context, last-token pooling) — chunks เก่า re-embed อัตโนมัติ ไม่มี migration

## Architecture Decisions

- **Group ประกาศใน template** (D1/D4) — `templates/ff2569.ts` เป็น single source of truth; chunking อ่าน group ไม่ hardcode ชื่อหัวข้อ (กฎ Never เดิมคงอยู่)
- **เลิก row-chunks ทั้งหมด** (D2) — ลบ `table_row`/`parent_chunk_index` จาก `ChunkMeta` และ parent-expansion ใน `retrieval.ts` (clean cutover, ไม่ทิบ dead code); ข้อมูลเก่าใน DB ไม่ crash เพราะ `asFormMeta` รูปร่างไม่ตรง → generic (D11)
- **`field_ids: string[]`** (D3) — chunk รวมเก็บ field ครบ; chunk เดี่ยว = array 1 ตัว
- **ตัดเกินที่ขอบ field/แถว** (D6/D7) — กลุ่ม text เกิน `chunkTargetTokens` ตัดก่อนเปิด field ใหม่; ตารางเกิน `chunkTableMaxTokens` (4096) ตัดที่ขอบแถว; ทุก part heading_path เดียวกัน → `expandToSections` ประกบกลับได้โดยไม่แตะ helper
- **Qwen3 pooling ต่างจาก e5** (ADR-0031) — last-token pooling + instruction prefix เฉพาะฝั่ง query; ลบ e5 prefix/mean-pool ออกทั้งหมด
- **VLM prompt เดียว** (D9) — มี text → OCR ครบ; diagram → flow mermaid ถ้าได้ ไม่ได้ใช้ ASCII; ไม่มี text → บรรยาย; best-effort/quota กฎเดิมคงอยู่

## Task List

### Phase 1: Foundation
- [ ] Task R1: `chunkGroups` ใน template + config knob
- [ ] Task R2: extractor ยืดหยุ่นตำแหน่งรูปใน s2

### Checkpoint: Foundation
- [ ] `pnpm test -- tests/unit/files` + `pnpm typecheck` เขียว

### Phase 2: Core Chunking
- [ ] Task R3: `fieldsToChunks` — group render + field_ids + เลิก row-chunks + cap ตาราง
- [ ] Task R4: `retrieval.ts` — ลบ parent-expansion, `asFormMeta` อ่าน `field_ids`

### Checkpoint: Core
- [ ] unit `fields-to-chunks`/`retrieval` เขียวตาม acceptance ใหม่; ไม่มี reference `table_row`/`parent_chunk_index` เหลือ (`grep` ยืนยัน)

### Phase 3: Pipeline Models
- [ ] Task R5: VLM prompt 3 เงื่อนไข
- [ ] Task R6: embedding adapter Qwen3 + สลับ `embeddingModel`

### Checkpoint: Models
- [ ] e2e upload FF fixture เขียว (meta รูปแบบใหม่, embed สำเร็จ); integration embedding เขียว

### Phase 4: Verify & Docs
- [ ] Task R7: e2e/golden-qa ปรับ assertion + docs + gate ครบ

### Checkpoint: Complete
- [ ] `pnpm lint && pnpm typecheck && pnpm test` เขียวทั้ง 3 tier บน Postgres จริง
- [ ] Golden QA hit@5 ≥ 0.8 ด้วย chunk ใหม่ (ต่ำกว่า → รายงานก่อนขยับ threshold)
- [ ] ไม่มี dead code: e5 prefix/mean-pool, row-chunk, parent-expansion

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| transformers.js pooling แบบ last-token บน Qwen3-0.6B ONNX ไม่ตรง model card (dims/prefix) | High | ยืนยันกับหน้า HF `Qdrant/Qwen3-Embedding-0.6B-onnx` ก่อนเขียน adapter (Task R6 มีขั้น verify); integration test เช็ค dims=1024 + normalize |
| คุณภาพไทย Qwen3 ไม่มี SEA-BED ยืนยัน — golden QA อาจต่ำกว่าเดิม | Med | golden-qa เทียบ metric เดิม (0.977); ต่ำกว่า 0.8 → รายงานก่อนตัดสินใจ |
| กลุ่ม s1 รวมแล้วยาวเกิน target บ่อย → part เยอะ | Low | part ตัดที่ขอบ field + heading_path เดียวกัน → read_proposal ประกบครบ; วัดจำนวน part จริงจาก fixture ใน unit checkpoint |
| e2e/integration assertion เดิม pin พฤติกรรมเก่า (row-chunks, heading เดิม) | Low | Task R7 ลบ assertion ที่ pin ของเก่า ไม่ re-pin (ผ่านการตัดสินใจแล้ว Q3 grilling) |
| chunk ตารางเดียว 4096 tokens ทำ upload ช้าลง (embed ต่อ chunk) | Low | fp16/CUDA อยู่แล้ว; ถ้าเกินงบ ~15 วิ → ลด knob (config เดิม) |

## Open Questions

- (หมด — ตัดสินใจครบใน grilling และ spec §Revision 2; ความเสี่ยงคุณภาพไทย Qwen3 รับไว้ ให้ golden-qa ตัดสิน)
