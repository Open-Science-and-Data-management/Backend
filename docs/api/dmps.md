# DMPs

แผนการจัดการข้อมูล (Data Management Plan) — แผนรายสัปดาห์ของโปรเจกต์ทั้งหมด:
สัปดาห์ 1, 2, … ต้องส่งเอกสารอะไร สร้างก่อนเริ่มงานและต้องได้รับอนุมัติจากกรรมการครบทุกคน
ก่อนนำไปปฏิบัติ DMP หนึ่งแผนมีหลาย version การส่งและอนุมัติดูที่
[DMP versions](dmp-versions.md) — dataset ที่แผนอ้างถึงเป็น resource แยก
ดูที่ [Datasets](datasets.md) (เป็นแหล่งอ้างอิงเท่านั้น ไม่มีการเก็บไฟล์ข้อมูลจริง)

## Endpoints

- [`POST /projects/{project_id}/dmps`](#create-a-dmp)
- [`GET /projects/{project_id}/dmps`](#list-a-projects-dmps)
- [`GET /dmps`](#list-dmps)
- [`GET /dmps/{dmp_id}`](#retrieve-a-dmp)
- [`PATCH /dmps/{dmp_id}`](#update-a-dmp)
- [`DELETE /dmps/{dmp_id}`](#delete-a-dmp)

## The DMP object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มีโปรเจกต์อยู่ก่อน (ดู [Create a project](projects.md#create-a-project))

### Request

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
  "project_id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
  "title": "Data Management Plan — Biodegradable Packaging Film",
  "description": "Weekly plan covering 12 weeks of experiments, testing and reporting.",
  "language": "th",
  "status": "approved",
  "active_version": 3,
  "alternate_identifier": "dmp:uni-cs:2026-014",
  "begin_date": "2026-08-10",
  "end_date": "2026-11-02",
  "ethics": "No human subjects; lab safety protocol LSU-2026-03 applies.",
  "indigenous": null,
  "schema_version": "1.0",
  "contributors": [],
  "costs": [],
  "created_at": "2026-08-03T05:00:00Z",
  "updated_at": "2026-09-18T09:15:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุ DMP

- `project_id` (string, nullable)
  UUID ของโปรเจกต์ที่ DMP สังกัด — โครงสร้างอนุญาตให้เป็น `null` ตาม ERD แต่ flow ปกติสร้าง DMP ภายใต้โปรเจกต์เสมอ

- `title` (string)
  ชื่อแผน

- `description` (string, nullable)
  บรรยายคร่าว ๆ ว่าแผนครอบคลุมอะไร

- `language` (string)
  รหัสภาษาของเนื้อหาแผน เช่น `"th"`, `"en"`

- `status` (enum)
  Possible enum values:
  - `draft`
    กำลังร่างหรือกำลังแก้ — แก้ไขได้ ยังไม่ถึงคิวกรรมการ (รวมถึงหลังถูกปฏิเสธ)
  - `pending`
    รอการอนุมัติ — มี version ที่ส่งให้กรรมการตัดสินอยู่
  - `approved`
    ได้รับอนุมัติครบทุกคน — ใช้ version ที่ `active_version` ปฏิบัติได้

- `active_version` (integer, nullable)
  หมายเลข version ที่ได้รับอนุมัติและใช้ปฏิบัติจริง — `null` จนกว่าจะมีการอนุมัติครบ

- `alternate_identifier` (string, nullable)
  รหัสอ้างอิงอื่นของแผน เช่น รหัสภายในของสถาบัน (ตาม maDMP form)

- `begin_date` (string, nullable)
  วันเริ่มช่วงแผน (ISO date)

- `end_date` (string, nullable)
  วันสิ้นสุดช่วงแผน (ISO date)

- `ethics` (string, nullable)
  ข้อพิจารณาด้านจริยธรรมของการวิจัย

- `indigenous` (string, nullable)
  ข้อมูลด้านชนพื้นเมือง/ภูมิปัญญาท้องถิ่นที่เกี่ยวข้อง — TODO: confirm ชื่อ field จริงจาก frontend form

- `schema_version` (string)
  เวอร์ชันของโครงสร้างแบบฟอร์ม DMP ที่เนื้อหาชุดนี้ใช้ — ใช้ตอน migrate โครงสร้างในอนาคต

- `contributors` (array, TODO: confirm โครงสร้าง)
  รายชื่อผู้เกี่ยวข้องกับแผน (ตาม DmpForm) — ยังเป็นข้อมูลซ้อนใน DMP ไม่แยก resource

- `costs` (array, TODO: confirm โครงสร้าง)
  รายการต้นทุนของแผน (ตาม DmpForm) — ยังเป็นข้อมูลซ้อนใน DMP ไม่แยก resource

- `created_at` (string)
  เวลาที่สร้าง DMP (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

## Create a DMP

สร้าง DMP ใหม่ในโปรเจกต์ — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น
โปรเจกต์หนึ่งมี DMP ได้หลายแผน แผนใหม่เริ่มที่ `status: draft`
`active_version` เริ่มเป็น `null`

### Body parameters

- `title` (required, string)
  ชื่อแผน ห้ามเป็นค่าว่าง

- `description` (optional, string)
  คำบรรยายแผน

- `language` (optional, string, default is "th")
  รหัสภาษาของเนื้อหา

- `begin_date`, `end_date` (optional, string)
  ช่วงเวลาของแผน (ISO date)

- `alternate_identifier`, `ethics`, `indigenous` (optional, string)
  ข้อมูลระดับแผนตาม DmpForm

Returns the created DMP.

```bash
curl http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/dmps \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title": "Data Management Plan — Biodegradable Packaging Film", "begin_date": "2026-08-10", "end_date": "2026-11-02"}'
```

## List a project's DMPs

คืนทุก DMP ของโปรเจกต์หนึ่ง — สมาชิกของโปรเจกต์หรือ admin เรียกได้
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)
เรียงตาม `created_at` ใหม่สุดก่อน

### Query parameters

- `status` (optional, enum)
  กรองตามสถานะ `draft | pending | approved`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/dmps?status=draft" \
  -H "Authorization: Bearer YOUR_JWT"
```

## List DMPs

คิวงานข้ามโปรเจกต์ — คืน DMP ที่ผู้เรียกเกี่ยวข้อง: กรรมการเห็น DMP `pending`
ของโปรเจกต์ที่ตนเป็น `committee` (ใช้ทำหน้า review queue), นักวิจัยเห็น DMP
ของตัวเอง, admin เห็นทั้งหมด ผลลัพธ์ห่อใน
[list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `status` (optional, enum)
  กรองตามสถานะ `draft | pending | approved`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/dmps?status=pending" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a DMP

คืน DMP หนึ่งแผน — สมาชิกของโปรเจกต์หรือ admin ไม่พบหรือไม่มีสิทธิ์จะได้ 404

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a DMP

แก้เนื้อหาแผน — **ได้เฉพาะเมื่อ `status` เป็น `draft`** ระหว่าง `pending` แก้ไม่ได้
(ได้ 409) ต้องรอผลตัดสิน ถูกปฏิเสธแล้ว status กลับเป็น `draft` จึงแก้ต่อได้ —
ตรงกับ workflow ใน requirement ที่ต้องแก้แล้วส่งใหม่ admin แก้ DMP นักวิจัยได้ตาม
สิทธิ์ระดับระบบ (ดู [Permissions](index.md#permissions-ภาพรวม)) การเปลี่ยน `status`
ด้วย endpoint นี้ไม่ได้ — การเข้าสู่ `pending` ทำผ่าน
[Submit a DMP for review](dmp-versions.md#submit-a-dmp-for-review)

### Body parameters

ส่ง field ใดก็ได้ที่ต้องการแก้ ไม่จำเป็นต้องส่งครบ:

- `title`, `description`, `language` (optional, string)
  ข้อมูลพื้นฐานของแผน

- `alternate_identifier`, `ethics`, `indigenous` (optional, string, nullable)
  ข้อมูลระดับแผนตาม DmpForm

- `begin_date`, `end_date` (optional, string, nullable)
  ช่วงเวลาของแผน (ISO date)

- `contributors`, `costs` (optional, array)
  รายการผู้เกี่ยวข้องและต้นทุน — ทับทั้ง array เดิม TODO: confirm โครงสร้างสมาชิก

Returns the updated DMP.

```bash
curl -X PATCH http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"description": "Weekly plan covering 12 weeks of experiments, testing and reporting.", "end_date": "2026-11-09"}'
```

## Delete a DMP

ลบ DMP — เจ้าของแผนหรือ admin เท่านั้น **ลบได้เฉพาะ `status: draft`**
แผนที่เคยถูกส่งพิจารณา (มี version) ลบไม่ได้เพื่อรักษาประวัติการตัดสิน ได้ 409

```bash
curl -X DELETE http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61 \
  -H "Authorization: Bearer YOUR_JWT"
```
