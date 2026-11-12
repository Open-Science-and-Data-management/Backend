# DMPs

Data Management Plan (DMP) เป็นแผนการจัดการข้อมูลวิจัยในรูปแบบ maDMP v3.0 แต่ละแผนมี working draft ที่ผู้เขียน (researcher) แก้ไขได้อิสระ และส่งเข้าสู่ version ที่ถูกตัดสินโดยคณะกรรมการ (institutional) หรือประกาศใช้เอง (independent)

## Endpoints

- [$\color{green}{\textsf{POST}}$ /dmps](#create-a-plan) — Create a plan
- [$\color{blue}{\textsf{GET}}$ /dmps](#list-plans) — List plans
- [$\color{blue}{\textsf{GET}}$ /dmps/:dmpId](#retrieve-a-plan) — Retrieve a plan
- [$\color{orange}{\textsf{PUT}}$ /dmps/:dmpId/draft](#update-a-draft) — Update a draft
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/draft/discard](#discard-a-draft) — Discard a draft
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/draft/restore](#restore-a-version) — Restore a version
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/archive](#archive-a-plan) — Archive a plan
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/unarchive](#unarchive-a-plan) — Unarchive a plan
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/versions/:number/approve](#approve-a-version) — Approve a version
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/versions/:number/reject](#reject-a-version) — Reject a version
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/minor-edits](#save-minor-edits) — Save minor edits
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/revisions](#submit-a-revision) — Submit a revision
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/submit](#submit-a-plan) — Submit a plan
- [$\color{green}{\textsf{POST}}$ /dmps/:dmpId/finalize](#finalize-a-plan) — Finalize a plan

## The DMP object

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-4b1f-7d3a-9c2e-5f8a1b6d4e70",
  "project_id": "019a2c7e-3a9c-7f21-8b4d-2e6c9a1f5d83",
  "title": "Data Management Plan for the Chao Phraya water quality survey",
  "description": "แผนการจัดการข้อมูลงานสำรวจคุณภาพน้ำ",
  "language": "tha",
  "status": "draft",
  "plan_mode": "institutional",
  "active_version": null,
  "created_at": "2026-11-01T09:12:34.567Z",
  "updated_at": "2026-11-05T14:02:11.203Z",
  "archived_at": null,
  "researcher": { "user_id": "019a2c7e-2f4d-7c8e-b1a3-6d9e0c5f8a21", "name": "สมชาย ใจดี" },
  "review_snapshot": { "title": "…", "dataset": ["…"] },
  "draft": { "title": "…", "schema_version": "1.0" },
  "draft_revision": 3,
  "versions": [],
  "readiness": { "complete": false, "unmet_items": [{ "label": "ต้องมีอย่างน้อย 1 dataset", "section": "dataset" }] }
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของอ็อบเจกต์ เป็น `dmp` เสมอ
- **dmp_id** (string, required) ตัวระบุแผน (UUID)
- **project_id** (string, nullable) ตัวระบุโครงการวิจัยที่แผนผูกอยู่ ถ้าสร้างแบบอิสระจะเป็น `null`
- **title** (string, required) ชื่อแผน — อ่านจาก draft ก่อน ถ้า draft ไม่มีจะใช้ค่าจาก version ล่าสุด
- **description** (string, required) คำอธิบายแผน — อ่านจาก draft เช่นเดียวกับ title
- **language** (string, required) รหัสภาษาของแผน อ่านจาก draft (default `eng`)
- **status** (string, required) สถานะของแผน

  | Value      | Description                                                        |
  | ---------- | ------------------------------------------------------------------ |
  | `draft`    | กำลังเขียน ยังไม่มี version ที่ถูกตัดสิน                           |
  | `pending`  | มี version รอคณะกรรมการตัดสิน (institutional)                      |
  | `approved` | มี version ใช้บังคับอยู่ (active version)                           |

- **plan_mode** (string, nullable) โหมดของแผน `institutional` (ส่งให้คณะกรรมการพิจารณา) หรือ `independent` (ประกาศใช้เอง) — มาจากโหมดของโครงการที่ผูกไว้ เป็น `null` จนกว่าจะ submit/finalize
- **active_version** (integer, nullable) เลข version ที่ใช้บังคับอยู่ ยังไม่มีจะเป็น `null`
- **created_at** (timestamp, required) เวลาที่สร้างแผน
- **updated_at** (timestamp, required) เวลาที่แก้ไขล่าสุด
- **archived_at** (timestamp, nullable) เวลาที่ถูกเก็บถาวร เป็น `null` ถ้ายังไม่ archive
- **researcher** (object, required) ผู้เขียนแผน มี **user_id** (string) และ **name** (string)
- **review_snapshot** (object, optional) เนื้อหาที่ใช้พิจารณา: snapshot ของ pending → ถ้าไม่มีใช้ version ใช้บังคับ → ถ้าไม่มีใช้ draft
- **draft** (object, optional) working draft ปัจจุบัน — ใส่มาเฉพาะเมื่อผู้เรียกเป็นผู้เขียนแผน
- **draft_revision** (integer, optional) ตัวนับ revision ของ draft ใช้เป็น token สำหรับ optimistic concurrency (CAS)
- **versions** (array, optional) รายการ version ทั้งหมด — ใส่เมื่อ `include=versions`
- **readiness** (object, optional) ผลตรวจความครบถ้วนของ snapshot — ใส่เมื่อ `include=readiness`; มี **complete** (boolean) และ **unmet_items** (array ของ `{ label, section }`)

### The draft object

Draft เป็น maDMP v3.0 แบบยังไม่สมบูรณ์ (`dmpSchema.partial()`) — แต่ละ field ส่งได้บางส่วน (ADR-0020: ส่งทั้งก้อนทุกครั้ง) ฟิลด์หลัก:

- **title** (string, required) ชื่อแผน (ต้องไม่ว่าง)
- **description** (string, required) คำอธิบายแผน (ต้องไม่ว่าง)
- **language** (string, required) รหัสภาษา (อย่างน้อย 2 ตัวอักษร)
- **dmp_id**, **project_id** (string, optional) ตัวระบุตาม maDMP
- **alternate_identifier** (object, optional) ตัวระบุรอง
- **begin_date**, **end_date** (date, required) ช่วงเวลาโครงการ
- **ethical_issues_exist** (boolean, required) มีประเด็นจริยธรรมหรือไม่
- **ethical_issues_description** (string, optional) รายละเอียดประเด็นจริยธรรม
- **ethical_issues_report** (string(url), optional) ลิงก์รายงานจริยธรรม (หรือสตริงว่าง)
- **indigenous_considerations** (string, optional) ข้อพิจารณาเรื่องชนพื้นเมือง
- **contributor** (array, required) ผู้ร่วมงาน อย่างน้อย 1 คน (ชื่อ, บทบาท, บัญชี/mbox ของแต่ละคน)
- **cost** (array, optional) ต้นทุนการจัดการข้อมูล default `[]`
- **dataset** (array, required) dataset ที่วางแผน อย่างน้อย 1 รายการ (dataset_id, title, type, access และรายละเอียดเชิงเทคนิค เช่น license, metadata, preservation)
- **schema_version** (string, required) เวอร์ชันของ maDMP schema (default จาก `MADMP_SCHEMA_VERSION`) — field นี้ locked

> ส่วนย่อยของ contributor / cost / dataset (เช่น identifier, distribution, license, technical_resource) ถูกตรวจแบบเดียวกับ maDMP v3.0 โดย domain engine ที่ `validateDraft` — กฎ cross-field เช่น วันย้อนหลัง, contact เดียว, license ต้องเปิด บังคับตอน submit/finalize ไม่ใช่ตอนบันทึก draft

> **DB integrity (ADR-0031):** Postgres บังคับรูปร่างระดับบนของ draft/snapshot เองด้วย CHECK constraint — ทุก key ระดับบนต้องอยู่ในชุด field ของ maDMP v3.0 ด้านบน (`dmps.draft`, `dmp_versions.snapshot`, `dmp_versions.based_on_snapshot`) `{}` ว่างผ่าน (แผนใหม่เริ่มเป็น `{}`) ส่วนความครบถ้วน/รูปของ nested (contributor, dataset ฯลฯ) เป็นหน้าที่ของ Zod ไม่ใช่ DB — key นอกชุดเข้า DB ไม่ได้แม้ผ่าน path ที่ไม่ผ่าน validation; key มั่วตอน save → error 500 (bug signal)

## Version lifecycle

- แผนสร้างใหม่อยู่ในสถานะ `draft` และ `draft_revision` เริ่มนับจาก 0
- แผน institutional ส่งด้วย Submit → เกิด version 1 สถานะ `pending` คณะกรรมการ approve หรือ reject; reject จะส่งแผนกลับไป `draft` (หรือกลับเป็น `approved` ถ้ามี version ใช้บังคับอยู่แล้ว)
- หลังมี version ใช้บังคับ การแก้เล็กน้อย (minor edits) fold เข้า version ใช้บังคับได้ทันที; การแก้ใหญ่ต้อง Submit a revision เป็น version ใหม่ (ได้ไม่เกินหนึ่ง `pending` ต่อแผน)
- แผน independent ตัดสินใจเองด้วย Finalize → เกิด version สถานะ `approved` ทันทีพร้อมสร้างชุดงานแรก (tasks)

## draft_conflict

Endpoints ที่ตัดสินจาก draft (Update a draft, Restore a version, Submit, Finalize, Save minor edits, Submit a revision) ใช้ `draft_revision` เป็น optimistic concurrency token เมื่อเลขที่ส่งมาไม่ตรงกับปัจจุบัน เซิร์ฟเวอร์คืน `409 draft_conflict` พร้อมใส่ draft ล่าสุดและ `draft_revision` ปัจจุบันใน error เพื่อให้ client rebase ได้:

```json
{
  "error": {
    "code": "draft_conflict",
    "message": "The draft changed since your last read",
    "draft": { "…": "…latest draft contents…" },
    "draft_revision": 5
  }
}
```

---

## Create a plan

$\color{green}{\textsf{POST}}$ /dmps

สร้างแผนใหม่ว่างเปล่า เฉพาะ researcher เท่านั้นที่สร้างได้ ถ้าระบุ `project_id` โครงการต้องเป็นของผู้เรียก (ถ้าไม่ใช่สมาชิกจะได้ 404 เพื่อซ่อนการมีอยู่ของโครงการ) แผนจะรับ `plan_mode` จากโหมดของโครงการทันที

### Parameters

- **project_id** (string(uuid), optional) ตัวระบุโครงการที่ผูกแผนด้วย ถ้าไม่ส่งจะได้แผนอิสระที่ยังไม่มี `plan_mode`

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "project_id": "019a2c7e-3a9c-7f21-8b4d-2e6c9a1f5d83",
  "title": "",
  "description": "",
  "language": "eng",
  "status": "draft",
  "plan_mode": "institutional",
  "active_version": null,
  "created_at": "2026-11-08T03:41:02.100Z",
  "updated_at": "2026-11-08T03:41:02.100Z",
  "archived_at": null,
  "researcher": { "user_id": "019a2c7e-2f4d-7c8e-b1a3-6d9e0c5f8a21", "name": "สมชาย ใจดี" },
  "review_snapshot": {},
  "draft": {},
  "draft_revision": 0
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน DMP object ที่สร้างใหม่ พร้อม draft ว่าง (`draft_revision` = 0) และ `review_snapshot`

### Errors

| Status | When it happens                                                  |
| ------ | ---------------------------------------------------------------- |
| 400    | `field_invalid` — body ไม่ผ่าน schema เช่น `project_id` ไม่ใช่ UUID |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                     |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                   |
| 404    | ไม่พบโครงการ หรือผู้เรียกไม่ใช่สมาชิกโครงการนั้น                 |

---

## List plans

$\color{blue}{\textsf{GET}}$ /dmps

คืนรายการแผนตามบทบาท: researcher เห็นเฉพาะแผนของตนเอง; committee/chief ต้องระบุ `project_id` และเห็นเฉพาะแผน institutional ของโครงการนั้น (ถ้าโครงการไม่ใช่ institutional จะคืนลิสต์ว่าง); admin เรียกไม่ได้

### Parameters

- **project_id** (string, optional แต่ required สำหรับ committee/chief) กรองเฉพาะแผนของโครงการ
- **archived** (string, optional) ตั้ง `true` เพื่อดูเฉพาะแผนที่ archive แล้ว — ใช้ได้เฉพาะ researcher; ปกติรายการจะตัดแผนที่ archive ออก
- **status** (string, optional) กรองตามสถานะ ส่งได้หลายค่าคั่นด้วย comma; ค่าที่รับได้คือ `draft`, `pending`, `approved` เท่านั้น
- **q** (string, optional) ค้นหาด้วยข้อความ (จับคู่ชื่อแผน)
- **sort** (string, optional) เรียงลำดับ `updated` (default), `title` หรือ `status`
- **limit** (integer, optional) จำนวนต่อหน้า default 50 สูงสุด 100 ค่าไม่ถูกต้องจะใช้ default; ถ้ามีรายการเกิน limit จะมี flag `has_more`
- **include** (string, optional) เสริมข้อมูล รับ `versions`, `readiness` ได้หลายค่าคั่นด้วย comma

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "dmp",
      "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
      "project_id": "019a2c7e-3a9c-7f21-8b4d-2e6c9a1f5d83",
      "title": "Data Management Plan for the Chao Phraya water quality survey",
      "description": "แผนการจัดการข้อมูลงานสำรวจคุณภาพน้ำ",
      "language": "tha",
      "status": "pending",
      "plan_mode": "institutional",
      "active_version": null,
      "created_at": "2026-11-01T09:12:34.567Z",
      "updated_at": "2026-11-05T14:02:11.203Z",
      "archived_at": null,
      "researcher": { "user_id": "019a2c7e-2f4d-7c8e-b1a3-6d9e0c5f8a21", "name": "สมชาย ใจดี" },
      "review_snapshot": { "title": "Data Management Plan for the Chao Phraya water quality survey" }
    }
  ],
  "has_more": false,
  "total_count": 1
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope ของ DMP object เรียงตาม `sort` ที่เลือก

### Errors

| Status | When it happens                                                                        |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | `field_invalid` — ค่า `status` ไม่ใช่ draft/pending/approved                           |
| 400    | `project_id_required` — committee/chief ไม่ได้ระบุ `project_id`                        |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                           |
| 403    | `permission_denied` — admin ยังไม่มีสิทธิ์เข้าถึงแผน                                    |
| 404    | `project_not_found` — ไม่พบโครงการตาม `project_id` (committee/chief)                   |

---

## Retrieve a plan

$\color{blue}{\textsf{GET}}$ /dmps/:dmpId

ดึงข้อมูลแผนหนึ่งรายการ researcher อ่านได้เฉพาะแผนของตนเอง (ไม่ใช่เจ้าของ → 404 เพื่อซ่อนการมีอยู่) committee/chief อ่านได้เฉพาะแผน institutional

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **include** (string, query, optional) เสริมข้อมูล รับ `versions`, `readiness` ได้หลายค่าคั่นด้วย comma; `include=draft` มีผลเฉพาะเมื่อผู้เรียกเป็นผู้เขียนแผน

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "project_id": "019a2c7e-3a9c-7f21-8b4d-2e6c9a1f5d83",
  "title": "Data Management Plan for the Chao Phraya water quality survey",
  "description": "แผนการจัดการข้อมูลงานสำรวจคุณภาพน้ำ",
  "language": "tha",
  "status": "approved",
  "plan_mode": "institutional",
  "active_version": 1,
  "created_at": "2026-11-01T09:12:34.567Z",
  "updated_at": "2026-11-06T10:20:00.000Z",
  "archived_at": null,
  "researcher": { "user_id": "019a2c7e-2f4d-7c8e-b1a3-6d9e0c5f8a21", "name": "สมชาย ใจดี" },
  "review_snapshot": { "title": "Data Management Plan for the Chao Phraya water quality survey" },
  "versions": [
    {
      "object": "dmp_version",
      "number": 1,
      "status": "approved",
      "edit_type": null,
      "changes": [],
      "created_at": "2026-11-05T14:00:00.000Z",
      "decided_at": "2026-11-06T10:19:30.000Z",
      "decided_by": "019a2c7e-7e1a-7b2c-9d4f-1a8b3c6e5d90",
      "approver": null,
      "note": null,
      "minor_edits": []
    }
  ]
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน DMP object พร้อม `review_snapshot` และส่วนเสริมตาม `include` (`draft` กับ `draft_revision` ใส่เฉพาะผู้เขียนแผน)

### Errors

| Status | When it happens                                                              |
| ------ | ---------------------------------------------------------------------------- |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                 |
| 403    | `permission_denied` — admin; `plan_not_reviewable` — แผน independent สำหรับ committee |
| 404    | `dmp_not_found` — ไม่พบแผน หรือ researcher ไม่ใช่ผู้เขียนแผน                 |

---

## Update a draft

$\color{orange}{\textsf{PUT}}$ /dmps/:dmpId/draft

บันทึก working draft ทั้งก้อน (ADR-0020) ตรวจเฉพาะ type/format — กฎเชิงเนื้อหาเช่นความครบถ้วนจะตรวจตอน submit/finalize ใช้ `draft_revision` เป็น CAS token ถ้าเลขไม่ตรงจะได้ 409 พร้อม draft ล่าสุดให้ rebase เฉพาะ researcher เจ้าของแผนเท่านั้น

field ที่ locked ปัจจุบันมี `schema_version` เสมอ และเพิ่ม `begin_date`, `end_date` เมื่อแผนมีสถานะ `approved` — ส่งค่าต่างจากค่าเดิมมาจะได้ 400 `field_locked` เทียบกับค่าใน draft ปัจจุบัน (ถ้า draft ยังไม่เคยเก็บค่านั้น เทียบกับ default เช่น `schema_version`)

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน
- **draft** (object, body, required) เนื้อหา maDMP ทั้งก้อน — ส่งได้บางส่วนตามโครง `dmpSchema.partial()` (ดู The draft object)

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/draft \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_revision": 0,
    "draft": {
      "title": "Data Management Plan for the Chao Phraya water quality survey",
      "language": "tha"
    }
  }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp_draft",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "draft_revision": 1,
  "draft": {
    "title": "Data Management Plan for the Chao Phraya water quality survey",
    "language": "tha"
  }
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน dmp_draft object พร้อม `draft_revision` ที่เพิ่มขึ้น 1

### Errors

| Status | When it happens                                                                             |
| ------ | ------------------------------------------------------------------------------------------- |
| 400    | `field_invalid` — body หรือ draft ไม่ผ่าน schema                                            |
| 400    | `field_locked` — พยายามแก้ locked field เช่น `schema_version` หรือวันเวลาของแผนที่ approved |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                                |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                                              |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                                             |
| 409    | `draft_conflict` — `draft_revision` ไม่ตรง พร้อม draft ล่าสุดให้ rebase                     |

---

## Discard a draft

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/draft/discard

ทิ้งการแก้ไข draft ทั้งหมด และรีเซ็ตกลับไปยังเนื้อหาที่ส่ง/ใช้บังคับอยู่ (ลำดับคือ snapshot ของ pending → version ใช้บังคับ → version แรกสุด) เฉพาะ researcher เจ้าของแผน ถ้าแผนไม่เคยถูกส่งเลยจะได้ 409 `never_submitted` — ให้ archive แทน เพราะไม่มีทางลบแผน (preservation)

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "status": "draft",
  "draft_revision": 4,
  "draft": { "title": "Data Management Plan for the Chao Phraya water quality survey" }
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม draft ที่รีเซ็ตแล้ว)

### Returns

คืน DMP object หลังรีเซ็ต draft ไปยัง snapshot ล่าสุดที่มีอยู่ (`draft_revision` เพิ่มขึ้น 1)

### Errors

| Status | When it happens                                              |
| ------ | ------------------------------------------------------------ |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                 |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher               |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน              |
| 409    | `never_submitted` — แผนไม่มี version ให้กลับไป (archive แทน) |

---

## Restore a version

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/draft/restore

โหลด snapshot ของ version ที่ระบุเข้า working draft เฉพาะ researcher เจ้าของแผน ตรวจ `draft_revision` ก่อน (CAS) กฎ:

- version ที่ยัง `pending` restore ไม่ได้ → 409 `version_pending`
- restore version ที่ใช้บังคับอยู่ = ทิ้งการแก้แล้วไม่จด `restored_from`
- restore version อื่น = ถือเป็นแก้ไขตั้งต้นใหม่และจด `restored_from` (flow #10)

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **number** (integer, body, required) เลข version ที่ต้องการ restore (ต้อง ≥ 1)
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/draft/restore \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "number": 1, "draft_revision": 4 }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "status": "approved",
  "draft_revision": 5,
  "draft": { "title": "Data Management Plan for the Chao Phraya water quality survey", "schema_version": "1.0" }
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม draft ที่ restore แล้ว)

