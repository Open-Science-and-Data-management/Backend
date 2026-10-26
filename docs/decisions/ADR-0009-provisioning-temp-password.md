# ADR-0009: Provisioning ด้วยรหัสผ่านชั่วคราว; password reset ผ่าน SMTP

## Status
Accepted

## Date
2026-10-19

## Context
committee/chief/admin สถาบันเป็นผู้สร้างบัญชีให้ (OC-1) — ไม่ควรพึ่ง email ในการเริ่มต้นระบบ

## Decision
Admin provisioning สร้างบัญชีด้วยรหัสผ่านชั่วคราวที่บังคับเปลี่ยนตอน login ครั้งแรก; password reset ผ่าน SMTP (`SmtpMailer` port; dev: MailPit)

## Consequences
- รหัสผ่านชั่วคราวแสดงครั้งเดียวในหน้า admin — ต้องจดว่า flow นี้ render อย่างปลอดภัย
