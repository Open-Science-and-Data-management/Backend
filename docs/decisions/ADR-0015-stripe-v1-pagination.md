# ADR-0015: Pagination ใช้ Stripe v1 list shape

## Status
Accepted

## Date
2026-10-26

## Context
arc42 เดิมระบุ `?page=&limit=` (offset) และเขียนว่า "ไม่จำเป็นต้องใช้ cursor" — แต่ frontend contract ยึด Stripe v1 (`object:"list"`, `data`, `has_more`, `total_count`, paged ด้วย `starting_after`) และ dashboard stat cards อ่าน `total_count` ตรง ๆ อยู่แล้ว

## Decision
ทุก list endpoint คืน Stripe v1 list shape paged ด้วย `limit` (1–100, default 20) + `starting_after` — แก้หมายเหตุใน arc42 5.2

## Alternatives Considered
- offset pagination: เขียนง่ายกว่าเล็กน้อยแต่ FE ต้องเขียน client ใหม่ทั้งชุด — ปฏิเสธ

## Consequences
- cursor ใช้ `id` ซึ่งเป็น UUID v7 (ADR-0012) — sort ตาม id ≈ เวลาสร้าง ทำงานได้โดยไม่ต้องมีคอลัมน์ cursor เพิ่ม
