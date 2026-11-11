# Files

ไฟล์แนบของโครงการ เช่น ข้อเสนอแผนข้อมูล (.docx), ผลส่งมอบงาน และหลักฐานอ้างอิง (evidence) ทุกไฟล์สังกัดโครงการเดียวและมองเห็นได้เฉพาะสมาชิกของโครงการนั้น การอัปโหลด `proposal` จะแทนที่ (supersede) proposal ตัวเก่าของโครงการโดยอัตโนมัติ และไฟล์ .docx จะถูกถอดข้อความ แบ่งเป็น chunks พร้อม embedding เพื่อใช้ในการค้นของ AI (ADR-0025)

## Endpoints

- [$\color{green}{\textsf{POST}}$ /projects/:projectId/files](#upload-a-file) — Upload a file
- [$\color{blue}{\textsf{GET}}$ /files](#list-files) — List files
- [$\color{blue}{\textsf{GET}}$ /files/:fileId/content](#download-file-content) — Download file content
- [$\color{green}{\textsf{POST}}$ /files/:fileId/archive](#archive-a-file) — Archive a file
- [$\color{red}{\textsf{DELETE}}$ /files/:fileId](#delete-a-file) — Delete a file

## The File object

```json
{
  "object": "file",
  "file_id": "01948f31-5d8e-7c2f-a1b3-c9d4e5f60718",
  "project_id": "01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b",
  "uploaded_by": "01937b6c-8a2d-7e4f-b1c2-3d4e5f6a7b8c",
  "filename": "proposal.docx",
  "file_type": "docx",
  "purpose": "proposal",
  "metadata": {
    "byte_size": 38412,
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  "uploaded_at": "2026-11-08T04:20:15.842Z",
  "superseded_at": null,
  "archived_at": null
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของออบเจ็กต์ เป็น `"file"` เสมอ
- **file_id** (string, required) รหัสไฟล์ UUID ใช้อ้างอิงในทุก endpoint ของ `/files`
- **project_id** (string, required) รหัสโครงการที่ไฟล์สังกัด
- **uploaded_by** (string, required) รหัสผู้ใช้ที่อัปโหลดไฟล์
- **filename** (string, required) ชื่อไฟล์ต้นฉบับจากผู้อัปโหลด รองรับ UTF-8 (เช่น ชื่อไฟล์ภาษาไทย)
- **file_type** (string, required) ประเภทไฟล์ อนุมานจาก MIME type จริงของเนื้อหา ไม่ได้ดูจากชื่อไฟล์

  | Value  | Description                                                                                     |
  | ------ | ----------------------------------------------------------------------------------------------- |
  | `docx` | MIME เป็น `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — ถอดข้อความและแบ่ง chunks ได้ |
  | `pdf`  | MIME เป็น `application/pdf` — เก็บ metadata เท่านั้น                                              |
  | `other`| MIME อื่น ๆ ทั้งหมด — เก็บ metadata เท่านั้น                                                      |

- **purpose** (string, required) วัตถุประสงค์ของไฟล์ในโครงการ

  | Value               | Description                                                                                          |
  | ------------------- | ---------------------------------------------------------------------------------------------------- |
  | `proposal`          | ข้อเสนอแผนข้อมูล ต้องเป็น .docx และตัวล่าสุดเท่านั้นที่เป็น active proposal (`proposal_file_id` ของโครงการ) |
  | `task_deliverable`  | ผลส่งมอบของงาน                                                                                        |
  | `evidence`          | หลักฐานอ้างอิง — เมื่อถูกอ้างเป็น evidence ของ task แล้วจะลบไม่ได้ (archive เท่านั้น)                     |

- **metadata** (object, required) ข้อมูลทางเทคนิคของไฟล์

  - **byte_size** (integer, required) ขนาดไฟล์หน่วยไบต์
  - **mime_type** (string, required) MIME type ที่ส่งมาพร้อมการอัปโหลด

- **uploaded_at** (timestamp, required) เวลาที่อัปโหลด (ISO 8601)
- **superseded_at** (timestamp, nullable) เวลาที่ proposal ถูกแทนที่ด้วยไฟล์ใหม่ เป็น `null` เมื่อยังเป็นไฟล์ปัจจุบันหรือไม่ใช่ proposal
- **archived_at** (timestamp, nullable) เวลาที่ archive เป็น `null` เมื่อยังไม่ถูก archive

---

## Upload a file

$\color{green}{\textsf{POST}}$ /projects/:projectId/files

อัปโหลดไฟล์เข้าโครงการด้วย `multipart/form-data` ขนาดไฟล์สูงสุด 25 MB ถ้า `purpose` เป็น `proposal` ไฟล์ต้องเป็น .docx ตาม MIME type จริง และจะกลายเป็น active proposal ของโครงการทันที (proposal เดิมถูก supersede) เฉพาะสมาชิกของโครงการเท่านั้นที่อัปโหลดได้

### Request

```bash
curl http://localhost:3000/projects/01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b/files \
  -H "Authorization: Bearer <access_token>" \
  -F "purpose=proposal" \
  -F "file=@proposal.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document"
```

> [!NOTE] Reconstructed from code

ข้อจำกัดของ multipart:

- ฟิลด์ไฟล์ต้องใช้ชื่อ `file` ส่งเนื้อหาไฟล์แบบ binary พร้อม Content-Type ที่ถูกต้อง — เซิร์ฟเวอร์พิจารณา MIME type ของพาร์ต ไม่ใช่นามสกุลในชื่อไฟล์
- ชื่อไฟล์ถูกถอดเป็น UTF-8 เสมอ (RFC 7578) ชื่อไฟล์ภาษาไทยจึงไม่เพี้ยน
- ไฟล์ถูกบัฟเฟอร์ในหน่วยความจำก่อนตรวจขนาดจากจำนวนไบต์จริง — ส่วนขยายเกิน 25 MB ถูกปฏิเสธทั้งคำขอ

### Parameters

- **projectId** (string, required) รหัสโครงการปลายทางใน path — ผู้อัปโหลดต้องเป็นสมาชิกของโครงการ
- **purpose** (string, required) วัตถุประสงค์ของไฟล์ (form field)

  | Value              | Description                                            |
  | ------------------ | ------------------------------------------------------ |
  | `proposal`         | ข้อเสนอแผนข้อมูล — ต้องเป็น .docx เท่านั้น                 |
  | `task_deliverable` | ผลส่งมอบงาน — ไม่จำกัดประเภทไฟล์                           |
  | `evidence`         | หลักฐานอ้างอิง — ไม่จำกัดประเภทไฟล์ แต่ลบไม่ได้เมื่อถูกอ้างแล้ว |

- **file** (file, required) เนื้อหาไฟล์ (form field ชื่อ `file`) ขนาดไม่เกิน 25 MB และถ้า `purpose` เป็น `proposal` MIME ต้องเป็น `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Docx extraction

ไฟล์ `docx` ถูกประมวลผลก่อนบันทึกทุกอย่าง:

- ถอดข้อความล้วนด้วย mammoth เก็บไว้กับไฟล์ (`docx_extracted_text`) เพื่อให้ agent อ่านสำเร็จรูปได้
- แยกเนื้อหาเป็น blocks (heading ระดับ 1–3 และย่อหน้า) แล้วแบ่งเป็น chunks โดย pack ย่อหน้าจนถึงประมาณ 450 tokens ต่อ chunk ทับซ้อนท้ายก้อน 10% ตาม config (`files.rag`) แต่ละ chunk ผูกกับ `heading_path` ล่าสุดในรูป `"H1 > H2"` เพื่อใช้อ้างบริบทตอนค้น
- ฝัง embedding ของทุก chunk ด้วยโมเดล `Xenova/multilingual-e5-large` (1024 มิติ) แล้วบันทึกไฟล์ chunks และการ supersede ทั้งหมดใน transaction เดียว — พังตรงจุดใดจุดหนึ่งจะคืน 422 โดยไม่ทิ้งข้อมูลครึ่ง ๆ กลาง ๆ แต่ละ chunk อาจเก็บ `meta` (jsonb) เพิ่ม — ขณะนี้สำหรับ chunk จาก fast path FF2569 (`{template_version, field_id, section_id, ...}`), generic path ไม่เก็บ

ไฟล์ `pdf` และ `other` เก็บเฉพาะ bytes และ metadata ไม่ถอดข้อความและไม่แบ่ง chunks

เมื่อ `purpose` เป็น `proposal` การอัปโหลดครั้งใหม่จะ: ตั้ง `superseded_at` ให้ proposal เดิม, ลบ chunks ของ proposal เดิม, และอัปเดต `proposal_file_id` ของโครงการให้ชี้ไฟล์ใหม่ — proposal เดิมยังคงอยู่ในรายการไฟล์และดาวน์โหลดได้

### Response

```json
{
  "object": "file",
  "file_id": "01948f31-5d8e-7c2f-a1b3-c9d4e5f60718",
  "project_id": "01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b",
  "uploaded_by": "01937b6c-8a2d-7e4f-b1c2-3d4e5f6a7b8c",
  "filename": "proposal.docx",
  "file_type": "docx",
  "purpose": "proposal",
  "metadata": {
    "byte_size": 38412,
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  "uploaded_at": "2026-11-08T04:20:15.842Z",
  "superseded_at": null,
  "archived_at": null
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน [ออบเจ็กต์ File](#the-file-object) ด้วยสถานะ 201 เมื่อ `purpose` เป็น `proposal` ไฟล์นี้จะเป็น active proposal ของโครงการทันที

### Errors

| Status | When it happens                                                                        |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | `invalid_purpose` — purpose ว่างหรือไม่อยู่ใน enum                                     |
| 400    | `field_invalid` — ไม่ได้แนบฟิลด์ `file`                                                |
| 400    | `file_type_not_allowed` — purpose เป็น `proposal` แต่ MIME ไม่ใช่ .docx                |
| 401    | `not_signed_in` — ไม่ได้แนบ Bearer token / `token_expired` — access token หมดอายุ       |
| 403    | `permission_denied` — บัญชี admin ไม่มีสิทธิ์เข้าถึงโครงการ                              |
| 404    | `project_not_found` — ไม่พบโครงการ หรือผู้ใช้ไม่ใช่สมาชิก (ซ่อนการมีอยู่ของโครงการ)      |
| 413    | `file_too_large` — ไฟล์เกิน 25 MB                                                      |
| 422    | `file_unparseable` — อ่านไฟล์ .docx ไม่สำเร็จ                                           |

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_purpose",
    "message": "purpose must be proposal, task_deliverable or evidence",
    "param": "/purpose"
  }
}
```

> [!NOTE] Reconstructed from code

---

## List files

$\color{blue}{\textsf{GET}}$ /files

คืนรายการไฟล์ทั้งหมดของโครงการ ต้องระบุ `project_id` เสมอ และกรองตาม `purpose` ได้ ไฟล์ปัจจุบัน (ไม่ถูก supersede) มาก่อน proposal ที่ถูกแทนแล้ว ภายในกลุ่มเดียวกันเรียงจากอัปโหลดล่าสุดขึ้นก่อน

### Request

```bash
curl "http://localhost:3000/files?project_id=01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b&purpose=proposal" \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **project_id** (string, required) รหัสโครงการที่ต้องการดูรายการไฟล์ — ผู้ใช้ต้องเป็นสมาชิกของโครงการ
- **purpose** (string, optional) กรองเฉพาะ purpose ใด purpose หนึ่ง ค่าที่ไม่อยู่ใน enum ถูกปฏิเสธด้วย 400

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "file",
      "file_id": "01948f45-9a1c-7b6e-b2d4-5f6a7b8c9d0e",
      "project_id": "01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b",
      "uploaded_by": "01937b6c-8a2d-7e4f-b1c2-3d4e5f6a7b8c",
      "filename": "proposal-v2.docx",
      "file_type": "docx",
      "purpose": "proposal",
      "metadata": { "byte_size": 41088, "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      "uploaded_at": "2026-11-08T05:02:41.310Z",
      "superseded_at": null,
      "archived_at": null
    },
    {
      "object": "file",
      "file_id": "01948f31-5d8e-7c2f-a1b3-c9d4e5f60718",
      "project_id": "01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b",
      "uploaded_by": "01937b6c-8a2d-7e4f-b1c2-3d4e5f6a7b8c",
      "filename": "proposal.docx",
      "file_type": "docx",
      "purpose": "proposal",
      "metadata": { "byte_size": 38412, "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      "uploaded_at": "2026-11-08T04:20:15.842Z",
      "superseded_at": "2026-11-08T05:02:41.358Z",
      "archived_at": null
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope รูปแบบ Stripe (`object`, `data`, `has_more`, `total_count`) ที่ `data` เป็นอาร์เรย์ของ [ออบเจ็กต์ File](#the-file-object) `has_more` เป็น `false` เสมอ (ไม่มี pagination) และ `total_count` เท่ากับจำนวนไฟล์ทั้งหมดหลังกรอง

### Errors

| Status | When it happens                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 400    | `project_id_required` — ไม่ได้ส่ง query `project_id`                              |
| 400    | `invalid_purpose` — purpose ไม่อยู่ใน enum                                        |
| 401    | `not_signed_in` — ไม่ได้แนบ Bearer token / `token_expired` — access token หมดอายุ  |
| 403    | `permission_denied` — บัญชี admin ไม่มีสิทธิ์เข้าถึงโครงการ                         |
| 404    | `project_not_found` — ไม่พบโครงการ หรือผู้ใช้ไม่ใช่สมาชิก                           |

---

## Download file content

$\color{blue}{\textsf{GET}}$ /files/:fileId/content

ดาวน์โหลดเนื้อหาไฟล์ดิบ (binary) พร้อม header สำหรับบันทึกเป็นไฟล์แนบ ไฟล์ที่ archive แล้วยังดาวน์โหลดได้ เพราะ evidence ที่ถูกเก็บรักษาอาจยังถูกอ้างถึง เฉพาะสมาชิกของโครงการเท่านั้นที่ดาวน์โหลดได้

### Request

```bash
curl http://localhost:3000/files/01948f31-5d8e-7c2f-a1b3-c9d4e5f60718/content \
  -H "Authorization: Bearer <access_token>" \
  -OJ
```

> [!NOTE] Reconstructed from code

### Parameters

- **fileId** (string, required) รหัสไฟล์ใน path

### Response

คืนเนื้อหาไฟล์ดิบ ไม่ใช่ JSON:

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Content-Disposition: attachment; filename="proposal.docx"; filename*=UTF-8''proposal.docx

<binary file bytes>
```

> [!NOTE] Reconstructed from code

- **Content-Type** เป็น MIME type ที่บันทึกไว้ตอนอัปโหลด ถ้าไม่มีจะใช้ `application/octet-stream`
- **Content-Disposition** เป็น `attachment` เสมอ ชื่อไฟล์ที่มีตัวอักษรนอก ASCII (เช่น ภาษาไทย) จะใช้ `filename=` เป็น ASCII fallback และ `filename*=UTF-8''…` ตาม RFC 6266/5987 — ไคลเอนต์ควรบันทึกไฟล์ด้วยชื่อจาก header นี้

### Returns

คืน bytes ดิบของไฟล์ (200) ใช้ `-OJ` ของ curl หรือแปลง blob ฝั่งเบราว์เซอร์เพื่อบันทึกเป็นไฟล์

### Errors

| Status | When it happens                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ Bearer token / `token_expired` — access token หมดอายุ  |
| 403    | `permission_denied` — บัญชี admin ไม่มีสิทธิ์เข้าถึงโครงการ                         |
| 404    | `file_not_found` — ไม่พบไฟล์ตาม `fileId`                                           |
| 404    | `project_not_found` — ผู้ใช้ไม่ใช่สมาชิกของโครงการที่ไฟล์สังกัด                     |
| 410    | `file_content_gone` — record ยังอยู่แต่เนื้อหาหายจาก storage แล้ว                   |

---

## Archive a file

$\color{green}{\textsf{POST}}$ /files/:fileId/archive

ทำเครื่องหมายว่าไฟล์ถูกเก็บถาวร (archive) โดยตั้ง `archived_at` เป็นเวลาปัจจุบัน ไม่ลบเนื้อหา chunks หรือ record ไฟล์จึงยังดาวน์โหลดได้ เหมาะกับ evidence ที่ต้องเก็บรักษาแต่ลบไม่ได้ เรียกซ้ำบนไฟล์ที่ archive แล้วปลอดภัย (idempotent) — คืนค่าเดิมโดยไม่เปลี่ยน `archived_at`

### Request

```bash
curl -X POST http://localhost:3000/files/01948f31-5d8e-7c2f-a1b3-c9d4e5f60718/archive \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **fileId** (string, required) รหัสไฟล์ใน path

### Response

```json
{
  "object": "file",
  "file_id": "01948f31-5d8e-7c2f-a1b3-c9d4e5f60718",
  "project_id": "01948f2a-1c3b-7e5a-9f2c-8b4d1e2f3a4b",
  "uploaded_by": "01937b6c-8a2d-7e4f-b1c2-3d4e5f6a7b8c",
  "filename": "proposal.docx",
  "file_type": "docx",
  "purpose": "proposal",
  "metadata": {
    "byte_size": 38412,
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  "uploaded_at": "2026-11-08T04:20:15.842Z",
  "superseded_at": null,
  "archived_at": "2026-11-08T06:12:03.157Z"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน [ออบเจ็กต์ File](#the-file-object) ด้วยสถานะ 201 พร้อม `archived_at` ที่ตั้งแล้ว ถ้าไฟล์ถูก archive ไปก่อนหน้าจะคืนออบเจ็กต์เดิมโดยไม่เปลี่ยนแปลง

### Errors

| Status | When it happens                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ Bearer token / `token_expired` — access token หมดอายุ  |
| 403    | `permission_denied` — บัญชี admin ไม่มีสิทธิ์เข้าถึงโครงการ                         |
| 404    | `file_not_found` — ไม่พบไฟล์ตาม `fileId`                                           |

---

## Delete a file

$\color{red}{\textsf{DELETE}}$ /files/:fileId

ลบไฟล์ถาวร: record, chunks และ bytes ใน storage ถูกลบทั้งหมด ถ้าไฟล์เป็น active proposal ของโครงการ ฟิลด์ `proposal_file_id` จะกลายเป็น `null` ไฟล์ที่ถูก task อ้างเป็น evidence ลบไม่ได้ (409) เพราะเป็นส่วนของบันทึกงานที่ต้องเก็บรักษา — ให้ archive แทน

### Request

```bash
curl -X DELETE http://localhost:3000/files/01948f45-9a1c-7b6e-b2d4-5f6a7b8c9d0e \
  -H "Authorization: Bearer <access_token>"
```

> [!NOTE] Reconstructed from code

### Parameters

- **fileId** (string, required) รหัสไฟล์ใน path

### Response

```json
{
  "object": "file",
  "file_id": "01948f45-9a1c-7b6e-b2d4-5f6a7b8c9d0e",
  "deleted": true
}
```

> [!NOTE] Reconstructed from code

### Returns

คืนออบเจ็กต์ยืนยันการลบด้วยสถานะ 200 หลังจากนี้ทุก endpoint ที่อ้าง `file_id` นี้จะตอบ 404 `file_not_found`

### Errors

| Status | When it happens                                                                   |
| ------ | --------------------------------------------------------------------------------- |
| 401    | `not_signed_in` — ไม่ได้แนบ Bearer token / `token_expired` — access token หมดอายุ  |
| 403    | `permission_denied` — บัญชี admin ไม่มีสิทธิ์เข้าถึงโครงการ                         |
| 404    | `file_not_found` — ไม่พบไฟล์ตาม `fileId`                                           |
| 409    | `file_in_use` — มี task อ้างไฟล์นี้เป็น evidence ให้ archive แทนการลบ                |
