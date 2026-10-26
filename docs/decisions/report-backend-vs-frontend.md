# Report: backend design (arc42) vs frontend API contract

**ตรวจเมื่อ:** 2026-10-26
**เทียบ:** `docs/architecture/arc42.md` + `docs/architecture/sequence-diagrams.md` ←→ `docs/frontend-api/` (README + auth, reviews, dmps, projects, tasks, files, ai, notifications + pages)
**บทบาทของแต่ละฝั่ง:** frontend-api คือ mockup API ที่ frontend ใช้งานอยู่จริงตอนนี้; arc42 คือพิมพ์เขียว backend ที่ยังไม่มีโค้ด

---

## บทสรุปผู้บริหาร

**เชิง domain/พฤติกรรม ตรงกันดี** — lifecycle ของแผน (submit → approve/return → revision → archive), preservation (carry/drop/rebase, cancel จดร่องรอย), draft_revision, notification types ครบทั้ง 8, role model ตรงกันทั้งหมด

**แต่ชั้น HTTP ต่างกันแทบทุกจุด** — path, error envelope, pagination, status code, refresh token storage, ชื่อ SSE event ของ AI ไม่มีตัวไหนตรงกันเลย และ arc42 แทบไม่นิยาม read/aggregation endpoints ที่ frontend ใช้วาดหน้าจอ (members, progress, file lifecycle, reviews queue)

**ความขัดแย้งเชิงนโยบาย 3 จุดที่ต้องตัดสินก่อนเขียนโค้ด:**
1. **AI SSE events** — frontend `delta/proposal/done/error` vs arc42 `status/tool/token/result` (ไม่ตรงกันแม้แต่ตัวเดียว)
2. **Notification delivery** — frontend ตัดสินแล้ว "polled, no push" vs arc42 ออกแบบ SSE push `GET /notifications/stream` ทั้งหมวด
3. **Exports** — frontend ตัดสินแล้ว "stay in the browser, out of the API" vs arc42 มี endpoint + feature `exports` + flow #14 ทั้งเรื่อง

---

## 1. ส่วนที่เหมือน (Match)

### 1.1 พฤติกรรมระดับ domain — ตรงกัน

| เรื่อง | รายละเอียดที่ตรงกัน |
| --- | --- |
| **Submit ครั้งแรก** | freeze `plan_mode` ตอน submit, สร้าง version #1 pending + snapshot, แจ้ง `dmp_submitted` + `review_requested`, ป้องกัน submit พร้อมกันด้วย partial unique |
| **การตัดสิน** | หนึ่งเวอร์ชัน หนึ่ง decision, ใครใน committee/chief ก็ตัดสินได้ (global queue ไม่มี assignment), จด `decided_at/decided_by` + approver snapshot, return → working draft ไม่ถูกแตะ, เลขเวอร์ชันไม่ถูกใช้ซ้ำ |
| **Self-finalize** | แผน independent สร้าง version #1 approved ด้วยตัวเอง, มีผลทันที, สร้าง tasks แรก |
| **Minor / major** | classify จาก field policy, major ฟิลด์เดียว = major ทั้งชุด, minor fold ลง version in force + จด `minor_edits`, การเพิ่ม/ลบ output เป็น major |
| **Carry / drop / rebase** | ตอน approve revision — replay ตาม entity id → `carried_minor_edits` / `dropped_minor_edits`, ไม่มีการหายเงียบ ๆ, rebase working copy |
| **Preservation** | ไม่มีทางลบแผน (archive/unarchive), task ที่มีงานบันทึกลบไม่ได้, เสร็จแล้ว cancel ไม่ได้ reopen เท่านั้น, cancel จด `cancelled_from`/`cancel_reason` (`manual`/`output_removed`), ลบ output เป็นข้อเสนอ — เวอร์ชันใหม่ที่นำ output กลับมา "เสนอ" เปิดคืนทีละ task ไม่เปิดเอง |
| **Optimistic concurrency** | `draft_revision` ต้องแนบทุกครั้ง, ไม่ตรง → `409` (ตรงกันทั้งสองฝั่ง) |
| **Restore** | pending restore ไม่ได้, restore in force = ทิ้ง edit ไม่จด, อื่น ๆ = แก้ธรรมดา + จด `restored_from`, rollback ข้ามการอนุมัติไม่ได้ |
| **Tasks** | `progress_percent` คำนวณจาก checklist เสมอ, complete จด `completed_at/by`, evidence หลายรูปแบบ, tasks ผูกกับ dmp (`dmp_id`) |
| **Notification types** | **ครบทั้ง 8 ตัวตรงชื่อกันหมด**: `dmp_submitted, dmp_approved, dmp_finalized, tasks_generated, tasks_cancelled, proposal_superseded, review_requested, dmp_returned` |
| **Roles** | reviewer = `committee` + `chief` เท่านั้น, researcher author คนเดียวต่อแผน, admin ไม่แตะ DMP, independent ไม่เข้าคิวกรรมการ |
| **Auth เชิงพฤติกรรม** | สมัครเองได้เฉพาะ researcher, username lowercase / email normalize, bcrypt/argon2id, access token 15 นาที, refresh token revoke ได้ |
| **plan_mode** | ผูกที่ project ตาม account_type ตอนสร้าง → freeze ลง dmp ตอน submit แรก pin ตลอด |
| **AI เชิงหลักการ** | ทุกผลลัพธ์เป็นข้อเสนอ ผู้ใช้แก้ก่อน apply ได้ทั้งหมด, ไม่มี web search, โควตาต่อผู้ใช้, run ล้มกลางทางโควตาที่ใช้ไปยังนับ, thread persist |

