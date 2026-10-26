# ADR-0002: I/O ที่เปลี่ยน implementation ได้ผ่าน port

## Status
Accepted

## Date
2026-10-19

## Context
ต้องการสลับ disk→S3, in-process bus→Redis, provider AI อื่น ได้โดยไม่แตะ domain logic (อนาคตอาจ scale ออกจากเครื่องเดียว)

## Decision
Port 4 ตัว: `FileStorage`, `NotificationPublisher`, `AiClient`, `MailSender` — cross-feature เป็น direct service inject; **ไม่มี event bus ทั่วไป** (InProcessEventBus มีอยู่แค่ใน adapter ของ NotificationPublisher)

## Consequences
- สลับ implementation แตะเฉพาะ adapter
- ADR-0013 ยังคง port ของ NotificationPublisher ไว้แม้ delivery เปลี่ยนเป็น polling
