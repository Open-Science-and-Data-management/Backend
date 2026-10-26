# ADR-0001: Modular monolith — instance เดียว

## Status
Accepted

## Date
2026-10-19

## Context
Scale จำกัดและรู้ค่าล่วงหน้า (~200 ผู้ใช้/วัน, peak ~2,000) deploy บน VM เดียวด้วย docker-compose (TC-1, TC-2) — ทุก flow ที่ต้องพร้อมกัน (approve → สร้าง tasks → notifications) ควรเป็น transaction เดียวที่ตรวจสอบได้

## Decision
Modular monolith 1 process — scale แนวตั้ง, in-process event bus เฉพาะภายใน adapter ของ NotificationPublisher; ไม่มี Redis และระบบ distributed บนเส้นทางหลัก

## Consequences
- transactional flows ง่ายและตรวจสอบได้
- release = restart สั้น ๆ หนึ่งครั้ง (ยอมรับได้ที่ scale นี้)
- storage/notification ต้องอยู่หลัง port เผื่อ scale ออกภายหลัง (ADR-0002)
