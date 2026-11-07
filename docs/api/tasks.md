# Tasks

งาน (tasks) คือ checklist การทำงานจริงที่ผูกกับแผนข้อมูล (DMP) หนึ่งฉบับ — งานทั่วไปหรืองานที่ทำหน้าที่กับ output (dataset) หนึ่งตัว งานถูกสร้างโดยผู้เขียนแผน (researcher) เอง นำเข้าจากชุดงานที่ AI เสนอ หรือสร้างอัตโนมัติเมื่อแผนได้รับอนุมัติครั้งแรก ทุก endpoint ใช้ Bearer access token และบังคับบทบาท: **researcher** (ผู้เขียนแผนนั้นเท่านั้น) แก้ไขได้ทุกอย่าง, **committee/chief** อ่านได้ผ่านการเป็นสมาชิกโครงการ ส่วน **admin** เข้าไม่ได้เลย (403 `permission_denied`)

การมองเห็นซ่อนการมีอยู่ของ resource เสมอ — งานหรือแผนที่ไม่ใช่ของคุณตอบ 404 ไม่ใช่ 403

## Endpoints

- [$\color{blue}{\textsf{GET}}$ /tasks](#list-tasks) — List tasks
- [$\color{green}{\textsf{POST}}$ /tasks](#create-a-task) — Create a task
- [$\color{green}{\textsf{POST}}$ /dmps/:dmp_id/tasks/generated](#import-generated-tasks) — Import generated tasks
- [$\color{lime}{\textsf{PATCH}}$ /tasks/:task_id](#update-a-task) — Update a task
- [$\color{green}{\textsf{POST}}$ /tasks/:task_id/complete](#complete-a-task) — Complete a task
- [$\color{green}{\textsf{POST}}$ /tasks/:task_id/reopen](#reopen-a-task) — Reopen a task
- [$\color{green}{\textsf{POST}}$ /tasks/:task_id/cancel](#cancel-a-task) — Cancel a task
- [$\color{red}{\textsf{DELETE}}$ /tasks/:task_id](#delete-a-task) — Delete a task
- [$\color{green}{\textsf{POST}}$ /tasks/:task_id/checklist](#add-a-checklist-item) — Add a checklist item
- [$\color{orange}{\textsf{PUT}}$ /tasks/:task_id/checklist](#replace-the-checklist) — Replace the checklist
- [$\color{lime}{\textsf{PATCH}}$ /tasks/:task_id/checklist/:item_id](#update-a-checklist-item) — Update a checklist item
- [$\color{red}{\textsf{DELETE}}$ /tasks/:task_id/checklist/:item_id](#delete-a-checklist-item) — Delete a checklist item
- [$\color{orange}{\textsf{PUT}}$ /tasks/:task_id/evidence](#set-task-evidence) — Set task evidence
- [$\color{red}{\textsf{DELETE}}$ /tasks/:task_id/evidence](#delete-task-evidence) — Delete task evidence
- [$\color{blue}{\textsf{GET}}$ /dmps/:dmp_id/reopen-offers](#list-reopen-offers) — List reopen offers
- [$\color{green}{\textsf{POST}}$ /reopen-offers/:offer_id/accept](#accept-a-reopen-offer) — Accept a reopen offer
- [$\color{green}{\textsf{POST}}$ /reopen-offers/:offer_id/dismiss](#dismiss-a-reopen-offer) — Dismiss a reopen offer

## The task object

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "lifecycle_stage": "preserve",
  "status": "in_progress",
  "priority": "high",
  "progress_percent": 50,
  "start_date": "2026-11-10",
  "end_date": "2026-12-01",
  "checklist": [
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11", "label": "ถ่ายภาพมุมหน้า", "done": true },
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c12", "label": "ตรวจสี", "done": false }
  ],
  "evidence": {
    "type": "none",
    "ref": null,
    "label": null,
    "attached_at": null
  },
  "generated_by": "user",
  "completed_at": null,
  "completed_by": null,
  "cancelled_from": null,
  "cancel_reason": null,
  "cancelled_dataset_title": null,
  "cancelled_at": null
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของ object ค่าจะเป็น `task` เสมอ
- **task_id** (string, required) ตัวระบุเฉพาะของงาน (UUID)
- **dmp_id** (string, required) id ของแผนที่งานนี้สังกัด
- **dataset_id** (string, nullable) id ของ output ในแผนที่งานนี้ทำหน้าที่ — เป็น `null` เมื่อเป็นงานทั่วไปที่ไม่ผูกกับ output
- **dataset_title** (string, nullable) ชื่อปัจจุบันของ output ดึงจาก snapshot ของเวอร์ชันที่มีผล เป็น `null` เมื่อไม่มี `dataset_id` หรือหา output ไม่เจอใน snapshot
- **source_version_id** (string, nullable) id ของเวอร์ชันแผนที่ใช้เป็นต้นทางตอนสร้างงาน
- **title** (string, required) ชื่องาน (ห้ามว่าง)
- **details** (string, nullable) รายละเอียดเพิ่มเติมของงาน
- **lifecycle_stage** (string, required) ระยะของวงจรชีวิตข้อมูลที่งานนี้อยู่

  | Value     | Description                                    |
  | --------- | ---------------------------------------------- |
  | `collect` | รวบรวม/ผลิตข้อมูล                               |
  | `process` | ประมวลผล/จัดระเบียบข้อมูล                        |
  | `analyse` | วิเคราะห์ข้อมูล                                 |
  | `preserve`| เก็บรักษาระยะยาว (ส่งมอบเข้า repository)         |
  | `share`   | เผยแพร่/แบ่งปันข้อมูล                           |

- **status** (string, required) สถานะปัจจุบันของงาน

  | Value         | Description                                                                                     |
  | ------------- | ----------------------------------------------------------------------------------------------- |
  | `todo`        | ยังไม่เริ่มทำ — ค่าเริ่มต้นเมื่อสร้างงาน                                                           |
  | `in_progress` | กำลังทำอยู่                                                                                      |
  | `done`        | เสร็จสิ้น — เข้าถึงได้ผ่าน Complete a task เท่านั้น (PATCH ที่ส่ง `done` มาจะโดนตีกลับ 409)          |
  | `cancelled`   | ถูกยกเลิก — เก็บบันทึกย้อนหลังไว้ใน `cancelled_from` / `cancel_reason` เพื่อให้เปิดคืนได้พอดีเดิม    |

- **priority** (string, required) ความสำคัญของงาน ค่าเริ่มต้น `medium`

  | Value    | Description   |
  | -------- | ------------- |
  | `low`    | ความสำคัญต่ำ  |
  | `medium` | ความสำคัญปานกลาง |
  | `high`   | ความสำคัญสูง  |

- **progress_percent** (integer, required) ความคืบหน้า 0–100 คำนวณจากสัดส่วน step ที่ tick แล้วใน `checklist` (ปัดเศษ) — ระบบคิดให้เอง ห้ามส่งค่าเข้ามาเอง checklist ว่าง = 0
- **start_date** (string, nullable) วันเริ่มงาน รูปแบบ ISO 8601 เฉพาะวันที่ (`YYYY-MM-DD`)
- **end_date** (string, nullable) วันสิ้นสุดงาน (`YYYY-MM-DD`) — ต้องไม่ก่อน `start_date` ไม่อย่างนั้น request โดนตีกลับ 400
- **checklist** (array of checklist items, required) ขั้นตอนย่อยของงาน — ดึงด้วย endpoint checklist ด้านล่าง
- **evidence** (object, required) หลักฐานการทำงานของงาน ดูโครงสร้างใน Set task evidence
- **generated_by** (string, required) ใครเป็นต้นทางของงาน

  | Value  | Description                                                       |
  | ------ | ----------------------------------------------------------------- |
  | `user` | ผู้เขียนแผนสร้างเอง — สร้างผ่าน Create a task แล้วติดค่านี้เสมอ        |
  | `ai`   | นำเข้าจากชุดงานที่ AI เสนอ หรือสร้างอัตโนมัติตอนแผนได้รับอนุมัติ       |

- **completed_at** (string, nullable) timestamp ที่งานถูกปิดเป็น `done` เป็น `null` ถ้ายังไม่เสร็จหรือเปิดคืนแล้ว
- **completed_by** (string, nullable) user id ของผู้ที่ปิดงาน
- **cancelled_from** (string, nullable) สถานะก่อนถูกยกเลิก (`todo` หรือ `in_progress`) ใช้ restore สถานะเดิมพอดีตอน accept reopen offer
- **cancel_reason** (string, nullable) เหตุผลการยกเลิก

  | Value            | Description                                                            |
  | ---------------- | ---------------------------------------------------------------------- |
  | `manual`         | ผู้ใช้ยกเลิกเองผ่าน Cancel a task                                         |
  | `output_removed` | ยกเลิกอัตโนมัติเพราะ output ที่งานผูกถูกลบออกจากแผนใน revision ที่อนุมัติ     |

- **cancelled_dataset_title** (string, nullable) ชื่อ output ที่ถูกลบตอนถูกยกเลิกด้วยเหตุ `output_removed` — ใช้จับคู่กลับเมื่อ output กลับมาใหม่ภายใต้ id ใหม่
- **cancelled_at** (string, nullable) timestamp ที่ถูกยกเลิก

## The checklist item object

Checklist คือวิธีตัดงานเป็น step ย่อย — ไม่มีวันที่ ไม่มีสถานะของตัวเอง มีแค่ชื่อ step กับว่า tick หรือยัง เก็บเป็น array เต็มบน task เดียว

```json
{
  "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11",
  "label": "ถ่ายภาพมุมหน้า",
  "done": true
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **item_id** (string, required) id ของ step (UUID) ระบบสร้างให้เองเมื่อเพิ่ม step ใหม่
- **label** (string, required) ชื่อ step (ห้ามว่าง)
- **done** (boolean, required) tick แล้วหรือยัง ค่าเริ่มต้น `false`

## The reopen offer object

เมื่อ output ที่มีงานผูกอยู่ถูกลบออกจากแผน (งานถูกยกเลิกด้วยเหตุ `output_removed`) ระบบเตรียม "offer เปิดงานคืน" ให้ผู้เขียนแผน — ถ้า output ตัวนั้นกลับมาในแผนอีกครั้ง (แม้จะได้ id ใหม่) ผู้เขียนเลือก accept เพื่อดึงงานกลับมาทำต่อ หรือ dismiss เพื่อปล่อยไป แถว offer หลายแถวของ output เดียวกัน (จับกลุ่มด้วย `dataset_id` หรือชื่อ) ถูกรวมเป็น object เดียวตอนตอบกลับ และการตอบ (accept/dismiss) จะปิดทั้งกลุ่มพร้อมกัน

```json
{
  "object": "reopen_offer",
  "offer_id": "0190a8d5-9e1b-7f2c-8a4d-2c6f0b3e5d71",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "created_at": "2026-11-08T09:15:42.311Z",
  "tasks": [
    {
      "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c91",
      "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
      "status": "cancelled",
      "cancelled_from": "in_progress"
    }
  ]
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของ object ค่าจะเป็น `reopen_offer` เสมอ
- **offer_id** (string, required) id ตัวแทนของกลุ่ม offer (UUID ของแถวแรกในกลุ่ม) ใช้ใน path ของ accept/dismiss
- **dmp_id** (string, required) id ของแผนที่ offer นี้อยู่
- **dataset_id** (string, nullable) id ของ output ที่ถูกลบ เป็น `null` ถ้าจับคู่ด้วยชื่ออย่างเดียว
- **dataset_title** (string, required) ชื่อ output ตอนถูกลบ — ใช้จับคู่กลับเมื่อ output กลับมาใหม่ภายใต้ id ใหม่
- **created_at** (string, required) timestamp ที่ offer ถูกสร้าง
- **tasks** (array, required) งานที่ถูกยกเลิกในกลุ่มนี้ แต่ละตัวมี **task_id**, **title**, **status** (`cancelled` เสมอ) และ **cancelled_from** (สถานะก่อนยกเลิก ซึ่งจะถูกคืนกลับเมื่อ accept)

## Generated tasks

ชุดงานที่ AI เสนอไม่ถูกสร้างในระบบทันที — ฝั่งผู้ใช้ดึงข้อเสนอมาแล้วยิง POST /dmps/:dmp_id/tasks/generated เพื่อ "นำเข้า" เป็นงานจริง พฤติกรรมสำคัญ:

- **mode: add** — เติมงานใหม่บนงานเดิมทั้งหมด
- **mode: replace** — ลบเฉพาะงาน AI ที่ *ยังไม่ถูกแตะ* ทิ้งก่อน (generated_by เป็น `ai`, status `todo`, progress 0% และไม่มี evidence) งานที่ผู้ใช้แตะแล้ว — tick checklist, ใส่ evidence, เปลี่ยนสถานะ — จะรอดทั้งหมด (preservation)
- ทุกงานที่นำเข้าถูกติด `generated_by: "ai"` และผูก `source_version_id` กับเวอร์ชันที่มีผล ณ ตอนนั้น
- `dataset_id` ของแต่ละงานต้องเป็น output ที่มีอยู่ในเวอร์ชันที่มีผลของแผน ไม่อย่างนั้นทั้ง request โดนตีกลับ 400
- การนำเข้าตั้งธง `tasks_generated` บนแผน — ระบบจะไม่ generate ชุดอัตโนมัติตอนอนุมัติซ้ำอีก

---

## List tasks

$\color{blue}{\textsf{GET}}$ /tasks

ดึงรายการงาน — **ต้องกรองด้วย `project_id` หรือ `dmp_id` อย่างน้อยหนึ่งตัว** เรียงตามลำดับ stage ของวงจรชีวิต (`collect` → `process` → `analyse` → `preserve` → `share`) แล้วตามชื่องาน (A→Z) ใช้ `task_id` เป็น tiebreak researcher เห็นเฉพาะงานของแผนที่ตัวเองเขียน committee/chief เห็นผ่านการเป็นสมาชิกโครงการ (กรองด้วย `dmp_id` ต้องผ่านการตรวจการมองเห็นโครงการของแผนด้วย)

### Parameters

- **project_id** (string, optional) กรองงานของทุกแผนในโครงการ — สำหรับ researcher จะได้เฉพาะแผนที่ตัวเองเขียน (กรองเงียบ ๆ ไม่ throw) ต้องส่งอย่างน้อยหนึ่งจาก `project_id`/`dmp_id` ไม่งั้น 400
- **dmp_id** (string, optional) กรองงานของแผนหนึ่ง — researcher ที่ไม่ใช่ผู้เขียนแผนนั้นจะเห็น 404 (ซ่อนการมีอยู่) ต้องส่งอย่างน้อยหนึ่งจาก `project_id`/`dmp_id` ไม่งั้น 400
- **status** (string, optional) กรองตามสถานะงาน

  | Value         | Description        |
  | ------------- | ------------------ |
  | `todo`        | ยังไม่เริ่มทำ      |
  | `in_progress` | กำลังทำ            |
  | `done`        | เสร็จสิ้น           |
  | `cancelled`   | ถูกยกเลิก           |

- **limit** (integer, optional) จำนวนรายการต่อหน้า สูงสุด 100 ค่าเริ่มต้น 20 — ค่าที่ parse ไม่ได้หรือน้อยกว่า 1 จะใช้ค่าเริ่มต้นเงียบ ๆ (ไม่ throw)
- **starting_after** (string, optional) cursor แบบ pagination — ส่ง `task_id` ตัวสุดท้ายของหน้าก่อนหน้าเพื่อขอรายการถัดจากตัวนั้น ต้องเป็นงานที่อยู่ในผลลัพธ์ชุดเดิม ไม่งั้น 400

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "task",
      "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
      "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
      "dataset_id": "ds-photos-001",
      "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
      "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
      "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
      "details": "ถ่าย 3 มุม อัตรา 600 dpi",
      "lifecycle_stage": "preserve",
      "status": "in_progress",
      "priority": "high",
      "progress_percent": 50,
      "start_date": "2026-11-10",
      "end_date": "2026-12-01",
      "checklist": [
        { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11", "label": "ถ่ายภาพมุมหน้า", "done": true },
        { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c12", "label": "ตรวจสี", "done": false }
      ],
      "evidence": { "type": "none", "ref": null, "label": null, "attached_at": null },
      "generated_by": "user",
      "completed_at": null,
      "completed_by": null,
      "cancelled_from": null,
      "cancel_reason": null,
      "cancelled_dataset_title": null,
      "cancelled_at": null
    }
  ],
  "has_more": false,
  "total_count": 1
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope โดย `data` เป็น array ของ task object `has_more` ระบุว่ามีรายการถัดไปจากหน้านี้ และ `total_count` เป็นจำนวนงานทั้งหมดที่ตรงกับ filter (ไม่ใช่จำนวนในหน้านี้) ใช้ `starting_after` กับ `task_id` ตัวสุดท้ายเพื่อดึงหน้าถัดไป

### Errors

| Status | When it happens                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 400    | ไม่ส่งทั้ง `project_id` และ `dmp_id` (code `filter_required`) / `status` ไม่อยู่ใน 4 ค่า (code `invalid_status`, `param` = `/status`) / `starting_after` ไม่ใช่งานในผลลัพธ์นี้ (code `field_invalid`, `param` = `/starting_after`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                          |
| 403    | ผู้เรียกเป็น `admin` (code `permission_denied` — admin ไม่มีสิทธิ์เข้างาน)                                          |
| 404    | `dmp_id` ไม่มีในระบบหรือ researcher ไม่ใช่ผู้เขียนแผน (code `dmp_not_found`) / `project_id` ไม่มีในระบบหรือไม่เห็นโครงการ (code `project_not_found`) |

---

## Create a task

$\color{green}{\textsf{POST}}$ /tasks

สร้างงานใหม่บนแผนหนึ่ง — researcher ผู้เขียนแผนเท่านั้น แผนต้องมีเวอร์ชันที่มีผล (in force) อยู่ก่อน และถ้าผูก `dataset_id` output ตัวนั้นต้องอยู่ในเวอร์ชันที่มีผลด้วย งานที่สร้างทางนี้ถูกติด `generated_by: "user"` เสมอ ไม่ว่า body จะพยายามส่งค่าอื่นมา

### Request

```json
{
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "start_date": "2026-11-10",
  "end_date": "2026-12-01",
  "lifecycle_stage": "preserve",
  "priority": "high"
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **dmp_id** (string, required) แผนที่งานนี้สังกัด ต้องเป็นแผนที่ผู้เรียกเขียนเอง
- **title** (string, required) ชื่องาน (ห้ามว่าง)
- **lifecycle_stage** (string, required) ระยะวงจรชีวิตของงาน — `collect` / `process` / `analyse` / `preserve` / `share`
- **dataset_id** (string, optional) output ในแผนที่งานนี้ทำหน้าที่ ต้องอยู่ในเวอร์ชันที่มีผล เว้นไว้ = งานทั่วไปไม่ผูก output
- **details** (string, optional) รายละเอียดงาน
- **start_date** (string, optional) วันเริ่มงาน (ISO 8601)
- **end_date** (string, optional) วันสิ้นสุดงาน — ต้องไม่ก่อน `start_date` ไม่งั้น 400
- **priority** (string, optional) ความสำคัญ `low` / `medium` / `high` ค่าเริ่มต้น `medium`

### Response

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "lifecycle_stage": "preserve",
  "status": "todo",
  "priority": "high",
  "progress_percent": 0,
  "start_date": "2026-11-10",
  "end_date": "2026-12-01",
  "checklist": [],
  "evidence": { "type": "none", "ref": null, "label": null, "attached_at": null },
  "generated_by": "user",
  "completed_at": null,
  "completed_by": null,
  "cancelled_from": null,
  "cancel_reason": null,
  "cancelled_dataset_title": null,
  "cancelled_at": null
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่เพิ่งสร้าง สถานะเริ่มต้น `todo`, checklist ว่าง, progress 0%

### Errors

| Status | When it happens                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูปตาม schema (code `field_invalid`, `param` เป็น JSON pointer ชี้ field แรกที่ผิด รวมถึง `end_date` ย้อนหลัง `start_date`) / `dataset_id` ไม่อยู่ในเวอร์ชันที่มีผล (code `dataset_not_in_force`, `param` = `/dataset_id`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                                 |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                          |
| 404    | ไม่มีแผนตาม `dmp_id` (code `dmp_not_found`) หรือ researcher ไม่ใช่ผู้เขียนแผน (code `task_not_found` — ซ่อนการมีอยู่)        |
| 409    | แผนยังไม่มีเวอร์ชันที่มีผล (code `plan_not_in_force`)                                                                       |

---

## Import generated tasks

$\color{green}{\textsf{POST}}$ /dmps/:dmp_id/tasks/generated

นำเข้าชุดงานที่ AI เสนอเป็นงานจริงบนแผน — researcher ผู้เขียนแผนเท่านั้น ดูพฤติกรรมของ `mode` ทั้งสองแบบในหัวข้อ Generated tasks ด้านบน

### Request

```json
{
  "mode": "replace",
  "tasks": [
    {
      "dataset_id": "ds-photos-001",
      "title": "จัดทำ metadata ชุดภาพถ่าย",
      "details": "กรอก Dublin Core ให้ครบทุกภาพ",
      "lifecycle_stage": "process",
      "priority": "medium"
    },
    {
      "title": "เตรียมแผนสำรองข้อมูล",
      "lifecycle_stage": "preserve",
      "priority": "high",
      "start_date": "2026-11-15",
      "end_date": "2026-11-30"
    }
  ]
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **mode** (string, required) วิธีนำเข้า

  | Value     | Description                                                                    |
  | --------- | ------------------------------------------------------------------------------ |
  | `add`     | เติมงานใหม่บนงานเดิมทั้งหมด                                                     |
  | `replace` | ลบงาน AI ที่ยังไม่ถูกแตะทิ้งก่อนแล้วค่อยเติม — งานที่ผู้ใช้แตะแล้วรอดทั้งหมด         |

- **tasks** (array, required) รายการงานที่จะนำเข้า (ว่างได้ — ใช้เพื่อลบงาน AI ที่ยังไม่ถูกแตะในโหมด `replace` อย่างเดียว)
  - **title** (string, required) ชื่องาน (ห้ามว่าง)
  - **lifecycle_stage** (string, required) ระยะวงจรชีวิต — `collect` / `process` / `analyse` / `preserve` / `share`
  - **dataset_id** (string, optional) output ที่งานผูก — ต้องอยู่ในเวอร์ชันที่มีผล
  - **details** (string, nullable, optional) รายละเอียดงาน
  - **priority** (string, optional) `low` / `medium` / `high` ค่าเริ่มต้น `medium`
  - **start_date** (string, optional) วันเริ่มงาน (ISO 8601)
  - **end_date** (string, optional) วันสิ้นสุดงาน

### Response

```json
{
  "object": "generated_tasks",
  "added": 2,
  "removed": 1,
  "kept": 3,
  "data": [
    {
      "object": "task",
      "task_id": "0190a8d6-3f7a-7c1e-9b2d-4e8a0c5f1d33",
      "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
      "dataset_id": "ds-photos-001",
      "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
      "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
      "title": "จัดทำ metadata ชุดภาพถ่าย",
      "details": "กรอก Dublin Core ให้ครบทุกภาพ",
      "lifecycle_stage": "process",
      "status": "todo",
      "priority": "medium",
      "progress_percent": 0,
      "start_date": null,
      "end_date": null,
      "checklist": [],
      "evidence": { "type": "none", "ref": null, "label": null, "attached_at": null },
      "generated_by": "ai",
      "completed_at": null,
      "completed_by": null,
      "cancelled_from": null,
      "cancel_reason": null,
      "cancelled_dataset_title": null,
      "cancelled_at": null
    }
  ]
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน object สรุปผลการนำเข้า: `added` จำนวนงานที่เพิ่งเพิ่ม, `removed` จำนวนงาน AI ที่ยังไม่ถูกแตะที่ถูกลบ (โหมด `replace` เท่านั้น ไม่งั้น 0), `kept` จำนวนงานคงเหลือบนแผนก่อนเติมชุดใหม่ และ `data` เป็น array ของ task object ที่เพิ่งเพิ่ม (ติด `generated_by: "ai"` ทั้งหมด)

### Errors

| Status | When it happens                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูป (code `field_invalid`) / `dataset_id` ของงานใดงานหนึ่งไม่อยู่ในเวอร์ชันที่มีผล (code `dataset_not_in_force`, `param` = `/tasks`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                    |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                            |
| 404    | ไม่มีแผนตาม `dmp_id` (code `dmp_not_found`) หรือ researcher ไม่ใช่ผู้เขียนแผน (code `task_not_found`)          |
| 409    | แผนยังไม่มีเวอร์ชันที่มีผล (code `plan_not_in_force`)                                                         |

---

## Update a task

$\color{lime}{\textsf{PATCH}}$ /tasks/:task_id

แก้งานบางส่วน — ส่งเฉพาะ field ที่จะแก้ ตัวที่เว้นไว้คงเดิม researcher ผู้เขียนแผนเท่านั้น ข้อยกเว้นสำคัญ: การปิดงานต้องใช้ Complete a task เสมอ (ส่ง `status: "done"` มาโดนตีกลับ) และงานที่เสร็จแล้วเปลี่ยน output ที่ผูกไม่ได้ — ต้อง Reopen ก่อน

### Request

```json
{
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา (ฉบับแก้ไข)",
  "status": "in_progress",
  "priority": "high",
  "end_date": "2026-12-05"
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะแก้ ต้องเป็นงานบนแผนที่ผู้เรียกเขียนเอง
- **title** (string, optional) ชื่องานใหม่ (ห้ามว่าง)
- **details** (string, nullable, optional) รายละเอียดใหม่ — ส่ง `null` เพื่อล้าง
- **dataset_id** (string, nullable, optional) เปลี่ยน output ที่งานผูก — ส่ง `null` เพื่อแปลงเป็นงานทั่วไป งานที่เสร็จแล้วเปลี่ยนค่านี้ไม่ได้ (409)
- **start_date** (string, optional) วันเริ่มงานใหม่ (ISO 8601)
- **end_date** (string, optional) วันสิ้นสุดงานใหม่ — คู่กับ `start_date` ที่ผลลัพธ์ต้องไม่สลับลำดับ ไม่งั้น 400
- **lifecycle_stage** (string, optional) ระยะวงจรชีวิตใหม่ — `collect` / `process` / `analyse` / `preserve` / `share`
- **status** (string, optional) สถานะใหม่ — `todo` / `in_progress` / `cancelled` (ส่ง `done` มา → 409)

  | Value         | Description                          |
  | ------------- | ------------------------------------ |
  | `todo`        | ยังไม่เริ่มทำ                         |
  | `in_progress` | กำลังทำ                               |
  | `cancelled`   | ยกเลิก (แนะนำใช้ Cancel a task แทน)    |

- **priority** (string, optional) ความสำคัญใหม่ — `low` / `medium` / `high`

### Response

คืน task object ฉบับเต็มหลังแก้ (โครงสร้างเดียวกับ The task object)

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา (ฉบับแก้ไข)",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "lifecycle_stage": "preserve",
  "status": "in_progress",
  "priority": "high",
  "progress_percent": 50,
  "start_date": "2026-11-10",
  "end_date": "2026-12-05",
  "checklist": [
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11", "label": "ถ่ายภาพมุมหน้า", "done": true },
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c12", "label": "ตรวจสี", "done": false }
  ],
  "evidence": { "type": "none", "ref": null, "label": null, "attached_at": null },
  "generated_by": "user",
  "completed_at": null,
  "completed_by": null,
  "cancelled_from": null,
  "cancel_reason": null,
  "cancelled_dataset_title": null,
  "cancelled_at": null
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน task object หลังปรับค่าแล้วทั้งก้อน

### Errors

| Status | When it happens                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูป (code `field_invalid`, `param` เป็น JSON pointer — รวมถึงลำดับวันที่สลับหลังแก้)                             |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                              |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                       |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)                                              |
| 409    | ส่ง `status: "done"` (code `use_complete` — ปิดงานต้องใช้ Complete a task) / เปลี่ยน `dataset_id` ของงานที่เสร็จแล้ว (code `output_locked`) |

---

## Complete a task

$\color{green}{\textsf{POST}}$ /tasks/:task_id/complete

ปิดงานเป็น `done` — researcher ผู้เขียนแผนเท่านั้น ก่อนปิดระบบตรวจว่า evidence ของงานตอบความต้องการของ stage หรือไม่ (ตารางด้านล่าง) การปิดจะ tick checklist ทุก step, ตั้ง progress 100%, บันทึก `completed_at`/`completed_by` และถ้างานผูก output ไว้ จะผลักสถานะของ output ไปตาม stage ของงาน (ไปหน้าเท่านั้น ไม่มีวันถอยหลัง)

ความต้องการ evidence ตามลักษณะงาน:

| ลักษณะงาน                                                            | Requirement       | evidence type ที่ผ่าน                        |
| -------------------------------------------------------------------- | ----------------- | -------------------------------------------- |
| งานทั่วไป (ไม่ผูก output)                                             | `declared`        | อะไรก็ได้ — ผ่านเสมอ                          |
| งานที่ผูก output, stage `collect` / `process` / `analyse`              | `evidence_linked` | `file` / `url` / `rdm_deposit`               |
| งาน stage `preserve` / `share` บนแผน institutional                     | `system_verified` | `rdm_deposit` เท่านั้น (ต้องมาจาก repository) |
| งาน stage `preserve` / `share` บนแผน independent                       | `evidence_linked` | `file` / `url` / `rdm_deposit`               |

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะปิด

### Response

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "lifecycle_stage": "preserve",
  "status": "done",
  "priority": "high",
  "progress_percent": 100,
  "start_date": "2026-11-10",
  "end_date": "2026-12-05",
  "checklist": [
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11", "label": "ถ่ายภาพมุมหน้า", "done": true },
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c12", "label": "ตรวจสี", "done": true }
  ],
  "evidence": {
    "type": "rdm_deposit",
    "ref": "10.5281/zenodo.10245312",
    "label": "เก็บใน Zenodo แล้ว",
    "attached_at": "2026-11-30T08:12:40.107Z"
  },
  "generated_by": "user",
  "completed_at": "2026-11-30T10:02:15.884Z",
  "completed_by": "0190a7b0-1d3e-7f5a-8c6b-2e4d6a8c0f17",
  "cancelled_from": null,
  "cancel_reason": null,
  "cancelled_dataset_title": null,
  "cancelled_at": null
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน task object สถานะ `done` checklist ถูก tick ทุก step, `progress_percent` เป็น 100 และ `completed_at`/`completed_by` ถูกบันทึก

### Errors

| Status | When it happens                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                                                |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                                         |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)                                                                |
| 409    | งานเสร็จแล้ว (code `task_done`) / งานถูกยกเลิก (code `task_cancelled`) / evidence ยังไม่ตอบความต้องการของ stage (code `evidence_required` พร้อม field `requirement` บอกสิ่งที่ต้องการ) / แผนไม่มีเวอร์ชันที่มีผล (code `plan_not_in_force`) |

---

## Reopen a task

$\color{green}{\textsf{POST}}$ /tasks/:task_id/reopen

เปิดงานที่เสร็จแล้วกลับมาทำต่อ — ได้ใช้เฉพาะกับงานสถานะ `done` evidence และการ tick ของ checklist **คงอยู่ทั้งหมด** สถานะใหม่จะเป็น `in_progress` ถ้ามี step ที่ tick แล้วอยู่ ไม่งั้นกลับไป `todo` พร้อมล้าง `completed_at`/`completed_by`

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะเปิดคืน

### Response

คืน task object หลังเปิดคืน (โครงสร้างเดียวกับ The task object — เช่น `status` เปลี่ยนเป็น `in_progress`, `completed_at` กับ `completed_by` เป็น `null`, evidence เดิมยังอยู่)

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่เปิดคืนแล้ว

### Errors

| Status | When it happens                                                                    |
| ------ | ------------------------------------------------------------------------------------ |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)             |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                      |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)             |
| 409    | งานยังไม่ได้เสร็จ — เปิดได้เฉพาะงานสถานะ `done` (code `task_not_done`)                  |

---

## Cancel a task

$\color{green}{\textsf{POST}}$ /tasks/:task_id/cancel

ยกเลิกงานที่ยังไม่เสร็จ — ระบบจดสถานะก่อนยกเลิกไว้ใน `cancelled_from`, ตั้ง `cancel_reason: "manual"` และ `cancelled_at` เพื่อให้เปิดคืนได้ตรงจุดเดิมผ่าน reopen offer (งานที่โดนยกเลิกอัตโนมัติเพราะ output ถูกลบใช้เหตุ `output_removed` แทน) ทำซ้ำกับงานที่ยกเลิกแล้วได้ — คืน object เดิมโดยไม่แก้อะไร (idempotent) งานที่เสร็จแล้วยกเลิกไม่ได้ — ต้อง Reopen ก่อน

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะยกเลิก

### Response

คืน task object สถานะ `cancelled` เช่น:

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c92",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "เตรียมแผนสำรองข้อมูล",
  "details": null,
  "lifecycle_stage": "preserve",
  "status": "cancelled",
  "priority": "medium",
  "progress_percent": 0,
  "start_date": null,
  "end_date": null,
  "checklist": [],
  "evidence": { "type": "none", "ref": null, "label": null, "attached_at": null },
  "generated_by": "ai",
  "completed_at": null,
  "completed_by": null,
  "cancelled_from": "todo",
  "cancel_reason": "manual",
  "cancelled_dataset_title": null,
  "cancelled_at": "2026-11-08T11:40:02.550Z"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน task object สถานะ `cancelled` พร้อมบันทึก `cancelled_from` / `cancel_reason` / `cancelled_at`

### Errors

| Status | When it happens                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                     |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                             |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)                                    |
| 409    | งานเสร็จแล้ว — ยกเลิกไม่ได้ ต้อง reopen ก่อน (code `task_done`)                                                |

---

## Delete a task

$\color{red}{\textsf{DELETE}}$ /tasks/:task_id

ลบงานถาวร — ได้เฉพาะงานที่ *ยังไม่มีบันทึกการทำงาน* คือไม่มี evidence, ไม่มี step ที่ถูก tick และไม่เคยถูกปิดเป็น done ถ้ามีบันทึกแล้วให้ใช้ Cancel a task แทน (preservation — งานที่มีประวัติจะไม่หายจากระบบ)

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะลบ

### Response

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c93",
  "deleted": true
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน object ที่ระบุว่าลบสำเร็จ โดย `deleted` เป็น `true` เสมอเมื่อตอบกลับได้

### Errors

| Status | When it happens                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                                   |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                            |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)                                                   |
| 409    | งานมีบันทึกการทำงานแล้ว (evidence, step ที่ tick แล้ว หรือเคยเสร็จ) — ให้ยกเลิกแทน (code `task_has_recorded_work`)              |

---

## Add a checklist item

$\color{green}{\textsf{POST}}$ /tasks/:task_id/checklist

เพิ่ม step ใหม่ต่อท้าย checklist ของงาน — ระบบสร้าง `item_id` ให้เองและตั้ง `done: false` `progress_percent` ถูกคำนวณใหม่ให้อัตโนมัติ

### Request

```json
{
  "label": "ถ่ายภาพมุมหน้า"
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะเพิ่ม step
- **label** (string, required) ชื่อ step — ค่าว่างหรือมีแต่ช่องว่างโดนตีกลับ 400

### Response

คืน task object ฉบับเต็มพร้อม checklist ที่มี step ใหม่ต่อท้าย (โครงสร้างเดียวกับ The task object)

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่ checklist เพิ่มแล้ว พร้อม `progress_percent` ใหม่

### Errors

| Status | When it happens                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูป (code `field_invalid`) / `label` ว่างหรือมีแต่ช่องว่าง (code `label_required`, `param` = `/label`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                        |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)                                |

---

## Replace the checklist

$\color{orange}{\textsf{PUT}}$ /tasks/:task_id/checklist

แทนที่ checklist ของงานทั้งชุดด้วยรายชื่อ step ใหม่ — **step ที่ถูก tick แล้วจะรอด** (preservation): ระบบคง step ที่ `done: true` เอาไว้ด้านหน้า แล้วสร้าง step ใหม่จาก `labels` ต่อท้าย (ได้ `item_id` ใหม่และ `done: false` ทั้งหมด) ใช้ endpoint นี้เมื่อต้องการจัดโครง step ใหม่ทั้งหมดโดยไม่เสียความคืบหน้า

### Request

```json
{
  "labels": ["ถ่ายภาพมุมหน้า", "ถ่ายภาพมุมข้าง", "ตรวจสี"]
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะแทนที่ checklist
- **labels** (array of strings, required) ชื่อ step ทั้งหมดที่ต้องการ — `item_id` และ `done` ระบบจัดการให้เอง ส่ง array ว่างได้ (เช็คเลิกทุก step ที่ยังไม่ tick)

### Response

คืน task object ฉบับเต็มพร้อม checklist ชุดใหม่ — step ที่ tick แล้วเดิม (ถ้ามี) นำหน้า ตามด้วย step ใหม่ทั้งหมด (โครงสร้างเดียวกับ The task object)

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่ checklist ถูกแทนแล้ว พร้อม `progress_percent` ที่คำนวณใหม่

### Errors

| Status | When it happens                                                                |
| ------ | ---------------------------------------------------------------------------------- |
| 400    | body ผิดรูป — เช่น `labels` ไม่ใช่ array ของ string (code `field_invalid`)            |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)             |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                     |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)            |

---

## Update a checklist item

$\color{lime}{\textsf{PATCH}}$ /tasks/:task_id/checklist/:item_id

tick (หรือเอา tick ออก) หรือแก้ชื่อของ step หนึ่ง — ส่งเฉพาะ field ที่จะแก้ ตัวที่เว้นไว้คงเดิม `progress_percent` ของงานถูกคำนวณใหม่ให้อัตโนมัติ

### Request

```json
{
  "done": true
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานเจ้าของ checklist
- **item_id** (string, required) ใน URL path — id ของ step ที่จะแก้
- **label** (string, optional) ชื่อ step ใหม่ เว้นไว้ = คงชื่อเดิม
- **done** (boolean, optional) สถานะ tick ใหม่ เว้นไว้ = คงสถานะเดิม

### Response

คืน task object ฉบับเต็มพร้อม checklist ที่แก้แล้ว (โครงสร้างเดียวกับ The task object)

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่แก้ step แล้ว พร้อม `progress_percent` ใหม่

### Errors

| Status | When it happens                                                                            |
| ------ | --------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูป (code `field_invalid`)                                                             |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                       |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                               |
| 404    | ไม่มีงานตาม `task_id` (code `task_not_found`) / งานไม่มี step ตาม `item_id` (code `item_not_found`) |

---

## Delete a checklist item

$\color{red}{\textsf{DELETE}}$ /tasks/:task_id/checklist/:item_id

ลบ step หนึ่งออกจาก checklist — `progress_percent` ถูกคำนวณใหม่ให้อัตโนมัติ ลบ step ที่ tick แล้วได้เช่นกัน (ต่างจาก Replace the checklist ที่เก็บไว้)

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานเจ้าของ checklist
- **item_id** (string, required) ใน URL path — id ของ step ที่จะลบ

### Response

คืน task object ฉบับเต็มหลังลบ step (โครงสร้างเดียวกับ The task object)

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่ step ถูกลบแล้ว พร้อม `progress_percent` ใหม่

### Errors

| Status | When it happens                                                                            |
| ------ | --------------------------------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                       |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                               |
| 404    | ไม่มีงานตาม `task_id` (code `task_not_found`) / งานไม่มี step ตาม `item_id` (code `item_not_found`) |

---

## Set task evidence

$\color{orange}{\textsf{PUT}}$ /tasks/:task_id/evidence

ตั้งหลักฐานการทำงานของงาน — งานที่เสร็จแล้วแก้ evidence ไม่ได้ ต้อง Reopen ก่อน กฎพิเศษที่ระบบบังคับ:

- ถ้า `ref` ที่ส่งมาตรงรูปแบบ DOI (เช่น `10.5281/zenodo.10245312` หรือลิงก์ `doi.org/10.…`) ระบบจัด type เป็น `rdm_deposit` ให้เสมอ ไม่ว่าจะประกาศ type มาว่าอะไร — DOI คือหลักฐานชนิดเดียวที่ผู้วิจัยสร้างเองไม่ได้
- `type: "file"` ต้องชี้ไฟล์ที่อัปโหลดไว้บนโครงการของแผนจริง ไม่งั้น 404
- `type` อื่นที่ไม่ใช่ `none` ต้องมี `ref` ไม่งั้น 400

ต้องการ evidence ของแต่ละ stage ดูตารางใน Complete a task

### Request

```json
{
  "type": "rdm_deposit",
  "ref": "10.5281/zenodo.10245312",
  "label": "เก็บใน Zenodo แล้ว"
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะตั้ง evidence
- **type** (string, optional) ชนิดหลักฐาน ค่าเริ่มต้น `none`

  | Value         | Description                                              |
  | ------------- | -------------------------------------------------------- |
  | `none`        | ยังไม่มีหลักฐาน                                          |
  | `file`        | ไฟล์ output ที่อัปโหลดไว้บนโครงการของแผน                    |
  | `url`         | ลิงก์ชี้ไปที่ output                                      |
  | `rdm_deposit` | DOI ที่ repository ออกให้ — หลักฐานที่ปลอมไม่ได้             |

- **ref** (string, optional) file id / URL / DOI ตาม `type` — ต้องมีเมื่อ `type` ≠ `none` (ไม่มี → 400)
- **label** (string, optional) ชื่อแสดงผลของหลักฐาน

### Response

คืน task object ฉบับเต็มพร้อม evidence ใหม่ เช่น:

```json
{
  "object": "task",
  "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c90",
  "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
  "dataset_id": "ds-photos-001",
  "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
  "source_version_id": "0190a7c0-8f4b-7d2c-9e5a-3b7d1f4e6c88",
  "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
  "details": "ถ่าย 3 มุม อัตรา 600 dpi",
  "lifecycle_stage": "preserve",
  "status": "in_progress",
  "priority": "high",
  "progress_percent": 50,
  "start_date": "2026-11-10",
  "end_date": "2026-12-05",
  "checklist": [
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c11", "label": "ถ่ายภาพมุมหน้า", "done": true },
    { "item_id": "0190a7c1-6a3b-7e4d-8c2f-9d5e1a3b7c12", "label": "ตรวจสี", "done": false }
  ],
  "evidence": {
    "type": "rdm_deposit",
    "ref": "10.5281/zenodo.10245312",
    "label": "เก็บใน Zenodo แล้ว",
    "attached_at": "2026-11-30T08:12:40.107Z"
  },
  "generated_by": "user",
  "completed_at": null,
  "completed_by": null,
  "cancelled_from": null,
  "cancel_reason": null,
  "cancelled_dataset_title": null,
  "cancelled_at": null
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน task object ที่ `evidence` ถูกแทนด้วยค่าใหม่ โดย `evidence.attached_at` เป็นเวลาที่ระบบบันทึกให้เอง

### Errors

| Status | When it happens                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | body ผิดรูป (code `field_invalid`) / `type` ≠ `none` แต่ไม่มี `ref` (code `ref_required`, `param` = `/ref`)                                                              |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                                                                              |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                                                                       |
| 404    | ไม่มีงานตาม `task_id` (code `task_not_found`) / `type: "file"` แต่ file id ไม่อยู่บนโครงการของแผน (code `file_not_found`, `param` = `/ref`)                                |
| 409    | งานเสร็จแล้ว — แก้ evidence ไม่ได้ ต้อง reopen ก่อน (code `task_done`)                                                                                                  |

---

## Delete task evidence

$\color{red}{\textsf{DELETE}}$ /tasks/:task_id/evidence

ล้างหลักฐานการทำงานของงาน — รีเซ็ต evidence กลับเป็น `type: "none"` พร้อมล้าง `ref`, `label` และ `attached_at` งานที่เสร็จแล้วล้างไม่ได้ ต้อง Reopen ก่อน

### Parameters

- **task_id** (string, required) ใน URL path — id ของงานที่จะล้าง evidence

### Response

คืน task object ฉบับเต็มที่ `evidence` กลับเป็นค่าว่าง:

```json
{
  "evidence": {
    "type": "none",
    "ref": null,
    "label": null,
    "attached_at": null
  }
}
```

> [!NOTE] Reconstructed from code (แสดงเฉพาะ field ที่เปลี่ยน — response จริงเป็น task object เต็ม)

### Returns

คืน task object ที่ evidence ถูกล้างแล้ว

### Errors

| Status | When it happens                                                                    |
| ------ | ------------------------------------------------------------------------------------ |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)             |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                      |
| 404    | ไม่มีงานตาม `task_id` หรือไม่ใช่งานบนแผนของผู้เรียก (code `task_not_found`)             |
| 409    | งานเสร็จแล้ว — ล้าง evidence ไม่ได้ ต้อง reopen ก่อน (code `task_done`)                 |

---

## List reopen offers

$\color{blue}{\textsf{GET}}$ /dmps/:dmp_id/reopen-offers

ดึง offer เปิดงานคืนที่ *ยังไม่ถูกตอบ* ทั้งหมดของแผนหนึ่ง — researcher ผู้เขียนแผนเท่านั้น แถว offer ของ output เดียวกันถูกรวมเป็น reopen offer object เดียว (เรียงตามเวลาที่สร้าง) พร้อมรายชื่องานที่โดนยกเลิกในกลุ่มนั้น

### Parameters

- **dmp_id** (string, required) ใน URL path — id ของแผนที่จะดึง offer ต้องเป็นแผนที่ผู้เรียกเขียนเอง

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "reopen_offer",
      "offer_id": "0190a8d5-9e1b-7f2c-8a4d-2c6f0b3e5d71",
      "dmp_id": "0190a7bf-2c8d-7e1f-8a3b-5d9e0c7f1a24",
      "dataset_id": "ds-photos-001",
      "dataset_title": "ชุดภาพถ่ายมรดกไทย (ฉบับเก็บรักษา)",
      "created_at": "2026-11-08T09:15:42.311Z",
      "tasks": [
        {
          "task_id": "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c91",
          "title": "ถ่ายภาพซ้ำชุดเก็บรักษา",
          "status": "cancelled",
          "cancelled_from": "in_progress"
        }
      ]
    }
  ],
  "has_more": false,
  "total_count": 1
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope โดย `data` เป็น array ของ reopen offer object ที่ยังเปิดอยู่ `has_more` เป็น `false` เสมอ และ `total_count` เป็นจำนวนกลุ่ม offer

### Errors

| Status | When it happens                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                  |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                           |
| 404    | ไม่มีแผนตาม `dmp_id` (code `dmp_not_found`) หรือ researcher ไม่ใช่ผู้เขียนแผน (code `task_not_found` — ซ่อนการมีอยู่) |

---

## Accept a reopen offer

$\color{green}{\textsf{POST}}$ /reopen-offers/:offer_id/accept

รับ offer เปิดงานคืน — เลือกงานที่จะดึงกลับมาทำต่อจากงานที่ถูกยกเลิกในกลุ่มนี้ ระบบจะ:

- ผูกงานกลับเข้ากับ output ที่กลับมา — จับคู่ด้วย `dataset_id` เดิมก่อน ถ้าไม่เจอ (output กลับมาใหม่คนละ id) จะจับคู่ด้วยชื่อเดิม (`dataset_title`) แทน
- คืนสถานะงานกลับไปเป็นค่าที่จดไว้ใน `cancelled_from` (ไม่มีก็กลับเป็น `todo`) และล้างบันทึกการยกเลิกทั้งหมด
- ปิด offer **ทั้งกลุ่ม** เป็น accepted — ตอบซ้ำไม่ได้ (409)

`task_ids` ที่ส่งมาต้องเป็นงานใน offer นี้เท่านั้น และแผนต้องมีเวอร์ชันที่มีผลอยู่ (ใช้จับคู่ output)

### Request

```json
{
  "task_ids": [
    "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c91",
    "0190a7c1-5e2f-7d3a-9b4c-1f6e8a2d5c92"
  ]
}
```

> [!NOTE] Reconstructed from code

### Parameters

- **offer_id** (string, required) ใน URL path — id ของ offer ที่ยังเปิดอยู่ ต้องเป็น offer บนแผนที่ผู้เรียกเขียนเอง
- **task_ids** (array of strings, required) งานที่จะเปิดคืน — อย่างน้อย 1 ตัว และทุกตัวต้องอยู่ใน offer นี้

### Response

```json
{
  "object": "reopen_offer",
  "offer_id": "0190a8d5-9e1b-7f2c-8a4d-2c6f0b3e5d71",
  "reopened": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

คืนผลการ accept โดย `reopened` เป็นจำนวนงานที่เปิดคืนสำเร็จ — offer ทั้งกลุ่มถูกปิดแล้วไม่ว่าจะเลือกงานคืนกี่ตัว

### Errors

| Status | When it happens                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | body ผิดรูป เช่น `task_ids` ว่าง (code `field_invalid`) / มีงานที่ไม่อยู่ใน offer นี้ (code `task_not_offered`)                                |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                                                    |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                                                             |
| 404    | ไม่มี offer ตาม `offer_id` (code `offer_not_found`) / researcher ไม่ใช่ผู้เขียนแผนของ offer (code `task_not_found` — ซ่อนการมีอยู่)                |
| 409    | offer ถูกตอบไปแล้ว (code `offer_closed`) / แผนไม่มีเวอร์ชันที่มีผล (code `plan_not_in_force`)                                                   |

---

## Dismiss a reopen offer

$\color{green}{\textsf{POST}}$ /reopen-offers/:offer_id/dismiss

ปัดติ offer เปิดงานคืน — งานในกลุ่มคงสถานะ `cancelled` เดิมไว้ทั้งหมด ปิด offer **ทั้งกลุ่ม** เป็น dismissed แล้วจะไม่โผล่ใน List reopen offers อีก (ตอบซ้ำไม่ได้ — 409)

### Parameters

- **offer_id** (string, required) ใน URL path — id ของ offer ที่ยังเปิดอยู่ ต้องเป็น offer บนแผนที่ผู้เรียกเขียนเอง

### Response

```json
{
  "object": "reopen_offer",
  "offer_id": "0190a8d5-9e1b-7f2c-8a4d-2c6f0b3e5d71",
  "reopened": 0
}
```

> [!NOTE] Reconstructed from code

### Returns

คืนผลการ dismiss โดย `reopened` เป็น `0` เสมอ — ไม่มีงานใดถูกเปิดคืน

### Errors

| Status | When it happens                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง (`not_signed_in` / `token_expired`)                                      |
| 403    | บทบาทไม่ใช่ researcher (code `not_a_researcher`)                                                              |
| 404    | ไม่มี offer ตาม `offer_id` (code `offer_not_found`) / researcher ไม่ใช่ผู้เขียนแผนของ offer (code `task_not_found`) |
| 409    | offer ถูกตอบไปแล้ว (code `offer_closed`)                                                                       |
