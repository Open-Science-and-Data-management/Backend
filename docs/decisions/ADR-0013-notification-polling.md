# ADR-0013: Notification delivery เป็น polling ไม่ใช้ push

## Status
Accepted

## Date
2026-10-26

## Context
frontend contract ตัดสินแล้วว่า "Notifications are polled; no push" (poll ทุก ~60 วิ + ตอน refocus) ขณะที่ arc42 ออกแบบ SSE push ทั้งหมวด 8.6 — ตรวจโหลดแล้ว: peak 2,000 ผู้ใช้ poll ทุก 60 วิ ≈ 33 req/s เทียบกับ SELECT indexed ระดับ sub-ms คือใช้แรงเครื่องไม่ถึง ~3% — polling ไม่ใช่ปัญหาที่ scale นี้ (กังวลได้เมื่อ ~10k concurrent ขึ้นไปหรือต้อง latency ระดับวินาที)

## Decision
ใช้ polling — ตัด `GET /notifications/stream` ออก และแก้หมวด 8.6 ของ arc42; คง `NotificationPublisher` port ไว้ (แทบไม่มีต้นทุน และวันหน้าจะสลับเป็น push ก็แตะเฉพาะ adapter — ADR-0002)

## Alternatives Considered
- SSE push (arc42 เดิม): ประหยัดกว่าตอน event ห่าง แต่แลกด้วย connection ค้าง ~2,000 เส้น + reconnect + proxy buffering — ซับซ้อนเกินความจำเป็น
- ตัด port ทิ้งด้วย (YAGNI สุด ๆ): ปฏิเสธ — สูญเสียทางถอยที่ฟรี

## Consequences
- arc42 หมวด 8.6 / 5.2 ต้องแก้ตาม
- เพิ่ม `unread_count` ใน list response ตามที่ FE ใช้ (หมายเหตุ: ตัดสินใน grilling session 2026-10-26)
