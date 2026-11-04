# ADR-0028: Embedding runtime = transformers.js v3 บน onnxruntime-node + โมเดล multilingual-e5-large-instruct

## Status
Accepted — ปรับปรุงการตัดสินโมเดลของ ADR-0025 (หลัก in-process, brute-force cosine, re-embed ตาม `embedding_model` คงเดิมทั้งหมด)

## Date
2026-11-04

## Context
ADR-0025 กำหนด in-process embedding แต่ไม่ได้เลือก runtime และ config ระบุ `multilingual-e5-small` (384 dims) โดยไม่มีหลักฐานคุณภาพภาษาไทย Research (ดู `docs/research/thai-embedding-models.md`, 2026-11-04) พบ:

- e5-small/base/large (non-instruct) **ไม่ปรากฏใน Thai MTEB และ SEA-BED เลย** — คุณภาพไทยไม่มี benchmark ยืนยัน
- `intfloat/multilingual-e5-large-instruct` — SEA-BED **TH 81.11** (อันดับต้นของ open ≤1B), MIT, **มี ONNX official ใน repo**, context 512 รองรับ chunk 450, 1.7M downloads
- ทางเลือกที่ถูกตัด: fastembed (npm) ไม่มี e5-small และ multilingual เล็กสุดของมัน (`paraphrase-multilingual-MiniLM-L12-v2`) max_seq 128 ตัดทิ้ง ~72% ของ chunk 450-token; SEA-LION-E5-600M (TH 81.34) ยังไม่มี ONNX ต้อง export เอง; EmbeddingGemma-300m gated + ไม่มี ONNX + license gemma; bge-m3 คะแนนไทยต่ำกว่า (TH 77.59) และ fp32 2.2 GB; embeddings API ภายนอก (OpenAI small TH เพียง 55.24) ขัด ADR-0025/TC-6

## Decision
1. **Runtime**: `@huggingface/transformers` v3 (transformers.js) บน **onnxruntime-node** — in-process ตรง convention "ไม่มีบริการแยก" (TC-1/§4.2)
2. **โมเดล**: `intfloat/multilingual-e5-large-instruct`, **1024 dims** — config `files.rag.embeddingModel` แก้ตาม; quantized (q8) convert สำหรับ transformers.js ครั้งเดียวตอน setup
3. **Fallback**: ถ้าวัดจริงแล้ว CPU ที่ VM เดียวรับไม่ได้ (embed ต่อไฟล์เกินงบที่ยอมรับ ~15 วินาที) ลดเป็น `Xenova/multilingual-e5-small` ได้ทันทีเพราะเป็นตระกูล/tokenizer เดียวกัน — สลับผ่าน config + re-embed ทั้งไฟล์ (กลไก `embedding_model` มีอยู่แล้ว)
4. คอลัมน์ `embedding real[]` ไม่ผูกจำนวน dims (schema เดิมยืดหยุ่นอยู่แล้ว)

## Consequences
- ปรับ arc42 §5.3 (file_chunks), §6.3, §8.6, §8.7 config จาก 384 → 1024 dims + ชื่อโมเดลใหม่
- upload ไฟล์ละหนึ่งครั้งช้าขึ้น (~4–12 วิ ต่อ proposal ~40 chunks บน CPU) — ยอมรับได้เพราะ embed ครั้งเดียวต่อไฟล์ตลอดโปรเจกต์ (ADR-0025)
- model cache บนดิสก์ VM ~600 MB (q8); CI ที่รัน RAG test ต้อง cache โมเดลหรือ mock adapter
