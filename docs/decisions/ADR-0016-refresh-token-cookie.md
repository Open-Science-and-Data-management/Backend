# ADR-0016: Refresh token เก็บใน httpOnly cookie แบบ rotating

## Status
Accepted

## Date
2026-10-26

## Context
frontend contract: refresh token เป็น httpOnly cookie แบบ rotating อายุ 14 วัน พร้อม reuse detection — arc42 8.2 เขียนว่า "token ส่งผ่าน header เท่านั้น" และ config TTL 30 วัน โดยไม่มี rotation

## Decision
- access token (15 นาที): ผ่าน `Authorization` header — ประโยค "header เท่านั้น" ใน 8.2 จำกัดความหมายที่ access token
- refresh token: httpOnly cookie, **rotating** (ออกใหม่ทุกครั้งที่ refresh), TTL 14 วัน
- reuse detection: ใช้ refresh token ที่ถูก rotate ไปแล้ว → `401 refresh_token_reused` + revoke ทั้ง token family

## Alternatives Considered
- refresh ใน header/storage ฝั่ง JS: โดนขโมยง่ายกว่า (XSS อ่านได้) — ปฏิเสธ

## Consequences
- `refresh_tokens` ตารางเพิ่ม token family/replaced_by สำหรับ reuse detection
- config `refreshTokenTtlDays` เปลี่ยน default เป็น 14
