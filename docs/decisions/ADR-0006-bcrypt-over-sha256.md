# ADR-0006: bcrypt/argon2id แทน SHA-256 ของ ERD

## Status
Accepted

## Date
2026-10-19

## Context
ERD ฝั่ง frontend ระบุ SHA-256 สำหรับรหัสผ่าน แต่ ERD เองยอมรับว่าไม่ปลอดภัยพอ (requirement หมวด 2.3)

## Decision
salted hash ด้วย bcrypt/argon2id — เบี่ยงจาก ERD อย่างมีเจตนา (OC-2 ให้เบี่ยงได้ถ้าจดเหตุผล)

## Consequences
- ต้นทุน verify สูงกว่า SHA-256 แต่จำกัดด้วย cost factor ที่เหมาะกับ scale
