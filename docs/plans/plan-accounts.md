# Implementation Plan: accounts

**Spec:** [`../specs/SPEC-accounts.md`](../specs/SPEC-accounts.md) · **Depends on:** plan-foundation · **Gate:** e2e flow #1 + #15 เขียว, CI stage 1 เขียว

## Overview
บัญชี + การยืนยันตัวตน: sign-up เฉพาะ researcher, profile, argon2id, JWT access + refresh rotation พร้อม family reuse detection, guards ครอบทุก endpoint ถัดไป

## Architecture Decisions
- argon2id (ADR-0029) — params ใน `config.toml`
- Refresh token ผ่าน httpOnly cookie + rotation + token-family reuse detection (ADR-0016)
- JWT subject ระบุผู้กระทำทุก mutation (§8.2)
- Error codes จาก catalog FE (`username_taken`, `email_taken`, `not_signed_in`, `token_expired`)

## Task List

### Phase 1: Users
- [x] **Task 1: users module + sign-up** — NestJS module, repository, service, `POST /users` (researcher only), `GET /users/username-available`, argon2id hash/verify
  - Acceptance: sign-up สร้าง users + credentials row; บทบาทอื่นขอสมัคร → ปฏิเสธ; email/username normalize (lowercase+trim) + unique → `409 username_taken`/`email_taken`
  - Verify: `pnpm test -- tests/unit/users` + integration (hash round-trip, uniqueness ที่ระดับ DB)
  - Files: `src/features/users/**`, `tests/unit/users/`, `tests/integration/users.ts` (M)
  - Deps: foundation ทั้งหมด
- [x] **Task 2: profile endpoints** — `GET/PATCH /users/me` (role/username/quota แก้ไม่ได้)
  - Acceptance: PATCH เปลี่ยนเฉพาะ field ที่อนุญาต; ผู้ไม่ sign-in → `not_signed_in`
  - Verify: `pnpm test -- tests/unit/users` (S)
  - Files: `src/features/users/**` (S)
  - Deps: 1

### Phase 2: Auth
- [x] **Task 3: sign-in + access token** — `POST /auth/sessions` → JWT 15 นาที; `JWT_SECRET` จาก env; TTL จาก `config.toml`
  - Acceptance: credential ผิด → 401; สำเร็จ → access token + refresh cookie
  - Verify: unit + รอ e2e รวม Task 5 (S)
  - Files: `src/features/auth/**` (M)
  - Deps: 1
- [x] **Task 4: refresh rotation + reuse detection + sign-out** — httpOnly cookie, rotating TTL 14 วัน, token-family table ตาม arc42 `refresh_tokens`
  - Acceptance: refresh เก่าซ้ำ → revoke ทั้ง family (ทุก session ของ user ตาย); sign-out revoke session ปัจจุบัน
  - Verify: `pnpm test -- tests/integration/auth` (M)
  - Files: `src/features/auth/**` (M)
  - Deps: 3
- [x] **Task 5: global guard + e2e flows #1, #15** — guard ครอบทุก endpoint; 401 `token_expired` → `POST /auth/refresh` → retry; เปิด CI stage 1 (lint+unit บน GitHub Actions)
  - Acceptance: e2e flow #1 (sign-up/sign-in) + #15 (refresh retry) เขียวต่อ Postgres จริง; CI เขียว
  - Verify: `pnpm test -- tests/e2e/auth`, ดูผล CI run
  - Files: `src/features/auth/**` (guard), `.github/workflows/**`, `tests/e2e/auth.ts` (M)
  - Deps: 2, 4

### Checkpoint: M1 จบ
- [ ] e2e #1 + #15 เขียว, CI stage 1 เขียว, refresh reuse detection มี e2e คุ้ม
- [ ] Review กับ human ก่อนเริ่ม projects-files

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Cookie behavior ต่างกัน dev (http) กับ prod (https/Caddy) | Low | cookie `secure` auto ตาม protocol; e2e ยิงผ่าน app ตรง |
| argon2 native build ใน CI | Low | ใช้ prebuilt binaries (npm `argon2`), cache node_modules ใน CI |

## Open Questions
- argon2id params default OWASP minimum — ยืนยันค่าจริงใน `config.toml` ตอน Task 1
