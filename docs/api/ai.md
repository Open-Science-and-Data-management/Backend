# AI

ผู้ช่วย AI สำหรับนักวิจัย (เจ้าของแผนเท่านั้น) ประกอบด้วย 3 กลุ่ม — quota, action streaming (SSE) และ thread persistence ทุก run จบด้วย terminal event (`done` หรือ `error`) หนึ่งตัวเสมอ โควตาเป็นรายเดือน (reset ต้นเดือนถัดไป UTC) นับทั้ง call ที่ fail/abort (ADR-0023)

ข้อจำกัดสำคัญ:

- เฉพาะ role `researcher` ที่เป็นเจ้าของแผน (`created_by` = ผู้เรียก) — ไม่ใช่เจ้าของตอบ 404 `dmp_not_found` เพื่อซ่อนการมีอยู่, ไม่ใช่ researcher ตอบ 403 `not_a_researcher`
- ทุก action streaming (รวม `analyze-proposal`) **ต้องส่ง header `Idempotency-Key`** — ขาดตอบ 400 `field_invalid`; key เดิมที่ run จบแล้ว replay snapshot เดิมโดยไม่หักโควตาซ้ำ (24 ชม.), key ซ้ำขณะ run ยังบินตอบ 409
- `scope` ใน path เป็น `dmp_id` หรือ `unscoped` (chat ในโหมดอิสระ) — action อื่นที่ไม่ใช่ `chat` ใต้ `unscoped` ตอบ 400 `field_invalid`

## Endpoints