### Returns

คืน DMP object หลัง draft ถูกแทนด้วย snapshot ของ version ที่เลือก (`draft_revision` เพิ่มขึ้น 1)

### Errors

| Status | When it happens                                                 |
| ------ | --------------------------------------------------------------- |
| 400    | `field_invalid` — body ไม่ผ่าน schema เช่น `number` ไม่ใช่ integer |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                    |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                  |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                 |
| 404    | `version_not_found` — ไม่มี version ตามเลขที่ระบุ               |
| 409    | `draft_conflict` — `draft_revision` ไม่ตรง                      |
| 409    | `version_pending` — version นั้นยังรอการตัดสิน                  |

---

## Archive a plan

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/archive

เก็บแผนไว้นอกรายการปกติ (ตั้ง `archived_at`) — ระบบไม่มีการลบแผน (preservation) แผนที่มี version ใช้บังคับอยู่ archive ไม่ได้ เพราะ tasks/evidence เป็นหลักฐานการทำงาน

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "status": "draft",
  "archived_at": "2026-11-08T04:15:00.000Z"
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม `archived_at`)

### Returns

คืน DMP object หลัง archive (`archived_at` เป็นเวลาปัจจุบัน)

### Errors

| Status | When it happens                                          |
| ------ | -------------------------------------------------------- |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง             |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher           |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน          |
| 409    | `plan_in_force` — แผนมี version ใช้บังคับอยู่ archive ไม่ได้ |

