# Notifications

การแจ้งเตือน (notifications) เป็น read model ที่สร้างโดยฝั่ง DMP flows (เช่น เมื่อ DMP ถูกส่งอนุมัติ หรือ tasks ถูกสร้าง) และผู้ใช้ดึงมาอ่านผ่าน REST polling เท่านั้น — ทุก endpoint ใช้ Bearer access token และปิดสำหรับผู้ใช้ role `admin` (ตอบ 403 `permission_denied`) เสมอ

> [!NOTE] การส่งมอบการแจ้งเตือนเป็นแบบ REST (poll) เท่านั้น ไม่มี SSE stream endpoint สำหรับ notifications ในระบบ (โค้ดมี schema ของ SSE events เฉพาะฝั่ง AI flow ใน `src/shared/contracts/envelope.ts` ซึ่งไม่เกี่ยวกับ resource นี้)

## Endpoints

- [$\color{blue}{\textsf{GET}}$ /notifications](#list-notifications) — List notifications
- [$\color{green}{\textsf{POST}}$ /notifications/:notification_id/read](#mark-a-notification-as-read) — Mark a notification as read
- [$\color{green}{\textsf{POST}}$ /notifications/read_all](#mark-all-notifications-as-read) — Mark all notifications as read
- [$\color{red}{\textsf{DELETE}}$ /notifications/:notification_id](#delete-a-notification) — Delete a notification
- [$\color{red}{\textsf{DELETE}}$ /notifications](#delete-all-notifications) — Delete all notifications

## The notification object

```json
{
  "object": "notification",
  "notification_id": "018f3a2c-7b41-7d5e-9f2a-3c8b1e6d4a07",
  "user_id": "018f3a2c-7b41-7d5e-9f2a-1d4f9e2b8c30",
  "type": "dmp_approved",
  "title": "DMP approved",
  "message": "Your DMP has been approved by a reviewer.",
  "link": "/projects/018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12/dmps/018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "project_id": "018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12",
  "read_at": null,
  "created_at": "2026-11-08T04:31:20.512Z"
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของ object ค่าจะเป็น `notification` เสมอ
- **notification_id** (string, required) ตัวระบุเฉพาะของการแจ้งเตือน (UUID) ใช้เป็น cursor ใน `starting_after` ด้วย
- **user_id** (string, required) id ของผู้ใช้เจ้าของการแจ้งเตือน
- **type** (string, required) ประเภทของเหตุการณ์ที่ทำให้เกิดการแจ้งเตือน

  | Value                 | Description                                        |
  | --------------------- | -------------------------------------------------- |
  | `dmp_submitted`       | DMP ถูกส่งเพื่อขออนุมัติ                            |
  | `dmp_approved`        | DMP ได้รับการอนุมัติ                                |
  | `dmp_finalized`       | DMP ถูก finalize เป็นฉบับสมบูรณ์                    |
  | `tasks_generated`     | งาน (tasks) ถูกสร้างจาก DMP                         |
  | `tasks_cancelled`     | งาน (tasks) ถูกยกเลิก                               |
  | `proposal_superseded` | proposal ถูกแทนที่ด้วยเวอร์ชันใหม่                   |
  | `review_requested`    | มีคำขอให้ทบทวน (review) DMP                          |
  | `dmp_returned`        | DMP ถูกตีกลับให้แก้ไข                               |

- **title** (string, required) หัวข้อของการแจ้งเตือน (ยาวไม่เกิน 500 ตัวอักษร)
- **message** (string, nullable) ข้อความอธิบายเพิ่มเติม อาจไม่มีค่า
- **link** (string, nullable) path ภายในสำหรับเปิดหน้าที่เกี่ยวข้อง อาจไม่มีค่า
- **dmp_id** (string, nullable) id ของ DMP ที่เกี่ยวข้อง ถ้ามี
- **project_id** (string, nullable) id ของ project ที่เกี่ยวข้อง ถ้ามี
- **read_at** (string, nullable) timestamp ที่ผู้ใช้อ่านแล้ว เป็น `null` หากยังไม่ได้อ่าน
- **created_at** (string, required) timestamp ที่สร้างการแจ้งเตือน

---

## List notifications

$\color{blue}{\textsf{GET}}$ /notifications

ดึงรายการการแจ้งเตือนของผู้ใช้ปัจจุบัน เรียงจากใหม่สุดไปเก่าสุด (`created_at` desc, ใช้ `notification_id` เป็น tiebreak) ใช้ cursor pagination แบบ Stripe และตอบกลับด้วย list envelope ที่เพิ่ม `unread_count`

### Parameters

- **unread** (string, optional) ส่ง `true` เพื่อกรองเฉพาะรายการที่ยังไม่ได้อ่าน หรือ `false` เพื่อขอทุกรายการ ไม่ส่งมาเท่ากับ `false`

  | Value   | Description                             |
  | ------- | --------------------------------------- |
  | `true`  | เฉพาะรายการที่ยังไม่ได้อ่าน (`read_at` เป็น null) |
  | `false` | ทุกรายการของผู้ใช้ (ค่าเริ่มต้น)          |

- **limit** (integer, optional) จำนวนรายการต่อหน้า อยู่ระหว่าง 1–100 ค่าเริ่มต้น 20
- **starting_after** (string, optional) cursor แบบ pagination — ส่ง `notification_id` ตัวสุดท้ายของหน้าก่อนหน้าเพื่อดึงหน้าถัดไป (เอาเฉพาะรายการที่เก่ากว่ารายการนั้น)

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "notification",
      "notification_id": "018f3a2c-7b41-7d5e-9f2a-3c8b1e6d4a07",
      "user_id": "018f3a2c-7b41-7d5e-9f2a-1d4f9e2b8c30",
      "type": "dmp_approved",
      "title": "DMP approved",
      "message": "Your DMP has been approved by a reviewer.",
      "link": "/projects/018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12/dmps/018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
      "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
      "project_id": "018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12",
      "read_at": null,
      "created_at": "2026-11-08T04:31:20.512Z"
    }
  ],
  "has_more": false,
  "total_count": 1,
  "unread_count": 1
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope โดย `data` เป็น array ของ notification object `has_more` ระบุว่ามีหน้าถัดไป (ดึง limit + 1 row มาตรวจ) `total_count` เป็นจำนวนรายการทั้งหมดที่ตรงกับ filter และ `unread_count` เป็นจำนวนรายการที่ยังไม่ได้อ่านของผู้ใช้

### Errors

| Status | When it happens                                                             |
| ------ | --------------------------------------------------------------------------- |
| 400    | `unread` ไม่ใช่ `"true"`/`"false"` หรือ `limit` ไม่ใช่ integer ในช่วง 1–100 (code `field_invalid`, `param` เป็น JSON pointer) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                        |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied` — admin ไม่มีการแจ้งเตือน)      |

---

## Mark a notification as read

$\color{green}{\textsf{POST}}$ /notifications/:notification_id/read

ทำเครื่องหมายว่าอ่านการแจ้งเตือนหนึ่งรายการแล้ว โดยตั้ง `read_at` เป็นเวลาปัจจุบัน operation นี้ idempotent — ถ้าอ่านไปแล้ว `read_at` เดิมจะถูกคงไว้และคืน object เดิมกลับมา

### Parameters

- **notification_id** (string, required) ใน URL path — id ของการแจ้งเตือนที่ต้องการทำเครื่องหมายว่าอ่านแล้ว ต้องเป็นของผู้ใช้ปัจจุบันเท่านั้น

### Response

```json
{
  "object": "notification",
  "notification_id": "018f3a2c-7b41-7d5e-9f2a-3c8b1e6d4a07",
  "user_id": "018f3a2c-7b41-7d5e-9f2a-1d4f9e2b8c30",
  "type": "dmp_approved",
  "title": "DMP approved",
  "message": "Your DMP has been approved by a reviewer.",
  "link": "/projects/018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12/dmps/018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "project_id": "018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12",
  "read_at": "2026-11-08T05:02:11.128Z",
  "created_at": "2026-11-08T04:31:20.512Z"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน notification object ที่ตั้ง `read_at` แล้ว

### Errors

| Status | When it happens                                                       |
| ------ | ---------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                   |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied`)                         |
| 404    | ไม่มีการแจ้งเตือนที่ตรงกับ id นี้สำหรับผู้ใช้ปัจจุบัน (code `notification_not_found`) |

---

## Mark all notifications as read

$\color{green}{\textsf{POST}}$ /notifications/read_all

ทำเครื่องหมายว่าอ่านการแจ้งเตือนที่ยังไม่ได้อ่าน **ทุก** รายการของผู้ใช้ปัจจุบันในครั้งเดียว รายการที่อ่านแล้วแต่เดิมจะไม่ถูกแตะต้อง (คง `read_at` เดิม)

### Parameters

ไม่มีพารามิเตอร์

### Response

```json
{
  "object": "notification_batch",
  "updated": 3
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน batch result object โดย `object` เป็น `notification_batch` และ `updated` เป็นจำนวนรายการที่ถูกทำเครื่องหมายว่าอ่านแล้วในครั้งนี้

### Errors

| Status | When it happens                               |
| ------ | ---------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง           |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied`) |

---

## Delete a notification

$\color{red}{\textsf{DELETE}}$ /notifications/:notification_id

ลบการแจ้งเตือนหนึ่งรายการถาวร ต้องเป็นของผู้ใช้ปัจจุบันเท่านั้น (ของผู้ใช้อื่นตอบ 404)

### Parameters

- **notification_id** (string, required) ใน URL path — id ของการแจ้งเตือนที่ต้องการลบ

### Response

```json
{
  "object": "notification",
  "notification_id": "018f3a2c-7b41-7d5e-9f2a-3c8b1e6d4a07",
  "deleted": true
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน object ที่ระบุว่าลบสำเร็จ โดย `deleted` เป็น `true` เสมอเมื่อตอบกลับได้

### Errors

| Status | When it happens                                                       |
| ------ | ---------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                   |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied`)                         |
| 404    | ไม่มีการแจ้งเตือนที่ตรงกับ id นี้สำหรับผู้ใช้ปัจจุบัน (code `notification_not_found`) |

---

## Delete all notifications

$\color{red}{\textsf{DELETE}}$ /notifications

ลบการแจ้งเตือน **ทุก** รายการของผู้ใช้ปัจจุบันถาวร

### Parameters

ไม่มีพารามิเตอร์

### Response

```json
{
  "object": "notification_batch",
  "deleted": 5
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน batch result object โดย `object` เป็น `notification_batch` และ `deleted` เป็นจำนวนรายการที่ถูกลบ

### Errors

| Status | When it happens                               |
| ------ | ---------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง           |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied`) |
