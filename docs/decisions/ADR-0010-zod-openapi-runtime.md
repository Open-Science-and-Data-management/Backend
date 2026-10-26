# ADR-0010: zod → OpenAPI, เสิร์ฟ spec แบบ runtime

## Status
Accepted

## Date
2026-10-19

## Context
ไม่มี monorepo ร่วมกับ frontend (TC-4) — frontend ต้อง generate client จาก runtime endpoint

## Decision
`@asteasolutions/zod-to-openapi` + `@nestjs/swagger`; ไม่ commit `openapi.json` — เสิร์ฟที่ `GET /openapi-json`

## Consequences
- zod schema ใน `features/shared/contracts/` เป็น source of truth เดียวของรูปร่างข้อมูล (TD-4)
