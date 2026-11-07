# Users

Intros นี้ครอบทรัพยากร `users` — การสมัครบัญชีใหม่ (register), การตรวจว่า username ว่างอยู่หรือไม่, และการอ่าน/แก้ไขโปรไฟล์ของผู้ใช้ที่ sign-in อยู่ (`/me`) ทุก endpoint อยู่ภายใต้ AuthGuard ระดับ global โดย route ที่เปิดให้ใช้ได้โดยไม่ต้อง sign-in (register และ username-available) จะมี `@Public()` ประกาศไว้ชัดเจน ส่วน `/me` ต้องแนบ Bearer access token ทุกครั้ง

### Endpoints

- [$\color{green}{\textsf{POST}}$ /users](#register-a-user) — Register a user (และ sign-in ทันที)
- [$\color{blue}{\textsf{GET}}$ /users/username-available](#check-username-availability) — Check username availability
- [$\color{blue}{\textsf{GET}}$ /me](#retrieve-me) — Retrieve the signed-in user
- [$\color{lime}{\textsf{PATCH}}$ /me](#update-me) — Update the signed-in user's profile

### Authentication

- **Signed-in routes** (`GET /me`, `PATCH /me`) — ต้องส่ง header `Authorization: Bearer <access token>` access token มาจาก sign-in/refresh หากไม่มี token จะได้ `401 not_signed_in` และถ้า token หมดอายุจะได้ `401 token_expired`
- **Public routes** (`POST /users`, `GET /users/username-available`) — ประกาศ `@Public()` จึงข้าม guard ได้โดยไม่ต้องมี token
- **Refresh token** — ไม่ได้อยู่ใน response body แต่ถูก set เป็น cookie `refresh_token` (`HttpOnly`, `SameSite=Strict`, `Path=/auth`, เพิ่ม `Secure` เมื่อ request เป็น https) ใช้สำหรับ refresh session ผ่าน `/auth/refresh`

### The User object

```json
{
  "object": "user",
  "user_id": "01946d3f-6a1e-7c2a-9b3d-4f1e8a2c5d70",
  "title": "Dr.",
  "name": "Somchai",
  "surname": "Jaidee",
  "email": "somchai@example.ac.th",
  "role": "researcher",
  "username": "somchai.j",
  "ai_token_limit": 100000,
  "ai_token_used": 1234,
  "account_type": "institutional",
  "phone": "+66812345678",
  "orcid": "0000-0002-1825-0097",
  "affiliation": {
    "organization": "Chulalongkorn University",
    "department": "Computer Engineering",
    "position": "Lecturer"
  },
  "address": null
}
```

> [!NOTE] Reconstructed from code (`toUserResponse` ใน users.repository.ts และ userSchema) รหัสผ่าน (password hash) ไม่เด็ดขาดที่จะไม่ถูกส่งออกทาง object นี้

#### Attributes

- **object** (string, required) ชนิดของ object เสมอเป็น `user`
- **user_id** (string, required) UUID ประจำตัวผู้ใช้ ใช้เป็น `sub` ใน access token
- **title** (string, nullable) คำนำหน้าชื่อ เช่น `Dr.` เป็น `null` หากผู้ใช้ไม่ได้กรอก
- **name** (string, required) ชื่อจริง
- **surname** (string, required) นามสกุล
- **email** (string, required) อีเมล ถูก normalize (trim + lowercase) ก่อนบันทึก และบังคับ unique ที่ระดับ DB (`users_email_normalized_uq`)
- **role** (string, required) บทบาทของผู้ใช้ในระบบ กำหนดโดยสถาบัน ผู้ใช้แก้เองไม่ได้

  | Value        | Description                                                              |
  | ------------ | ------------------------------------------------------------------------ |
  | `admin`      | ผู้ดูแลระบบของสถาบัน สิทธิสูงสุด                                           |
  | `chief`      | หัวหน้าโครงการ ดูแลและตัดสินงานในโครงการของตน                              |
  | `committee`  | กรรมการซึ่งอนุมัติแผนของนักวิจัยสถาบัน                                      |
  | `researcher` | นักวิจัยทั่วไป — บทบาทเดียวที่สมัครบัญชีเองได้ (OC-1)                       |

- **username** (string, required) ชื่อผู้ใช้สำหรับ sign-in 3–30 ตัวอักษร ตัวพิมพ์เล็ก ตัวเลข `.` `-` `_` เท่านั้น unique ที่ระดับ DB
- **ai_token_limit** (integer, required) โควตา AI token สูงสุดต่อบัญชี กำหนดโดยเซิร์ฟเวอร์ (อ่านจริงผ่าน quota endpoint)
- **ai_token_used** (integer, required) จำนวน token ที่ใช้ไปแล้ว ค่าเริ่มต้น `0`
- **account_type** (string, nullable) ลักษณะการสมัครของผู้ใช้ เป็น `null` ได้สำหรับบัญชี seed/เก่า

  | Value           | Description                                                        |
  | --------------- | ------------------------------------------------------------------ |
  | `institutional` | นักวิจัยสังกัดองค์กร ต้องระบุ `affiliation` — แผนของผู้นี้ให้กรรมการอนุมัติ |
  | `citizen`       | นักวิจัยภาคประชาชน ไม่มีสังกัด อาจให้ `address` ของตนเองได้              |

- **phone** (string, nullable) เบอร์โทรรูปแบบ `+?[\d\s-]{9,15}` เป็น `null` หากไม่ได้กรอก
- **orcid** (string, nullable) ORCID iD รูปแบบ `0000-0002-1825-0097` เป็น `null` หากไม่ได้กรอก
- **affiliation** (object, nullable) สังกัดของนักวิจัยสถาบัน มีเฉพาะเมื่อ `account_type` เป็น `institutional` เป็น `null` สำหรับ citizen researcher

  - **organization** (string, required) ชื่อองค์กรที่สังกัด
  - **department** (string, optional) ภาควิชา/ฝ่าย
  - **position** (string, optional) ตำแหน่งในองค์กร

- **address** (string, nullable) ที่อยู่ของนักวิจัยภาคประชาชน (ถ้าให้ไว้) เป็น `null` สำหรับนักวิจัยสถาบัน

### Error format

ทุก error ออกในรูป envelope เดียวกัน:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "field_invalid",
    "param": "/email",
    "message": "Enter a valid email address"
  }
}
```

> [!NOTE] Reconstructed from code (`ApiError` + `ErrorEnvelopeFilter`) — `type` มาจาก HTTP status (เช่น 400 → `invalid_request_error`, 409 → `conflict_error`) และ `param` มีเฉพาะเมื่อ error ระบุจุดที่ผิด

---

## Register a user

$\color{green}{\textsf{POST}}$ /users

สมัครบัญชีนักวิจัยใหม่ (`@Public()` — ไม่ต้อง sign-in) สมัครได้เฉพาะบทบาท `researcher` — หาก body แนบ field `role` มาด้วยจะถูกปฏิเสธทันทีด้วย `400 role_not_allowed` เพราะบทบาทอื่นสถาบันเป็นผู้สร้างให้ (OC-1) สำเร็จแล้วจะ sign-in ทันที: response เป็น session object พร้อม access token และมีการ set cookie `refresh_token` กลับมา

นักวิจัย `institutional` ต้องกรอก `organization` (สังกัด) ส่วน `citizen` ไม่มีสังกัด และ `confirm_password` ต้องตรงกับ `password`

#### Request

```curl
curl http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "account_type": "institutional",
    "title": "Dr.",
    "name": "Somchai",
    "surname": "Jaidee",
    "email": "somchai@example.ac.th",
    "phone": "+66812345678",
    "orcid": "0000-0002-1825-0097",
    "organization": "Chulalongkorn University",
    "department": "Computer Engineering",
    "position": "Lecturer",
    "username": "somchai.j",
    "password": "Secret123",
    "confirm_password": "Secret123"
  }'
```

#### Parameters

- **account_type** (string, required) ลักษณะการสมัคร

  | Value           | Description                                              |
  | --------------- | -------------------------------------------------------- |
  | `institutional` | นักวิจัยสังกัดองค์กร — บังคับกรอก `organization`              |
  | `citizen`       | นักวิจัยภาคประชาชน — ไม่กรอกสังกัด อาจกรอก `address` แทน     |

- **title** (string, optional) คำนำหน้าชื่อ ค่าว่างจะถูกแปลงเป็นไม่มี (`null`)
- **name** (string, required) ชื่อจริง อย่างน้อย 1 ตัวอักษรหลัง trim
- **surname** (string, required) นามสกุล อย่างน้อย 1 ตัวอักษรหลัง trim
- **email** (string, required) อีเมลที่ถูกต้อง ถูก normalize (trim + lowercase) ก่อนเช็คซ้ำและบันทึก
- **phone** (string, optional) รูปแบบ `+?[\d\s-]{9,15}` เช่น `+66812345678`
- **orcid** (string, optional) ORCID iD รูปแบบ `0000-0002-1825-0097`
- **organization** (string, required เมื่อ `account_type` เป็น `institutional`) ชื่อองค์กรที่สังกัด — ขาดไปจะ validation fail
- **department** (string, optional) ภาควิชา/ฝ่าย
- **position** (string, optional) ตำแหน่งในองค์กร
- **address** (string, optional) ที่อยู่ของผู้สมัคร (ส่วนใหญ่ใช้กับ `citizen`)
- **username** (string, required) 3–30 ตัวอักษร ถูก trim และ lowercase ก่อนบันทึก อนุญาตเฉพาะ `/^[a-z0-9._-]+$/`
- **password** (string, required) อย่างน้อย 8 ตัวอักษร ต้องมีทั้งตัวอักษรและตัวเลข ถูก hash ด้วย argon2 ก่อนเก็บ — ไม่มีทางออกจากระบบเป็น plaintext
- **confirm_password** (string, required) ต้องตรงกับ `password` มิฉะนั้น validation fail ที่ `param: /confirm_password`

> หมายเหตุ — หาก body มี field `role` แม้ค่าจะถูก ก็ถูกปฏิเสธก่อน validation (`400 role_not_allowed`)

#### Response

```json
{
  "object": "session",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTk0NmQzZi02YTFlLTdjMmEtOWIzZC00ZjFlOGEyYzVkNzAiLCJ1c2VybmFtZSI6InNvbWNoYWkuaiIsInJvbGUiOiJyZXNlYXJjaGVyIn9.x",
  "token_type": "Bearer",
  "expires_at": "2026-11-08T12:30:00.000Z",
  "user": {
    "object": "user",
    "user_id": "01946d3f-6a1e-7c2a-9b3d-4f1e8a2c5d70",
    "title": "Dr.",
    "name": "Somchai",
    "surname": "Jaidee",
    "email": "somchai@example.ac.th",
    "role": "researcher",
    "username": "somchai.j",
    "ai_token_limit": 100000,
    "ai_token_used": 0,
    "account_type": "institutional",
    "phone": "+66812345678",
    "orcid": "0000-0002-1825-0097",
    "affiliation": {
      "organization": "Chulalongkorn University",
      "department": "Computer Engineering",
      "position": "Lecturer"
    },
    "address": null
  }
}
```

> [!NOTE] Reconstructed from code (`buildSession` + `toUserResponse`) พร้อมกับ body นี้ เซิร์ฟเวอร์ set header `Set-Cookie: refresh_token=…; Path=/auth; HttpOnly; SameSite=Strict; Expires=…`

#### Returns

Returns a **session** object (`object: "session"`) ที่ sign-in สำเร็จทันที พร้อม **user** object ของบัญชีใหม่

#### Errors

| Status | When it happens                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 400    | Body แนบ field `role` (`role_not_allowed`), validation ล้มเหลว (`field_invalid` พร้อม JSON pointer ใน `param`) |
| 409    | `username` ถูกใช้แล้ว (`username_taken`), อีเมลถูกบัญชีอื่นใช้ (`email_taken`)                              |

---

## Check username availability

$\color{blue}{\textsf{GET}}$ /users/username-available

เช็คว่า username ว่างอยู่หรือไม่ (`@Public()` — ไม่ต้อง sign-in) ใช้ก่อนสมัครบัญชีเพื่อ validate ล่วงหน้า username จะถูก trim และ lowercase ก่อนเช็ค ผลลัพธ์สอดคล้องกับเงื่อนไข unique เดียวกับตอน register

#### Request

```curl
curl "http://localhost:3000/users/username-available?username=somchai.j"
```

#### Parameters

- **username** (string, required) ชื่อผู้ใช้ที่ต้องการเช็ค ส่งเป็น query string — ถ้าไม่ส่งมาจะได้ `400 parameter_missing` พร้อม `param: /username`

#### Response

```json
{
  "object": "username_availability",
  "username": "somchai.j",
  "available": true
}
```

> [!NOTE] Reconstructed from code

#### Returns

Returns an object `object: "username_availability"` โดย **username** เป็นค่าที่ normalize แล้ว (trim + lowercase) และ **available** เป็น `true` เมื่อยังไม่มีใครใช้

#### Errors

| Status | When it happens                                        |
| ------ | ------------------------------------------------------ |
| 400    | ไม่ได้ส่ง query `username` (`parameter_missing`)         |

---

## Retrieve me

$\color{blue}{\textsf{GET}}$ /me

ดึงโปรไฟล์ของผู้ใช้ที่ sign-in อยู่ ต้องส่ง Bearer access token ตัวตนของผู้ใช้มาจาก JWT subject (`sub`) ไม่ใช่จาก body — client จึงปลอม username ของผู้อื่นไม่ได้

#### Request

```curl
curl http://localhost:3000/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
```

#### Parameters

ไม่มี parameter

#### Response

```json
{
  "object": "user",
  "user_id": "01946d3f-6a1e-7c2a-9b3d-4f1e8a2c5d70",
  "title": "Dr.",
  "name": "Somchai",
  "surname": "Jaidee",
  "email": "somchai@example.ac.th",
  "role": "researcher",
  "username": "somchai.j",
  "ai_token_limit": 100000,
  "ai_token_used": 1234,
  "account_type": "institutional",
  "phone": "+66812345678",
  "orcid": "0000-0002-1825-0097",
  "affiliation": {
    "organization": "Chulalongkorn University",
    "department": "Computer Engineering",
    "position": "Lecturer"
  },
  "address": null
}
```

> [!NOTE] Reconstructed from code

#### Returns

Returns the **User** object ของผู้ใช้ที่ sign-in อยู่

#### Errors

| Status | When it happens                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 401    | ไม่ได้แนบ `Authorization` header (`not_signed_in`) หรือ token หมดอายุ (`token_expired`) |

---

## Update me

$\color{lime}{\textsf{PATCH}}$ /me

แก้ไขโปรไฟล์ของผู้ใช้ที่ sign-in อยู่ แก้ได้เฉพาะ 4 field: `title`, `name`, `surname`, `email` — `role` และโควตา AI แก้ผ่าน endpoint นี้ไม่ได้ (สถาบันเป็นผู้กำหนด) ก่อนบันทึกจะเช็คว่าอีเมลใหม่ไม่ซ้ำกับบัญชีอื่น แล้วจึงอัปเดตใน transaction เดียว

#### Request

```curl
curl -X PATCH http://localhost:3000/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Assoc. Prof.",
    "name": "Somchai",
    "surname": "Jaidee",
    "email": "somchai.jaidee@example.ac.th"
  }'