---

## Unarchive a plan

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/unarchive

นำแผนที่ archive แล้วกลับเข้ารายการปกติ โดยเนื้อหาและสถานะไม่เปลี่ยนแปลง (เคลียร์ `archived_at` เป็น `null`)

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "status": "draft",
  "archived_at": null
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม `archived_at` = `null`)

### Returns

คืน DMP object หลัง unarchive

### Errors

| Status | When it happens                                 |
| ------ | ----------------------------------------------- |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง    |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher  |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน |

---

## Approve a version

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/versions/:number/approve

คณะกรรมการ (committee/chief) อนุมัติ version ที่ `pending` — version กลายเป็น `approved` และใช้บังคับ (active version) minor edits ค้างจะถูก carry/drop ตามความเหมาะสม และอาจมีการปรับชุด tasks ให้ตรงกับ dataset ล่าสุด แผนต้องเป็น institutional เท่านั้น

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **number** (integer, path, required) เลข version ที่จะอนุมัติ (ต้อง ≥ 1; ไม่ใช่จำนวนเต็ม → 400)
- **position** (string, body, required) ตำแหน่งของผู้อนุมัติ (ไม่ว่าง)
- **note** (string, body, optional) บันทึกเพิ่มเติมจากผู้อนุมัติ

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/versions/1/approve \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "position": "หัวหน้าศูนย์ข้อมูล", "note": "ผ่านการพิจารณาแล้ว" }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp_version",
  "number": 1,
  "status": "approved",
  "edit_type": null,
  "changes": [],
  "created_at": "2026-11-05T14:00:00.000Z",
  "decided_at": "2026-11-06T10:19:30.000Z",
  "decided_by": "019a2c7e-7e1a-7b2c-9d4f-1a8b3c6e5d90",
  "approver": {
    "user_id": "019a2c7e-7e1a-7b2c-9d4f-1a8b3c6e5d90",
    "name": "อรพิน วิศิษฐ์",
    "position": "หัวหน้าศูนย์ข้อมูล",
    "mbox": "arpin@example.ac.th"
  },
  "note": "ผ่านการพิจารณาแล้ว",
  "minor_edits": [],
  "carried_minor_edits": [],
  "dropped_minor_edits": []
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน dmp_version object หลังอนุมัติ พร้อม **approver**, **carried_minor_edits** และ **dropped_minor_edits**

