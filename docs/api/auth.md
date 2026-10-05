# Auth

การยืนยันตัวตนของ API ทั้งหมด ผู้ใช้สมัครบัญชีใหม่ได้เองแบบสาธารณะ
ผู้ใช้ใหม่ได้ role `researcher` เสมอ — role อื่น (`chief`, `committee`, `admin`)
ต้องให้ admin มอบหมายผ่าน [Update a user](users.md#update-a-user) หลังสมัคร
การสมัครหรือเข้าสู่ระบบสำเร็จจะได้ JWT ที่ใช้แนบใน header `Authorization` ของทุก request ถัดไป
ดูภาพรวมได้ที่ [index](index.md#authentication)

## Endpoints

- [`POST /auth/register`](#create-an-account)
- [`POST /auth/login`](#log-in)
- [`GET /auth/me`](#retrieve-the-current-user)

## The session object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

### Request

```bash
curl http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "arisa.w@university.ac.th",
    "password": "correct-horse-battery"
  }'
```

### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YTdkM2YyZS01YzQxLTRiOGEtOWUyZi0xZDZjOGI0YTdlMzAiLCJyb2xlIjoicmVzZWFyY2hlciJ9.xK9f...",
  "user": {
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
}
```

## Attributes

- `token` (string)
  JWT ที่ใช้ยืนยันตัวตน แนบใน header `Authorization: Bearer <token>` ของทุก request — มีอายุจำกัด เมื่อหมดอายุจะได้รับ 401 กลับมาและต้อง login ใหม่

- `user` (User object)
  ข้อมูลบัญชีของผู้ใช้ — รายละเอียดทุก field ดูที่ [The user object](users.md#the-user-object)

## Create an account

สมัครบัญชีใหม่แบบสาธารณะ ไม่ต้องมี token บัญชีใหม่ได้ role `researcher` เสมอ
ส่วน `ai_token_limit` เริ่มต้นตามค่า default ของระบบ (TODO: confirm ค่าเริ่มต้น)
email ต้องไม่ซ้ำกับบัญชีที่มีอยู่ — ซ้ำจะได้ 409

### Body parameters

- `title` (optional, string)
  คำนำหน้าชื่อ เช่น `"Dr."`, `"Mr."`, `"Ms."`

- `name` (required, string)
  ชื่อจริง

- `surname` (required, string)
  นามสกุล

- `email` (required, string)
  อีเมลใช้เข้าสู่ระบบ ต้องเป็นรูปแบบ email ที่ถูกต้องและไม่ซ้ำ

- `password` (required, string)
  รหัสผ่าน — TODO: confirm ความยาวขั้นต่ำที่ backend จะ enforce

สมัครสำเร็จจะได้ session ทันที (ไม่ต้อง login ซ้ำ)

```bash
curl http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Dr.",
    "name": "Arisa",
    "surname": "Wongchai",
    "email": "arisa.w@university.ac.th",
    "password": "correct-horse-battery"
  }'
```

## Log in

แลก email/password เป็น session ใหม่ ใช้ได้กับทุก role
email หรือ password ผิดจะได้ 401 `authentication_error`

### Body parameters

- `email` (required, string)
  อีเมลที่สมัครไว้

- `password` (required, string)
  รหัสผ่านของบัญชี

```bash
curl http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "arisa.w@university.ac.th", "password": "correct-horse-battery"}'
```

## Retrieve the current user

คืน `user` ของเจ้าของ token เอง ใช้เป็นวิธีตรวจว่า token ยังใช้ได้
และดึง role/โควตา AI ล่าสุดตอนเปิดแอป — ไม่มีพารามิเตอร์

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_JWT"
```
