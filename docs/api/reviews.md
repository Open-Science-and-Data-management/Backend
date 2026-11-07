# Reviews

คิวพิจารณา (Review Queue) สำหรับกรรมการ — เป็น read model ของเวอร์ชันล่าสุดต่อแผน (DMP) โหมด `institutional` เท่านั้น แต่ละรายการคือ "รีวิว" ของเวอร์ชันที่ส่งเข้าพิจารณาใหม่ล่าสุดของแผนหนึ่งแผน ทั้งหน้าต้องยืนยันตัวตนด้วย Bearer access token และบทบาท `committee` หรือ `chief` เท่านั้น

## Endpoints

- [$\color{blue}{\textsf{GET}}$ /reviews](#list-reviews) — List reviews

## The Review object

> [!NOTE] Reconstructed from code

```json
{
  "object": "review",
  "id": "01948a2b-7c3f-7d55-9e21-4b8a1f6c2d90:3",
  "dmp_id": "01948a2b-7c3f-7d55-9e21-4b8a1f6c2d90",
  "title": "Data Management Plan: Coastal Erosion Study",
  "version": 3,
  "status": "pending",
  "is_revision": true,
  "active_version": 2,
  "submitted_at": "2026-11-05T03:12:44.000Z",
  "days_waiting": 3,
  "changes_summary": { "major": 1, "minor": 4 },
  "timeline": "Week 6 of 12",
  "researcher": {
    "user_id": "0193c4d8-2f61-7bb2-8c44-1a9d0e3f5b12",
    "name": "Somchai Prasert"
  },
  "project": {
    "project_id": "0194b0e1-8a2c-7f43-9d55-6e7f1a2b3c44",
    "project_name": "Coastal Resilience 2026"
  },
  "decided_at": null,
  "decided_by": null,
  "approver": null,
  "note": null
}
```

### Attributes

- **object** (string, required) ชนิดของอ็อบเจ็กต์ มีค่าเป็น `review` เสมอ
- **id** (string, required) ตัวระบุรีวิว อยู่ในรูป `dmp_id:version` เช่น `01948a2b-…:3` — ใช้เป็นค่า `starting_after` สำหรับเลื่อนหน้า
- **dmp_id** (string, required) รหัสแผน DMP ที่รีวิวนี้ผูกอยู่
- **title** (string, required) ชื่อเรื่องปัจจุบันของแผน
- **version** (string, required) หมายเลขเวอร์ชันล่าสุดของแผน ซึ่งเป็นเวอร์ชันที่อยู่ในคิวพิจารณา
- **status** (string, required) สถานะการพิจารณาของเวอร์ชันนี้

  | Value      | Description                                        |
  | ---------- | -------------------------------------------------- |
  | `pending`  | ส่งเข้าพิจารณาแล้ว ยังรอคำตัดสินจากกรรมการ          |
  | `approved` | กรรมการอนุมัติเวอร์ชันนี้แล้ว                       |
  | `rejected` | กรรมการไม่อนุมัติเวอร์ชันนี้                        |

- **is_revision** (boolean, required) เป็น `true` เมื่อแผนมีเวอร์ชัน active อยู่แล้ว (รายการนี้จึงเป็นการแก้ไขซ้ำ ไม่ใช่การส่งครั้งแรก)
- **active_version** (integer, nullable) หมายเลขเวอร์ชันที่บังคับใช้อยู่ในปัจจุบัน หรือ `null` หากยังไม่มีเวอร์ชันใดได้รับอนุมัติ
- **submitted_at** (timestamp, required) เวลาที่เวอร์ชันนี้ถูกส่งเข้าพิจารณา
- **days_waiting** (integer, required) จำนวนวันปฏิทิน (นับแบบ UTC ตัดเวลา) นับจากวันส่งพิจารณาถึงวันนี้
- **changes_summary** (object, required) สรุปจำนวนการเปลี่ยนแปลงที่บันทึกไว้บนเวอร์ชัน โดยนับรายการ `edit_type` เป็น `major` และนับส่วนที่เหลือเป็น `minor`

  - **major** (integer, required) จำนวนการเปลี่ยนแปลงระดับ major
  - **minor** (integer, required) จำนวนการเปลี่ยนแปลงระดับ minor และรายการอื่นที่ไม่ได้ระบุ `edit_type`

- **timeline** (string, required) สรุปไทม์ไลน์ภาษาอังกฤษที่คำนวณจาก snapshot ของเวอร์ชันที่บังคับใช้ (หากไม่มีใช้ draft ปัจจุบัน)

  | Value                        | Description                                       |
  | ---------------------------- | ------------------------------------------------- |
  | `Week N of M`                | วันนี้อยู่ระหว่างช่วง begin–end ของแผน            |
  | `Starts <date>`              | แผนยังไม่เริ่ม แสดงวันเริ่มต้น (เช่น `Starts Jan 5, 2027`) |
  | `Timeline ended`             | วันนี้เลยวันสิ้นสุดของแผนแล้ว                      |
  | `No timeline set`            | ไม่พบ `begin_date` หรือ `end_date` ที่ถูกต้อง      |

- **researcher** (object, required) ผู้สร้างแผน
  - **user_id** (string, required) รหัสผู้ใช้ของนักวิจัย
  - **name** (string, required) ชื่อ–นามสกุลเต็มของนักวิจัย
- **project** (object, required) โครงการที่แผนผูกอยู่ (อาจเป็น `null` ทั้งคู่หากแผนไม่ได้ผูกโครงการ)
  - **project_id** (string, nullable) รหัสโครงการ หรือ `null` หากไม่ผูกโครงการ
  - **project_name** (string, nullable) ชื่อโครงการ หรือ `null` หากไม่ผูกโครงการ
- **decided_at** (timestamp, nullable) เวลาที่ตัดสิน หรือ `null` หากยังรอพิจารณา
- **decided_by** (string, nullable) รหัสผู้ใช้ของกรรมการที่ตัดสิน หรือ `null` หากยังรอพิจารณา
- **approver** (object, nullable) ข้อมูลผู้อนุมัติตามที่บันทึกไว้บนเวอร์ชัน หรือ `null` หากยังไม่มีคำตัดสิน
  - **user_id** (string, required) รหัสผู้ใช้ของผู้อนุมัติ
  - **name** (string, required) ชื่อของผู้อนุมัติ
  - **position** (string, required) ตำแหน่งของผู้อนุมัติ
  - **mbox** (string, nullable) อีเมลของผู้อนุมัติ หรือ `null` หากไม่มีข้อมูล
- **note** (string, nullable) บันทึกคำตัดสิน (decision note) หรือ `null` หากไม่มี

---

## List reviews

$\color{blue}{\textsf{GET}}$ /reviews

ดึงรายการรีวิวในคิวพิจารณา เรียงตามเวอร์ชันล่าสุดของแผน institutional แต่ละแผน เฉพาะบทบาท `committee` และ `chief` เท่านั้นที่เรียกใช้ได้ ผลลัพธ์เป็น Stripe-style list envelope พร้อม cursor pagination

```curl
curl http://localhost:3000/reviews \
  -H "Authorization: Bearer <access token>" \
  -d status=pending \
  -d sort=-submitted_at
```

### Parameters

- **status** (string, optional) กรองตามสถานะ ระบุได้หลายค่าโดยส่งพารามิเตอร์ซ้ำ (`status=pending&status=approved`) หรือคั่นด้วยเครื่องหมายจุลภาค (`status=pending,approved`) ค่าที่ไม่อยู่ในชุดที่กำหนดทำให้เกิด error 400 `invalid_status`
- **decided_by** (string, optional) กรองตามรหัสผู้ใช้ของกรรมการที่ตัดสิน ใช้ค่าพิเศษ `me` เพื่อกรองเฉพาะรายการที่ผู้เรียกเป็นผู้ตัดสินเอง
- **project_id** (string, optional) กรองเฉพาะแผนของโครงการที่ระบุ
- **submitted_after** (string, optional) กรองเฉพาะรายการที่ส่งพิจารณาหลังเวลาที่กำหนด (ISO date-time) ค่าที่ parse ไม่ได้ทำให้เกิด error 400 `field_invalid`
- **sort** (string, optional) ลำดับการเรียง

  | Value            | Description                                         |
  | ---------------- | --------------------------------------------------- |
  | `submitted_at`   | เรียงตามวันส่งพิจารณาจากเก่าไปใหม่ (ค่า default)     |
  | `-submitted_at`  | เรียงตามวันส่งพิจารณาจากใหม่ไปเก่า                   |
  | `-decided_at`    | เรียงตามวันตัดสินจากใหม่ไปเก่า (รายการที่ยังไม่ตัดสินอยู่ท้ายสุด) |

- **limit** (integer, optional) จำนวนรายการสูงสุดต่อหน้า ค่า default คือ 20 และตัดที่ 100 ค่าไม่ใช่จำนวนเต็มบวกจะถูกแทนที่ด้วยค่า default
- **starting_after** (string, optional) cursor สำหรับเลื่อนหน้า ใส่ `id` ของรีวิวรายการสุดท้ายในหน้าปัจจุบัน (`dmp_id:version`) หาก id ไม่มีอยู่จริงทำให้เกิด error 400 `field_invalid`

### Response

> [!NOTE] Reconstructed from code

```json
{
  "object": "list",
  "data": [
    {
      "object": "review",
      "id": "01948a2b-7c3f-7d55-9e21-4b8a1f6c2d90:3",
      "dmp_id": "01948a2b-7c3f-7d55-9e21-4b8a1f6c2d90",
      "title": "Data Management Plan: Coastal Erosion Study",
      "version": 3,
      "status": "pending",
      "is_revision": true,
      "active_version": 2,
      "submitted_at": "2026-11-05T03:12:44.000Z",
      "days_waiting": 3,
      "changes_summary": { "major": 1, "minor": 4 },
      "timeline": "Week 6 of 12",
      "researcher": {
        "user_id": "0193c4d8-2f61-7bb2-8c44-1a9d0e3f5b12",
        "name": "Somchai Prasert"
      },
      "project": {
        "project_id": "0194b0e1-8a2c-7f43-9d55-6e7f1a2b3c44",
        "project_name": "Coastal Resilience 2026"
      },
      "decided_at": null,
      "decided_by": null,
      "approver": null,
      "note": null
    }
  ],
  "has_more": true,
  "total_count": 34
}
```

### Returns

คืน list envelope ของอ็อบเจ็กต์ Review `has_more` บอกว่ายังมีหน้าถัดไป (ตรวจด้วยการดึง limit+1 รายการภายใน) และ `total_count` คือจำนวนรายการทั้งหมดตาม filter เดียวกันโดยไม่คิด cursor และ limit — เหมาะสำหรับตัวเลข stat card ของ dashboard หากมีหน้าถัดไป ให้เลื่อนด้วย `starting_after` โดยใส่ `id` ของรายการสุดท้ายในหน้าปัจจุบัน

### Errors

| Status | When it happens                                                                            |
| ------ | ------------------------------------------------------------------------------------------ |
| 400    | `invalid_status` — ค่า `status` ไม่อยู่ใน pending, approved, rejected                       |
| 400    | `field_invalid` — `submitted_after` ไม่ใช่ date-time ที่ parse ได้                          |
| 400    | `field_invalid` — `starting_after` ไม่ใช่ review id ที่มีอยู่จริง                           |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                                |
| 403    | `permission_denied` — ผู้เรียกไม่ใช่บทบาท `committee` หรือ `chief`                          |
