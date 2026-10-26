# ADR-0014: รับ error conventions ของ frontend contract (envelope, status codes, catalog)

## Status
Accepted

## Date
2026-10-26

## Context
frontend-api ใช้ envelope สไตล์ Stripe (`{error:{type,code,message,param}}`) และมี catalog รหัส error ต่อ endpoint ทั้งเล่ม (`draft_conflict`, `not_a_reviewer` ฯลฯ) ขณะที่ arc42 ออกแบบ `{error:{code, errors:[{path,code,message}]}}` เพื่อให้ FE ทำ "คลิกไปแก้จุดที่ผิดใน draft" ได้ — grilling session ตัดสินแบบ case-by-case และข้อนี้ให้รูป Stripe ชนะ

## Decision
- Envelope: `{error: {type, code, message, param}}` ทั้ง API
- **`param` ถือ JSON pointer** สำหรับ error ที่ชี้ตำแหน่งใน draft (click-to-fix ยังทำได้ — Stripe ใช้ param แบบนี้เอง) — error ทั่วไป param เป็นชื่อฟิลด์ request
- Status codes: `400` request ผิดรูป/พารามิเตอร์ขาด · `409` สถานะขัดกัน (`draft_conflict`, `revision_pending`, `username_taken`) · `422` ข้อมูลไม่ผ่านกฎ (draft validation, proposal unreadable)
- Catalog รหัส error ต่อ endpoint ยึดตาม frontend-api เป็น source of truth — arc42 เพิ่มหมวดอ้างอิง

## Alternatives Considered
- `errors[]` ของ arc42: แม่นยำกว่าสำหรับ multi-error แต่ FE ต้องแกะ array ทุก error — ปฏิเสธ
- Stripe เต็มรูปโดยไม่มี pointer: เสีย click-to-fix — ปฏิเสธ

## Consequences
- ADR-0011 (path-based field policy) ยังใช้ระบบ JSON pointer เดิม เพียงส่งผ่าน `param`
- รหัส error ต้อง sync สองเอกสาร — ตัวจริงคือ frontend-api docs
