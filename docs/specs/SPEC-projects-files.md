# Spec: projects-files

**Map:** `docs/specs/SPEC.md` · **Depends on:** `foundation`, `accounts` · **Gate = จบ M2 (e2e flow #2 + #18 เขียว)**
**ADR ที่เกี่ยว:** 0022 (ไฟล์ project-scoped), 0024 (proposal ผูกโดย analyze-proposal), 0025 + 0028 (RAG + embedding runtime)

## Objective
โครงการวิจัย (สมาชิก, proposal .docx) และไฟล์ประกอบ — พร้อมเตรียมความรู้ของเอกสารครั้งเดียว (parse → chunk → embed) ใช้ตลอดโปรเจกต์โดย AI module มาใช้ภายหลัง

## Scope (slices)
S2.1 projects + members + delete protection → S2.2 files upload/download + docx parse + lifecycle → S2.3 RAG (chunk + embed + retrieval สำรอง)

## Interfaces (boundary)
- `POST/GET /projects`, `GET /projects/{id}`, `GET /projects/{id}/members`, `DELETE /projects/{id}` (ปฏิเสธเมื่อมีแผน — flow #13)
- `POST /projects/{id}/files` (25 MB, MIME .docx → 400, parse ไม่ได้ → 422), `GET /files`, `GET /files/{id}/content`, `POST /files/{id}/archive`, `DELETE /files/{id}` (`409 file_in_use` เมื่อเป็น evidence)
- I/O ไฟล์ผ่าน `FileStorage` port (adapter DiskStorage) — เผื่อสลับ S3 (QS-7)
- ให้ ai module ใช้ต่อ: extracted text (`file_records`), `file_chunks` (`chunk_index, heading_path, embedding real[1024], embedding_model`) — retrieval: กรอง `file_id` ก่อน cosine ฝั่ง app คืน top-5 (~1 ms), ไม่มี pgvector
- proposal active ตัวเดียวต่อโปรเจกต์; แทน proposal → `superseded_at` + CASCADE chunks ตามไฟล์; โมเดลไม่ตรง config → re-embed ทั้งไฟล์; ไฟล์เก่า backfill lazy

## Testing
- **Seam: HTTP boundary** — e2e flow #2 (สร้างโครงการ+proposal), #18 (file lifecycle, `409 file_in_use`, archive/delete)
- **Seam: ports/adapters (integration)** — DiskStorage จริงบน volume; embed บน model จริง (transformers.js v3 + `multilingual-e5-large-instruct`): upload → chunks ครบ → query cosine ได้ตำแหน่งถูก; วัดเวลาต่อไฟล์ — เกิน ~15 วิ → สลับ fallback e5-small ผ่าน `config.toml`
- unit: กฎขนาด/MIME, supersede CASCADE, `embedding_model` mismatch → re-embed

## Success Criteria
1. e2e flow #2 + #18 เขียว
2. Upload proposal → chunks + embeddings ครบใน transaction เดียว; ล้มเหลว (parse/embed) → 422 ไม่ทิ้งข้อมูลครึ่ง ๆ
3. Retrieval brute-force คืน top-5 พร้อมตำแหน่ง บน corpus เอกสารเดียว
4. การแทนไฟล์ proposal ระเบิด chunks เก่า (CASCADE) และจด `superseded_at`

## Out of Scope
`POST /ai/analyze-proposal` (จะผูก proposal จริงตอน ai module — ตอนนี้ proposal nullable ตาม ADR-0024), evidence ไฟล์ (อยู่ dmp-lifecycle)
