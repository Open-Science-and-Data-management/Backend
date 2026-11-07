# Projects

**Projects** คือโครงการวิจัยซึ่งเป็นคอนเทนเนอร์ของสมาชิก (project members), ไฟล์ (files) และแผนการจัดการข้อมูล (DMP plans) ทั้งหมด นักวิจัย (researcher) สร้างโครงการได้และเห็นเฉพาะโครงการที่ตนเป็นสมาชิก ส่วนคณะกรรมการ (committee) และหัวหน้า (chief) เห็นโครงการแบบ *institutional* ทั้งหมดเพื่อใช้ในการพิจารณาแผน

การเข้าถึงแบ่งตาม role ของผู้ใช้:

- **researcher** — สร้างโครงการใหม่ และเข้าถึงได้เฉพาะโครงการที่ตนเป็นสมาชิกเท่านั้น
- **committee** / **chief** — ดูรายการและเข้าถึงโครงการ institutional ได้ทุกโครงการ (ไม่ต้องเป็นสมาชิก) แต่สร้างโครงการไม่ได้
- **admin** — ยังไม่มีสิทธิ์เข้าถึงโครงการใด ๆ (403 `permission_denied`)

ทุก endpoint บนหน้านี้อยู่ภายใต้ global AuthGuard — ต้องแนบ `Authorization: Bearer <access_token>` ทุกครั้ง (token หมดอายุให้ใช้ `refresh_token` cookie ที่ path `/auth` เพื่อรับ token ใหม่) และทุก error ออกใน envelope เดียวรูปแบบ `{ "error": { "type", "code", "message", "param?" } }`

## Endpoints

