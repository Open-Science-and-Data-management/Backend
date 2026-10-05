# Datasets

แหล่งอ้างอิงข้อมูลของงานวิจัย — **เป็นบันทึกของ "แหล่งที่มา" เท่านั้น ไม่ใช่ที่เก็บข้อมูลจริง**
เหมือนการอ้างอิง (citation) ว่าแผนนี้ใช้/ผลิตข้อมูลชุดใด จากไหน เข้าถึงอย่างไร
การเข้าถึงตัวข้อมูลทำผ่าน [Distribution](distributions.md) ซึ่งเก็บ URL ปลายทาง
ขอบเขตนี้ตกลงกันใน draft นี้แล้ว (ไม่มีการโหลดข้อมูลมาเก็บในระบบ)
dataset เป็นข้อมูลลูกของ DMP — ตาม RDA DMP Common Standard ที่ระบบอ้างอิง

## Endpoints

- [`POST /dmps/{dmp_id}/datasets`](#create-a-dataset)
- [`GET /dmps/{dmp_id}/datasets`](#list-a-dmps-datasets)
- [`GET /datasets/{dataset_id}`](#retrieve-a-dataset)
- [`PATCH /datasets/{dataset_id}`](#update-a-dataset)
- [`DELETE /datasets/{dataset_id}`](#delete-a-dataset)

## The dataset object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มี DMP อยู่ก่อน (ดู [Create a DMP](dmps.md#create-a-dmp))

### Request

```bash
curl http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17",
  "dmp_id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
  "type": "raw",
  "title": "Tensile test measurements — cassava starch films",
  "status": "collected",
  "access": "open",
  "preservation": {
    "retention_period": 5,
    "storage_location": "University research data repository"
  },
  "domain_metadata": {
    "discipline": "materials-science",
    "keywords": ["biodegradable", "cassava starch"]
  },
  "created_at": "2026-08-05T06:00:00Z",
  "updated_at": "2026-09-10T08:00:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุ dataset

- `dmp_id` (string)
  UUID ของ DMP ที่ dataset นี้ถูกอ้างถึง

- `type` (enum)
  Possible enum values:
  - `raw`
    ข้อมูลดิบที่เก็บ/วัดได้จากการทดลอง
  - `software`
    โค้ดหรือซอฟต์แวร์ที่ใช้/ผลิตในงาน
  - `publication`
    บทความหรือเอกสารตีพิมพ์ที่เกี่ยวข้อง
  - `other`
    แหล่งอ้างอิงอื่นที่ไม่เข้าพวงข้างต้น

- `title` (string)
  ชื่อเรียกชุดข้อมูล/แหล่งอ้างอิง

- `status` (enum, TODO: confirm possible values)
  สถานะของชุดข้อมูลตาม DatasetStatus ใน ERD — ค่า enum ยังไม่ระบุใน er-0410.md ต้องตกลงร่วมกับ frontend ก่อน implement (ตัวอย่างข้างบนใช้ `"collected"` จากเดาตามบริบท)

- `access` (enum, TODO: confirm possible values)
  ระดับการเข้าถึงข้อมูลตาม DataAccess ใน ERD — ค่า enum ยังไม่ระบุใน er-0410.md (ตัวอย่างข้างบนใช้ `"open"` จากเดาตามบริบท)

- `preservation` (map)
  แผนการเก็บรักษาอ้างอิง — โครงสร้างอิสระ (json) เช่น ระยะเวลาเก็บ สถานที่เก็บตามที่แผนระบุ

- `domain_metadata` (map)
  metadata เฉพาะสาขา — โครงสร้างอิสระ (json) เช่น สาขาวิชา คำสำคัญ

- `created_at` (string)
  เวลาที่สร้าง (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

## Create a dataset

เพิ่มแหล่งอ้างอิงเข้า DMP — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น
และได้เฉพาะเมื่อ DMP `status: draft` (แผนที่ `pending`/`approved` แก้รายการ
dataset ไม่ได้ ต้อง submit version ใหม่)

### Body parameters

- `type` (required, enum)
  ประเภทแหล่งอ้างอิง `raw | software | publication | other`

- `title` (required, string)
  ชื่อชุดข้อมูล ห้ามเป็นค่าว่าง

- `status` (optional, enum)
  สถานะของชุดข้อมูล — ดู TODO ใน Attributes

- `access` (optional, enum)
  ระดับการเข้าถึง — ดู TODO ใน Attributes

- `preservation`, `domain_metadata` (optional, map)
  ข้อมูลเสริมตามโครงสร้างที่ frontend ใช้

Returns the created dataset.

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/datasets \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"type": "raw", "title": "Tensile test measurements — cassava starch films"}'
```

## List a DMP's datasets

คืนแหล่งอ้างอิงทั้งหมดของ DMP — สมาชิกของโปรเจกต์หรือ admin
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `type` (optional, enum)
  กรองตามประเภท `raw | software | publication | other`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/datasets" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a dataset

คืน dataset หนึ่งรายการ — สมาชิกของโปรเจกต์ที่ DMP สังกัด หรือ admin
ไม่พบหรือไม่มีสิทธิ์จะได้ 404

```bash
curl http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a dataset

แก้ข้อมูลแหล่งอ้างอิง — researcher ของโปรเจกต์ (หรือ admin) และได้เฉพาะเมื่อ
DMP `status: draft` เงื่อนไขเดียวกับ [Create a dataset](#create-a-dataset)

### Body parameters

ส่ง field ใดก็ได้ที่ต้องการแก้ ไม่จำเป็นต้องส่งครบ:

- `type`, `title`, `status`, `access` (optional)
  ดูคำอธิบายใน Attributes

- `preservation`, `domain_metadata` (optional, map)
  ทับ object เดิมทั้งก้อน

Returns the updated dataset.

```bash
curl -X PATCH http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"access": "open"}'
```

## Delete a dataset

ลบแหล่งอ้างอิงออกจาก DMP — เงื่อนไขสิทธิ์/สถานะเดียวกับ Update
ถ้า [Task](tasks.md) ยังอ้างถึง dataset นี้อยู่ (`dataset_id`) ลบไม่ได้ ได้ 409

```bash
curl -X DELETE http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17 \
  -H "Authorization: Bearer YOUR_JWT"
```
