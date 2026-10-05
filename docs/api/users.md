# Users

บัญชีผู้ใช้ของระบบ — นักวิจัย, กรรมการ, หัวหน้าโปรเจกต์ และผู้ดูแลระบบ
object นี้คือแกนกลางที่ทุก resource อื่นอ้างถึง (เจ้าของโปรเจกต์, ผู้อัปโหลดไฟล์,
ผู้รับ notification) role กำหนดสิทธิ์ระดับระบบ ดูภาพรวมได้ที่
[Permissions](index.md#permissions-ภาพรวม) และโควตา AI token อยู่กับ user
ไม่ใช่กับโปรเจกต์

## Endpoints

- [`GET /users`](#list-users)
- [`GET /users/{user_id}`](#retrieve-a-user)
- [`PATCH /users/{user_id}`](#update-a-user)

## The user object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

### Request

```bash
curl http://localhost:3000/users/9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30 \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "id": "9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30",
  "title": "Dr.",
  "name": "Arisa",
  "surname": "Wongchai",
  "email": "arisa.w@university.ac.th",
  "role": "researcher",
  "ai_token_limit": 200000,
  "ai_token_used": 73500,
  "created_at": "2026-08-01T04:00:00Z",
  "updated_at": "2026-09-19T16:40:00Z"
}
```

## Attributes

- `id` (string)
  UUID ระบุตัวตนของผู้ใช้

- `title` (string, nullable)
  คำนำหน้าชื่อ เช่น `"Dr."` — ไม่บังคับตอนสมัคร

- `name` (string)
  ชื่อจริง

- `surname` (string)
  นามสกุล

- `email` (string)
  อีเมลใช้เข้าสู่ระบบ ไม่ซ้ำกันในระบบ

- `role` (enum)
  Possible enum values:
  - `admin`
    ผู้ดูแลระบบ — เห็นและแก้ได้ทุกข้อมูล รวมถึงมอบหมาย role และโควตา AI
  - `chief`
    หัวหน้าโปรเจกต์ — จัดการโปรเจกต์และสมาชิกของโปรเจกต์ตัวเอง
  - `committee`
    กรรมการ — ตรวจและอนุมัติ/ปฏิเสธ DMP ติดตามความก้าวหน้า ไม่มีสิทธิ์ใช้ AI
  - `researcher`
    นักวิจัย — สร้างโปรเจกต์และ DMP อัปโหลดเอกสาร ใช้ AI ภายใต้โควตา

- `ai_token_limit` (integer)
  โควตา AI token สูงสุดของผู้ใช้ (สะสมทุกโปรเจกต์) — admin ตั้งค่าได้ เมื่อ `ai_token_used` ถึงค่านี้ การเรียก AI จะได้ 403

- `ai_token_used` (integer)
  จำนวน token ที่ใช้ไปแล้วสะสม อ่านอย่างเดียว — เพิ่มโดยอัตโนมัติทุกครั้งที่เรียก AI endpoints

- `created_at` (string)
  เวลาที่สร้างบัญชี (ISO 8601 UTC)

- `updated_at` (string)
  เวลาที่แก้ไขล่าสุด (ISO 8601 UTC)

## List users

คืนรายชื่อผู้ใช้ทั้งหมด **สำหรับ admin เท่านั้น** — ใช้ตอนเลือกกรรมการเข้าโปรเจกต์
หรือตั้งโควตา AI ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)
เรียงตาม `created_at` ใหม่สุดก่อน error สิทธิ์ดู [errors.md](errors.md)

### Query parameters

- `role` (optional, string)
  กรองตาม role เช่น `committee` — ค่าที่ไม่อยู่ใน enum จะได้ 400

- `q` (optional, string)
  ค้นหาแบบ substring ใน `name`, `surname` หรือ `email`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/users?role=committee&page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Retrieve a user

คืน object ผู้ใช้หนึ่งคน — admin ดูได้ทุกคน ผู้ใช้ทั่วไปดูได้เฉพาะตัวเอง
(ดูตัวเองสะดวกกว่าด้วย [`GET /auth/me`](auth.md#retrieve-the-current-user))
ไม่พบหรือไม่มีสิทธิ์จะได้ 404

```bash
curl http://localhost:3000/users/9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30 \
  -H "Authorization: Bearer YOUR_JWT"
```

## Update a user

แก้ข้อมูลผู้ใช้ — แต่ละ field มีกติกาสิทธิ์ต่างกัน: ผู้ใช้แก้โปรไฟล์ตัวเองได้
(`title`, `name`, `surname`), ส่วน `role` และ `ai_token_limit` **admin เท่านั้น**
ส่ง field ที่ไม่มีสิทธิ์จะได้ 403 เปลี่ยน role เป็นค่าที่ไม่มีจะได้ 400
ส่ง field ใดก็ได้ที่ต้องการแก้ ไม่จำเป็นต้องส่งครบ

### Body parameters

- `title` (optional, string)
  คำนำหน้าชื่อ — แก้ได้เมื่อเป็นตัวเองหรือ admin

- `name` (optional, string)
  ชื่อจริง — แก้ได้เมื่อเป็นตัวเองหรือ admin

- `surname` (optional, string)
  นามสกุล — แก้ได้เมื่อเป็นตัวเองหรือ admin

- `role` (optional, enum)
  มอบหมาย role ใหม่ (`admin | chief | committee | researcher`) — admin เท่านั้น

- `ai_token_limit` (optional, integer)
  ตั้งโควตา AI token — admin เท่านั้น ค่าต้องเป็นจำนวนเต็มบวก

```bash
curl -X PATCH http://localhost:3000/users/9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"role": "committee", "ai_token_limit": 300000}'
```
