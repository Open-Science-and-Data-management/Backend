# uni-backend API

REST API ของแพลตฟอร์ม Research Data Management — นักวิจัยเขียนแผนข้อมูล (DMP, maDMP v3.0) ส่งเวอร์ชันเข้าพิจารณา เมื่ออนุมัติจะสร้างงาน lifecycle อัตโนมัติ พร้อมไฟล์และการแจ้งเตือน

**Base URL**

```
http://localhost:3000
```

(port จาก `PORT` env; ไม่มี prefix นำหน้า route)

**Resources**

- [Authentication sessions](authentication-sessions.md) — sign-in, refresh token rotation + reuse detection, sign-out
- [Users](users.md) — สมัครบัญชี, เช็ค username, ดูและแก้โปรไฟล์ตัวเอง (`/users/me`)
- [Projects](projects.md) — โปรเจกต์วิจัยและสมาชิก พร้อมการมองเห็นแบบ role-based
- [Files](files.md) — อัปโหลด proposal/task deliverable/evidence, ดาวน์โหลดเนื้อหา, จัดเก็บถาวร, สกัดข้อความจาก docx
- [DMPs](dmps.md) — แผนข้อมูล: draft autosave, submit เวอร์ชัน, approve/reject, minor edits, revision, archive/finalize
- [Reviews](reviews.md) — งานพิจารณาของคณะกรรมการ: รายการแผนที่รอตัดสินและสถานะล่าสุด
- [Tasks](tasks.md) — งาน lifecycle ที่ผูกกับ DMP: checklist, evidence, complete/reopen/cancel, reopen offers
- [Notifications](notifications.md) — การแจ้งเตือน: อ่าน, อ่านทั้งหมด, ลบ
- [AI](ai.md) — ผู้ช่วย AI: quota, action streaming (SSE) chat/suggest/analyze-proposal, thread persistence + idempotency
- [Domain profiles](domain-profiles.md) — ชุดโปรไฟล์ domain และ field policy สำหรับฟอร์ม DMP

**Core topics**

- [Authentication](authentication.md) — Bearer JWT access token + refresh token cookie, ครอบทุก endpoint ผ่าน global guard
- [Errors](errors.md) — error envelope แบบ Stripe รูปแบบเดียวทั้ง API (ADR-0014)
- [Pagination](pagination.md) — cursor pagination (`limit`, `starting_after`) บน `ListEnvelope`