- [$\color{blue}{\textsf{GET}}$ /ai/quota](#retrieve-quota) — Retrieve quota
- [$\color{green}{\textsf{POST}}$ /ai/analyze-proposal](#analyze-a-proposal) — Analyze a proposal (SSE)
- [$\color{green}{\textsf{POST}}$ /dmps/:scope/ai/:action](#run-an-ai-action) — Run an AI action (SSE)
- [$\color{blue}{\textsf{GET}}$ /dmps/:scope/ai-thread](#list-thread-entries) — List thread entries
- [$\color{orange}{\textsf{PUT}}$ /dmps/:scope/ai-thread/:entry_id](#set-a-proposal-decision) — Set a proposal decision
- [$\color{green}{\textsf{POST}}$ /dmps/:scope/ai-thread/clear](#clear-a-thread) — Clear a thread
- [$\color{green}{\textsf{POST}}$ /ai-thread/adopt](#adopt-an-unscoped-thread) — Adopt an unscoped thread

## The quota object

```json
{
  "object": "ai_quota",
  "limit": 200000,
  "used": 34500,
  "remaining": 165500,
  "resets_at": "2026-12-01T00:00:00.000Z"
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของ object ค่าจะเป็น `ai_quota` เสมอ
- **limit** (integer, required) โควตา token ต่อเดือน ค่า `0` หมายถึงไม่จำกัด
- **used** (integer, required) token ที่ใช้ไปในงวดปัจจุบัน — output + uncached input + cached input คิดเป็น 10% (เพดานปัด)
- **remaining** (integer, required) คงเหลือ (`limit - used`) ถ้า `limit` เป็น 0 คืนค่าจำนวนเต็มมากมาก
- **resets_at** (string, nullable) timestamp ต้นเดือนถัดไป UTC ที่โควตา reset

---

## Retrieve quota

$\color{blue}{\textsf{GET}}$ /ai/quota

ดูโควตา AI ของผู้ใช้ปัจจุบัน ถ้าเลยกำหนด reset แล้วระบบ reset ให้ก่อน (lazy) แล้วคืนค่าหลัง reset

### Parameters

ไม่มีพารามิเตอร์

### Response

```json
{
  "object": "ai_quota",
  "limit": 200000,
  "used": 34500,
  "remaining": 165500,
  "resets_at": "2026-12-01T00:00:00.000Z"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน quota object ของผู้ใช้ปัจจุบัน

### Errors

| Status | When it happens                        |
| ------ | --------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง    |

---

## The SSE event stream

ทุก action endpoint (`analyze-proposal` และ `POST /dmps/:scope/ai/:action`) ตอบ `200` พร้อม `Content-Type: text/event-stream` แล้วส่ง event เป็น SSE frames จนถึง terminal event ถ้า error เกิด **ก่อน** event แรกยังได้ error envelope ปกติผ่าน global filter รูปแบบ event เป็น discriminated union บน field `event` (ADR-0023):

- **event** (string, required) ชนิดของ event

  | Value      | Description                                                                                                     |
  | ---------- | --------------------------------------------------------------------------------------------------------------- |
  | `status`   | ข้อความสถานะ เช่น hint เมื่อโควตาเหลือ ≤ 20% (`message` ใน payload)                                               |
  | `tool`     | ผลจาก tool read-only ที่โมเดลเรียก (payload ตาม tool)                                                            |
  | `delta`    | ข้อความส่วนของคำตอบ (`text` ใน payload) — ต่อกันเป็นข้อความเต็ม                                                  |
  | `proposal` | ผลลัพธ์ structured (เช่น maDMP JSON) (`proposal` ใน payload)                                                     |
  | `done`     | terminal event — run สำเร็จ                                                                                      |
  | `error`    | terminal event — run ล้มเหลว (มี terminal event เดียวต่อ run เสมอ)                                                 |

### done event

```json
{
  "event": "done",
  "entry_id": "018f4b5d-8c52-7e6f-9a3b-4d9c2f7e5a18",
  "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 850,
    "cached_input_tokens": 300,
    "total_tokens": 2050
  }
}
```

> [!NOTE] Reconstructed from code

**entry_id** (string, optional) id ของ assistant entry ที่ run นี้เขียนลง thread
**dmp_id** (string, optional) แผนที่เกี่ยวข้อง — ปรากฏเมื่อ run อยู่ใต้ `dmp_id` หรือ `analyze-proposal` สร้างแผนสำเร็จ
**usage** (object, optional) รายงาน token ของ run

  | Field                  | Description                                    |
  | ---------------------- | ---------------------------------------------- |
  | `input_tokens`         | token ฝั่ง input ทั้งหมด                        |
  | `output_tokens`        | token ฝั่ง output                              |
  | `cached_input_tokens`  | ส่วน input ที่ cached (นับ 10% ตอน reconcile)   |
  | `total_tokens`         | ผลรวม                                          |

### error event

```json
{
  "event": "error",
  "code": "ai_rate_limited",
  "message": "provider rate limited the request",
  "retryable": true,
  "usage": { "input_tokens": 900, "output_tokens": 0, "cached_input_tokens": 0, "total_tokens": 900 },
  "resets_at": "2026-12-01T00:00:00.000Z"
}
```

> [!NOTE] Reconstructed from code

**code** (string, required) รหัส error จากชุดเดียวที่ adapter แปลให้ (anti-corruption — client ไม่เห็น schema ของ OpenRouter)

  | Value                | Description                                |
  | -------------------- | ------------------------------------------ |
  | `ai_auth_failed`     | 401 จาก provider — key ไม่ถูก/ไม่มี         |
  | `ai_payment_required`| เครดิต provider หมด                         |
  | `ai_rate_limited`    | rate limit (retry ได้)                      |
  | `ai_invalid_request` | request เราผิด (model ไม่มี, params เกิน)    |
  | `ai_provider_error`  | ไม่มี provider รับงาน (retry ได้)            |
  | `ai_network_error`   | fetch ล้ม/timeout ก่อนได้ response (retry ได้)|
  | `ai_stream_error`    | error กลาง stream                           |
  | `ai_aborted`         | caller ยกเลิกกลางทาง (ปิด connection)        |

**message** (string, required) คำอธิบาย
**retryable** (boolean, required) บอกว่า retry request เดิมได้หรือไม่
**usage** (object, optional) ส่วนที่โมเดลประมวลผลไปแล้ว — โควตาถูกหักแม้ fail/abort
**resets_at** (string, optional) ปรากฏเฉพาะ `code: quota_exceeded` (โควตาเดือนนี้หมด — กรณีนี้ตอบ 429 ผ่าน envelope ก่อน stream เริ่ม ไม่ใช่ error event)

---

## Analyze a proposal

$\color{green}{\textsf{POST}}$ /ai/analyze-proposal

วิเคราะห์ไฟล์ proposal ของโปรเจกต์แล้วร่างแผนข้อมูลใหม่ (maDMP JSON) — สำเร็จแล้วเขียน draft ลงแผน (set `draft`, `title`, `draft_revision = 1`) และผูก `proposal_file_id` ให้โปรเจกต์ ถ้าไม่ส่ง `dmp_id` มา ระบบสร้างแผนใหม่ก่อน run; run fail แล้วแผนนั้นถูกสร้างเองใน call นี้ → ลบแผนทิ้ง (ไม่มีแผนค้างจาก proposal ที่อ่านไม่รู้เรื่อง) ส่งผลทาง SSE

### Request

```bash
curl <base URL>/ai/analyze-proposal \
  -H "Authorization: Bearer <access token>" \
  -H "Idempotency-Key: analyze-2026-11-08-1" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"018f3a2c-7b41-7d5e-9f2a-5e7a9c0d3f12","file_id":"018f3a2c-7b41-7d5e-9f2a-2d8b4f6a0c71"}'
```

### Parameters

- **project_id** (string, required) id ของโปรเจกต์ที่ผู้เรียกเห็นได้
- **file_id** (string, required) id ของไฟล์ purpose `proposal` บนโปรเจกต์นั้น — ไฟล์อื่นหรือต่างโปรเจกต์ตอบ 404 `file_not_found`
- **dmp_id** (string, optional) redraft แผนที่มีอยู่ (ต้องเป็นแผนของผู้เรียก) แทนสร้างใหม่
- **direction** (string, optional) คำสั่งเสริมส่งเข้า prompt แทน prompt เริ่มต้น

### Response

```
event: status
data: {"event":"status","message":"โควตา AI คงเหลือ 12000 tokens"}

event: delta
data: {"event":"delta","text":"ร่างแผนจาก proposal ..."}

event: proposal
data: {"event":"proposal","proposal":{"title":"..."}}

event: done
data: {"event":"done","entry_id":"...","dmp_id":"018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90","usage":{...}}
```

> [!NOTE] Reconstructed from code

### Returns

SSE stream จบด้วย `done` — แผนถูกสร้าง/redraft แล้ว `dmp_id` อยู่ใน done event จบด้วย `error` และแผนถูกสร้างใน call นี้ → แผนถูกลบ (ไม่มี `dmp_id`)

### Errors

ก่อน stream เริ่ม (envelope ปกติ):

| Status | When it happens                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 400    | ไม่มี header `Idempotency-Key` หรือ body ไม่ผ่าน validation (code `field_invalid`)                       |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                                                    |
| 404    | โปรเจกต์ไม่มองเห็นสำหรับผู้เรียก หรือไฟล์ไม่ใช่ purpose `proposal` บนโปรเจกต์นั้น (code `file_not_found`) |
| 409    | key ซ้ำขณะ run แรกยังไม่จบ                                                                              |
| 422    | ไฟล์ไม่มีข้อความที่ extract ได้ (code `proposal_unreadable` — ไม่มีแผนถูกสร้าง)                          |
| 429    | โควตาเดือนนี้ใช้ครบแล้ว (code `quota_exceeded`, `resets_at` แนบใน error)                                 |

ภายใน stream: `error` event ตามตารางในหัวข้อ [The SSE event stream](#the-sse-event-stream)

---

## Run an AI action

$\color{green}{\textsf{POST}}$ /dmps/:scope/ai/:action

รัน action ของ AI ใต้แผน (หรือ `unscoped` สำหรับ chat อิสระ) ทุก run persist ลง thread — user entry ก่อน run, assistant + event entry ตอนจบ — และ action `chat` ใช้ประวัติล่าสุดของ scope (10 entries ล่าสุด, เฉพาะ user/assistant) เป็น context ส่งผลทาง SSE

### Request

```bash
curl <base URL>/dmps/018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90/ai/chat \
  -H "Authorization: Bearer <access token>" \
  -H "Idempotency-Key: chat-2026-11-08-1" \
  -H "Content-Type: application/json" \
  -d '{"message":"สรุปช่องว่างของแผนช่วง data collection","section":"4"}'
```

### Parameters

- **scope** (string, required) ใน URL path — `dmp_id` หรือ `unscoped`
- **action** (string, required) ใน URL path — ตัวใดตัวหนึ่ง อื่น ๆ ตอบ 404 `action_not_found`

  | Value              | Description                                                     |
  | ------------------ | --------------------------------------------------------------- |
  | `chat`             | สนทนาเรื่องแผน (action เดียวที่อยู่ใต้ `unscoped` ได้)            |
  | `suggest`          | ข้อเสนอแนะต่อแผน                                                 |
  | `regenerate-field` | สร้างฟิลด์ใน draft ใหม่                                           |
  | `generate-tasks`   | เสนองาน lifecycle จากแผน                                          |
  | `checklist`        | เช็คความครบถ้วนของแผน                                             |

- **message** (string, required เมื่อ action `chat`) ข้อความของผู้ใช้ (min length 1)
- **section** (string, optional เมื่อ action `chat`) section ของแผนที่สนทนาอยู่
- **direction** (string, optional สำหรับ action อื่น) คำสั่งเสริม — body ของ action อื่น passthrough ส่งตรงเข้า prompt

### Response

```json
{"event":"done","entry_id":"018f4b5d-8c52-7e6f-9a3b-4d9c2f7e5a18","usage":{"input_tokens":900,"output_tokens":400,"cached_input_tokens":0,"total_tokens":1300}}
```

> [!NOTE] Reconstructed from code — สตรีมจริงเป็น SSE frames ตามลำดับ `status`/`tool`/`delta`/`proposal`/`done`|`error`

### Returns

SSE stream จบด้วย terminal event เดียว เมื่อสำเร็จ `done` แนบ `entry_id` ของ assistant entry ให้ใช้ตัดสิน proposal ต่อได้

### Errors

ก่อน stream เริ่ม (envelope ปกติ):

| Status | When it happens                                                                            |
| ------ | ------------------------------------------------------------------------------------------- |
| 400    | ไม่มี header `Idempotency-Key`, action ที่ไม่ใช่ `chat` อยู่ใต้ `unscoped`, หรือ body ไม่ผ่าน validation (code `field_invalid`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                                        |
| 403    | ผู้เรียกไม่ใช่ `researcher` (code `not_a_researcher`)                                        |
| 404    | ไม่มีแผนนี้หรือไม่ใช่ของผู้เรียก (code `dmp_not_found`) หรือไม่มี action นี้ (code `action_not_found`) |
| 409    | key ซ้ำขณะ run แรกยังไม่จบ                                                                   |
| 429    | โควตาเดือนนี้ใช้ครบแล้ว (code `quota_exceeded`, `resets_at` แนบใน error)                      |

ภายใน stream: `error` event ตามตารางในหัวข้อ [The SSE event stream](#the-sse-event-stream)

---

## The thread entry object

```json
{
  "object": "ai_thread_entry",
  "entry_id": "018f4b5d-8c52-7e6f-9a3b-4d9c2f7e5a18",
  "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "kind": "assistant",
  "content": { "action": "chat", "text": "...", "proposal": null },
  "token_count": 1300,
  "decision": null,
  "hidden": false,
  "created_at": "2026-11-08T09:15:42.310Z"
}
```

> [!NOTE] Reconstructed from code

### Attributes

- **object** (string, required) ชนิดของ object ค่าจะเป็น `ai_thread_entry` เสมอ
- **entry_id** (string, required) id ของ entry (UUID) ใช้เป็น cursor `before` ด้วย
- **dmp_id** (string, nullable) แผนที่ entry ผูกอยู่ `null` = thread `unscoped`
- **kind** (string, required) ชนิดของ entry

  | Value       | Description                                        |
  | ----------- | -------------------------------------------------- |
  | `user`      | ข้อความ/action ที่ผู้ใช้สั่ง (เขียนก่อน run)          |
  | `assistant` | คำตอบของโมเดล — มี `proposal` ให้ตัดสินได้           |
  | `event`     | บันทึก metadata ของ run (usage, dmp_id) — ไม่แสดงใน chat |

- **content** (object) เนื้อหาของ entry รูปร่างตาม `kind` (เช่น `{text, section}` ของ user chat, `{action, text, proposal}` ของ assistant)
- **token_count** (integer, required) token ที่ entry นี้ใช้ (assistant ใช้ total ของ run)
- **decision** (string, nullable) ผลการตัดสิน proposal — มีได้เฉพาะ `assistant` ที่ตัดสินแล้ว

  | Value       | Description                          |
  | ----------- | ------------------------------------ |
  | `accepted`  | ผู้ใช้รับ proposal (การ clear ยังเก็บไว้) |
  | `rejected`  | ผู้ใช้ปัด proposal                    |
  | `stale`     | ทำเครื่องหมายว่าหมดอายุ/ไม่ใช้แล้ว      |

- **hidden** (boolean, required) ถูกซ่อนโดย clear หรือไม่ — entry ที่ hidden ไม่ปรากฏในการ list เสมอ
- **created_at** (string, required) timestamp ที่สร้าง entry

---

## List thread entries

$\color{blue}{\textsf{GET}}$ /dmps/:scope/ai-thread

ดึงประวัติ thread ของ scope — เรียงเก่า → ใหม่ โดยหน้าแรกดึงจากใหม่สุดย้อนหลัง ใช้ cursor pagination ด้วย `before` ซ่อน entry ที่ hidden เสมอ

### Parameters

- **scope** (string, required) ใน URL path — `dmp_id` หรือ `unscoped`
- **limit** (integer, optional) จำนวนรายการต่อหน้า อยู่ระหว่าง 1–100 ค่าเริ่มต้น 50
- **before** (string, optional) cursor — `entry_id` ตัวแรก (ตัวเก่าสุด) ของหน้าปัจจุบัน เพื่อดึงหน้าที่เก่ากว่าต่อ ไม่พบ anchor จะถูกข้าม (เหมือนไม่ส่ง)

### Response

```json
{
  "object": "list",
  "data": [
    {
      "object": "ai_thread_entry",
      "entry_id": "018f4b5d-8c52-7e6f-9a3b-1e7a3c9f4b62",
      "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
      "kind": "user",
      "content": { "text": "สรุปช่องว่างของแผน", "section": "4" },
      "token_count": 0,
      "decision": null,
      "hidden": false,
      "created_at": "2026-11-08T09:15:40.104Z"
    },
    {
      "object": "ai_thread_entry",
      "entry_id": "018f4b5d-8c52-7e6f-9a3b-4d9c2f7e5a18",
      "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
      "kind": "assistant",
      "content": { "action": "chat", "text": "...", "proposal": null },
      "token_count": 1300,
      "decision": null,
      "hidden": false,
      "created_at": "2026-11-08T09:15:42.310Z"
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน list envelope (`object: "list"`, `data`, `has_more`, `total_count`) — `has_more` ตรวจด้วยการดึง limit + 1 row `total_count` เป็นจำนวนรายการในหน้านี้ (cursor ถอยหลัง ไม่ใช่จำนวนทั้ง thread)

### Errors

| Status | When it happens                                                       |
| ------ | ---------------------------------------------------------------------- |
| 400    | `limit` ไม่ใช่ integer ในช่วง 1–100 (code `field_invalid`)               |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                    |
| 403    | ผู้เรียกไม่ใช่ `researcher` (code `not_a_researcher`)                    |
| 404    | ไม่มีแผนนี้หรือไม่ใช่ของผู้เรียก (code `dmp_not_found`)                   |

---

## Set a proposal decision

$\color{orange}{\textsf{PUT}}$ /dmps/:scope/ai-thread/:entry_id

ตัดสิน proposal ของ assistant entry — จด `decision` ลง entry (และ `stale_reason` ลง content เมื่อตัดสิน `stale`) ตัดสินได้ครั้งเดียว ตัดสินซ้ำตอบ 409

### Parameters

- **scope** (string, required) ใน URL path — `dmp_id` หรือ `unscoped` ต้องตรงกับแผนของ entry
- **entry_id** (string, required) ใน URL path — id ของ assistant entry
- **status** (string, required) ผลการตัดสิน — `accepted`, `rejected` หรือ `stale`
- **stale_reason** (string, optional) เหตุผล (บันทึกเมื่อ `status: stale`)

### Response

```json
{
  "object": "ai_thread_entry",
  "entry_id": "018f4b5d-8c52-7e6f-9a3b-4d9c2f7e5a18",
  "dmp_id": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "kind": "assistant",
  "content": { "action": "chat", "text": "...", "proposal": null },
  "token_count": 1300,
  "decision": "accepted",
  "hidden": false,
  "created_at": "2026-11-08T09:15:42.310Z"
}
```

> [!NOTE] Reconstructed from code

### Returns

คืน thread entry ที่ตั้ง `decision` แล้ว

### Errors

| Status | When it happens                                                                     |
| ------ | ------------------------------------------------------------------------------------ |
| 400    | body ไม่ผ่าน validation (code `field_invalid`)                                        |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                                 |
| 403    | ผู้เรียกไม่ใช่ `researcher` (code `not_a_researcher`)                                  |
| 404    | ไม่พบ entry ของผู้เรียกใน scope นี้ (code `entry_not_found`)                           |
| 409    | entry ถูกตัดสินไปแล้ว (code `proposal_settled`)                                        |

---

## Clear a thread

$\color{green}{\textsf{POST}}$ /dmps/:scope/ai-thread/clear

ซ่อน (soft-delete) entry `user` + `assistant` ที่ยังไม่ได้ `accepted` ของ scope — เก็บ entry `event` และ assistant ที่ accepted ไว้ตลอด entry ที่ซ่อนแล้วไม่ปรากฏในการ list และไม่ถูกใช้เป็น history อีก

### Parameters

- **scope** (string, required) ใน URL path — `dmp_id` หรือ `unscoped`

### Response

```json
{
  "object": "ai_thread",
  "scope": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "hidden": 6,
  "kept": 2
}
```

> [!NOTE] Reconstructed from code

### Returns

คืนผลลัพธ์ของการ clear — `object` เป็น `ai_thread`, `hidden` คือจำนวน entry ที่ซ่อน, `kept` คือจำนวนที่เก็บไว้

### Errors

| Status | When it happens                                                       |
| ------ | ---------------------------------------------------------------------- |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                    |
| 403    | ผู้เรียกไม่ใช่ `researcher` (code `not_a_researcher`)                    |
| 404    | ไม่มีแผนนี้หรือไม่ใช่ของผู้เรียก (code `dmp_not_found`)                   |

---

## Adopt an unscoped thread

$\color{green}{\textsf{POST}}$ /ai-thread/adopt

ย้าย thread `unscoped` ทั้งหมดของผู้เรียกเข้าผูกกับแผน (ใช้เมื่อเริ่ม chat ก่อนมีแผนแล้วค่อยเลือกแผน)

### Parameters

- **from** (string, required) ต้องเป็น `"unscoped"` ค่าเดียว
- **to** (string, required) id ของแผนปลายทาง (ต้องเป็นแผนของผู้เรียก)

### Response

```json
{
  "object": "ai_thread",
  "scope": "018f3a2c-7b41-7d5e-9f2a-8b2c4e6a1d90",
  "moved": 4
}
```

> [!NOTE] Reconstructed from code

### Returns

คืนผลลัพธ์ของการย้าย — `scope` เป็นแผนปลายทาง, `moved` คือจำนวน entry ที่ย้าย

### Errors

| Status | When it happens                                                       |
| ------ | ---------------------------------------------------------------------- |
| 400    | body ไม่ผ่าน validation เช่น `from` ไม่ใช่ `"unscoped"` (code `field_invalid`) |
| 401    | ไม่ได้ส่งหรือ access token ไม่ถูกต้อง                                    |
| 403    | ผู้เรียกไม่ใช่ `researcher` (code `not_a_researcher`)                    |
| 404    | ไม่มีแผนปลายทางหรือไม่ใช่ของผู้เรียก (code `dmp_not_found`)               |