### Errors

| Status | When it happens                                                                 |
| ------ | ------------------------------------------------------------------------------- |
| 400    | `field_invalid` — body ไม่ผ่าน schema หรือเลข version ใน path ไม่ถูกต้อง        |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                    |
| 403    | `permission_denied` — admin; `plan_not_reviewable` — แผน independent            |
| 404    | `dmp_not_found` — ไม่พบแผน; researcher จะเห็น 404 เสมอ                           |
| 409    | `version_not_pending` — version นั้นถูกตัดสินไปแล้ว                             |

---

## Reject a version

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/versions/:number/reject

คณะกรรมการ (committee/chief) ตีกลับ version ที่ `pending` — ต้องระบุ `note` เป็นเหตุผล แผนกลับไปสถานะ `draft` ถ้ายังไม่มี version ใช้บังคับ หรือคงเป็น `approved` ถ้ามี version ใช้บังคับอยู่แล้ว แผนต้องเป็น institutional เท่านั้น

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **number** (integer, path, required) เลข version ที่จะตีกลับ (ต้อง ≥ 1; ไม่ใช่จำนวนเต็ม → 400)
- **position** (string, body, required) ตำแหน่งของผู้ตัดสิน (ไม่ว่าง)
- **note** (string, body, required) เหตุผลการตีกลับ — จำเป็นสำหรับ reject เท่านั้น

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/versions/1/reject \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "position": "หัวหน้าศูนย์ข้อมูล", "note": "แผนยังไม่ระบุแผนการเก็บรักษาระยะยาว" }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp_version",
  "number": 1,
  "status": "rejected",
  "edit_type": null,
  "changes": [],
  "created_at": "2026-11-05T14:00:00.000Z",
  "decided_at": "2026-11-06T11:05:12.000Z",
  "decided_by": "019a2c7e-7e1a-7b2c-9d4f-1a8b3c6e5d90",
  "approver": {
    "user_id": "019a2c7e-7e1a-7b2c-9d4f-1a8b3c6e5d90",
    "name": "อรพิน วิศิษฐ์",
    "position": "หัวหน้าศูนย์ข้อมูล",
    "mbox": "arpin@example.ac.th"
  },
  "note": "แผนยังไม่ระบุแผนการเก็บรักษาระยะยาว",
  "minor_edits": [],
  "plan_status": "draft"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน dmp_version object หลังตีกลับ พร้อม **approver** และ **plan_status** (สถานะแผนหลังการตัดสิน)

