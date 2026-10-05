# ResearchTrack API

REST API ของระบบติดตามความก้าวหน้างานวิจัย (Research Progress Tracking System) — จัดการโปรเจกต์วิจัย, แผนการจัดการข้อมูล (DMP), การอนุมัติโดยกรรมการ, งานรายสัปดาห์, ไฟล์ และผู้ช่วย AI

> [!NOTE]
> เอกสารชุดนี้เป็น **contract-first draft** เพื่อสื่อสารระหว่างทีม frontend และ backend —
> backend ยังไม่มี implementation ทุกตัวอย่าง request/response ในเอกสารถูก reconstruct
> จาก `er-0410.md` (ERD), `open-sci/docs/requirement.md` และ mock data ของ frontend
> (`ui/src/lib/mock-data.ts`) ไม่ได้ capture จาก API ที่รันจริง

## Base URL

```
http://localhost:3000
```

TODO: confirm base URL และ port ของ environment จริง

## Authentication

ใช้ **Bearer JWT** ส่งใน header `Authorization` ทุก request ยกเว้น register และ login
role ของผู้ใช้ (`admin | chief | committee | researcher`) ฝังอยู่ใน claims ของ token

- `POST /auth/register` — เปิดบัญชีใหม่แบบสาธารณะ ผู้ใช้ใหม่ได้ role `researcher` เสมอ
- `POST /auth/login` — แลก email/password เป็น token
- role อื่น (`chief`, `committee`, `admin`) เปลี่ยนโดย admin ผ่าน `PATCH /users/{user_id}`

ตัวอย่าง header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Resources

- [Auth](auth.md) — สมัครบัญชี, เข้าสู่ระบบ, ดูข้อมูลผู้ใช้ปัจจุบัน
- [Users](users.md) — บัญชีผู้ใช้, role, และโควตา AI token (จัดการโดย admin)
- [Projects](projects.md) — โปรเจกต์วิจัย พร้อมสถานะและ proposal ที่ถูกเลือกใช้จริง
- [Project members](project-members.md) — สมาชิกของโปรเจกต์แต่ละคนพร้อมบทบาทในโปรเจกต์
- [DMPs](dmps.md) — แผนการจัดการข้อมูล (Data Management Plan) ของแต่ละโปรเจกต์
- [DMP versions](dmp-versions.md) — รอบการส่งและการอนุมัติของ DMP (ทุกกรรมการต้องอนุมัติ)
- [Datasets](datasets.md) — แหล่งอ้างอิงข้อมูลของงานวิจัย (metadata และ URL อ้างอิงเท่านั้น ไม่มีการเก็บไฟล์ข้อมูลจริง)
- [Distributions](distributions.md) — ช่องทางเข้าถึงของแต่ละ dataset (URL, license)
- [Tasks](tasks.md) — งานรายสัปดาห์ที่ได้จาก DMP พร้อม checklist และหลักฐาน
- [Files](files.md) — ไฟล์เอกสาร (.docx ฯลฯ) ที่อัปโหลด: proposal, ส่งงาน, หลักฐาน
- [Notifications](notifications.md) — การแจ้งเตือนของผู้ใช้แต่ละคน
- [AI](ai.md) — ผู้ช่วย AI: สร้าง/แก้แผนจาก proposal, ตรวจรายงานรายสัปดาห์, ประวัติการสนทนา

## Conventions

- **Errors** — ทุก error ใช้ envelope เดียวกัน ดู [errors.md](errors.md)
- **Pagination** — endpoint ที่เป็น List ทุกตัวใช้ page-based offset ดู [pagination.md](pagination.md)
- **IDs** — ทุก entity ใช้ UUID เว้นแต่ `DMP_VERSION` ซึ่งใช้หมายเลข revision ต่อ DMP (integer)
- **Timestamps** — ISO 8601 เขตเวลา UTC เช่น `2026-09-20T09:00:00Z`
- **Case** — field ทั้งหมดเป็น `snake_case`

### Permissions (ภาพรวม)

| ทรัพยากร | admin | chief | committee | researcher |
| --- | --- | --- | --- | --- |
| Users | จัดการได้ทุกบัญชี | — | — | แก้โปรไฟล์ตัวเอง |
| Projects | ทุกโปรเจกต์ | โปรเจกต์ตัวเอง | อ่านเฉพาะที่เป็นสมาชิก | สร้าง/แก้โปรเจกต์ตัวเอง |
| Project members | ทุกโปรเจกต์ | โปรเจกต์ตัวเอง | — | — |
| DMPs | อ่าน+แก้ได้ทุก DMP | อ่านโปรเจกต์ตัวเอง | อ่านเฉพาะที่เป็นสมาชิก | สร้าง/แก้ DMP ตัวเอง |
| DMP versions (approve/reject) | — | — | ตัดสินได้ | — |
| Datasets / Distributions | ตาม DMP | ตามโปรเจกต์ตัวเอง | อ่าน | จัดการใน DMP ตัวเอง |
| Tasks | ทุกงาน | โปรเจกต์ตัวเอง | อ่าน | จัดการใน DMP ตัวเอง |
| Files | ทุกไฟล์ | โปรเจกต์ตัวเอง | อ่าน (เพื่อตรวจ) | อัปโหลด/ลบของตัวเอง |
| Notifications | ของตัวเอง | ของตัวเอง | ของตัวเอง | ของตัวเอง |
| AI | — | — | ไม่มีสิทธิ์ใช้ | ใช้ได้ภายใต้โควตา token |

> ตารางนี้เป็นภาพรวมคร่าว ๆ ตามข้อตกลงใน draft กฎของแต่ละ endpoint ระบุซ้ำในหน้าของ resource นั้น
