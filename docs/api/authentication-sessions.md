# Authentication & Sessions

ทรัพยากรสำหรับการยืนยันตัวตน (sign-in, refresh, sign-out) — ทั้งสาม endpoint อยู่ภายใต้ `@Public()` จึงไม่ต้องส่ง Bearer token แต่ต้องใช้ cookie `refresh_token` สำหรับ refresh และ sign-out

การยืนยันตัวตนใช้ token คู่แบบมาตรฐาน:

- **Access token** — JWT (HS256, ไลบรารี jose) อายุ 15 นาที (ค่า `auth.accessTokenTtlMinutes` ใน `config.toml`) ส่งกลับมาใน response body และต้องแนบใน header `Authorization: Bearer <access_token>` สำหรับ endpoint อื่น ๆ ทั้งหมด
- **Refresh token** — สตริงแบบ opaque `rt_<random 32 bytes base64url>` ไม่ใช่ JWT ฐานข้อมูลเก็บเฉพาะ SHA-256 hash อายุ 14 วัน (ค่า `auth.refreshTokenTtlDays`) ส่งถึง client ผ่าน cookie เท่านั้น

## Endpoints

- [$\color{green}{\textsf{POST}}$ /auth/sessions](#create-a-session) — Create a session (sign in)
- [$\color{green}{\textsf{POST}}$ /auth/refresh](#refresh-a-session) — Refresh a session (rotate refresh token)
- [$\color{red}{\textsf{DELETE}}$ /auth/sessions/current](#delete-the-current-session) — Delete the current session (sign out)

## Cookie behavior

Cookie ชื่อ `refresh_token` (ค่าคงที่ `REFRESH_COOKIE` ใน `AuthService`) ถูกตั้งค่าเมื่อ sign-in และ refresh ด้วย header `Set-Cookie`:

```
Set-Cookie: refresh_token=rt_7Kd9f2QmLpXvN8wT3sYhR6uJ4eB1aZ0cG5iHk8oDqWt; Path=/auth; HttpOnly; SameSite=Strict; Expires=Sun, 22 Nov 2026 10:00:00 GMT; Secure
```

- **Path=/auth** — browser ส่ง cookie เฉพาะคำขอไปยัง `/auth/*` เท่านั้น
- **HttpOnly** — JavaScript ฝั่ง client อ่านค่าไม่ได้
- **SameSite=Strict** — ไม่ส่งไปกับคำขอ cross-site
- **Expires** — วันหมดอายุเท่ากับวันหมดอายุของ refresh token ปัจจุบัน (14 วันนับจากการออก token)
- **Secure** — ใส่เมื่อ `req.secure` หรือ header `x-forwarded-proto` เป็น `https` เท่านั้น

เมื่อ sign-out cookie ถูกล้างด้วย `Max-Age=0` พร้อม attribute เดียวกันทุกประการ

> [!NOTE] Reconstructed from code

## The Session object

```json
{
  "object": "session",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTkzM2Q1ZS03YTJiLTdjNDEtOWUxZi04ZDRjMmI2YTVmMDMiLCJ1c2VybmFtZSI6InNvbWNoYWkiaiIsInJvbGUiOiJyZXNlYXJjaGVyIiwiaWF0IjoxNzYyNTk0NDAwLCJleHAiOjE3NjI1OTUzMDB9.k5Zx8vQ2mF1nH7wT9sL3pR6uJ4eB1aZ0cG5iHk8oDqWtY",
  "token_type": "Bearer",
  "expires_at": "2026-11-08T10:15:00.000Z",
  "user": {
    "object": "user",
    "user_id": "01933d5e-7a2b-7c41-9e1f-8d4c2b6a5f03",
    "title": "Dr.",
    "name": "Somchai",
    "surname": "Jaidee",
    "email": "somchai.j@university.ac.th",
    "role": "researcher",
    "username": "somchai.j",
    "ai_token_limit": 100000,
    "ai_token_used": 4231,
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

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชื่อชนิด object ของ server เป็น `"session"` เสมอ
- **access_token** (string, required) JWT อัลกอริทึม HS256 ลงนามด้วย `JWT_SECRET` จาก environment นำไปใช้ใน header `Authorization: Bearer <access_token>`

  claims ภายใน token:

  | Claim | Description |
  | --- | --- |
  | `sub` | `user_id` ของผู้ใช้ — ใช้ระบุตัวผู้กระทำในทุก mutation |
  | `username` | ชื่อบัญชีผู้ใช้ |
  | `role` | บทบาท (`admin`, `chief`, `committee` หรือ `researcher`) |
  | `iat` | เวลาออก token (Unix timestamp) |
  | `exp` | เวลาหมดอายุ (Unix timestamp) ตรงกับ `expires_at` ใน body |

- **token_type** (string, required) รูปแบบการส่ง token ใน header เป็น `"Bearer"` เสมอ
- **expires_at** (timestamp, required) เวลาหมดอายุของ access token ในรูป ISO 8601 (UTC) — อายุ 15 นาทีนับจากการออก token เมื่อ access token หมดอายุ endpoint ที่ต้องยืนยันตัวตนจะคืน 401 `token_expired` ให้เรียก refresh แล้วลองใหม่
- **user** (object, required) object ผู้ใช้ที่ sign-in อยู่ (ดู [Users](users.md))

  | Attribute | Description |
  | --- | --- |
  | `object` | เป็น `"user"` เสมอ |
  | `user_id` | UUID เฉพาะตัวของผู้ใช้ |
  | `title` | คำนำหน้าชื่อ — `null` ได้ |
  | `name`, `surname` | ชื่อและนามสกุล |
  | `email` | อีเมล (เก็บแบบ lowercase + trim) |
  | `username` | ชื่อบัญชีสำหรับ sign-in |
  | `role` | `admin`, `chief`, `committee` หรือ `researcher` |
  | `account_type` | `institutional` หรือ `citizen` — `null` สำหรับบัญชี seed เก่า |
  | `ai_token_limit`, `ai_token_used` | โควตา AI token สูงสุดและยอดที่ใช้ไป |
  | `phone`, `orcid`, `address` | ข้อมูลติดต่อ/วิชาการ — `null` ได้ |
  | `affiliation` | ที่สังกัด `{ organization, department?, position? }` — `null` สำหรับ citizen researcher |

---

## Create a session

$\color{green}{\textsf{POST}}$ /auth/sessions

ยืนยันตัวตนด้วย username และ password (ตรวจด้วย Argon2id) แล้วออก session ใหม่: access token ใน response body และ refresh token ใน cookie `refresh_token` ชื่อ username ถูกค้นหาแบบ trim + lowercase

### Request

```bash
curl http://localhost:3000/auth/sessions \
  -H "Content-Type: application/json" \
  -d '{"username": "somchai.j", "password": "correct-horse-battery"}'
```

### Parameters

- **username** (string, required) ชื่อบัญชีผู้ใช้ — ค่าว่างหรือไม่ใช่ string ถือว่า parameter ขาด
- **password** (string, required) รหัสผ่าน — ค่าว่างหรือไม่ใช่ string ถือว่า parameter ขาด

### Response

คืน session object ใหม่พร้อม header `Set-Cookie` ของ refresh token (ดู [Cookie behavior](#cookie-behavior))

#### Returns

คืน [session object](#the-session-object) หาก username และ password ถูกต้องและบัญชียังไม่ถูกปิดใช้งาน

#### Errors

| Status | When it happens |
| --- | --- |
| 400 | `parameter_missing` — body ไม่มี `username` หรือ `password` หรือค่าเป็นค่าว่าง |
| 401 | `invalid_credentials` — username ไม่มีอยู่จริง password ไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน (`disabledAt` มีค่า) ทุกกรณีใช้ message เดียวกันเพื่อไม่เปิดเผยว่า username มีอยู่ในระบบ |

```json
{
  "error": {
    "type": "authentication_error",
    "code": "invalid_credentials",
    "message": "Username or password is incorrect"
  }
}
```

> [!NOTE] Reconstructed from code

---

## Refresh a session

$\color{green}{\textsf{POST}}$ /auth/refresh

ออก session ใหม่จาก refresh token ใน cookie — ไม่มี request body การ refresh ทำ **rotation** เสมอ: token เดิมถูกเพิกถอน (`revokedAt` มีค่า, `replacedBy` ชี้ไป token ใหม่) และ token ใหม่ถูกออกภายใน family เดิม (`familyId` เดียวกัน) พร้อมอายุ 14 วันใหม่ จากนั้นตั้ง cookie `refresh_token` ใหม่ทับค่าเดิม

การตรวจ reuse detection: หาก token ที่ส่งมาถูกเพิกถอนแล้ว หรือไม่ใช่ leaf ของ family (มี token ใหม่แทนที่มันอยู่แล้ว — สัญญาณว่า token รั่วและถูกใช้ซ้ำ) ระบบจะเพิกถอน refresh token **ทั้ง family** ทำให้ทุก session ของผู้ใช้ใช้ไม่ได้พร้อมกัน แล้วคืน 401 `refresh_token_reused`

### Request

```bash
curl http://localhost:3000/auth/refresh \
  -H "Cookie: refresh_token=rt_7Kd9f2QmLpXvN8wT3sYhR6uJ4eB1aZ0cG5iHk8oDqWt"
```

browser ส่ง cookie ให้เองโดยอัตโนมัติ (HttpOnly) ส่วน curl ต้องแนบ header `Cookie` เอง

### Parameters

ไม่มี request body — refresh token อ่านจาก cookie `refresh_token` เท่านั้น

### Response

คืน session object ใหม่พร้อม header `Set-Cookie` ของ refresh token ตัวใหม่ (rotation)

#### Returns

คืน [session object](#the-session-object) ใหม่ (access token อายุ 15 นาที + refresh token อายุ 14 วัน)

#### Errors

| Status | When it happens |
| --- | --- |
| 401 | `refresh_token_invalid` — ไม่มี cookie `refresh_token` หรือ token ไม่รู้จัก (ไม่พบ hash ในระบบ) หรือหมดอายุ — client ต้องกลับไป sign-in ใหม่ |
| 401 | `refresh_token_reused` — พบการใช้ token ซ้ำหลังถูก rotate ระบบเพิกถอน refresh token ทั้ง family แล้ว client ต้อง sign-in ใหม่ทุกอุปกรณ์ |

```json
{
  "error": {
    "type": "authentication_error",
    "code": "refresh_token_reused",
    "message": "Token reuse detected; all sessions revoked — sign in again"
  }
}
```

> [!NOTE] Reconstructed from code

---

## Delete the current session

$\color{red}{\textsf{DELETE}}$ /auth/sessions/current

Sign-out: เพิกถอน refresh token ใน cookie (ตั้ง `revokedAt`) แล้วล้าง cookie `refresh_token` ด้วย `Max-Age=0` access token ที่ออกไปแล้วไม่ถูกยกเลิก แต่จะหมดอายุเองภายใน 15 นาที

### Request

```bash
curl -X DELETE http://localhost:3000/auth/sessions/current \
  -H "Cookie: refresh_token=rt_7Kd9f2QmLpXvN8wT3sYhR6uJ4eB1aZ0cG5iHk8oDqWt"
```

### Parameters

ไม่มี request body — refresh token อ่านจาก cookie `refresh_token` เท่านั้น

### Response

```json
{
  "object": "session",
  "deleted": true
}
```

> [!NOTE] Reconstructed from code

#### Returns

คืน object ยืนยันการลบ session — endpoint นี้ไม่มีจุดโยน `ApiError` ใน service: หากไม่มี cookie หรือ token ไม่รู้จัก จะข้ามการเพิกถอนในฐานข้อมูลแล้วยังคืน 200 พร้อม `deleted: true` และล้าง cookie ตามปกติ จึงไม่มี error status ที่เป็นไปได้

#### Errors

ไม่มี — endpoint คืน 200 เสมอ ไม่ว่าจะมี cookie `refresh_token` หรือไม่