```

#### Parameters

- **title** (string, optional) คำนำหน้าชื่อใหม่ ค่าว่างหลัง trim จะถูกบันทึกเป็น `null`
- **name** (string, required) ชื่อจริงใหม่ อย่างน้อย 1 ตัวอักษรหลัง trim
- **surname** (string, required) นามสกุลใหม่ อย่างน้อย 1 ตัวอักษรหลัง trim
- **email** (string, required) อีเมลใหม่ ต้องเป็นรูปแบบอีเมลที่ถูกต้อง และห้ามซ้ำกับบัญชีอื่น (ซ้ำตัวเองได้)

#### Response

```json
{
  "object": "user",
  "user_id": "01946d3f-6a1e-7c2a-9b3d-4f1e8a2c5d70",
  "title": "Assoc. Prof.",
  "name": "Somchai",
  "surname": "Jaidee",
  "email": "somchai.jaidee@example.ac.th",
  "role": "researcher",
  "username": "somchai.j",
  "ai_token_limit": 100000,
  "ai_token_used": 1234,
  "account_type": "institutional",
  "phone": "+66812345678",
  "orcid": "0000-0002-1825-0097",
  "affiliation": {
    "organization": "Chulalongkorn University",
    "department": "Computer Engineering",
    "position": "Lecturer"
  },
  "address": null
}
```

> [!NOTE] Reconstructed from code

#### Returns

Returns the updated **User** object

#### Errors

| Status | When it happens                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Validation ล้มเหลว — `email_invalid` เมื่ออีเมลไม่ถูกต้อง หรือ `name_required` สำหรับ field ชื่อ/นามสกุล (code เลือกจาก field แรกที่ผิด)      |
| 401    | ไม่ได้แนบ `Authorization` header (`not_signed_in`) หรือ token หมดอายุ (`token_expired`)                                                    |
| 409    | อีเมลใหม่ถูกบัญชีอื่นใช้อยู่ (`email_taken`)                                                                                                |