### Errors

| Status | When it happens                                                                     |
| ------ | ----------------------------------------------------------------------------------- |
| 400    | `field_invalid` — body ไม่ผ่าน schema หรือเลข version ใน path ไม่ถูกต้อง            |
| 400    | `note_required` — reject ต้องระบุเหตุผล                                             |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                                        |
| 403    | `permission_denied` — admin; `plan_not_reviewable` — แผน independent                |
| 404    | `dmp_not_found` — ไม่พบแผน; researcher จะเห็น 404 เสมอ                              |
| 409    | `version_not_pending` — version นั้นถูกตัดสินไปแล้ว                                 |

---

## Save minor edits

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/minor-edits

บันทึกการแก้ไขเล็กน้อยจาก draft และ fold เข้า version ที่ใช้บังคับอยู่ทันทีโดยไม่ต้องรอคณะกรรมการ (flow #8) ทุก change ในการแก้ต้องเป็น minor — มี change ใดเป็น major จะได้ 409 `edits_include_major` ให้ไปใช้ Submit a revision แทน ต้องมี version ใช้บังคับอยู่แล้ว และไม่มีอะไรใหม่จะได้ 409 `no_new_edits`

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/minor-edits \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "draft_revision": 5 }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp_version",
  "number": 1,
  "status": "approved",
  "edit_type": "minor",
  "changes": [{ "path": "description", "op": "replace" }],
  "created_at": "2026-11-07T08:30:00.000Z",
  "decided_at": null,
  "decided_by": null,
  "approver": null,
  "note": null,
  "minor_edits": [{ "path": "description", "op": "replace" }]
}
```

> [!NOTE] Reconstructed from code (โครงสร้าง changes/minor_edits ขึ้นกับผล diff จริงใน repository layer)

### Returns

คืน dmp_version object ที่ fold minor edits แล้ว (version ใช้บังคับเดิม ไม่เกิด version ใหม่)

### Errors

| Status | When it happens                                                        |
| ------ | ---------------------------------------------------------------------- |
| 400    | `field_invalid` — `draft_revision` ขาดหรือผิดรูป                       |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                           |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                         |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                        |
| 409    | `draft_conflict` — `draft_revision` ไม่ตรง                             |
| 409    | `plan_not_in_force` — ยังไม่มี version ใช้บังคับ                       |
| 409    | `no_new_edits` — ไม่มีอะไรเปลี่ยนจาก version ใช้บังคับ                 |
| 409    | `edits_include_major` — มีการแก้ใหญ่ ต้องส่ง revision แทน              |

---

## Submit a revision

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/revisions

ส่ง version ใหม่ให้คณะกรรมการพิจารณา (flow #8) รับได้ทั้งการแก้ใหญ่และแก้เล็ก แต่ต้องมีการเปลี่ยนแปลงจริงจาก version ใช้บังคับ แผน institutional เท่านั้น และได้หนึ่ง `pending` ต่อแผนเท่านั้น — มี pending ค้างจะได้ 409 `revision_pending` ส่งสำเร็จแล้ว draft จะถูกรีเซ็ตเป็นสถานะ pending และมีการแจ้งเตือนผู้พิจารณา

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/revisions \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "draft_revision": 6 }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp_version",
  "number": 2,
  "status": "pending",
  "edit_type": "major",
  "changes": [{ "path": "dataset", "op": "add" }],
  "created_at": "2026-11-07T09:00:00.000Z",
  "decided_at": null,
  "decided_by": null,
  "approver": null,
  "note": null,
  "minor_edits": []
}
```

