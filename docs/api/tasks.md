# Tasks

งานที่ได้จาก DMP — "สัปดาห์นี้ทำอะไร" ตามที่แผนกำหนด หนึ่ง task อยู่ใต้ DMP
หนึ่งแผน อาจอ้างถึง dataset หรือไฟล์ และมี checklist กับหลักฐานของตัวเอง
status เก็บเป็น lifecycle (`todo → in_progress → done`, หรือ `cancelled`)
ตามข้อตกลงใน draft — **ส่วน "overdue/due-soon" ให้ frontend คำนวณจาก
`end_date` เทียบวันปัจจุบันเอง** API ไม่ compute ให้

## Endpoints

- [`POST /dmps/{dmp_id}/tasks`](#create-a-task)
- [`GET /dmps/{dmp_id}/tasks`](#list-a-dmps-tasks)
- [`GET /tasks/{task_id}`](#retrieve-a-task)
- [`PATCH /tasks/{task_id}`](#update-a-task)
- [`DELETE /tasks/{task_id}`](#delete-a-task)

## The task object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มี DMP อยู่ก่อน (ดู [Create a DMP](dmps.md#create-a-dmp))

### Request

```bash
curl http://localhost:3000/tasks/1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42",
  "dmp_id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
  "dataset_id": "8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17",
  "source_version": 3,
  "file_id": null,
  "title": "Upload Week 6 weekly report",
  "details": "Report tensile testing results for weeks 5-6 with sample-size justification.",
  "start_date": "2026-09-14",
  "end_date": "2026-09-22",
  "progress_percent": 60,
  "status": "in_progress",
  "priority": "high",
  "lifecycle_stage": "data_collection",
  "generated_by": "ai",
  "checklist": [
    { "text": "Prepare figure 3", "done": true },
    { "text": "Write results section", "done": false }
  ],
  "evidence": [
    "https://doi.org/10.1234/example",
    "7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12"
  ],
  "completed_at": null,
  "completed_by": null,
  "created_at": "2026-08-03T05:10:00Z",
  "updated_at": "2026-09-19T16:40:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุงาน

- `dmp_id` (string)
  UUID ของ DMP ที่งานสังกัด

- `dataset_id` (string, nullable)
  UUID ของ [Dataset](datasets.md#the-dataset-object) ที่งานนี้ scoped อยู่ — งานส่วนใหญ่ไม่ผูก dataset

- `source_version` (integer, nullable)
  หมายเลข [version](dmp-versions.md#the-version-object) ของ DMP ที่งานนี้ถูกสร้างจาก — ใช้ย้อนดูว่างานมาจากแผนฉบับไหน

- `file_id` (string, nullable)
  UUID ของ [File](files.md#the-file-object) ที่งานอ้างถึง เช่น แบบฟอร์มที่ต้องกรอก

- `title` (string)
  ชื่องานที่อ่านรู้เรื่องในหนึ่งบรรทัด

- `details` (string, nullable)
  รายละเอียดสิ่งที่ต้องทำ

- `start_date` (string, nullable)
  วันเริ่มงาน (ISO date)

- `end_date` (string, nullable)
  วันครบกำหนด (ISO date) — frontend ใช้ค่านี้คำนวณ overdue/due-soon

- `progress_percent` (integer)
  ความคืบหน้า 0–100 — ใช้แสดง progress bar ให้กรรมการดู

- `status` (enum)
  Possible enum values:
  - `todo`
    ยังไม่เริ่มทำ
  - `in_progress`
    กำลังทำอยู่
  - `done`
    เสร็จสิ้น — จะมี `completed_at` และ `completed_by` กำกับ
  - `cancelled`
    ยกเลิก — ไม่ต้องทำแล้วแต่ยังเก็บไว้ในประวัติ

- `priority` (enum)
  Possible enum values:
  - `low`
    ทำทีหลังได้
  - `medium`
    ปกติ
  - `high`
    สำคัญ/ใกล้ครบกำหนด — ควรโผล่ก่อนในหน้าจอ

- `lifecycle_stage` (enum, TODO: confirm possible values)
  ขั้นของวงจรงานวิจัยที่งานนี้อยู่ ตาม LifecycleStage ใน ERD — ค่า enum ยังไม่ระบุใน er-0410.md (ตัวอย่างข้างบนใช้ `"data_collection"` จากเดาตามบริบท)

- `generated_by` (enum)
  Possible enum values:
  - `ai`
    งานที่ AI สร้างให้จาก proposal (ดู [AI](ai.md))
  - `user`
    งานที่ผู้ใช้สร้าง/แก้เอง

- `checklist` (array of ChecklistItem objects)
  รายการย่อยภายในงาน — รายละเอียดดูที่ [ChecklistItem object](#checklistitem-object)

- `evidence` (array of strings)
  หลักฐานว่างานเสร็จ — **แต่ละสมาชิกเป็น string polymorphic**: UUID ของไฟล์ในระบบ, URL ภายนอก หรือ DOI ฝั่ง frontend ต้องตรวจรูปแบบเองก่อนแสดงผล

- `completed_at` (string, nullable)
  เวลาที่เปลี่ยนสถานะเป็น `done` (ISO 8601 UTC) — `null` ถ้ายังไม่เสร็จ

- `completed_by` (string, nullable)
  UUID ของผู้ใช้ที่ปิดงาน — `null` ถ้ายังไม่เสร็จ

- `created_at` (string)
  เวลาที่สร้างงาน (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

### ChecklistItem object

- `text` (string)
  ข้อความของรายการย่อย

- `done` (boolean)
  ทำรายการนี้แล้วหรือยัง

## Create a task

เพิ่มงานใน DMP — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น และได้เฉพาะเมื่อ
DMP `status: draft`; ระหว่าง `pending`/`approved` สร้างไม่ได้ (ได้ 409)
งานใหม่เริ่มที่ `status: todo`, `progress_percent: 0`, `generated_by: user`
โดยอัตโนมัติ

### Body parameters

- `title` (required, string)
  ชื่องาน ห้ามเป็นค่าว่าง

- `details` (optional, string)
  รายละเอียดงาน

- `start_date`, `end_date` (optional, string)
  ช่วงเวลาของงาน (ISO date)

- `priority` (optional, enum, default is "medium")
  ความสำคัญ `low | medium | high`

- `lifecycle_stage` (optional, enum)
  ขั้นวงจรงานวิจัย — ดู TODO ใน Attributes

- `dataset_id`, `file_id` (optional, string)
  อ้างอิง dataset/ไฟล์ — ต้องเป็นของโปรเจกต์เดียวกัน มิฉะนั้นได้ 400

- `checklist` (optional, array of ChecklistItem objects)
  รายการย่อยเริ่มต้น

Returns the created task.

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/tasks \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title": "Upload Week 6 weekly report", "end_date": "2026-09-22", "priority": "high"}'
```

## List a DMP's tasks

คืนทุกงานของ DMP — สมาชิกของโปรเจกต์หรือ admin ผลลัพธ์ห่อใน
[list envelope](pagination.md#the-list-envelope-object)
เรียงตาม `end_date` ใกล้สุดก่อน (งานที่ไม่มี `end_date` ไปอยู่ท้ายสุด)

### Query parameters

- `status` (optional, enum)
  กรองตามสถานะ `todo | in_progress | done | cancelled`

- `priority` (optional, enum)
  กรองตามความสำคัญ `low | medium | high`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/tasks?status=todo" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a task

คืนงานหนึ่งชิ้น — สมาชิกของโปรเจกต์หรือ admin ไม่พบหรือไม่มีสิทธิ์จะได้ 404

```bash
curl http://localhost:3000/tasks/1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a task

แก้งาน — researcher ของโปรเจกต์ (หรือ admin) จุดพิเศษคือการปิดงาน:
ส่ง `status: done` ระบบจะตั้ง `completed_at` และ `completed_by` จาก token ให้เอง
เลิกติ๊กกลับ (`status` อื่น) ค่าทั้งสองถูกล้างเป็น `null` — การเปลี่ยนสถานะเป็น
`done` เมื่อ checklist ยังมีรายการไม่เสร็จยังอนุญาต (checklist เป็นข้อมูลช่วยจำ
ไม่ใช่กำแพง) การแก้โครงสร้างงาน (title, dates, checklist) ทำได้เฉพาะเมื่อ DMP
`status: draft` แต่การอัปเดตความคืบหน้า (`progress_percent`, `status`,
`checklist[*].done`, `evidence`) ทำได้ทุกเมื่อระหว่างงานดำเนินอยู่

### Body parameters

ส่ง field ใดก็ได้ที่ต้องการแก้ ไม่จำเป็นต้องส่งครบ:

- `title`, `details`, `start_date`, `end_date` (optional)
  ดูคำอธิบายใน Attributes — แก้ได้เฉพาะ DMP `draft`

- `status` (optional, enum)
  เปลี่ยน lifecycle `todo | in_progress | done | cancelled`

- `progress_percent` (optional, integer)
  0–100 ค่านอกช่วงได้ 400

- `priority` (optional, enum)
  ความสำคัญ `low | medium | high`

- `checklist` (optional, array of ChecklistItem objects)
  ทับทั้ง array — ถ้าตัวเดียวให้ส่ง array เต็มกลับมา

- `evidence` (optional, array of strings)
  ทับทั้ง array — สมาชิกเป็น UUID ไฟล์, URL หรือ DOI

Returns the updated task.

```bash
curl -X PATCH http://localhost:3000/tasks/1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"progress_percent": 100, "status": "done"}'
```

## Delete a task

ลบงาน — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น ลบได้เฉพาะเมื่อ DMP
`status: draft`; งานที่เกิดจาก version ที่อนุมัติแล้ว (`source_version` มีค่า)
ลบไม่ได้ ให้ยกเลิกด้วย `status: cancelled` แทน เพื่อรักษาประวัติที่กรรมการเห็น

```bash
curl -X DELETE http://localhost:3000/tasks/1c8f5e2b-6d94-4a37-8b0c-5e9a3d7f1b42 \
  -H "Authorization: Bearer YOUR_JWT"
```
