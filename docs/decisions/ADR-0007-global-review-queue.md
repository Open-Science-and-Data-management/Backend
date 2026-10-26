# ADR-0007: Committee queue เป็น global queue ไม่มีการมอบหมาย

## Status
Accepted

## Date
2026-10-19

## Context
requirement หมวด 4.6: หนึ่งเวอร์ชัน ตัดสินได้ครั้งเดียว กรรมการคนใดคนหนึ่งตัดสินได้

## Decision
คิวตรวจเป็น global queue (`GET /dmps?status=pending` — ดู ADR-0023 เรื่อง read model) — ใครก็ตัดสินได้ก่อน ไม่มี entity การมอบหมายงาน

## Consequences
- ไม่มีระบบ assignment/claim — เวอร์ชันเดียว decision เดียวบังคับด้วย DB constraint
