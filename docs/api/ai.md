# AI

ผู้ช่วย AI ของระบบ — มีสาม operation หลักตาม requirement: (1) สร้างแผน+งานจาก
proposal, (2) แก้แผน/งานตามข้อความที่ผู้ใช้พิมพ์, (3) ตรวจรายงานรายสัปดาห์เทียบกับ
งานของสัปดาห์นั้น — operation ที่ 3 เป็นแบบ non-blocking เสมอ
เฉพาะ researcher มีสิทธิ์ใช้ AI (กรรมการไม่มี) ภายใต้โควตา token ต่อบุคคล
(`ai_token_limit / ai_token_used` บน [User](users.md#the-user-object)) —
โควตาหมดได้ 403 `permission_error` provider ที่ backend ใช้ (OpenRouter ตาม
requirement) เป็นรายละเอียดภายใน ไม่ปรากฏใน contract นี้

> [!NOTE]
> requirement มีข้อขัดแย้งค้างอยู่ (Open Item 4): use-case diagram ให้ Admin
> "Generate plan" แต่ §2 บอกเฉพาะ researcher มี AI — contract นี้ยึด §2
> (admin แก้ DMP ตรง ๆ ได้แต่ไม่เรียก AI) ต้องตกลงกันอีกครั้งก่อน implement

## Endpoints

- [`POST /dmps/{dmp_id}/ai/generate`](#generate-a-plan-from-a-proposal)
- [`POST /dmps/{dmp_id}/ai/edit`](#edit-a-plan-with-an-instruction)
- [`POST /files/{file_id}/recheck`](#recheck-a-weekly-report)
- [`GET /dmps/{dmp_id}/ai/thread`](#retrieve-the-ai-thread)

## The AI response object

การ generate/edit คืนผลลัพธ์เป็น DMP ที่ถูกอัปเดต งานที่เกิด/ถูกแก้
และสรุปการใช้ token — ตัวอย่างด้านล่างคือ response ของ Generate

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

### Request

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/ai/generate \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"proposal_file_id": "b2e8c4a1-5f79-4d06-8b3e-9c1d7a5f4e28"}'
```

### Response

```json
{
  "dmp": {
    "id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
    "status": "draft",
    "title": "Data Management Plan — Biodegradable Packaging Film",
    "description": "12-week plan generated from the approved proposal."
  },
  "tasks": [
    {
      "id": "1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42",
      "title": "Upload Week 6 weekly report",
      "status": "todo",
      "generated_by": "ai"
    }
  ],
  "usage": {
    "total_tokens": 18450,
    "ai_token_used": 91950,
    "ai_token_limit": 200000
  }
}
```

## Attributes

- `dmp` (DMP object)
  DMP หลัง AI แก้ — รูปทรงเต็มตาม [The DMP object](dmps.md#the-dmp-object)

- `tasks` (array of Task objects)
  งานที่ AI สร้างใหม่หรือแก้ไปใน operation นี้ — รูปทรงตาม
  [The task object](tasks.md#the-task-object) งานที่ได้จาก AI มี `generated_by: ai`
  และ **ผู้ใช้แก้ต่อได้ทุก field ก่อน submit เสมอ** ตาม requirement

- `usage` (AiUsage object)
  สรุป token ที่ operation นี้ใช้ — ดูที่ [AiUsage object](#aiusage-object)

### AiUsage object

- `total_tokens` (integer)
  token ที่ operation ครั้งนี้ใช้ (prompt + completion)

- `ai_token_used` (integer)
  ยอดสะสมใหม่ของผู้ใช้หลังหักครั้งนี้ — ใช้แสดง progress ของโควตาบนหน้าจอได้ทันที
  โดยไม่ต้องเรียก `GET /auth/me` ซ้ำ

- `ai_token_limit` (integer)
  โควตาของผู้ใช้ ณ ตอนนั้น

## Generate a plan from a proposal

ให้ AI อ่าน proposal (.docx) แล้วร่างแผน + สร้างงานให้ครบทุก field
— researcher เจ้าของ DMP เท่านั้น และได้เฉพาะเมื่อ DMP `status: draft`
proposal ที่ใช้ต้องเป็น [File](files.md#the-file-object) `purpose: proposal`
ของโปรเจกต์เดียวกัน งานเดิมที่ AI เคยสร้าง (`generated_by: ai` และยังไม่เริ่มทำ)
ถูกแทนที่ด้วยชุดใหม่; งานที่ผู้ใช้สร้างเองหรือเริ่มทำแล้วไม่ถูกแตะ
เสร็จแล้วผู้ใช้ได้ notification `tasks_generated` ใช้ token ตาม `usage`

### Body parameters

- `proposal_file_id` (optional, string)
  UUID ของไฟล์ proposal ที่ต้องการให้อ่าน — ไม่ส่งใช้ proposal active ของโปรเจกต์
  (`proposal_file_id` ของ project); ถ้าไม่มีทั้งสองได้ 400

Returns the updated DMP, the generated tasks, and token usage.

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/ai/generate \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"proposal_file_id": "b2e8c4a1-5f79-4d06-8b3e-9c1d7a5f4e28"}'
```

## Edit a plan with an instruction

ให้ AI แก้แผน/งานตามข้อความภาษาธรรมชาติของผู้ใช้ เช่น
"เลื่อนการทดสอบแรงดึงไปสัปดาห์ 7" — เงื่อนไขสิทธิ์/สถานะเดียวกับ Generate
ผลลัพธ์คือ DMP/งานที่แก้แล้ว พร้อม `usage` ผู้ใช้ยังแก้ต่อเองได้เสมอ

### Body parameters

- `instruction` (required, string)
  ข้อความสั่งแก้เป็นภาษาธรรมชาติ ห้ามเป็นค่าว่าง

Returns the updated DMP, the affected tasks, and token usage.

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/ai/edit \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"instruction": "Move the tensile testing to week 7 and add a composting trial in week 9."}'
```

## Recheck a weekly report

ให้ AI ตรวจรายงานรายสัปดาห์ว่าตรงกับงานที่แผนกำหนดไว้ในสัปดาห์นั้นหรือไม่
— researcher เจ้าของไฟล์เรียกเองได้ (ปกติระบบเรียกให้อัตโนมัติตอน
[Upload a file](files.md#upload-a-file) แบบ weekly report อยู่แล้ว)
endpoint นี้เป็น **async**: ตอบกลับ `202 Accepted` ทันทีด้วย `ai_check.status:
checking` อัปโหลด/การส่งไม่ถูก block เมื่อตรวจเสร็จ `ai_check` บนไฟล์อัปเดต
และผู้อัปโหลดได้ notification `ai_recheck_complete` ใช้ token ตามปกติ
ไฟล์ `file_type: docx` เท่านั้นที่ตรวจได้ — นามสกุลอื่นได้ 400

Returns `202 Accepted` with the file whose `ai_check` is `checking`.

```bash
curl -X POST http://localhost:3000/files/7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12/recheck \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve the AI thread

ประวัติการสนทนา/กิจกรรมกับ AI ของ DMP นี้ — user/assistant turn และเหตุการณ์
เบา ๆ เรียงตาม `created_at` เก่าสุดก่อน — สมาชิกของโปรเจกต์หรือ admin
ใช้ทำหน้าแสดงบทสนทนากับ AI ในหน้าร่างแผน ผลลัพธ์ห่อใน
[list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/ai/thread" \
  -H "Authorization: Bearer YOUR_JWT"
```

### ThreadEntry object

- `id` (string)
  UUID ระบุรายการ

- `role` (enum)
  Possible enum values:
  - `user`
    ข้อความหรือคำสั่งของผู้ใช้
  - `assistant`
    ข้อความตอบของ AI

- `action` (string, nullable)
  ชนิด action ที่ AI ทำใน turn นี้ เช่น `analyze_proposal`, `regenerate_field`,
  `batch_regenerate`, `generate_tasks`, `redraft_steps` — `null` ถ้าเป็นข้อความทั่วไป

- `content` (string)
  เนื้อข้อความของ turn

- `created_at` (string)
  เวลาที่เกิด (ISO 8601 UTC)
