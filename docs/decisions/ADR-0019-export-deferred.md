# ADR-0019: Export (maDMP/RDA) deferred ออกจาก API scope v1

## Status
Accepted

## Date
2026-10-26

## Context
frontend contract ตัดสินแล้ว "Exports (maDMP, RDA) stay in the browser, out of the API" ขณะที่ arc42 มี `GET /dmps/{id}/export` + feature `exports` + flow #14 ทั้งเรื่อง — browser export อาจเจอขีดจำกัดภายหลัง (ไฟล์ใหญ่, audit ที่ต้องฝั่ง server)

## Decision
ตัดออกจาก scope v1 — ลบ endpoint/feature ออกจาก design ที่ implement แต่**คง flow #14 ไว้ในเอกสารเป็น design สำรอง** กรณี browser export ไม่พอ

## Alternatives Considered
- ลบทิ้งทั้งหมด: ถ้าต้องกลับมาทำ audit export ต้องออกแบบใหม่หมด — ปฏิเสธ
- ทำ export ใน API v1: ย้อน decision ที่ประกาศแล้วโดยไม่มีความจำเป็นปัจจุบัน — ปฏิเสธ

## Consequences
- flow #14 ถูก mark ว่า "deferred — ไม่ implement ใน v1"
