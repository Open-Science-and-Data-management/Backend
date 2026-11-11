# ADR-0031: เปลี่ยน embedding model เป็น Qwen3-Embedding-0.6B (ONNX) + cap ตาราง 4096

## Status

Accepted (2026-11-11) — supersede บางส่วนของ ADR-0028 (เลือกโมเดล); หลัก runtime transformers.js/onnxruntime-node, in-process, brute-force cosine, re-embed ตาม `embedding_model` คงเดิมทั้งหมด

## Context

SPEC ff2569 Rev 2 (grilling session 2026-11-11): fast path ยุบ row-chunks ทั้งหมด ให้ตารางอยู่ chunk เดียวเต็ม ๆ — ตาราง FF2569 ใหญ่สุด (research_team, work_plan/Gantt, expected_outputs) ยาวเกิน context 512 ของ `Xenova/multilingual-e5-large` มาก (เกินแล้วโมเดลตัดท้ายเงียบ ๆ ตอน embed → ค้นไม่เจอท้ายตาราง)

- `docs/research/thai-embedding-models.md`: Qwen3-Embedding-0.6B Thai-MTEB **68.39** vs e5-large-instruct 67.69 (ใกล้เคียง); **ไม่มีคะแนน SEA-BED** (e5 ได้ TH 81.11) — หลักฐานไทยอ่อนกว่า ยอมรับแลกกับ context 32k; golden-qa เป็นตัวตัดสินจริง
- `Qdrant/Qwen3-Embedding-0.6B-onnx`: ONNX สำเร็จรูปบน HF, Apache-2.0, **1024 dims** (ตรง schema `real[]` ที่ไม่ผูก dims — ไม่ต้อง migration), context **32k**
- ทางเลือกที่ถูกตัด: jina-v3 (8k แต่ CC-BY-NC), nomic-v1.5 (8k แต่ไทยอ่อน), bge-m3 (8k, TH 77.59 ต่ำกว่า, fp32 2.2 GB)

## Decision

1. **โมเดล**: `files.rag.embeddingModel = "Qdrant/Qwen3-Embedding-0.6B-onnx"` — fp16/CUDA ก่อน fallback CPU/q8 ตามกลไก adapter เดิม
2. **Adapter ต้องแก้ตาม model card** — Qwen3-Embedding **ไม่ใช่ mean-pool + e5 prefix**:
   - pooling = **last-token**
   - query ต้อง prepend instruction (`Instruct: …\nQuery: …`), document/passage ไม่ prepend
   - ห้ามคง logic e5 (`passage: `/`query: ` + mean-pool) ไว้ — ลบตาม default clean cutover
3. **Cap ตาราง**: knob ใหม่ `[files.rag] chunkTableMaxTokens = 4096` — เกิน → part i/n ตัดที่ขอบเขต field/แถว ไม่ตัดกลาง field; text ทั่วไปยังใช้ `chunkTargetTokens = 450` เดิม
4. **ไม่มี DB migration**: dims 1024 ตรงเดิม; chunk เก่า (model ไม่ตรง config) re-embed อัตโนมัติผ่านกลไก `embedding_model` จาก ADR-0025 ข้อ 6

## Consequences

- ตารางทุกตัวใน FF2569 จุใน context ของ embedding (chunk เดียว ตารางเต็ม) — `read_proposal` อ่านครบ, ค้นเจอท้ายตาราง
- คุณภาพ retrieval ภาษาไทยอาจต่างจากเดิม (ไม่มี SEA-BED ยืนยัน) — วัดจริงด้วย golden-qa hit@5/MRR; ต่ำกว่า threshold → รายงานก่อนตัดสินใจครั้งถัดไป
- fp16 weights (~1.2 GB) โหลดจาก HF cache ครั้งแรก; CI คง fallback CPU/q8 — pipeline ไม่เปลี่ยน
- เครื่องมี GPU ยังต้องติดตั้ง CUDA EP หลัง `pnpm install` ตาม AGENTS.md (ไม่เปลี่ยน)