> [!NOTE] Reconstructed from code (โครงสร้าง changes/edit_type ขึ้นกับผล diff จริงใน repository layer)

### Returns

คืน dmp_version object ใหม่สถานะ `pending`

### Errors

| Status | When it happens                                                          |
| ------ | ------------------------------------------------------------------------ |
| 400    | `field_invalid` — `draft_revision` ขาดหรือผิดรูป                         |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                             |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                           |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                          |
| 409    | `draft_conflict` — `draft_revision` ไม่ตรง                               |
| 409    | `revision_pending` — มี version รอตัดสินอยู่แล้ว                         |
| 409    | `plan_not_in_force` — ยังไม่เคยส่งแผน ให้ใช้ Submit ก่อน                 |
| 409    | `plan_is_independent` — แผน independent ให้ใช้ Finalize                  |
| 409    | `no_new_edits` — ไม่มีการเปลี่ยนแปลงจาก version ใช้บังคับ                |
| 422    | `plan_incomplete` — draft ยังไม่ผ่าน checklist พร้อมรายการ `items`      |

---

## Submit a plan

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/submit

ส่งแผน institutional เข้าสู่การพิจารณาครั้งแรก (flow #5) — สร้าง version 1 สถานะ `pending` และตั้ง `plan_mode` เป็น `institutional` draft ต้องผ่าน checklist (`validateDraft`) ครบทุกข้อก่อนส่ง และระบบจะแจ้งเตือนผู้ส่งและผู้พิจารณา ส่งซ้ำเมื่อมี version อยู่แล้วจะได้ 409 `already_submitted` — การแก้ภายหลังใช้ Submit a revision

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/submit \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "draft_revision": 3 }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "title": "Data Management Plan for the Chao Phraya water quality survey",
  "status": "pending",
  "plan_mode": "institutional",
  "active_version": null,
  "archived_at": null,
  "review_snapshot": { "title": "Data Management Plan for the Chao Phraya water quality survey" },
  "draft_revision": 3,
  "versions": [
    {
      "object": "dmp_version",
      "number": 1,
      "status": "pending",
      "edit_type": null,
      "changes": [],
      "created_at": "2026-11-05T14:00:00.000Z",
      "decided_at": null,
      "decided_by": null,
      "approver": null,
      "note": null,
      "minor_edits": []
    }
  ]
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม versions)

