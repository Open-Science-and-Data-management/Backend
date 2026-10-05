# DMP versions

รอบการส่งและการตัดสินของ DMP — หัวใจของ workflow อนุมัติตาม requirement:
ผู้วิจัย submit → เกิด version ใหม่ `pending` → **กรรมการทุกคนของโปรเจกต์ต้อง approve**
→ version ผ่านและกลายเป็น `active_version` แต่ถ้ามีใคร reject แม้คนเดียว
version นั้นจบที่ `rejected` ทันที นักวิจัยได้รับแจ้งให้แก้ แล้วแก้ต่อใน
`status: draft` และ submit ใหม่ — การอนุมัติชุดใหม่เริ่มนับใหม่ทั้งหมดทุกครั้ง
version ใช้หมายเลข revision ต่อ DMP (1, 2, 3, …) ไม่ใช่ UUID

## Endpoints

- [`GET /dmps/{dmp_id}/versions`](#list-versions)
- [`GET /dmps/{dmp_id}/versions/{number}`](#retrieve-a-version)
- [`POST /dmps/{dmp_id}/submit`](#submit-a-dmp-for-review)
- [`POST /dmps/{dmp_id}/versions/{number}/approve`](#approve-a-dmp-version)
- [`POST /dmps/{dmp_id}/versions/{number}/reject`](#reject-a-dmp-version)

## The version object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มี DMP อยู่ก่อน และถูก submit อย่างน้อยหนึ่งครั้ง
(ดู [Submit a DMP for review](#submit-a-dmp-for-review))

### Request

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions/3 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "dmp_id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
  "number": 3,
  "status": "approved",
  "edit_type": "major",
  "changes": {
    "summary": "Rescheduled tensile testing to weeks 6-7; added composting trial.",
    "fields_changed": ["description", "end_date"]
  },
  "snapshot": {
    "title": "Data Management Plan — Biodegradable Packaging Film",
    "description": "Weekly plan covering 12 weeks of experiments, testing and reporting.",
    "datasets": ["8e4a1c6f-7b25-4d93-a5e8-0c3f6d9b2a17"]
  },
  "created_at": "2026-09-15T07:20:00Z",
  "decided_at": "2026-09-18T09:15:00Z",
  "decided_by": "e4c1a8f2-7d36-4b95-8a0e-3f6b9c2d5a81",
  "note": null
}
```

## Attributes

- `dmp_id` (string)
  UUID ของ DMP ที่ version นี้เป็นของ

- `number` (integer)
  หมายเลข revision เพิ่มทีละ 1 ต่อการ submit หนึ่งครั้ง เริ่มที่ 1 — ใช้เป็น key ใน path แทน UUID

- `status` (enum)
  Possible enum values:
  - `pending`
    รอกรรมการตัดสิน — นับ approval ที่ละคนอยู่
  - `approved`
    อนุมัติครบทุกคนแล้ว — version นี้คือ `active_version` ของ DMP
  - `rejected`
    ถูกปฏิเสธ — มีกรรมการ reject อย่างน้อยหนึ่งคน นักวิจัยต้องแก้และ submit ใหม่

- `edit_type` (enum)
  Possible enum values:
  - `minor`
    แก้เล็กน้อย เช่น ข้อความ วันที่
  - `major`
    เปลี่ยนโครงสร้างแผน เช่น เพิ่ม/ลบสัปดาห์ งาน หรือ dataset — TODO: confirm เกณฑ์กำหนด minor/major (ผู้ใช้เลือกเองตอน submit)

- `changes` (map)
  สรุปสิ่งที่เปลี่ยนจาก version ก่อน — โครงสร้างอิสระ (json) เก็บไว้ให้กรรมการกวาดตาเห็นจุดที่แก้ได้เร็ว

- `snapshot` (map)
  สำเนาเนื้อหาแผน ณ วัน submit ทั้งก้อน (json) — ทำให้ version เก่าย้อนดูได้แม้ DMP ปัจจุบันถูกแก้ไปแล้ว

- `created_at` (string)
  เวลาที่ submit (ISO 8601 UTC)

- `decided_at` (string, nullable)
  เวลาที่ตัดสินจบ (อนุมัติครบ หรือถูกปฏิเสธ) — `null` ขณะยัง `pending`

- `decided_by` (string, nullable)
  UUID ของกรรมการคนที่ทำให้ผลจบ — approve คนสุดท้าย หรือคนที่ reject; `null` ขณะ `pending`

- `note` (string, nullable)
  เหตุผลการปฏิเสธจากกรรมการ — มีค่าเฉพาะตอน reject ใช้เป็นสิ่งที่นักวิจัยอ่านเพื่อแก้

## List versions

ประวัติการส่งทั้งหมดของ DMP เรียงตาม `number` มากไปน้อย — สมาชิกของโปรเจกต์
หรือ admin เรียกได้ ผลลัพธ์ห่อใน
[list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `status` (optional, enum)
  กรองตามสถานะ `pending | approved | rejected`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a version

คืน version ตามหมายเลข — สมาชิกของโปรเจกต์หรือ admin
ไม่พบหมายเลขนี้ใน DMP นี้ได้ 404

```bash
curl http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions/3 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Submit a DMP for review

ส่งแผนให้กรรมการพิจารณา — researcher ของโปรเจกต์ (หรือ admin) เท่านั้น
ต้องเรียกเมื่อ DMP `status: draft` (รวมกรณีแก้หลังถูกปฏิเสธ) — เรียกซ้ำตอน
`pending` ได้ 409 ผลคือ:

- เกิด version ใหม่ หมายเลขถัดไป สถานะ `pending` พร้อม `snapshot` ของเนื้อหา ณ ตอนนั้น
- DMP เปลี่ยนเป็น `status: pending`
- กรรมการทุกคนของโปรเจกต์ได้ notification `dmp_submitted`;
  ถ้าเป็นการส่งหลังถูกปฏิเสธ กรรมการได้ `dmp_resubmitted` แทน

Returns the newly created pending version.

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/submit \
  -H "Authorization: Bearer YOUR_JWT"
```

## Approve a DMP version

กรรมการของโปรเจกต์กดอนุมัติ version ที่ `pending` — ตัดสินซ้ำโดยคนเดิมได้ 409
ทุกครั้งที่อนุมัติ นักวิจัยได้ notification `dmp_member_approved`
(รูปแบบ "2 of 3 approvals collected") เมื่ออนุมัติครบ **ทุกคน** ในโปรเจกต์:

- version เปลี่ยนเป็น `approved` พร้อม `decided_at` และ `decided_by` ของคนอนุมัติคนสุดท้าย
- DMP เปลี่ยนเป็น `status: approved` และ `active_version` = หมายเลขนี้
- นักวิจัยได้ notification `dmp_finalized`

ไม่มีพารามิเตอร์ — ตัวตนของผู้อนุมัติมาจาก token

Returns the updated version.

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions/3/approve \
  -H "Authorization: Bearer YOUR_JWT"
```

## Reject a DMP version

กรรมการปฏิเสธ version ที่ `pending` — ทำให้ version จบที่ `rejected` **ทันที**
แม้ยังไม่ครบทุกคน กรรมการคนอื่นตัดสินต่อไม่ได้ (ได้ 409 ถ้าเรียกหลัง version จบแล้ว)
ผลคือ:

- version เป็น `rejected` พร้อม `decided_at`, `decided_by` และ `note`
- DMP กลับเป็น `status: draft` — นักวิจัยแก้ไขได้ทันที
- นักวิจัยได้ notification `dmp_rejected` พร้อม `note` ที่กรรมการเขียน

### Body parameters

- `note` (required, string)
  เหตุผลที่ปฏิเสธ — นักวิจัยใช้ข้อความนี้เป็นสิ่งที่ต้องแก้ก่อนส่งใหม่ ห้ามว่าง

Returns the updated version.

```bash
curl -X POST http://localhost:3000/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions/3/reject \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"note": "Week 6 lacks detail on sample size justification. Please revise and resubmit."}'
```
