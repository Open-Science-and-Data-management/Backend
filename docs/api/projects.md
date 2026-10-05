# Projects

โปรเจกต์วิจัยหนึ่งหน่วย คือภาชนะหลักของทุกอย่าง: สมาชิก, DMP, ไฟล์ และ notification
ล้วนแขวนอยู่กับ project นักวิจัยสร้างโปรเจกต์และอัปโหลด proposal เข้ามา
เมื่อ proposal ถูกเลือกเป็นฉบับที่ใช้จริง (`proposal_file_id`) ไฟล์ฉบับเก่าจะถูกทำเครื่องหมาย
superseded และมี notification `proposal_superseded` ทุกโปรเจกต์เริ่มที่ `status: draft`
และปิดท้ายที่ `done` เมื่องานเสร็จ

## Endpoints

- [`POST /projects`](#create-a-project)
- [`GET /projects`](#list-projects)
- [`GET /projects/{project_id}`](#retrieve-a-project)
- [`PATCH /projects/{project_id}`](#update-a-project)
- [`DELETE /projects/{project_id}`](#delete-a-project)

## The project object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: สมัครบัญชีและ login ก่อน (ดู [Auth](auth.md))

### Request

```bash
curl http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
  "name": "Biodegradable Packaging Film from Cassava Starch",
  "description": "Development of biodegradable packaging film from cassava starch for food packaging applications.",
  "status": "active",
  "plan_mode": "independent",
  "proposal_file_id": "7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12",
  "created_at": "2026-08-02T03:30:00Z",
  "updated_at": "2026-09-18T09:15:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุโปรเจกต์

- `name` (string)
  ชื่อโปรเจกต์วิจัย

- `description` (string, nullable)
  บรรยายสั้น ๆ ว่าโปรเจกต์ทำอะไร

- `status` (enum)
  Possible enum values:
  - `draft`
    ยังเตรียมการ — อัปโหลด proposal และร่าง DMP ได้
  - `active`
    กำลังดำเนินงาน — DMP ได้รับอนุมัติแล้ว นักวิจัยทำงานตามแผนสัปดาห์
  - `done`
    จบแล้ว — งานวิจัยเสร็จสิ้น

- `plan_mode` (enum)
  Possible enum values:
  - `institutional`
    แผนอยู่ภายใต้กรอบของสถาบัน
  - `independent`
    แผนเป็นอิสระของผู้วิจัย

- `proposal_file_id` (string, nullable)
  UUID ของ [File](files.md#the-file-object) ที่เป็น proposal ฉบับที่ใช้จริง —
  `null` จนกว่าจะเลือก proposal; เลือกไฟล์ใหม่ทับจะทำให้ไฟล์เดิมมี `superseded_at`
  และเกิด notification `proposal_superseded`

- `created_at` (string)
  เวลาที่สร้างโปรเจกต์ (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

## Create a project

สร้างโปรเจกต์ใหม่ — ผู้สร้างถูกเพิ่มเป็น [member](project-members.md) คนแรก
โดยอัตโนมัติด้วย `project_role: researcher` โปรเจกต์ใหม่เริ่มที่ `status: draft`
เสมอ ไม่ต้องส่ง `status` หรือ `proposal_file_id`

### Body parameters

- `name` (required, string)
  ชื่อโปรเจกต์ ห้ามเป็นค่าว่าง

- `description` (optional, string)
  คำบรรยายโปรเจกต์

- `plan_mode` (optional, enum, default is "independent")
  โหมดแผนของโปรเจกต์

Returns the created project.

```bash
curl http://localhost:3000/projects \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name": "Biodegradable Packaging Film from Cassava Starch", "plan_mode": "independent"}'
```

## List projects

คืนโปรเจกต์ที่ผู้เรียกมีส่วนเกี่ยวข้อง (เป็นสมาชิกอยู่) — admin เห็นทุกโปรเจกต์
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)
เรียงตาม `updated_at` ใหม่สุดก่อน

### Query parameters

- `status` (optional, enum)
  กรองตามสถานะ `draft | active | done`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/projects?status=active" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a project

คืนโปรเจกต์หนึ่งหน่วย — เฉพาะสมาชิกของโปรเจกต์หรือ admin ไม่พบหรือไม่มีสิทธิ์จะได้ 404

```bash
curl http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a project

แก้ข้อมูลโปรเจกต์ — เจ้าของโปรเจกต์ (researcher ที่สร้าง), chief ของโปรเจกต์
หรือ admin เท่านั้น จุดสำคัญคือ field `proposal_file_id`: การตั้งค่านี้คือ "การเลือก
proposal ฉบับที่ใช้จริง" ของโปรเจกต์ ต้องชี้ไปยัง [File](files.md#the-file-object)
ที่มี `purpose: proposal` อยู่ในโปรเจกต์เดียวกัน มิฉะนั้นได้ 400
เลือกทับฉบับเดิมทำให้ฉบับเดิมถูก superseded ตามที่อธิบายใน Attributes

### Body parameters

- `name` (optional, string)
  ชื่อโปรเจกต์ใหม่

- `description` (optional, string)
  คำบรรยายใหม่

- `status` (optional, enum)
  เปลี่ยนสถานะ `draft | active | done` — ทุก role ที่มีสิทธิ์แก้โปรเจกต์เปลี่ยนได้

- `plan_mode` (optional, enum)
  โหมดแผน `institutional | independent`

- `proposal_file_id` (optional, string, nullable)
  เลือก proposal ฉบับที่ใช้จริง หรือส่ง `null` เพื่อถอนการเลือก

```bash
curl -X PATCH http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"proposal_file_id": "7b3e9d1c-2a86-4f54-9c7b-0d5a8f3e6c12", "status": "active"}'
```

## Delete a project

ลบโปรเจกต์ถาวร — admin เท่านั้น การลบจะลบข้อมูลลูกทั้งหมด (สมาชิก, DMP, งาน,
ไฟล์, notification ของโปรเจกต์) TODO: confirm ว่าต้องการ soft delete หรือไม่

```bash
curl -X DELETE http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74 \
  -H "Authorization: Bearer YOUR_JWT"
```