### 1.2 Endpoint ที่ตรงกันเป๊ะ (path + พฤติกรรม)

`POST /dmps/{id}/versions/{n}/approve` · `POST /dmps/{id}/submit` · `POST /dmps/{id}/finalize` · `POST /dmps/{id}/archive` · `POST /dmps/{id}/unarchive` · `POST /tasks/{id}/complete` · `POST /tasks/{id}/reopen` · `POST /tasks/{id}/cancel` · `DELETE /tasks/{id}` · `GET /notifications` · `POST /notifications/{id}/read` · `POST /projects` · AI `generate_tasks`

---

## 2. ส่วนที่ตรงบางส่วน (50/50 — มีในทั้งสองฝั่ง แต่รายละเอียดต่างกัน)

### 2.1 ต่างกันทั้งเล่ม (cross-cutting) — ตัดสินครั้งเดียว แก้ทั้ง API

| หัวข้อ | frontend-api (README) | arc42 | ผลกระทบ |
| --- | --- | --- | --- |
| **Error envelope** | Stripe style `{error: {type, code, message, param}}` | `{error: {code, errors: [{path, code, message}]}}` — path เป็น JSON pointer เพื่อ "คลิกไปแก้" | ทุก error handler ฝั่ง FE |
| **Pagination** | Stripe v1: `object:"list"`, `data`, `has_more`, `total_count`, `starting_after` — dashboard อ่าน `total_count` ตรง ๆ | `?page=&limit=` offset (ระบุชัดว่า "ไม่จำเป็นต้องใช้ cursor") | ทุก list endpoint + stat cards |
| **Status codes** | 400/409 สำหรับ invalid/ซ้ำ | ใช้ 422 สำหรับ validation และซ้ำ (flow #1) | error mapping FE |
| **Error codes catalog** | มี code ตั้งชื่อต่อ endpoint (`draft_conflict`, `note_required`, `not_a_reviewer`, `username_taken` ฯลฯ) | ไม่มี catalog เลย — มีแค่ `VALIDATION_FAILED`/`REQUIRED`/409 | FE switch บน code ไม่ทำงาน |
| **Refresh token** | httpOnly **cookie** แบบ rotating, TTL 14 วัน | "token ส่งผ่าน **header เท่านั้น**" (8.2), config TTL 30 วัน, ไม่มี rotation/token-family | security ต้องตัดสิน |
| **URL style** | `/v1/auth/sessions`, `/v1/users/me`, kebab/underscore ปน | `/sign-in`, `/me` — แทบไม่มี path ไหนตรงกันโดยตรง | ทุก client call |

### 2.2 ต่างราย resource

| Resource | Endpoint | จุดที่ต่าง |
| --- | --- | --- |
| auth | Sign in / Sign out / me / Register | พฤติกรรมตรง (flow #1) แต่ path ต่าง, ไม่มี session object, 422 แทน 409 `username_taken`/`email_taken` |
| reviews | `GET /v1/reviews` | ไม่มี resource "review" — arc42 ใช้ `GET /dmps?status=pending` (global queue); หลักการตรง แต่รูปร่าง (`days_waiting`, `changes_summary`, timeline, `decided_by=me`, sort) ไม่มี |
| dmps | Update a draft | **PATCH** merge-patch `{draft_revision, patch}` vs arc42 **PUT** ทั้งก้อน; `409 draft_conflict` ฝัง draft ปัจจุบันกลับมาให้ rebase vs arc42 แค่ "ให้โหลดใหม่"; **frontend save ไม่ตรวจ completeness** (ตรวจตอน submit) vs flow #4 ตรวจกฎ 3.3 เต็มทุกครั้งที่ save |
| dmps | Save minor edits / Submit a revision | **คนละสถาปัตยกรรม**: frontend = save draft เป็นกลาง แล้ว client เลือก endpoint เอง (`minor-edits` vs `revisions`, ตอบ `409 edits_include_major` ได้); arc42 = server classify ตอน `PUT /draft` แล้ว route เอง (fold หรือสร้างเวอร์ชัน) — ไม่มี choice point ของ client |
| dmps | Reject a version | path ต่าง (`reject` vs `return`); สำคัญ: frontend ให้ **revision ถูก reject แล้วแผนยัง `approved`** (version in force ทำงานต่อ) ขณะที่ flow #6 รวบว่า return แล้ว `DMP.status = draft` เสมอ |
| dmps | Finalize a plan | arc42 ใช้ finalize เฉพาะเวอร์ชันแรก; frontend ใช้กับ **ทุก major edit ของแผน independent** หลังมีผลด้วย — arc42 ไม่มี lifecycle revision ฝั่ง independent |
| dmps | Restore a version | path ต่าง (`versions/{n}/restore` vs `draft/restore` + ส่ง `draft_revision` ใน body) — พฤติกรรมตรงครบ flow #10 |
| tasks | Update / Complete | มี endpoint แต่ arc42 ไม่มีกฎ `use_complete`, `output_locked`, เงื่อนไข evidence 3 ระดับ (`declared`/`evidence_linked`/`system_verified`) ตาม stage/plan_mode |
| tasks | evidence | แนวคิด polymorphic ตรง (flow #12) แต่ arc42 ไม่มี endpoint `PUT/DELETE /evidence` เฉพาะ; ชื่อประเภทต่าง: arc42 `url \| doi` vs frontend `url \| rdm_deposit`; status enum ของ arc42 (`todo/in_progress/done`) ไม่มี `cancelled` |
| tasks | Reopen offers | แนวคิดครบใน flow #11 แต่ arc42 ใช้ `POST reopen` ต่อ task ไม่มี offer entity (`offer_id`, accept/dismiss) |
| files | Upload | path project-scoped ตรง แต่ (1) **ขนาดไฟล์ 20 MB (FE) vs 25 MB (arc42)**, (2) ไม่มีเช็ค MIME .docx → `400`, (3) ไม่มี `422` proposal อ่านไม่ได้, (4) โมเดล evidence upload ต่างกัน: FE อัปโหลดที่ project แล้วผูกทีหลัง vs arc42 task-scoped `POST /tasks/{id}/files` + `task.file_id` |
| files | Download | `GET /files/{id}` (metadata) vs `GET /files/:id/content` (stream bytes + `Content-Disposition`) |
| ai | ชุด actions | ตรง: `analyze_proposal`, `regenerate_field`, `generate_tasks`; **ต่างชื่อ**: `suggest` (FE) vs `batch_regenerate`, `checklist` (FE) vs `redraft_steps`; **ขาดฝั่ง arc42**: `chat` ทั้ง action + scope `unscoped` |
| ai | analyze-proposal | FE วาง **นอก path ของ dmp** (แผนยังไม่เกิด) vs arc42 ผูกทุก action กับ `/dmps/{id}/ai/{action}` เสมอ |
| ai | Streaming | abort → ยกเลิก upstream: arc42 มีครึ่งเดียว (โควตายังนับ) แต่ไม่พูดถึง abort; **Idempotency-Key + replay 24 ชม. — arc42 เงียบสนิท** |
| ai | quota | arc42 มี `ai_token_limit/used` + estimate→reconcile แต่ไม่มี endpoint quota, `resets_at`, reset รายเดือน, cached input ลดหน่วย; FE ระบุว่า pre-flight check เป็นแค่ hint — server คิดทุก call รวมที่ fail/abort (ต่างจาก "ปฏิเสธก่อนเริ่ม" ของ arc42) |
| ai | field policy | arc42 มีแต่ major/minor path-based; FE ต้องการ policy เชิง permission (`ai`/`human`/`noAiAssist`, rewrite/polish) สำหรับ regenerate-field |
| notifications | read all | สะกดต่าง `read-all` vs `read_all`; list ไม่มี `unread_count`; pagination ต่าง |
| projects | List / Retrieve | มี endpoint แต่ไม่มี `include=progress,researcher`, ฟิลด์ card (`file_count`, `member_count`, `awaiting_review`), status `done` |
| projects | การผูก proposal | arc42 = `PATCH /projects/{id}` (proposal_file_id) vs FE = side effect ของ Analyze a proposal (ไม่มี PATCH ใน contract) |

---

## 3. ส่วนที่ขาด (frontend ต้องการ แต่ arc42 ไม่มีเลย)

### 3.1 Endpoints ขาดสนิท

| Resource | Endpoints ที่ขาด |
| --- | --- |
| auth | `GET username-available` (Check a username) |
| reviews | `GET /v1/reviews` ทั้ง resource (ในรูป resource shape ที่ FE ใช้) |
| dmps | `POST /dmps` (Create a plan — ไม่มีทั้ง endpoint, กติกา author, `draft_revision: 0`) · `GET /dmps/{id}` (Retrieve a plan) · `POST .../draft/discard` (Discard draft edits + กติกา `never_submitted` → archive) · List plans ฝั่ง researcher (My DMPs, archived filter, `q`/`sort`) |
| tasks | `POST /tasks` (สร้าง task เอง) · `POST /dmps/{id}/tasks/generated` (+ mode add/replace) · checklist steps ทั้ง 4 (add/update/delete/replace) · `PUT`/`DELETE .../evidence` · reopen offers ทั้ง 3 (list/accept/dismiss) |
| files | `GET /files` (list + filter purpose) · `POST /files/{id}/archive` + กฎ "ไฟล์ evidence ลบไม่ได้ archive เท่านั้น" + `archived_at` · `DELETE /files/{id}` + `409 file_in_use` |
| ai | `GET /v1/ai/quota` (+ `resets_at`, usage แยก 3 ช่อง, cached discount) · `POST .../ai/chat` (+ scope `unscoped` ทั้งลำดับ) · thread `PUT` (decision accepted/rejected/stale + `409 proposal_settled`) · thread `clear` · thread `adopt` · paging `before/limit` + กฎ hidden/kept |
| notifications | `DELETE /notifications/{id}` · `DELETE /notifications` (delete all) · `unread_count` ใน list |
| projects | `GET /projects/{id}/members` · **Progress object ระดับ project** (overall/done/total/overdue — arc42 มี progress เฉพาะ task) · ฟิลด์ aggregate บน card (`file_count`, `member_count`, `awaiting_review`) |

### 3.2 กลุ่มอาการที่ซ้ำ

- **arc42 ออกแบบ write path (14 flows) ละเอียดมาก แต่เงียบเรื่อง read/aggregation endpoints ที่ frontend ใช้วาดหน้าจอ** — members list, project progress, file lifecycle, reviews queue, stat cards (`total_count`)
- **Idempotency / retry** — FE บังคับ `Idempotency-Key` + replay บน AI actions; arc42 ไม่มีแนวคิดนี้เลย
- **Error codes + object shapes** — arc42 ไม่เคยนิยาม response shape ต่อ endpoint และไม่มี catalog รหัส error ที่ FE อ้างทั้งเล่ม

---

## 4. arc42 มีเกิน (backend design มี แต่ frontend contract ไม่ขอ)

| สิ่งที่เกิน | หมายเหตุ |
| --- | --- |
| `GET /dmps/{id}/export?format=madmp-v3\|rda-v1.3` + feature `exports` + flow #14 | **ขัด decision ที่ประกาศแล้ว** (README "Decided"): Exports stay in the browser, out of the API |
| `GET /notifications/stream` (SSE push) ทั้งหมวด 8.6 | **ขัด decision ที่ประกาศแล้ว**: "Notifications are polled; no push" |
| `PATCH /projects/{id}`, `DELETE /projects/{id}` | FE ไม่มีทั้งคู่ใน contract (ประกาศชัดว่าตัดออก) — แต่ flow #13 ยังอาศัย DELETE ตรวจกติกา "มีแผนลบไม่ได้" |
| `POST /tasks/{id}/files` (task-scoped upload) | FE อัปโหลดที่ project เท่านั้น — สองโมเดลข้อมูลคนละแบบ |
| `DELETE /dmps/{id}/draft/datasets/{ds}` เป็น endpoint แยก | FE ส่ง list ทั้งก้อนผ่าน PATCH draft |
| admin provisioning, password reset, `POST /me/password` | README บอกแล้วว่า admin endpoints นอก contract ฉบับนี้ — ไม่ถือว่าขัด แต่ password reset/change ควรจดว่า FE ยังไม่ใช้ |
| meta endpoints (`/openapi-json`, `/field-policy`, `/domain-profiles`) | README ไม่กล่าวถึง — FE น่าจะต้องใช้ (zod single source of truth) แต่ยังไม่อยู่ใน contract |

---

## 5. Sequence diagrams — ครบไหม?

`sequence-diagrams.md` มี 14 flows ครอบ write path ครบดี: sign-up/in → สร้างโครงการ+proposal → AI action → draft+validation → submit → ตัดสิน → self-finalize → minor edit → revision (carry/drop) → restore → ลบ/นำกลับ output → tasks → archive → export

**จากมุมมอง frontend contract, diagram ขาด/เพี้ยน 7 จุด:**

| # | Flow ที่ขาดหรือไม่ตรง | รายละเอียด |
| --- | --- | --- |
| 1 | **Auth/session** | ไม่มี flow refresh token (401 `token_expired` → refresh → retry) และ sign-out — เป็นพฤติกรรมที่ FE ใช้ทุกคำขอ |
| 2 | **Notification lifecycle** | มีแต่ "การสร้าง" notification กระจายใน flows อื่น — ไม่มี flow อ่าน/mark read/delete; และ **model delivery ขัดกัน** (FE poll ทุก 60 วิ vs BE SSE push) — diagram ทั้งเล่มวาดบนสมมติฐาน push |
| 3 | **AI chat / thread management** | flow #3 ครอบแค่ action ทำงาน (analyze/regenerate/tasks) — ไม่มี chat, ไม่มี thread clear/adopt/decision (accepted/rejected), ไม่มี abort/idempotency retry |
| 4 | **File lifecycle** | flow #12 มีแนบ evidence แต่ไม่มี upload เป็น flow ตั้งต้น (MIME check, 422 อ่านไม่ได้), ไม่มี archive file, ไม่มี delete file + `file_in_use` |
| 5 | **การสร้าง task** | flow #12 เกริ่ว `generated_by=user/ai` แต่ไม่มี flow สร้าง task ด้วยมือ / generated tasks + mode add/replace |
| 6 | **Checklist / evidence / reopen offers เป็น endpoints** | flow #11/#12 มีแนวคิดครบ (เสนอเปิดคืน, ติก checklist) แต่เป็น narrative ไม่ผูกกับ endpoint ย่อยที่ FE เรียกจริง (checklist steps, PUT/DELETE evidence, offer accept/dismiss) |
| 7 | **Flow ที่กลายเป็นเกิน/เพี้ยนตาม contract** | flow #14 export — FE ตัดสินให้ export อยู่ใน browser แล้ว; flow #4 ตรวจ validation เต็มทุก save ขณะ FE ระบุ "save ไม่ตรวจ completeness, ตรวจตอน submit" |

**สรุป:** 14 flows ครอบพฤติกรรมหลักของ DMP lifecycle ได้ครบและละเอียดดี แต่ไม่ครอบ **read paths และ lifecycle เสริม** ที่ frontend ใช้จริง (session refresh, notification read/delete, file lifecycle, AI thread/chat, การสร้าง task) — ควรเพิ่มอย่างน้อย flow refresh-token, notification polling (ตาม decision ใหม่), และ AI chat/thread

---

## 6. ข้อเสนอแนะ (ลำดับที่ควรตัดสิน)

1. **ตัดสิน 3 นโยบายใหญ่** — AI SSE event names, notification delivery (poll vs push), export ใน API vs ใน browser — สองหลังเป็นการย้อน decision ที่ README ประกาศแล้ว ฝั่งใดฝั่งหนึ่งต้องแก้เอกสาร
2. **ตัดสิน cross-cutting 6 ข้อ** (error envelope, pagination, status codes, error code catalog, refresh token cookie vs header + TTL, URL style) — ทำครั้งเดียวพอ
3. **เติม read/aggregation design** — members, project progress, reviews queue shape, file lifecycle, stat cards
4. **เติม endpoints ที่ขาด 30+ รายการ** ตามหมวด 3 ลงใน arc42 หมวด 5.2 พร้อม error code catalog
5. **เพิ่ม sequence diagram 4–5 flows** — refresh token, notification read/delete, AI chat + thread, file upload/archive
6. **อัปเดต flow #4/#6/#14** ให้ตรง decision ใหม่ (validation timing, reject ของ revision แผนยัง approved, export)

---

*ผลตรวจอ้างอิงบรรทัดจากทั้งสองเอกสาร; ตัวเลข endpoint: ตรง ~13, ตรงบางส่วน ~25, ขาด ~30, arc42 มีเกิน ~8*
