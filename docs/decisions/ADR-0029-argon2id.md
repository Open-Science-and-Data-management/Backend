# ADR-0029: Password hash = argon2id

## Status
Accepted — ยืนยัน ADR-0006 และปิดความกำกวม "bcrypt/argon2id"

## Date
2026-11-04

## Context
ADR-0006 ตัดสินเบี่ยงจาก ERD (SHA-256) ไปใช้ salted hash แต่เขียนกำกวมเป็น "bcrypt/argon2id" ทั้งใน arc42 §4.1, §5.3 และ §8.2 — ต้องเลือกตัวใดตัวหนึ่งก่อน implement auth (ระลอก 1)

## Decision
ใช้ **argon2id** (npm `argon2` — มี prebuilt binary บน linux) — OWASP Password Storage Cheat Sheet แนะนำเป็นลำดับแรก, memory-hard ทน GPU/ASIC; พารามิเตอร์อย่างน้อยตาม OWASP minimum (m=19 MiB, t=2, p=1) และ tune ได้ผ่าน `config.toml`; สตริง hash เก็บแบบ encoded (มี salt + params ในตัว) ที่คอลัมน์ `credentials`

ทางเลือกที่ถูกปฏิเสธ: bcrypt (ไม่ memory-hard; ที่ scale ~200 ผู้ใช้/วัน ประสิทธิภาพไม่ใช่ตัวตัดสิน จึงเลือกตามมาตรฐานความปลอดภัยปัจจุบัน), scrypt (argon2id ได้มาตรฐานกว่า)

## Consequences
- arc42 §4.1, §5.3 (`credentials`), §8.2 ระบุ argon2id ตายตัว
- พารามิเตอร์ hash อยู่ใน config (จุดเดียวที่อ่าน config ตาม §8.7)
