# Notifications

การแจ้งเตือนของผู้ใช้แต่ละคน — ระบบสร้างให้เองตามเหตุการณ์ใน workflow
(ส่ง DMP, มีคนอนุมัติ, อนุมัติครบ, ถูกปฏิเสธ, อัปโหลดรายงาน, AI ตรวจเสร็จ)
ผู้ใช้ไม่มีสิทธิ์สร้าง notification เอง ทำได้แค่อ่านและ mark ว่าอ่านแล้ว
ชนิดของเหตุการณ์ดูที่ `type` ด้านล่าง — ตรงกับ trigger ทั้งหมดใน requirement

## Endpoints

- [`GET /notifications`](#list-notifications)
- [`POST /notifications/{notification_id}/read`](#mark-a-notification-as-read)
- [`POST /notifications/read-all`](#mark-all-notifications-as-read)

## The notification object

> [!NOTE]
> ตัวอย่างถูก reconstruct จาก contract นี้ ไม่ได้ capture จาก API ที่รันจริง

Prerequisites: login ก่อน (ดู [Auth](auth.md)) — notification เห็นได้เฉพาะเจ้าของ

### Request

```bash
curl http://localhost:3000/notifications \
  -H "Authorization: Bearer YOUR_JWT"
```

### Response

```json
{
  "data": [
    {
      "id": "5a9c1f7d-3b42-4e68-8d0a-2c6e9b4f8d73",
      "user_id": "9a7d3f2e-5c41-4b8a-9e2f-1d6c8b4a7e30",
      "dmp_id": "2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61",
      "project_id": "6c2f8a1d-3e47-4d59-b0a2-8f5c9d1e3b74",
      "type": "dmp_member_approved",
      "title": "Somchai Prasert approved DMP v3",
      "message": "2 of 3 committee approvals collected so far.",
      "link": "/dmps/2d5b9e7c-4a63-4f81-8c0d-3b7a5f2e9d61/versions/3",
      "read_at": null,
      "created_at": "2026-09-18T09:15:00Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 7
}
```

## Attributes

- `id` (string)
  UUID ระบุการแจ้งเตือน

- `user_id` (string)
  UUID ของผู้รับ — คนที่จะเห็นรายการนี้

- `dmp_id` (string, nullable)
  UUID ของ [DMP](dmps.md#the-dmp-object) ที่เกี่ยวข้อง ถ้ามี

- `project_id` (string, nullable)
  UUID ของ [Project](projects.md#the-project-object) ที่เกี่ยวข้อง ถ้ามี

- `type` (enum)
  Possible enum values:
  - `dmp_submitted`
    นักวิจัยส่ง DMP เข้าพิจารณา — ส่งถึงกรรมการทุกคนของโปรเจกต์
  - `dmp_resubmitted`
    นักวิจัยส่งใหม่หลังถูกปฏิเสธ — ส่งถึงกรรมการทุกคน
  - `dmp_member_approved`
    กรรมการอนุมัติหนึ่งคน — ส่งถึงนักวิจัย รูปแบบ "N of M approvals collected"
  - `dmp_finalized`
    อนุมัติครบทุกคนแล้ว — ส่งถึงนักวิจัย งานเริ่มตามแผนได้
  - `dmp_rejected`
    มีกรรมการปฏิเสธ — ส่งถึงนักวิจัย พร้อมเหตุผลใน `message`
  - `tasks_generated`
    AI สร้างงานจาก proposal เสร็จ — ส่งถึงนักวิจัย
  - `proposal_superseded`
    proposal ถูกเลือกทับด้วยฉบับใหม่ — ส่งถึงผู้อัปโหลดฉบับเดิม
  - `report_uploaded`
    นักวิจัยอัปโหลดรายงานรายสัปดาห์ — ส่งถึงกรรมการพร้อมสรุปผลตรวจของ AI ถ้ามี
  - `ai_recheck_complete`
    AI ตรวจรายงานเสร็จ — ส่งถึงนักวิจัยผู้อัปโหลด

- `title` (string)
  หัวข้อสั้นหนึ่งบรรทัด เช่น `"Somchai Prasert approved DMP v3"`

- `message` (string)
  รายละเอียดเพิ่ม เช่น จำนวน approval ที่เก็บได้ หรือเหตุผลการปฏิเสธ

- `link` (string)
  path ภายในแอปที่ควรพาผู้ใช้ไปเมื่อคลิก — frontend ใช้ต่อกับ router ของตัวเอง

- `read_at` (string, nullable)
  เวลาที่ผู้รับ mark ว่าอ่านแล้ว (ISO 8601 UTC) — `null` = ยังไม่อ่าน

- `created_at` (string)
  เวลาที่เกิดเหตุการณ์ (ISO 8601 UTC)

## List notifications

คืนการแจ้งเตือนของตัวเองเรียงตาม `created_at` ใหม่สุดก่อน — เห็นของคนอื่นไม่ได้
ผลลัพธ์ห่อใน [list envelope](pagination.md#the-list-envelope-object)

### Query parameters

- `unread` (optional, boolean)
  ส่ง `true` เพื่อดูเฉพาะที่ยังไม่อ่าน (`read_at` เป็น `null`)

- `type` (optional, enum)
  กรองตามชนิด เช่น `dmp_rejected`

- `page`, `limit` (optional, integer)
  ดู [pagination.md](pagination.md#parameters)

```bash
curl "http://localhost:3000/notifications?unread=true" \
  -H "Authorization: Bearer YOUR_JWT"
```

## Mark a notification as read

ตั้ง `read_at` ของรายการหนึ่งเป็นเวลาปัจจุบัน — mark รายการของตัวเองเท่านั้น
mark ซ้ำได้ (ค่า `read_at` ไม่เปลี่ยน) ไม่มีพารามิเตอร์

Returns the updated notification.

```bash
curl -X POST http://localhost:3000/notifications/5a9c1f7d-3b42-4e68-8d0a-2c6e9b4f8d73/read \
  -H "Authorization: Bearer YOUR_JWT"
```

## Mark all notifications as read

ตั้ง `read_at` ให้ทุกรายการที่ยังไม่อ่านของตัวเองในครั้งเดียว — ใช้ตอนกด
"อ่านทั้งหมด" ในหน้า UI ไม่มีพารามิเตอร์ ตอบกลับเป็นจำนวนรายการที่เพิ่ง mark

```json
{ "marked": 4 }
```

```bash
curl -X POST http://localhost:3000/notifications/read-all \
  -H "Authorization: Bearer YOUR_JWT"
```
