# Files

ไฟล์เอกสารที่อัปโหลดเข้าโปรเจกต์ — proposal, ส่งงานรายสัปดาห์ และหลักฐานประกอบ
ระบบรองรับเอกสาร `.docx` เป็นหลักตาม requirement (`file_type` ยังรับ `pdf`/`other`
ตาม ERD) ทุกไฟล์กรอก metadata form ชุดเดียวกัน: ชื่อเอกสาร, เลขสัปดาห์ (ถ้ามี),
หมายเหตุ ไฟล์ส่งงานรายสัปดาห์เมื่ออัปโหลดจะถูก AI ตรวจทันทีแบบ non-blocking —
อัปโหลดไม่เคยถูก block รอผลตรวจผ่าน `ai_check`

## Endpoints

- [`POST /files`](#upload-a-file)
- [`GET /files`](#list-files)
- [`GET /files/{file_id}`](#retrieve-a-file)
- [`DELETE /files/{file_id}`](#delete-a-file)

## The file object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มีโปรเจกต์อยู่ก่อน (ดู [Create a project](projects.md#create-a-project))

### Request

```bash
curl http://localhost:3000/files/7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12",
  "project_id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
  "uploaded_by": "9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30",
  "filename": "Week 5 weekly report.docx",
  "file_type": "docx",
  "purpose": "task_deliverable",
  "size_bytes": 411648,
  "metadata": {
    "document_name": "Week 5 weekly report",
    "week_no": 5,
    "note": "Tensile testing continuation"
  },
  "download_url": "/files/7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12/download",
  "ai_check": {
    "status": "incomplete",
    "note": "2 deviations from the planned scope: tensile testing was skipped (planned 3.2) and the composting trial used 20 instead of 30 samples."
  },
  "uploaded_at": "2026-09-19T16:40:00Z",
  "superseded_at": null
}
```

## Attributes

- `id` (string)
  UUID ระบุไฟล์

- `project_id` (string)
  UUID ของโปรเจกต์ที่ไฟล์อัปโหลดเข้า

- `uploaded_by` (string)
  UUID ของผู้ใช้ที่อัปโหลด

- `filename` (string)
  ชื่อไฟล์ต้นฉบับพร้อมนามสกุล

- `file_type` (enum)
  Possible enum values:
  - `docx`
    เอกสาร Word — รูปแบบหลักที่ requirement กำหนด
  - `pdf`
    เอกสาร PDF
  - `other`
    นามสกุลอื่น — ระบบเก็บไว้ได้แต่ AI recheck ไม่รับประกัน

- `purpose` (enum)
  Possible enum values:
  - `proposal`
    ข้อเสนอโครงการวิจัย — ตัวที่ถูกเลือกเป็น `proposal_file_id` ของโปรเจกต์คือฉบับที่ใช้จริง
  - `task_deliverable`
    ของที่ส่งตามงาน เช่น รายงานรายสัปดาห์ — ถ้ามี `week_no` ถือเป็น weekly report และถูก AI ตรวจอัตโนมัติ
  - `evidence`
    หลักฐานประกอบงาน เช่น ภาพผลการทดลอง ข้อมูลดิบ

- `size_bytes` (integer)
  ขนาดไฟล์เป็นไบต์ — frontend ใช้แสดงเป็น KB/MB เอง

- `metadata` (Metadata object)
  ข้อมูลประกอบจาก metadata form — รายละเอียดดูที่ [Metadata object](#metadata-object)

- `download_url` (string)
  path สำหรับดาวน์โหลดเนื้อไฟล์ (แนบ `Authorization` header เหมือน endpoint อื่น)

- `ai_check` (AiCheck object)
  ผลการตรวจของ AI — มีเฉพาะไฟล์ที่ถูกตรวจ (weekly report หรือที่เรียก
  [Recheck](ai.md#recheck-a-weekly-report) เอง) ดูรายละเอียดที่
  [AiCheck object](#aicheck-object)

- `uploaded_at` (string)
  เวลาที่อัปโหลด (ISO 8601 UTC)

- `superseded_at` (string, nullable)
  เวลาที่ไฟล์ถูกแทนที่ — มีค่าเมื่อโปรเจกต์เลือก proposal ฉบับใหม่ทับ (ดู
  [Update a project](projects.md#update-a-project)) ไฟล์ที่ superseded ยังดาวน์โหลดได้
  แต่ไม่ใช่ฉบับ active

### Metadata object

- `document_name` (string)
  ชื่อเอกสารที่ผู้ใช้ตั้ง หรือดึงจากชื่อไฟล์อัตโนมัติถ้าไม่ตั้ง

- `week_no` (integer, nullable)
  เลขสัปดาห์ที่เอกสารอ้างถึง (เทียบกับ DMP) — ใช้กับ weekly report เป็นหลัก

- `note` (string, nullable)
  หมายเหตุสั้น ๆ จากผู้อัปโหลด

### AiCheck object

- `status` (enum)
  Possible enum values:
  - `checking`
    AI กำลังตรวจ — อัปโหลดเสร็จแล้วตามปกติ ผลตามหลัง เมื่อจบจะมี notification `ai_recheck_complete`
  - `complete`
    ตรวจแล้ว พบว่าเนื้อหาตรงกับงานของสัปดาห์นั้น
  - `incomplete`
    ตรวจแล้ว พบความเบี่ยงเบน — รายละเอียดอยู่ใน `note` ใช้เป็นข้อมูลให้กรรมการพิจารณา ไม่ block การส่ง

- `note` (string, nullable)
  ข้อความ feedback จาก AI เช่น รายการความเบี่ยงเบนจากขอบเขตที่วางไว้

## Upload a file

อัปโหลดไฟล์ใหม่ด้วย `multipart/form-data` — researcher ของโปรเจกต์ (หรือ admin)
เงื่อนไขพิเศษ: ถ้า `purpose` เป็น `task_deliverable` **และ** ระบุ `metadata[week_no]`
ไฟล์ถูกถือเป็น weekly report และระบบเริ่ม AI recheck ให้ทันที (ตอบกลับได้เลย
ไม่รอผลตรวจ — ดู [AiCheck object](#aicheck-object)) ขนาดไฟล์สูงสุด
TODO: confirm ค่าที่ backend จะ enforce

### Body parameters

`multipart/form-data` — field ของ metadata ใช้ bracket notation:

- `file` (required, binary)
  เนื้อไฟล์ที่อัปโหลด

- `project_id` (required, string)
  UUID ของโปรเจกต์ปลายทาง

- `purpose` (required, enum)
  วัตถุประสงค์ `proposal | task_deliverable | evidence`

- `task_id` (optional, string)
  UUID ของ [Task](tasks.md#the-task-object) ที่ไฟล์เป็นของส่ง — ต้องอยู่โปรเจกต์เดียวกัน

- `metadata[document_name]` (optional, string)
  ชื่อเอกสาร — ไม่ส่งใช้ชื่อไฟล์แทน

- `metadata[week_no]` (optional, integer)
  เลขสัปดาห์ — การส่งค่านี้คู่กับ `purpose=task_deliverable` คือสัญญาณว่าเป็น weekly report

- `metadata[note]` (optional, string)
  หมายเหตุสั้น ๆ

Returns the created file object.

```bash
curl http://localhost:3000/files \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@Week 5 weekly report.docx" \
  -F "project_id=6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74" \
  -F "purpose=task_deliverable" \
  -F "metadata[week_no]=5" \
  -F "metadata[note]=Tensile testing continuation"
```

## List files

คืนไฟล์ของโปรเจกต์ — สมาชิกของโปรเจกต์หรือ admin กรองตาม purpose หรือสัปดาห์ได้
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)
เรียงตาม `uploaded_at` ใหม่สุดก่อน

### Query parameters

- `project_id` (required, string)
  UUID ของโปรเจกต์ที่ต้องการดูไฟล์

- `purpose` (optional, enum)
  กรองตามวัตถุประสงค์ `proposal | task_deliverable | evidence`

- `week_no` (optional, integer)
  กรองเฉพาะไฟล์ของสัปดาห์ที่กำหนด

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/files?project_id=6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74&purpose=task_deliverable&week_no=5" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a file

คืน metadata ของไฟล์หนึ่งไฟล์ — สมาชิกของโปรเจกต์หรือ admin
ใช้เป็นวิธี poll ผล `ai_check` หลังอัปโหลด weekly report

```bash
curl http://localhost:3000/files/7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Delete a file

ลบไฟล์ — ผู้อัปโหลดเองหรือ admin เท่านั้น **ไฟล์ที่เป็น active proposal ของโปรเจกต์
(ตรงกับ `proposal_file_id`) ลบไม่ได้** ได้ 409 — ต้องเลือก proposal ใหม่ทับก่อน
ไฟล์ที่ superseded แล้วลบได้ตามปกติ

```bash
curl -X DELETE http://localhost:3000/files/7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12 \
  -H "Authorization: Bearer YOUR_JWT"
```
