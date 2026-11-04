# Spec: accounts

**Map:** `docs/specs/SPEC.md` **Depends on:** `foundation` · **Gate = จบ M1 (S1.1–S1.2, e2e flow #1 + #15 เขียว)** **ADR ที่เกี่ยว:** 0006/0029 (argon2id), 0016 (refresh cookie rotation), 0009 (provisioning รหัสผ่านชั่วคราว)

## Objective

บัญชีผู้ใช้ 4 บทบาท (researcher/committee/chief/admin) พร้อมการยืนยันตัวตนที่ปลอดภัย — researcher สมัครเองได้เท่านั้น (OC-1), อีกสามบทบาทสถาบันสร้างให้

## Scope (slices)

S1.1 users (sign-up researcher, profile, argon2id) → S1.2 auth (sign-in, refresh, sign-out, guards) + CI stage 1

## Interfaces (boundary กับ module อื่น)

- Endpoints: `POST /users`, `GET /users/username-available`, `POST /auth/sessions`, `POST /auth/refresh`, `DELETE /auth/sessions/current`, `GET/PATCH /users/me` — paths ยึด `docs/frontend-api/` (ตัด `/v1` — ADR-0017)
- JWT access 15 นาที (header) — ทุก mutation ระบุผู้กระทำจาก JWT subject; refresh token ใน httpOnly cookie, rotation + token-family reuse detection → revoke ทั้ง family (ครอบทุก endpoint เป็น guard — ใช้โดย module ทุกตัวถัดไป)
- Error codes ตาม catalog FE: `username_taken`, `email_taken`, `not_signed_in`, `token_expired` …
- Quota fields (`ai_token_limit/used`, `quota_resets_at`) อยู่ที่ตาราง users — ai module อ่านภายหลัง

## Testing

- **Seam: HTTP boundary** — e2e supertest ต่อ Postgres จริง: flow #1 (sign-up/sign-in), #15 (401 `token_expired` → refresh → retry), reuse detection (refresh เก่าซ้ำ → revoke ทั้ง family)
- unit: argon2id hash/verify round-trip, username/email normalize (lowercase + trim)
- กฎเทส: ทดสอบพฤติกรรมภายนอก (response codes, cookie, revoke ผลข้างเคียง) — ไม่ยึดโครงสร้างภายใน token

## Success Criteria

1. e2e flow #1 + #15 เขียว — sign-up เฉพาะ researcher (บทบาทอื่นถูกปฏิเสธ)
2. Refresh rotation + reuse detection ถูก e2e คุ้มกัน
3. CI stage 1 (lint + unit) เขียวบน GitHub Actions
4. รหัสผ่านเก็บ argon2id ตาม OWASP minimum, params tune ผ่าน `config.toml`

## Out of Scope

Admin provisioning + password reset + รหัสผ่านชั่วคราวบังคับเปลี่ยน (ทำใน dmp-lifecycle ช่วงเตรียมคิวกรรมการ — ใช้ guard จาก module นี้), email verification (OC-4 ยอมรับไว้), email ส่งจริง (MailPit dev)
