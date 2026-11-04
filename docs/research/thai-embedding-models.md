# Research: Embedding Model สำหรับภาษาไทย

**Date:** 2026-11-04 **Status:** Report (input ของการตัดสิน embedding runtime — arc42 ADR-0025 / config `files.rag`) **บริบทของระบบ:** corpus = research proposal ภาษาไทย/อังกฤษ (.docx, 1 ไฟล์ active ต่อโปรเจกต์), chunk ~450 token, query ภาษาไทยจาก agent, embed **in-process บน Node 24 ตอน upload** (ADR-0025 — ไม่มี background job ไม่มีบริการแยก), VM เดียว, brute-force cosine ฝั่ง app (ADR-0025)

---

## 1. แหล่งอ้างอิงที่ใช้

| แหล่ง | คืออะไร | วันที่ข้อมูล |
| --- | --- | --- |
| [Thai MTEB Benchmark](https://anusoft.github.io/thai-mteb-leaderboard/) (ThaiSC/NSTDA) | MTEB v2.10.0 รันบน LANTA Supercomputer (A100-40GB) เฉพาะ **29 ชุดทดสอบภาษาไทย** 7 ประเภทงาน — [ผลดิบ](https://anusoft.github.io/thai-mteb-leaderboard/data/all-results.json) (30 โมเดล) | 2026-03-22 |
| [SEA-BED / SEA-HELM Embedding Leaderboard](https://leaderboard.sea-lion.ai/embedding/SEA) (AI Singapore) | Benchmark embedding 10 ภาษา SEA ([paper arXiv:2508.12243](https://arxiv.org/html/2508.12243v2)) — มีคอลัมน์คะแนน **TH แยกต่างหาก** ประกอบ model open + closed 11 ตัว | 2026-09-18 |
| [FastEmbed supported models](https://qdrant.github.io/fastembed/examples/Supported_Models/) | รายการโมเดลที่ fastembed (npm) รองรับ — ตัวกำหนดว่าอะไรใช้ in-process บน Node ได้แบบสำเร็จรูป | ปัจจุบัน |
| Hugging Face model metadata | downloads / license / ONNX tag (ดึงผ่าน HF API วันที่ 2026-11-04) | 2026-11-04 |

> ค่า AVG ของ Thai MTEB ในตารางด้านล่าง **คำนวณจากเฉพาะ task ที่โมเดลรันสำเร็จ** — โมเดล ≥300M บางตัว OOM บน A100-40GB ใน task corpus ใหญ่ (MIRACL/MrTyDi/MultiLongDoc) จึงถูกตัดออกไปบาง task ตัวเลขจึง**เทียบข้ามโมเดลได้ไม่สมบูรณ์** ใช้เป็นแนวร่วมกับ SEA-BED TH ซึ่งครอบชุดเดียวกันทั้ง 11 โมเดล

## 2. คะแนนฝั่ง Thai (ข้อเท็จจริงจาก benchmark)

### 2.1 SEA-BED — คะแนน Thai (TH) โดยตรง (ครอบทุกโมเดลชุดเดียวกัน)

| Model | TH | Params | Open weights | License |
| --- | --- | --- | --- | --- |
| SEA-LION Embedding E5 | **81.34** | 0.6B | ✓ | MIT |
| Qwen3 Embedding 8B | 81.49 | 8B | ✓ | Apache-2.0 |
| Cohere Embed v3 Multilingual | 80.98 | — | ✗ (API) | commercial |
| Multilingual E5 Large Instruct | **81.11** | 0.6B | ✓ | MIT |
| EmbeddingGemma | 80.58 | 0.3B | ✓ (gated) | gemma |
| Jina Embeddings v3 | 78.64 | 0.6B | ✓ (ใช้เชิงพาณิชย์ต้องชำระเงิน) | cc-by-nc |
| BGE M3 | 77.59 | 0.6B | ✓ | MIT |
| GritLM | 72.84 | 7B | ✓ | MIT |
| LaBSE | 70.20 | 0.5B | ✓ | Apache-2.0 |
| voyage-3 | 69.78 | — | ✗ (API) | commercial |
| **OpenAI text-embedding-3-small** | **55.24** | — | ✗ (API) | commercial |

แหล่ง: [SEA-HELM leaderboard](https://leaderboard.sea-lion.ai/embedding/SEA) 2026-09-18 — อ่านโดยตรง

**ข้อสังเกตสำคัญ:** `text-embedding-3-small` ของ OpenAI ได้ TH เพียง 55.24 — **อย่าใช้ embedding API ทั่วไปกับภาษาไทยโดยไม่เช็ก benchmark** ข้อนี้ยืนยันการตัดสิน ADR-0025 ที่ embed เองด้วย open model

### 2.2 Thai MTEB — ค่าเฉลี่ย 29 ชุดทดสอบไทย (คำนวณจากข้อมูลดิบ)

| Model | AVG | tasks ที่รันได้ | Params | Dim | Max tokens | License |
| --- | --- | --- | --- | --- | --- | --- |
| nvidia/llama-embed-nemotron-8b | 81.69 | — | 8B | — | — | — |
| google/embeddinggemma-300m | **76.79** | 11 | 308M | 768 | 2048 | gemma |
| tencent/KaLM-Embedding-Gemma3-12B | 74.94 | — | 12B | — | — | — |
| Qwen/Qwen3-Embedding-4B | 73.47 | — | 4B | — | — | — |
| **intfloat/multilingual-e5-large-instruct** | **67.69** | **28 (ครบสุดใน dataset)** | 560M | 1024 | 512 | MIT |
| jinaai/jina-embeddings-v5-text-small | 69.45 | — | 281M | — | — | — |
| Qwen/Qwen3-Embedding-0.6B | 68.39 | — | 0.6B | — | — | — |
| BAAI/bge-m3 | 62.41 | 16 | 568M | 1024 | 8194 | MIT |
| jinaai/jina-embeddings-v3 | 62.38 | — | 0.6B | — | — | — |

⚠️ **multilingual-e5-small / base / large (ตัวไม่-instruct) ไม่ปรากฏใน dataset นี้เลย** — แปลว่าโมเดลที่ config ปัจจุบันระบุ (`multilingual-e5-small`) **ไม่มีหลักฐานคุณภาพภาษาไทยจาก benchmark เฉพาะไทยทั้งสองชุด** (SEA-BED ก็ไม่มีรายชื่อ)

### 2.3 ความนิยม (popularity) — Hugging Face metadata 2026-11-04

| Model | Downloads | Likes | หมายเหตุ |
| --- | --- | --- | --- |
| BAAI/bge-m3 | **30.3M** | 3,963 | นิยมสุดในกลุ่ม; OpenThaiRAG (ระบบ RAG เปิดของไทย) ใช้ตัวนี้กับภาษาไทย |
| intfloat/multilingual-e5-large-instruct | 1.7M | 656 | — |
| Xenova/multilingual-e5-small (ONNX copy) | 475K | 21 | สะท้อนการใช้ transformers.js ฝั่ง e5-small |
| google/embeddinggemma-300m | 1.3M | 2.1K | repo **gated** — ต้องขอ access |
| aisingapore/SEA-LION-E5-Embedding-600M | 1K | 2 | ใหม่มาก (Mar 2026) |

## 3. Feasibility บน runtime ของระบบนี้ (transformers.js v3 / onnxruntime-node, in-process)

| Model | ONNX พร้อมใช้ | ต้นทุน runtime | ข้อจำกัด |
| --- | --- | --- | --- |
| multilingual-e5-small | ✓ `Xenova/multilingual-e5-small` (quantized ครบ, 475K dl) | เร็วสุด ~10–30 ms/chunk (q8) | คุณภาพไทยไม่มี benchmark ยืนยัน |
| multilingual-e5-large-instruct | ✓ **official ONNX ใน repo เอง** (`onnx` tag) — อาจต้องปรับชื่อไฟล์/convert quantized เพิ่งเข้ากับ transformers.js | ~100–300 ms/chunk (q8, 560M) → proposal 40 chunks ≈ 4–12 วินาที ต่อ upload ครั้งเดียว | context 512 — เหมาะกับ chunk 450 พอดี |
| SEA-LION-E5-Embedding-600M | ✗ มีแต่ safetensors — ต้อง export ONNX เอง (optimum, build-time) | เทียบ e5-large (~100–300 ms/chunk) | ต้องดูแล pipeline conversion เอง |
| EmbeddingGemma-300m | ✗ ไม่มี ONNX tag + repo gated + license gemma (มีเงื่อนไขการใช้งาน) | ~50–150 ms/chunk | ข้อเสียสามต่อสำหรับ CI/self-host |
| BAAI/bge-m3 | ✓ มี ONNX ใน repo (fp32 ~2.2 GB, ไม่มี quantized) | หนักสุดในกลุ่ม + context 8194 ไม่จำเป็น | คะแนนไทยต่ำกว่า e5-large-instruct ทั้งสอง benchmark |
| fastembed (npm) | — | — | ไม่มี e5-small; multilingual เล็กสุด `paraphrase-multilingual-MiniLM-L12-v2` **max_seq 128** → ตัดทิ้ง ~72% ของ chunk 450 token |

## 4. สรุปตัวเลือกสำหรับระบบนี้

| ตัวเลือก | คุณภาพไทย (หลักฐาน) | ความเร็ว in-process | ต้นทุน setup | License |
| --- | --- | --- | --- | --- |
| **A. multilingual-e5-large-instruct** | TH 81.11 (SEA-BED, อันดับ 2 ของ open ≤1B), AVG 67.69 ครบ 28 task ไทย | ปานกลาง (~4–12 วิ/ไฟล์) | ONNX official + convert quantized ครั้งเดียว | MIT |
| B. multilingual-e5-small (config ปัจจุบัน) | ไม่มีหลักฐาน benchmark ไทย | เร็วสุด | สำเร็จรูป Xenova | MIT |
| C. SEA-LION-E5-Embedding-600M | TH 81.34 (สูงสุดของ open ≤1B) + ออกแบบเพื่อ SEA/ไทยโดยเฉพาะ | ปานกลาง | ต้อง export ONNX เอง + โมเดลใหม่มาก สอดส่อง community เล็ก | MIT |
| D. EmbeddingGemma-300m | TH 80.58, Thai-MTEB 76.79 | ค่อนข้างเร็ว | gated + ไม่มี ONNX + license gemma | gemma |
| E. BAAI/bge-m3 | TH 77.59, AVG 62.41 | ช้า/ใหญ่สุด | ONNX fp32 2.2 GB | MIT |

## 5. References

- Thai MTEB Benchmark — https://anusoft.github.io/thai-mteb-leaderboard/ (ThaiSC/E-Government Agency; MTEB v2.10.0, LANTA)
- ข้อมูลดิบ Thai MTEB — https://anusoft.github.io/thai-mteb-leaderboard/data/all-results.json (generated 2026-03-22)
- SEA-HELM / SEA-BED Embedding leaderboard — https://leaderboard.sea-lion.ai/embedding/SEA (AI Singapore, 2026-09-18)
- SEA-BED paper — https://arxiv.org/abs/2508.12243 (Southeast Asia Embedding Benchmark)
- SEA-LION-E5-Embedding-600M card — https://huggingface.co/aisingapore/SEA-LION-E5-Embedding-600M (MIT, base = multilingual-e5-large, ctx 512, dim 1024)
- multilingual-e5-large-instruct — https://huggingface.co/intfloat/multilingual-e5-large-instruct (MIT, ONNX in-repo, 1.7M downloads)
- BAAI/bge-m3 — https://huggingface.co/BAAI/bge-m3 (MIT, 30.3M downloads, ONNX fp32)
- OpenThaiRAG — https://openthai.aieat.or.th/openthairag (ใช้ bge-m3 กับภาษาไทย)
- FastEmbed supported models — https://qdrant.github.io/fastembed/examples/Supported_Models/
- paraphrase-multilingual-MiniLM-L12-v2 — https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (max_seq_length 128)
- Xenova/multilingual-e5-small (ONNX) — https://huggingface.co/Xenova/multilingual-e5-small (475K downloads)
