# Authentication

การยืนยันตัวตนของ API ทั้งหมดทำผ่าน Bearer JWT access token โดย AuthGuard แบบ global ครอบทุก endpoint — endpoint ที่เปิดให้ใช้ได้โดยไม่ต้อง sign-in ต้องประกาศ `@Public()` อย่างชัดเจนในโค้ด (เช่น sign-up, sign-in, refresh)

## How it works

1. เรียก `$\color{green}{\textsf{POST}}$ /auth/sessions` ด้วย username/password เพื่อรับ access token (JWT) — server ตั้ง refresh token ใน cookie `refresh_token` (HttpOnly)
2. แนบ access token ทุก request: `Authorization: Bearer <access token>`
3. เมื่อ token หมดอายุ เรียก `$\color{green}{\textsf{POST}}$ /auth/refresh` เพื่อรับ token ใหม่ (refresh token หมุนเวียนทุกครั้ง)
4. sign-out ด้วย `$\color{red}{\textsf{DELETE}}$ /auth/sessions/current`

## Access token

- ประเภท: JWT (HS256, ลงนามด้วย `JWT_SECRET` ซึ่ง required และ fail-fast ตอนบูต)
- ส่งใน header `Authorization: Bearer <token>`
- Claims ใช้ระบุผู้กระทำ (`sub`) สำหรับทุก mutation และ role check ใน service layer

## Refresh token

- เก็บใน cookie `refresh_token` — client ไม่ต้องจัดการเอง
- **Rotation + reuse detection:** ทุกครั้งที่ refresh จะออก token ใหม่และเพิกถอน token เดิม หาก server พบว่ามีการใช้ refresh token ที่ถูกใช้ไปแล้วซ้ำ จะถือว่า token ถูกขโมยและ **เพิกถอนทั้งตระกูล (family) ของ session นั้น** — client ต้อง sign-in ใหม่

## Errors

| Status | Code | เมื่อไร |
| --- | --- | --- |
| 401 | `not_signed_in` | ไม่มี header `Authorization: Bearer` บน endpoint ที่ต้อง sign-in |
| 401 | `token_expired` | access token หมดอายุหรือลายเซ็นไม่ถูกต้อง — refresh แล้วลองใหม่ |
| 401 | `refresh_token_invalid` | cookie `refresh_token` หาย หมดอายุ หรือถูกเพิกถอน |
| 401 | `refresh_token_reused` | ตรวจพบการใช้ refresh token ซ้ำ — เพิกถอนทั้ง session family แล้ว |

## Where it applies

ดู flows ที่เกี่ยวข้อง: [Authentication sessions](authentication-sessions.md), [Users](users.md) — ทุก resource page อื่นใช้ scheme เดียวกันนี้
