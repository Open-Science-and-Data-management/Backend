# ADR-0003: โมเดลข้อมูลแบบผสม (JSONB + relational)

## Status
Accepted

## Date
2026-10-19

## Context
ERD ฝั่ง frontend วาด DATASET/DISTRIBUTION/CONTRIBUTOR/COST เป็น entity แยก แต่ requirement หมวด 3.2 ระบุว่าทั้งหมดเป็นค่า nested ใน `draft` และให้ enforce constraint เป็น constraint จริง

## Decision
`dmps.draft` เป็น JSONB ก้อนเดียว (working draft — diff/validate/fold ทำกับทั้ง tree); `dmp_versions` เป็นตารางจริงบังคับ constraint ด้วย Postgres (`UNIQUE (dmp_id, number)`, partial unique pending); entity ที่มี lifecycle จริงเป็นตาราง relational

## Consequences
- การ submit พร้อมกันสอง request เป็นไปไม่ได้โดย Postgres ปฏิเสธเอง
- query ที่ต้องเจาะ draft ใช้ JSONB operator (ยอมรับได้เพราะความถี่ต่ำ — TD-3)
