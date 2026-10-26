# ADR-0022: โมเดลไฟล์ project-scoped + enum evidence ปิด TC-5 + checklist แบบ array เต็ม + reopen offers เป็น entity

## Status
Accepted

## Date
2026-10-26

## Context
จาก grilling session — arc42 ใช้ task-scoped upload (`POST /tasks/{id}/files` + `task.file_id`) ขณะที่ frontend contract อัปโหลดระดับ project แล้วผูก evidence ทีหลัง; คำถาม TC-5 เรื่อง enum ของ evidence ตอบได้แล้วจาก frontend mockup (`rdm_deposit` ถูกใช้จริง, DOI อยู่ใน `ref` ไม่มี type `doi` แยก)

## Decision
1. **ไฟล์เป็นของโครงการ**: upload เดียวที่ `POST /projects/{id}/files` (+ `purpose`) — task evidence อ้าง `file_id` ผ่าน evidence, ตาราง tasks ไม่มี `file_id`; `file_records` เพิ่ม `archived_at`; ไฟล์ที่เป็น evidence ลบไม่ได้ — archive เท่านั้น, ลบไฟล์ที่ใช้งานอยู่ → `409 file_in_use`
2. **evidence enum: `none | file | url | rdm_deposit`** — DOI รวมอยู่ใน `rdm_deposit` (`{type: "rdm_deposit", ref: "10.5281/…"}`) — **ปิดข้อรอตัดสินของ TC-5 ข้อ enum**
3. **Checklist แก้ผ่าน `PATCH /tasks/{id}` ส่ง array เต็ม** — ไม่มี sub-endpoints ราย item (add/update/delete/replace ครอบด้วยการส่ง array ใหม่) — `progress_percent` ยัง derive จาก array เสมอ
4. **Reopen offers เป็น entity**: `GET /dmps/{id}/reopen-offers` + `accept` + `dismiss` — ระบบต้องจำว่าเสนออะไรไปแล้วและ user dismiss อันไหน (arc42 เดิม stateless ไม่มีแนวคิด dismiss)

## Consequences
- flow #11, #12 ต้องแก้ตาม; frontend contract แก้ checklist client เป็น array-PATCH
- เช็ค MIME .docx + 422 ถ้า parse ไม่ได้ (หมายเหตุ 20 MB ถูกย้อนโดย ADR-0024 — คง 25 MB ฝั่ง server)