- [$\color{green}{\textsf{POST}}$ /projects](#create-a-project) — Create a project
- [$\color{blue}{\textsf{GET}}$ /projects](#list-projects) — List projects
- [$\color{blue}{\textsf{GET}}$ /projects/:projectId](#retrieve-a-project) — Retrieve a project
- [$\color{blue}{\textsf{GET}}$ /projects/:projectId/members](#list-project-members) — List project members
- [$\color{red}{\textsf{DELETE}}$ /projects/:projectId](#delete-a-project) — Delete a project

## The Project object

> [!NOTE] Reconstructed from code
```json
{
  "object": "project",
  "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
  "project_name": "โครงการดิจิทัลภาพถ่ายมรดกไทย",
  "description": "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata ครบถ้วน",
  "status": "active",
  "plan_mode": "institutional",
  "proposal_file_id": "01948a5f-9e11-7b2c-8d3f-4a6b7c8d9e0f",
  "created_at": "2026-11-08T02:31:07.482Z",
  "updated_at": "2026-11-08T03:05:22.917Z",
  "file_count": 4,
  "member_count": 2,
  "awaiting_review": true
}
```

### Attributes

- **object** (string, required) ชนิดของ object เป็น `"project"` เสมอ
- **project_id** (string, required) ตัวระบุเฉพาะของโครงการ (UUID) ใช้เป็น cursor ในการแบ่งหน้าของ List projects ด้วย
- **project_name** (string, required) ชื่อโครงการ ยาวไม่เกิน 255 ตัวอักษร
- **description** (string, nullable) คำอธิบายโครงการ เป็น `null` เมื่อไม่ได้ระบุตอนสร้าง
- **status** (string, required) สถานะปัจจุบันของโครงการ โครงการใหม่เริ่มที่ `draft` และเปลี่ยนโดยขั้นตอน lifecycle อื่น (ไม่มี endpoint ในหน้านี้ที่แก้ค่านี้)

  | Value    | Description                                        |
  | -------- | -------------------------------------------------- |
  | `draft`  | เพิ่งสร้าง ยังไม่ผ่านการเปิดใช้งาน                  |
  | `active` | ใช้งานอยู่ มีแผนผ่านการอนุมัติแล้ว                  |
  | `done`   | โครงการสิ้นสุดแล้ว                                  |

- **plan_mode** (string, required) โหมดการอนุมัติแผนของโครงการ — server คำนวณจาก `account_type` ของผู้สร้างเสมอ (citizen → `independent`, อื่น ๆ → `institutional`) และไม่รับค่านี้จาก client

  | Value           | Description                                                            |
  | --------------- | ---------------------------------------------------------------------- |
  | `institutional` | แผนของโครงการถูกผูกเข้าสู่ระบบพิจารณาโดยคณะกรรมการ                     |
  | `independent`   | แผนของโครงการอิสระ ผู้สร้าง finalize เองได้โดยไม่ผ่านคณะกรรมการ        |

- **proposal_file_id** (string, nullable) UUID ของไฟล์ proposal ที่ผูกกับโครงการ — ผูกโดย upload `purpose=proposal` เท่านั้น ไม่ได้ตั้งผ่าน endpoint ของหน้านี้
- **created_at** (timestamp, required) เวลาที่สร้างโครงการ (ISO 8601)
- **updated_at** (timestamp, required) เวลาที่แก้ไขโครงการล่าสุด (ISO 8601)
- **file_count** (integer, required) จำนวนไฟล์ในโครงการ (นับจาก `file_records`)
- **member_count** (integer, required) จำนวนสมาชิกในโครงการ (นับจาก `project_members`)
- **awaiting_review** (boolean, required) `true` เมื่อโครงการมีเวอร์ชันแผนสถานะ `pending` รอการพิจารณาอย่างน้อยหนึ่งเวอร์ชัน

## The Project Member object

> [!NOTE] Reconstructed from code
```json
{
  "object": "project_member",
  "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
  "user_id": "01948a02-7d54-7e69-9c1b-2f3a4b5c6d7e",
  "project_role": "researcher",
  "user": {
    "name": "Aran",
    "email": "aran.saelim@example.edu"
  }
}
```

### Attributes

- **object** (string, required) ชนิดของ object เป็น `"project_member"` เสมอ
- **project_id** (string, required) UUID ของโครงการที่สมาชิกสังกัดอยู่
- **user_id** (string, required) UUID ของผู้ใช้ที่เป็นสมาชิก
- **project_role** (string, required) บทบาทของผู้ใช้ภายในโครงการ

  | Value       | Description                                            |
  | ----------- | ------------------------------------------------------ |
  | `researcher` | เจ้าของงานวิจัยในโครงการ ผู้สร้างโครงการได้บทบาทนี้เสมอ |
  | `committee`  | กรรมการผู้พิจารณาแผนของโครงการ                          |
  | `chief`      | หัวหน้าผู้กำกับดูแลโครงการ                              |

- **user** (object, required) ข้อมูลผู้ใช้แบบฝัง (embedded) ประกอบด้วย **name** (string) และ **email** (string) เท่านั้น

---

## Create a project

$\color{green}{\textsf{POST}}$ /projects

สร้างโครงการใหม่ มีเฉพาะ **researcher** เท่านั้นที่เรียกได้ ระบบสร้างโครงการสถานะ `draft` เสมอ เพิ่มผู้สร้างเป็นสมาชิกคนแรกด้วยบทบาท `researcher` และคำนวณ `plan_mode` จาก `account_type` ของผู้สร้างเอง — ค่า `plan_mode` หรือ `status` ที่ส่งมาใน body จะถูกละเลย

### Request

```curl
curl http://localhost:3000/projects \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"project_name": "โครงการดิจิทัลภาพถ่ายมรดกไทย", "description": "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata"}'
```

> [!NOTE] Reconstructed from code

### Parameters

- **project_name** (string, required) ชื่อโครงการ ต้องไม่ว่างและไม่ใช่ช่องว่างล้วน ยาวไม่เกิน 255 ตัวอักษร
- **description** (string, optional) คำอธิบายโครงการ ไม่ส่งจะถูกเก็บเป็น `null`

### Response

```json
{
  "object": "project",
  "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
  "project_name": "โครงการดิจิทัลภาพถ่ายมรดกไทย",
  "description": "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata",
  "status": "draft",
  "plan_mode": "institutional",
  "proposal_file_id": null,
  "created_at": "2026-11-08T02:31:07.482Z",
  "updated_at": "2026-11-08T02:31:07.482Z",
  "file_count": 0,
  "member_count": 1,
  "awaiting_review": false
}
```

> [!NOTE] Reconstructed from code

### Returns

Returns the [Project object](#the-project-object) ที่เพิ่งสร้าง — `status` เป็น `draft`, `file_count` เป็น 0, `member_count` เป็น 1 (นับผู้สร้าง), `awaiting_review` เป็น `false` และ `plan_mode` มาจาก `account_type` ของผู้สร้าง

### Errors

| Status | When it happens                                                       |
| ------ | --------------------------------------------------------------------- |
| 400    | `project_name_required` — `project_name` ว่างหรือเป็นช่องว่างล้วน     |
| 400    | `field_invalid` — body ผิดรูปแบบอื่น ๆ (`param` ชี้ตำแหน่งด้วย JSON pointer) |
| 401    | `not_signed_in` — ไม่ได้แนบ access token หรือบัญชีไม่มีอยู่ในระบบอีกต่อไป |
| 401    | `token_expired` — access token หมดอายุหรือไม่ถูกต้อง ให้ refresh แล้วลองใหม่ |
| 403    | `not_a_researcher` — มีเฉพาะ researcher เท่านั้นที่สร้างโครงการได้    |

---

## List projects

$\color{blue}{\textsf{GET}}$ /projects

ดึงรายการโครงการแบบแบ่งหน้า (cursor pagination) ตามลำดับ `project_id` จากน้อยไปมาก **committee** และ **chief** เห็นเฉพาะโครงการ institutional ทั้งหมด ส่วน **researcher** เห็นเฉพาะโครงการที่ตนเป็นสมาชิก (ไม่ถูกกรองด้วย `plan_mode`) ส่วนหัว `has_more` บอกว่ายังมีหน้าถัดไป และ `total_count` นับจากชุดผลลัพธ์ทั้งหมดของ role นั้น ไม่ขึ้นกับการแบ่งหน้า

### Request

```curl
curl "http://localhost:3000/projects?limit=20&starting_after=01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a" \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **plan_mode** (string, optional) ใช้ได้เฉพาะ committee/chief — กรองชุดผลลัพธ์ โดยส่งค่าอื่นที่ไม่ใช่ `institutional` จะได้รายการว่างเสมอ (researcher จะไม่สนใจพารามิเตอร์นี้)

  | Value           | Description                                     |
  | --------------- | ----------------------------------------------- |
  | `institutional` | เห็นโครงการ institutional ทั้งหมด (ค่าเดียวที่มีผล) |
  | `independent`   | ส่งค่านี้ (หรือค่าอื่นใด) จะได้รายการว่าง        |

- **limit** (integer, optional) จำนวนรายการต่อหน้า ระหว่าง 1–100 ค่าเริ่มต้น 20 — ค่าที่ไม่ใช่จำนวนเต็มบวกจะถูกแทนด้วยค่าเริ่มต้น และค่าที่มากกว่า 100 จะถูกตัดที่ 100
- **starting_after** (string, optional) cursor สำหรับหน้าถัดไป — ส่ง `project_id` ของรายการสุดท้ายในหน้าปัจจุบัน เพื่อดึงเฉพาะโครงการที่มี `project_id` มากกว่านั้น

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "project",
      "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
      "project_name": "โครงการดิจิทัลภาพถ่ายมรดกไทย",
      "description": "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata ครบถ้วน",
      "status": "active",
      "plan_mode": "institutional",
      "proposal_file_id": "01948a5f-9e11-7b2c-8d3f-4a6b7c8d9e0f",
      "created_at": "2026-11-08T02:31:07.482Z",
      "updated_at": "2026-11-08T03:05:22.917Z",
      "file_count": 4,
      "member_count": 2,
      "awaiting_review": true
    },
    {
      "object": "project",
      "project_id": "01948b21-5a90-7d64-8e2f-1c3d4e5f6a7b",
      "project_name": "โครงการสำรวจจุลินทรีย์ในดิน",
      "description": "เปรียบเทียบจุลินทรีย์ดินนาอินทรีย์กับนาเชิงเดี่ยว",
      "status": "draft",
      "plan_mode": "institutional",
      "proposal_file_id": null,
      "created_at": "2026-11-08T04:12:40.006Z",
      "updated_at": "2026-11-08T04:12:40.006Z",
      "file_count": 0,
      "member_count": 1,
      "awaiting_review": false
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

Returns a list envelope (`object` เป็น `"list"`) ที่มี `data` เป็นอาร์เรย์ของ [Project object](#the-project-object) พร้อม `has_more` และ `total_count`

### Errors

| Status | When it happens                                                            |
| ------ | -------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ access token                                   |
| 401    | `token_expired` — access token หมดอายุหรือไม่ถูกต้อง ให้ refresh แล้วลองใหม่ |
| 403    | `permission_denied` — admin ยังไม่มีสิทธิ์เข้าถึงโครงการ                    |

---

## Retrieve a project

$\color{blue}{\textsf{GET}}$ /projects/:projectId

ดึงข้อมูลโครงการหนึ่งรายการพร้อมตัวนับ (`file_count`, `member_count`, `awaiting_review`) การมองเห็นขึ้นกับ role — **researcher** ต้องเป็นสมาชิกของโครงการจึงจะเห็น ถ้าไม่ใช่สมาชิก endpoint จะตอบ 404 เหมือนโครงการไม่มีอยู่จริง เพื่อไม่เปิดเผยว่าโครงการนั้นมีอยู่ (**404 to hide existence**) ส่วน **committee**/**chief** เห็นได้ทุกโครงการ

### Request

```curl
curl http://localhost:3000/projects/01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **projectId** (string, required) ตัวระบุของโครงการใน path — UUID ของโครงการที่ต้องการดู

### Response

```json
{
  "object": "project",
  "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
  "project_name": "โครงการดิจิทัลภาพถ่ายมรดกไทย",
  "description": "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata ครบถ้วน",
  "status": "active",
  "plan_mode": "institutional",
  "proposal_file_id": "01948a5f-9e11-7b2c-8d3f-4a6b7c8d9e0f",
  "created_at": "2026-11-08T02:31:07.482Z",
  "updated_at": "2026-11-08T03:05:22.917Z",
  "file_count": 4,
  "member_count": 2,
  "awaiting_review": true
}
```

> [!NOTE] Reconstructed from code

### Returns

Returns the [Project object](#the-project-object) ถ้าโครงการมีอยู่และผู้เรียกมองเห็นได้

### Errors

| Status | When it happens                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ access token                                             |
| 401    | `token_expired` — access token หมดอายุหรือไม่ถูกต้อง ให้ refresh แล้วลองใหม่         |
| 403    | `permission_denied` — admin ยังไม่มีสิทธิ์เข้าถึงโครงการ                              |
| 404    | `project_not_found` — ไม่มีโครงการตาม id นี้ หรือ researcher ไม่ได้เป็นสมาชิก (ซ่อนการมีอยู่ของโครงการ) |

---

## List project members

$\color{blue}{\textsf{GET}}$ /projects/:projectId/members

ดึงรายชื่อสมาชิกทั้งหมดของโครงการ เรียงตามเวลาที่เข้าร่วมจากเก่าสุดไปใหม่สุด ต้องมองเห็นโครงการได้ก่อนจึงจะเรียกได้ — กติกาเดียวกับ Retrieve a project (researcher ที่ไม่ใช่สมาชิกได้ 404 เพื่อซ่อนการมีอยู่ของโครงการ)

### Request

```curl
curl http://localhost:3000/projects/01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a/members \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **projectId** (string, required) ตัวระบุของโครงการใน path — UUID ของโครงการที่ต้องการดูรายชื่อสมาชิก

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "project_member",
      "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
      "user_id": "01948a02-7d54-7e69-9c1b-2f3a4b5c6d7e",
      "project_role": "researcher",
      "user": {
        "name": "Aran",
        "email": "aran.saelim@example.edu"
      }
    },
    {
      "object": "project_member",
      "project_id": "01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a",
      "user_id": "01948a44-1b26-7f05-9d78-3e4f5a6b7c8d",
      "project_role": "committee",
      "user": {
        "name": "Malee",
        "email": "malee.wong@example.ac.th"
      }
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

Returns a list envelope (`object` เป็น `"list"`) ที่มี `data` เป็นอาร์เรย์ของ [Project Member object](#the-project-member-object) — `has_more` เป็น `false` เสมอ และ `total_count` เท่ากับจำนวนสมาชิกทั้งหมด (ไม่มีการแบ่งหน้าใน endpoint นี้)

### Errors

| Status | When it happens                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ access token                                             |
| 401    | `token_expired` — access token หมดอายุหรือไม่ถูกต้อง ให้ refresh แล้วลองใหม่         |
| 403    | `permission_denied` — admin ยังไม่มีสิทธิ์เข้าถึงโครงการ                              |
| 404    | `project_not_found` — ไม่มีโครงการตาม id นี้ หรือ researcher ไม่ได้เป็นสมาชิก (ซ่อนการมีอยู่ของโครงการ) |

---

## Delete a project

$\color{red}{\textsf{DELETE}}$ /projects/:projectId

ลบโครงการถาวร ต้องมองเห็นโครงการได้ก่อน (กติกาเดียวกับ Retrieve a project) และลบได้เฉพาะเมื่อโครงการ **ไม่มีแผน (DMP) เหลืออยู่เลย** — รวมแผนที่ archive แล้วด้วย เพื่อการอนุรักษ์ข้อมูล ถ้ายังมีแผนอยู่ต้องลบแผนทั้งหมดก่อน สมาชิกทั้งหมดถูกลบตามไปโดยอัตโนมัติ (cascade)

### Request

```curl
curl -X DELETE http://localhost:3000/projects/01948a7e-3c2d-7f41-9a5e-8b1c2d3e4f5a \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **projectId** (string, required) ตัวระบุของโครงการใน path — UUID ของโครงการที่ต้องการลบ

### Response

```json
{
  "deleted": true
}
```

> [!NOTE] Reconstructed from code

### Returns

Returns `{"deleted": true}` เมื่อลบสำเร็จ — เรียก Retrieve a project ซ้ำจะได้ 404 `project_not_found`

### Errors

| Status | When it happens                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ access token                                             |
| 401    | `token_expired` — access token หมดอายุหรือไม่ถูกต้อง ให้ refresh แล้วลองใหม่         |
| 403    | `permission_denied` — admin ยังไม่มีสิทธิ์เข้าถึงโครงการ                              |
| 404    | `project_not_found` — ไม่มีโครงการตาม id นี้ หรือ researcher ไม่ได้เป็นสมาชิก (ซ่อนการมีอยู่ของโครงการ) |
| 409    | `project_has_plans` — โครงการยังมีแผนอยู่ (นับรวมแผนที่ archive แล้ว) ต้องลบแผนก่อนจึงจะลบโครงการได้ |
