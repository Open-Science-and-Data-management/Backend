# ADR-0012: UUID v7 mint โดย backend

## Status
Accepted

## Date
2026-10-19

## Context
ระบบเดิมมีปัญหา seed id ซ้ำข้ามแผน (open question หมวด 9 ของ requirement)

## Decision
ID ทุก entity เป็น UUID v7 ที่ backend mint เสมอ; ตอน export เติม prefix ด้วย dmp_id เป็น safeguard กัน collision

## Consequences
- sort ตาม id ≈ sort ตามเวลาสร้าง (มีประโยชน์กับ pagination แบบ cursor ของ ADR-0015)
