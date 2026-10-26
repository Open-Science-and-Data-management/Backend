# ADR-0025: RAG บน proposal — embed ตอน upload, ตาราง `file_chunks` + cosine ฝั่ง app, tool `search_proposal`

## Status
Accepted

## Context
จาก grilling session — ขยาย flow #3 (arc42 6.3) ให้เริ่มตั้งแต่ upload เอกสาร และให้ agent ตอบคำถามเกี่ยวกับเอกสารผ่าน RAG แทนที่จะอ่าน extracted text ทั้งก้อนทุกครั้ง โดยมีเงื่อนไขจากเจ้าของระบบว่า "เอกสารอันเดียวใช้จนจบ project" — corpus ของ RAG คือ proposal active ตัวเดียวต่อโปรเจกต์เท่านั้น และเวกเตอร์ต้อง embed ครั้งเดียวแล้วใช้ซ้ำได้ตลอด

## Decision
1. **Corpus = proposal active ตัวเดียวต่อโปรเจกต์** — evidence/task deliverable ไม่เข้า corpus (sensitive + ไม่จำเป็นต่อการตอบใน flow #3)
2. **เพิ่ม tool ที่ 4 `search_proposal(query)`** ใน ReAct loop — agent เป็นคนตัดสินใจว่าคำถามไหนต้อง query RAG (คำถามที่ต้องเห็นทั้งก้อนยังใช้ `read_proposal` ได้) คืน top-k = 5 chunks พร้อม `chunk_index` + `heading_path`; ถ้า RAG ไม่พร้อม tool บอก agent ให้ fallback `read_proposal` — ไม่ error ทั้ง run
3. **Embed ตอน upload, in-process** — parse (mammoth) → chunk ตาม heading/ย่อหน้า (~400–500 token วัดด้วย tokenizer, overlap ~10%) → embed ด้วย **multilingual-e5-small in-process** — คง convention "ไม่มี background job" (ไม่ใช่แค่ parse ที่ in-process แล้ว)
4. **เก็บใน Postgres ตาราง `file_chunks`** (`real[]` 384 dims + `chunk_index` + `content` + `heading_path` + `embedding_model`, FK CASCADE ตาม `file_records`) — query กรอง `WHERE file_id` ก่อน (index btree) แล้ว **cosine ฝั่ง app** — brute force ที่ขนาดเอกสารเดียว (~200–1,000 chunks) วัดจริง ~1 ms และแม่น 100%
5. **Cache ผูก `file_id`** — เอกสารตัวเดียวใช้จนจบโปรเจกต์ จึง embed ครั้งเดียว; ไฟล์เก่าก่อน feature นี้ backfill lazy ครั้งแรกที่ถูกใช้; supersede/ลบไฟล์ → chunks ระเบิดตาม (CASCADE) retrieval ชี้ proposal active เท่านั้น
6. **`embedding_model` column** — chunks ที่ embed ด้วยรุ่นไม่ตรง config ปัจจุบัน re-embed ทั้งไฟล์ครั้งเดียว (เปลี่ยน/อัปเกรดโมเดลได้โดยไม่ migration มือ)
7. **Embedding ไม่นับโควตา AI** (`ai_token_used`) — เป็น infra ฝั่งระบบเหมือน parse; ล้มเหลวตอน upload → `422` เหมือน parse ไม่ได้ (ไฟล์ที่ upload สำเร็จใช้ RAG ได้เสมอ — ไม่มี state แขวน)
8. **FE contract ไม่เปลี่ยน** — tool เป็นของภายใน, SSE event เดิม (ADR-0018), ค่า chunking/top-k เป็น tunable config (arc42 8.7)

## Consequences
- arc42 6.3 (narrative + diagram เริ่มที่ upload), 5.x ตาราง `file_chunks`, 8.6/8.7, `project-erd.md` (`FILE_CHUNK`), `sequence-diagrams.md` flow #3, `requirement.md` (tools 3 → 4 ตัว) แก้ตาม
- โมเดล embedding โหลดครั้งแรก ~100 MB — deployment เพิ่ม artifact แต่ไม่เพิ่ม service/key
- คำตอบของ AI อ้างตำแหน่งในเอกสารได้ (heading path) — มีประโยชน์ตอนกรรมการตรวจ

## Alternatives Considered
- **pgvector extension** — ได้ ANN index + SQL-level similarity แต่ที่ N = ไม่กี่ร้อย–พัน chunks ต่อ query, ANN index สร้างเองก็ช้ากว่าและแม่นน้อยกว่า exact scan; แลกด้วยการสลับ Postgres image/migration — ปฏิเสธ ถ้าวันหน้า corpus ต่อ query โตถึงหลักหมื่น chunks ค่อยสลับ (จุดคำนวณอยู่จุดเดียว)
- **Vector DB เฉพาะทาง (Qdrant ฯลฯ)** — ชนะเมื่อ corpus ระดับแสน vectors/ต้อง scale หลาย instance; ที่นี่เพิ่ม service ทั้งตัวบน VM เดียว (port/auth/backup/client) ผิดหลัก monolith (ADR-0001) — ปฏิเสธ
- **External embedding API (Gemini/OpenAI)** — คุณภาพสูงกว่าเล็กน้อยแต่เพิ่ม API key/ค่าใช้จ่าย/dependency ภายนอก + latency ตอน upload — ปฏิเสธ (OpenRouter ไม่มี embeddings endpoint ให้ใช้)
- **Inject top-k ทุก turn แทน tool** — ง่ายกว่าแต่เสีย token กับ turn ที่ไม่ต้องใช้ และขัดรูปแบบ ReAct ที่ agent ตัดสินใจเรียก tool เอง — ปฏิเสธ
- **ตัด `read_proposal` เหลือแต่ RAG** — บังคับใช้ retrieval แม้คำถามต้องเห็นทั้งก้อน — ปฏิเสธ
- **Thai NLP segmentation lib (PyThaiNLP ฯลฯ)** — chunking ตัดตามโครงสร้างและวัดความยาวด้วย tokenizer ของโมเดลเอง (sentencepiece tokenize ไทยได้) ไม่ต้อง segment คำ; libs ที่ดีอยู่ฝั่ง Python ขัด runtime NestJS — ปฏิเสธ
- **Embed lazy ครั้งแรกที่ AI ใช้ / background job** — ขัด convention in-process และทำให้ upload สำเร็จแต่ RAG อาจพังภายหลัง (state แขวน) — ปฏิเสธ
