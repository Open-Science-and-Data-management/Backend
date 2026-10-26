# ADR-0017: ไม่มี URL versioning — paths ยึดตาม frontend contract

## Status
Accepted

## Date
2026-10-26

## Context
frontend contract ใช้ prefix `/v1` ตามธรรมเนียม Stripe แต่ API นี้ใช้งานเดียว (frontend ของโครงการเดียวกัน) ไม่มี third-party consumer

## Decision
ไม่ใส่ prefix version ใน URL — ใช้ path ตาม frontend contract โดยตัด `/v1` ออก (เช่น `/auth/sessions`, `/users/me`, `/dmps/{id}/draft`); frontend contract เป็น source of truth ของ paths

## Consequences
- ถ้าวันหน้ามี consumer อื่น จะเป็นการเพิ่ม prefix ใหม่ทั้งชุด (ยอมรับ — ไม่ใช่การ break เพราะไม่มีใครใช้อยู่)