### Returns

คืน DMP object สถานะ `pending` พร้อม version 1 ที่เพิ่งสร้าง

### Errors

| Status | When it happens                                                 |
| ------ | --------------------------------------------------------------- |
| 400    | `field_invalid` — `draft_revision` ขาดหรือผิดรูป                |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                    |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                  |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                 |
| 409    | `draft_conflict` — draft เปลี่ยนหลังถูกอ่าน (`draft_revision` ไม่ตรง) |
| 409    | `already_submitted` — แผนมี version อยู่แล้ว ให้ใช้ revisions    |
| 409    | `plan_is_independent` — แผน independent ให้ใช้ Finalize         |
| 422    | `plan_incomplete` — draft ยังไม่ผ่าน checklist พร้อมรายการ `items` |

---

## Finalize a plan

$\color{green}{\textsf{POST}}$ /dmps/:dmpId/finalize

ประกาศใช้แผน independent โดยไม่ผ่านคณะกรรมการ (flow #7) — สร้าง version สถานะ `approved` และสร้างชุด tasks แรกจาก dataset ในแผน ภายใน transaction เดียว draft ต้องผ่าน checklist ครบก่อน และระบบแจ้งเตือนผู้เขียนแผน

### Parameters

- **dmpId** (string, path, required) ตัวระบุแผน
- **draft_revision** (integer, body, required) เลข revision ล่าสุดที่ผู้เรียกเห็น ต้องตรงกับปัจจุบัน

### Request

```bash
curl http://localhost:3000/dmps/019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47/finalize \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "draft_revision": 3 }'
```

> [!NOTE] Reconstructed from code

### Response

```json
{
  "object": "dmp",
  "dmp_id": "019a2c7e-9d4b-7e6f-a3c1-8b2d5e9f0a47",
  "title": "Independent survey data plan",
  "status": "approved",
  "plan_mode": "independent",
  "active_version": 1,
  "archived_at": null,
  "review_snapshot": { "title": "Independent survey data plan" },
  "draft_revision": 3,
  "versions": [
    {
      "object": "dmp_version",
      "number": 1,
      "status": "approved",
      "edit_type": null,
      "changes": [],
      "created_at": "2026-11-05T15:00:00.000Z",
      "decided_at": "2026-11-05T15:00:00.000Z",
      "decided_by": "019a2c7e-2f4d-7c8e-b1a3-6d9e0c5f8a21",
      "approver": null,
      "note": null,
      "minor_edits": []
    }
  ]
}
```

> [!NOTE] Reconstructed from code (ย่อ — คืน DMP object เต็มพร้อม versions)

### Returns

คืน DMP object สถานะ `approved` พร้อม version ที่ใช้บังคับ (`active_version`) และ tasks ชุดแรกที่สร้างแล้ว

### Errors

| Status | When it happens                                                 |
| ------ | --------------------------------------------------------------- |
| 400    | `field_invalid` — `draft_revision` ขาดหรือผิดรูป                |
| 401    | ไม่ได้แนบ access token หรือ token ไม่ถูกต้อง                    |
| 403    | `not_a_researcher` — ผู้เรียกไม่ใช่ researcher                  |
| 404    | `dmp_not_found` — ไม่พบแผน หรือไม่ใช่เจ้าของแผน                 |
| 409    | `draft_conflict` — draft เปลี่ยนหลังถูกอ่าน (`draft_revision` ไม่ตรง) |
| 409    | `already_submitted` — แผนมี version อยู่แล้ว                    |
| 409    | `plan_is_institutional` — แผน institutional ตัดสินโดยคณะกรรมการ |
| 422    | `plan_incomplete` — draft ยังไม่ผ่าน checklist พร้อมรายการ `items` |
