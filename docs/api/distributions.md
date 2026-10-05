# Distributions

ช่องทางเข้าถึงของ dataset หนึ่งชุด — URL เข้าถึง/ดาวน์โหลด, license และ (ถ้ามี)
ไฟล์ในระบบที่รองรับ หนึ่ง dataset มีได้หลาย distribution เช่น เผยแพร่ทั้งที่
repository ของมหาวิทยาลัยและ Zenodo คนละ URL คนละ license — ขอบเขตเดียวกับ
[Datasets](datasets.md): เก็บ "ทางเข้าถึง" เท่านั้น ไม่ใช่ตัวข้อมูล

## Endpoints

- [`POST /datasets/{dataset_id}/distributions`](#create-a-distribution)
- [`GET /datasets/{dataset_id}/distributions`](#list-a-datasets-distributions)
- [`GET /distributions/{distribution_id}`](#retrieve-a-distribution)
- [`PATCH /distributions/{distribution_id}`](#update-a-distribution)
- [`DELETE /distributions/{distribution_id}`](#delete-a-distribution)

## The distribution object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มี dataset อยู่ก่อน (ดู [Create a dataset](datasets.md#create-a-dataset))

### Request

```bash
curl http://localhost:3000/distributions/4f7d0b3a-9c58-4e26-b1d4-6a8c2e5f7b93 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "4f7d0b3a-9c58-4e26-b1d4-6a8c2e5f7b93",
  "dataset_id": "8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17",
  "file_id": null,
  "title": "University repository entry",
  "access_url": "https://repo.university.ac.th/datasets/2026-014",
  "download_url": "https://repo.university.ac.th/datasets/2026-014/download",
  "data_access": "open",
  "license": "CC-BY-4.0",
  "created_at": "2026-09-10T08:00:00Z",
  "updated_at": "2026-09-10T08:00:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุ distribution

- `dataset_id` (string)
  UUID ของ dataset ที่ distribution นี้เป็นช่องทางให้

- `file_id` (string, nullable)
  UUID ของ [File](files.md#the-file-object) ในระบบที่รองรับ distribution นี้ —
  ส่วนใหญ่แหล่งอ้างอิงชี้ไปภายนอก จึงมักเป็น `null`

- `title` (string)
  ชื่อเรียกช่องทางนี้ เช่น ชื่อ repository

- `access_url` (string)
  URL หน้าเข้าถึงข้อมูล — ใช้เมื่อผู้ใช้ต้องเข้าไปดู/ลงทะเบียนก่อน

- `download_url` (string, nullable)
  URL ดาวน์โหลดตรง — ถ้ามีช่องทางดาวน์โหลดตรงแยกจากหน้าเข้าถึง

- `data_access` (enum, TODO: confirm possible values)
  ระดับการเข้าถึงของช่องทางนี้ตาม DataAccess ใน ERD — ค่า enum ยังไม่ระบุใน
  er-0410.md (ตัวอย่างข้างบนใช้ `"open"` จากเดาตามบริบท)

- `license` (string, nullable)
  สัญญาอนุญาตของข้อมูลผ่านช่องทางนี้ เช่น `"CC-BY-4.0"`

- `created_at` (string)
  เวลาที่สร้าง (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

## Create a distribution

เพิ่มช่องทางเข้าถึงให้ dataset — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น
และได้เฉพาะเมื่อ DMP แม่ `status: draft` เงื่อนไขเดียวกับ
[Create a dataset](datasets.md#create-a-dataset)

### Body parameters

- `title` (required, string)
  ชื่อเรียกช่องทาง

- `access_url` (required, string)
  URL หน้าเข้าถึง ต้องเป็น URL ที่ถูกต้อง

- `download_url` (optional, string)
  URL ดาวน์โหลดตรง

- `data_access` (optional, enum)
  ระดับการเข้าถึง — ดู TODO ใน Attributes

- `license` (optional, string)
  สัญญาอนุญาต

- `file_id` (optional, string)
  ไฟล์ในระบบที่รองรับ — ต้องเป็นไฟล์ของโปรเจกต์เดียวกัน มิฉะนั้นได้ 400

Returns the created distribution.

```bash
curl http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17/distributions \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title": "University repository entry", "access_url": "https://repo.university.ac.th/datasets/2026-014", "license": "CC-BY-4.0"}'
```

## List a dataset's distributions

คืนช่องทางเข้าถึงทั้งหมดของ dataset — สมาชิกของโปรเจกต์หรือ admin
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/datasets/8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17/distributions" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a distribution

คืน distribution หนึ่งรายการ — สมาชิกของโปรเจกต์ที่ dataset สังกัด หรือ admin

```bash
curl http://localhost:3000/distributions/4f7d0b3a-9c58-4e26-b1d4-6a8c2e5f7b93 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a distribution

แก้ข้อมูลช่องทางเข้าถึง — เงื่อนไขสิทธิ์/สถานะเดียวกับ Create

### Body parameters

ส่ง field ใดก็ได้ที่ต้องการแก้ ไม่จำเป็นต้องส่งครบ:

- `title`, `access_url`, `download_url`, `license` (optional, string)
  ดูคำอธิบายใน Attributes

- `data_access` (optional, enum)
  ระดับการเข้าถึง

- `file_id` (optional, string, nullable)
  ไฟล์ในระบบที่รองรับ หรือ `null` เพื่อถอน

Returns the updated distribution.

```bash
curl -X PATCH http://localhost:3000/distributions/4f7d0b3a-9c58-4e26-b1d4-6a8c2e5f7b93 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"license": "CC-BY-SA-4.0"}'
```

## Delete a distribution

ลบช่องทางเข้าถึง — เงื่อนไขเดียวกับ Create (dataset แม่ยังอยู่ ไม่กระทบ dataset)

```bash
curl -X DELETE http://localhost:3000/distributions/4f7d0b3a-9c58-4e26-b1d4-6a8c2e5f7b93 \
  -H "Authorization: Bearer YOUR_JWT"
```
