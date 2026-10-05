# Project members

ความสัมพันธ์ "ใครอยู่โปรเจกต์ไหน ในบทบาทอะไร" — สิทธิ์ส่วนใหญ่ของระบบ (อ่าน DMP,
อนุมัติ, อัปโหลด) ตรวจจากความเป็นสมาชิกนี้ ไม่ใช่จาก role ระดับระบบเพียงอย่างเดียว
คู่ `(project_id, user_id)` ต้องไม่ซ้ำกันในโปรเจกต์เดียวกัน — เพิ่มซ้ำได้ 409
(ข้อนี้เป็น contract ใหม่ที่ ERD ยังไม่มี — ดู er-0410.md หมายเหตุเรื่อง uniqueness)

## Endpoints

- [`POST /projects/{project_id}/members`](#add-a-member)
- [`GET /projects/{project_id}/members`](#list-members)
- [`PATCH /projects/{project_id}/members/{user_id}`](#update-a-member)
- [`DELETE /projects/{project_id}/members/{user_id}`](#remove-a-member)

## The member object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: มีโปรเจกต์อยู่ก่อน (ดู [Create a project](projects.md#create-a-project))
และมีบัญชีผู้ใช้ที่จะเพิ่ม (ดู [Users](users.md))

### Request

```bash
curl http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/members \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "data": [
    {
      "project_id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
      "user_id": "9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30",
      "project_role": "researcher",
      "user": {
        "id": "9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30",
        "title": "Dr.",
        "name": "Arisa",
        "surname": "Wongchai",
        "email": "arisa.w@university.ac.th"
      }
    },
    {
      "project_id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
      "user_id": "e4c1a8f2-7d36-4b95-8a0e-3f6b9c2d5a81",
      "project_role": "committee",
      "user": {
        "id": "e4c1a8f2-7d36-4b95-8a0e-3f6b9c2d5a81",
        "title": "Prof. Dr.",
        "name": "Somchai",
        "surname": "Prasert",
        "email": "somchai.p@university.ac.th"
      }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 4
}
```

## Attributes

- `project_id` (string)
  UUID ของโปรเจกต์

- `user_id` (string)
  UUID ของสมาชิก

- `project_role` (enum)
  Possible enum values:
  - `researcher`
    ผู้ดำเนินงานวิจัยของโปรเจกต์ — สร้าง/แก้ DMP และอัปโหลดเอกสาร
  - `committee`
    กรรมการของโปรเจกต์ — ตรวจและอนุมัติ/ปฏิเสธ DMP ทุก version
  - `chief`
    หัวหน้าโปรเจกต์ — จัดการสมาชิกและข้อมูลโปรเจกต์

- `user` (MemberUser object)
  ข้อมูลผู้ใช้แบบย่อ embed มาให้แสดงผลได้ทันทีโดยไม่ต้องเรียก Users เพิ่ม

### MemberUser object

- `id` (string)
  UUID ของผู้ใช้

- `title` (string, nullable)
  คำนำหน้าชื่อ

- `name` (string)
  ชื่อจริง

- `surname` (string)
  นามสกุล

- `email` (string)
  อีเมลของผู้ใช้

## Add a member

เพิ่มผู้ใช้เข้าโปรเจกต์ — chief ของโปรเจกต์หรือ admin เท่านั้น
workflow ทั่วไปคือ researcher ขอให้ admin/chief เพิ่มกรรมการเข้าโปรเจกต์
เพื่อให้ทุกคนมีสิทธิ์อนุมัติ DMP คู่ `(project_id, user_id)` ซ้ำได้ 409
ไม่พบ `user_id` ได้ 404

### Body parameters

- `user_id` (required, string)
  UUID ของผู้ใช้ที่จะเพิ่ม

- `project_role` (required, enum)
  บทบาทในโปรเจกต์ `researcher | committee | chief` — ต่างจาก role ระดับระบบ
  คนเป็น `committee` ในโปรเจกต์นี้อาจเป็น `researcher` ในโปรเจกต์อื่นได้

Returns the created member object.

```bash
curl http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/members \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "e4c1a8f2-7d36-4b95-8a0e-3f6b9c2d5a81", "project_role": "committee"}'
```

## List members

คืนสมาชิกทั้งหมดของโปรเจกต์ — สมาชิกของโปรเจกต์หรือ admin เรียกได้
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `project_role` (optional, enum)
  กรองตามบทบาท เช่น ดึงเฉพาะ `committee` เพื่อแสดงสถานะการอนุมัติรายคน

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/members?project_role=committee" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a member

เปลี่ยนบทบาทของสมาชิกในโปรเจกต์ — chief ของโปรเจกต์หรือ admin เท่านั้น
เปลี่ยนบทบาทของตัวเองไม่ได้ (กันลดสิทธิ์ตัวเองจนจัดการโปรเจกต์ไม่ได้) ได้ 409

### Body parameters

- `project_role` (required, enum)
  บทบาทใหม่ `researcher | committee | chief`

Returns the updated member object.

```bash
curl -X PATCH http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/members/9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"project_role": "chief"}'
```

## Remove a member

ถอนสมาชิกออกจากโปรเจกต์ — chief ของโปรเจกต์หรือ admin เท่านั้น
ถอนกรรมการที่ยังตัดสิน DMP version ที่ `pending` อยู่ไม่ได้ จะได้ 409
(มิฉะนั้นการนับ "อนุมัติครบทุกคน" จะเข้าใจผิดได้) — ต้องรอ version นั้นจบก่อน

```bash
curl -X DELETE http://localhost:3000/projects/6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74/members/e4c1a8f2-7d36-4b95-8a0e-3f6b9c2d5a81 \
  -H "Authorization: Bearer YOUR_JWT"
```
