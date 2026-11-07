# Domain profiles

Domain profiles คือ registry กลางที่อธิบาย "โดเมนการวิจัย" ของชุดข้อมูล (dataset) — เป็นคนละแกนกับ `type` (raw / software / publication): `type` บอกว่าผลลัพธ์เป็นอะไร ส่วน `domain` บอกว่ามาจากสาขาวิชาใด ชุดข้อมูลหนึ่งชุดมีได้ทั้งสองอย่าง ฝั่ง backend เสิร์ฟ registry เดียวกับที่ engine ใช้ (`src/shared/domain-profiles/`) ผ่าน Meta controller (`src/features/meta/`) เพื่อให้ frontend ประกาศ schema และกติกาสิทธิ์ของฟิลด์โดยไม่ต้อง hardcode ซ้ำ

ทั้งสอง endpoint อยู่ภายใต้ global `AuthGuard` จึงต้องแนบ Bearer access token ทุกครั้ง (ไม่มี `@Public()`)

## Endpoints

- [$\color{blue}{\textsf{GET}}$ /domain-profiles](#list-all-domain-profiles) — List all domain profiles
- [$\color{blue}{\textsf{GET}}$ /field-policy](#retrieve-field-policy) — Retrieve field policy

---

## The domain profile object

Profile หนึ่งอันอธิบายโดเมนหนึ่งโดเมน: ชื่อ, คำอธิบาย และรายการฟิลด์เฉพาะโดเมน ทุกฟิลด์ที่ประกาศจะถูกใช้ทั้ง render และ validate (schema สืบทอดจากรายการฟิลด์โดยตรง จึงเบี่ยงเบนกันไม่ได้) — แต่ `schema` ถูกตัดออกจาก response เหลือเฉพาะส่วนที่ frontend ใช้แสดงผล

> [!NOTE] Reconstructed from code

```json
{
  "key": "life_sciences",
  "label": "Life sciences",
  "description": "Organisms, samples and the instruments that read them.",
  "fields": [
    {
      "key": "organism",
      "label": "Organism",
      "type": "text",
      "required": true,
      "help": "Species or cultivar the data describes, e.g. Oryza sativa IR64."
    },
    {
      "key": "sequencing_platform",
      "label": "Sequencing platform",
      "type": "select",
      "options": ["Illumina", "Oxford Nanopore", "PacBio", "Sanger", "Other"]
    },
    {
      "key": "biosafety_reviewed",
      "label": "Biosafety reviewed",
      "type": "toggle",
      "permission": "human",
      "help": "Tick only once the biosafety review has actually happened."
    }
  ]
}
```

### Attributes

- **key** (string, required) รหัสโดเมน ใช้อ้างอิงใน metadata ของ dataset
  - **type** (string, optional) ประเภท input ของฟิลด์
    | Value       | Description                          |
    | ----------- | ------------------------------------ |
    | `text`      | ข้อความสั้นบรรทัดเดียว                |
    | `textarea`  | ข้อความยาวหลายบรรทัด                  |
    | `number`    | ตัวเลข (coerce เป็น number ตอน validate) |
    | `select`    | เลือกจาก `options` ที่กำหนด            |
    | `date`      | วันที่ (coerce เป็น Date ตอน validate)  |
    | `toggle`    | ค่าบูลีนเปิด/ปิด                        |
- **label** (string, required) ชื่อโดเมนแบบ human-readable
- **description** (string, required) คำอธิบายสั้น ๆ ว่าโดเมนนี้ครอบคลุมข้อมูลลักษณะใด
- **fields** (array of objects, required) รายการฟิลด์เฉพาะโดเมน (อาจว่าง เช่น `generic`)
  - **key** (string, required) ชื่อฟิลด์ ใช้เป็น key ใน metadata
  - **label** (string, required) ชื่อฟิลด์สำหรับแสดงผล
  - **type** (string, required) ประเภท input (`text`, `textarea`, `number`, `select`, `date`, `toggle`)
  - **required** (boolean, optional) ฟิลด์บังคับกรอกหรือไม่
  - **options** (array of strings, optional) ค่าที่เลือกได้ — ใช้กับ `type: "select"` เท่านั้น
  - **help** (string, optional) ข้อความช่วยเหลือ แสดงใต้ input
  - **permission** (string, optional) สิทธิ์ของฟิลด์ (`ai` ค่าเริ่มต้น / `human` / `locked`); profile กำหนดเองสำหรับฟิลด์ที่ต้องเป็นของมนุษย์ เพื่อให้เพิ่มโดเมนใหม่ไม่ต้องแก้ field-policy ตาม

รายการโดเมนทั้งหมดที่ registry มี:

| Value                    | Description                          |
| ------------------------ | ------------------------------------ |
| `generic`                | ฟิลด์หลักอย่างเดียว ไม่มีฟิลด์เฉพาะโดเมน |
| `life_sciences`          | สิ่งมีชีวิต ตัวอย่าง และเครื่องมือวัด    |
| `health_medical`         | การศึกษาเกี่ยวกับคน เอกสารอนุญาตเป็นส่วนของข้อมูล |
| `social_science`         | สังคมศาสตร์                           |
| `humanities`             | มนุษยศาสตร์                           |
| `geospatial`             | ภูมิสารสนเทศ                          |
| `physical_sciences`      | วิทยาศาสตร์กายภาพ                     |
| `engineering_computing`  | วิศวกรรมและคอมพิวเตอร์                |

---

## List all domain profiles

$\color{blue}{\textsf{GET}}$ /domain-profiles

คืน profile ของทุกโดเมนใน registry ในรูป list envelope แบบ Stripe (`object: "list"`) โดยตัด `schema` (Zod) ออกจากทุก profile เพราะเป็นของฝั่ง server

### Request

```curl
curl http://localhost:3000/domain-profiles \
  -H "Authorization: Bearer <access_token>"
```

### Parameters

ไม่รับพารามิเตอร์

### Response

> [!NOTE] Reconstructed from code

```json
{
  "object": "list",
  "data": [
    {
      "key": "generic",
      "label": "Generic",
      "description": "Core fields only. Nothing domain-specific to record.",
      "fields": []
    },
    {
      "key": "life_sciences",
      "label": "Life sciences",
      "description": "Organisms, samples and the instruments that read them.",
      "fields": [
        {
          "key": "organism",
          "label": "Organism",
          "type": "text",
          "required": true,
          "help": "Species or cultivar the data describes, e.g. Oryza sativa IR64."
        },
        {
          "key": "sequencing_platform",
          "label": "Sequencing platform",
          "type": "select",
          "options": ["Illumina", "Oxford Nanopore", "PacBio", "Sanger", "Other"]
        }
      ]
    }
  ],
  "has_more": false,
  "total_count": 8
}
```

### Returns

คืน list envelope (`object: "list"`) ที่ `data` เป็น array ของ domain profile object (ครบทั้ง 8 โดเมน `has_more` เป็น `false` เสมอ) และ `total_count` เท่ากับจำนวน profile

### Errors

| Status | When it happens                                |
| ------ | ---------------------------------------------- |
| 401    | ไม่มีหรือ access token ไม่ถูกต้อง (global AuthGuard) |

---

## Retrieve field policy

$\color{blue}{\textsf{GET}}$ /field-policy

คืนนโยบายสิทธิ์ต่อฟิลด์ (field policy) ของ DMP, dataset และ list ภายใน plan — ใช้กำหนดว่าฟิลด์ใด AI ช่วยเขียนได้ ฟิลด์ใดเป็นของมนุษย์ ฟิลด์ใดล็อก และการแก้ฟิลด์ใดถือเป็น major change ที่ต้องขอ sign-off ใหม่ (ค่า `isMajorTrigger` ถูกตั้งที่เดียวใน registry นี้ และ plan-diff อ่านจากที่นี่)

### Request

```curl
curl http://localhost:3000/field-policy \
  -H "Authorization: Bearer <access_token>"
```

### Parameters

ไม่รับพารามิเตอร์

### Response

> [!NOTE] Reconstructed from code

```json
{
  "object": "field_policy",
  "dmp": {
    "title": { "permission": "ai", "kind": "prose" },
    "description": { "permission": "ai", "kind": "prose" },
    "language": { "permission": "ai", "kind": "choice" },
    "alternate_identifier": { "permission": "human", "kind": "identifier" },
    "begin_date": {
      "permission": "locked",
      "kind": "date",
      "editableBeforeApproval": true,
      "isMajorTrigger": true
    },
    "end_date": {
      "permission": "locked",
      "kind": "date",
      "editableBeforeApproval": true,
      "isMajorTrigger": true
    },
    "ethical_issues_exist": { "permission": "human", "kind": "boolean", "isMajorTrigger": true },
    "ethical_issues_description": { "permission": "human", "kind": "prose" },
    "ethical_issues_report": { "permission": "human", "kind": "identifier" },
    "indigenous_considerations": {
      "permission": "human",
      "kind": "prose",
      "isMajorTrigger": true,
      "noAiAssist": true
    },
    "schema_version": { "permission": "locked", "kind": "identifier" }
  },
  "dataset": {
    "title": { "permission": "ai", "kind": "prose" },
    "description": { "permission": "ai", "kind": "prose" },
    "keyword": { "permission": "ai", "kind": "list" },
    "schema_fields": { "permission": "ai", "kind": "list" },
    "access": { "permission": "human", "kind": "choice", "isMajorTrigger": true },
    "personal_data": { "permission": "human", "kind": "choice", "isMajorTrigger": true },
    "sensitive_data": { "permission": "human", "kind": "choice" },
    "personal_data_plan": { "permission": "human", "kind": "prose", "isMajorTrigger": true },
    "protection_level": { "permission": "human", "kind": "choice", "isMajorTrigger": true },
    "security_classification_level": { "permission": "human", "kind": "choice", "isMajorTrigger": true },
    "preservation.statement": { "permission": "human", "kind": "prose" },
    "preservation.repository": { "permission": "human", "kind": "identifier", "isMajorTrigger": true },
    "preservation.duration": { "permission": "human", "kind": "choice", "isMajorTrigger": true },
    "distribution.license": { "permission": "human", "kind": "identifier", "isMajorTrigger": true }
  },
  "lists": {
    "dataset": { "permission": "human", "kind": "list", "isMajorTrigger": true },
    "contributor": { "permission": "human", "kind": "list", "isMajorTrigger": true },
    "cost": { "permission": "human", "kind": "list" }
  }
}
```

### Returns

คืน object ที่มี `object: "field_policy"` และสาม map ของนโยบาย แต่ละ entry เป็น field policy object ที่มีฟิลด์ดังนี้

- **object** (string, required) ค่าคงที่ `field_policy`
- **dmp** (map, required) นโยบายของฟิลด์ระดับแผน (DMP) เช่น `title`, `begin_date`, `ethical_issues_exist`, `indigenous_considerations`, `schema_version`
- **dataset** (map, required) นโยบายของฟิลด์ระดับ research output/dataset เช่น `access`, `personal_data`, `preservation.repository`, `distribution.license`
- **lists** (map, required) นโยบายของ list ภายใน plan ตัดสินต่อรายการ (เพิ่ม/ลบ/แก้รายการใด ๆ นับทั้งรายการ) — มี 3 key เท่านั้น: `dataset`, `contributor`, `cost`

โครงสร้างของ field policy object แต่ละ entry:

- **permission** (string, required) ใครเป็นเจ้าของฟิลด์
  | Value    | Description                                        |
  | -------- | -------------------------------------------------- |
  | `ai`     | AI เขียน/แก้ได้อิสระ                                |
  | `human`  | มนุษย์เป็นเจ้าของ AI ช่วยขัดเกลา ("polish") ได้เท่านั้น |
  | `locked` | ล็อกจาก AI ทั้งกระบวนการ                            |
- **kind** (string, required) ประเภทเนื้อหาของฟิลด์ (`prose`, `choice`, `date`, `number`, `identifier`, `boolean`, `list`)
- **isMajorTrigger** (boolean, optional) การแก้ฟิลด์นี้ถือเป็น major change ต้องขอ sign-off ใหม่ (ใช้โดย plan-diff และรายการ "needs sign-off again")
- **editableBeforeApproval** (boolean, optional) แก้ได้ก่อนการอนุมัติแม้ฟิลด์ล็อก (เช่น ไทม์ไลน์ `begin_date`/`end_date`)
- **noAiAssist** (boolean, optional) AI ห้ามยุ่งทุกรูปแบบ — ไม่ rewrite, ไม่ polish, ไม่ suggest ในแชต (เช่น `indigenous_considerations`)

กติกา "Regenerate with AI": ใช้ได้เฉพาะฟิลด์ `kind: "prose"` ที่ไม่ใช่ `locked` — ฟิลด์ `permission: "ai"` ได้ mode `rewrite` ฟิลด์ `permission: "human"` ได้ mode `polish` เท่านั้น (และคำสั่งแบบ `shorter`/`formal` ถือเป็นการแก้ถ้อยคำอย่างเดียว)

### Errors

| Status | When it happens                                |
| ------ | ---------------------------------------------- |
| 401    | ไม่มีหรือ access token ไม่ถูกต้อง (global AuthGuard) |
