# ADR-0011: Field policy เป็น path-based registry

## Status
Accepted

## Date
2026-10-19

## Context
diff → classify → error path ต้องใช้ระบบพิกัดเดียวกันทั้งสาย และ frontend ต้องแสดง "ฟิลด์นี้ต้องขออนุมัติใหม่" จากชุดข้อมูลเดียวกับที่ backend ตัดสิน

## Decision
field policy นิยามแบบ path (JSON pointer style) เป็น registry (ข้อมูล ไม่ใช่โค้ด) — expose ผ่าน `GET /field-policy`

## Consequences
- หมายเหตุ: การตัดสินหลังจากนี้ (ADR-0014) เปลี่ยน error envelope ไปใช้ `param` แทน `errors[].path` — JSON pointer ยังใช้ระบบเดิม
