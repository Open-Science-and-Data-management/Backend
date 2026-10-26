# Sequence Diagrams — ระบบติดตามความคืบหน้าโครงการวิจัย

เอกสารนี้อธิบายเป็น sequence diagram ว่า "ใครทำอะไร ตามลำดับไหน" ในแต่ละสถานการณ์ของระบบ

- ข้อมูลอ้างอิงหลัก: `docs/sources/project-erd.md` ผ่าน `docs/architecture/requirement.md`
- เทียบเคียงกับ: `docs/sources/main-flowchart.md` (flowchart ฉบับย่อ ที่ลากเฉพาะ happy path ของ flow แบบ institutional)
- ผู้อ่านควรเปิด requirement ประกบไว้ด้วย เพราะแต่ละ flow จะอ้างหมวดของ requirement กำกับไว้

> **ข้อต่างสำคัญจาก flowchart เดิม**: flowchart เขียนว่า "กรรมการอนุมัติครบทุกคน" แต่ requirement หมวด 4.6 กำหนดไว้ต่างออกไป — **หนึ่งเวอร์ชัน มีการตัดสินได้เพียงครั้งเดียว และกรรมการเพียงคนเดียวก็ตัดสินได้** (`decided_by` เก็บชื่อคนเดียว, เวลาขอ review จะแจ้งกรรมการทุกคน แต่คำตัดสินถูกบันทึกบนเวอร์ชันนั้นเพียงครั้งเดียว) diagram ทั้งหมดในเอกสารนี้ยึด requirement เป็นหลัก ตามการตัดสินใจเมื่อ 18 ตุลาคม 2026

สัญลักษณ์ผู้เล่นที่ใช้ซ้ำ:

| ตัวย่อ | หมายถึง |
| --- | --- |
| R | นักวิจัย (Researcher) — ผู้ใช้ที่เขียนและส่งแผน |
| C | กรรมการ (Committee) — ผู้ตรวจและอนุมัติแผน |
| FE | Frontend (repo `Frontend`) — หน้าเว็บที่ผู้ใช้กดปุ่ม |
| BE | Backend ของระบบนี้ |
| AI | AI service ภายนอก (OpenRouter) — BE เรียกผ่าน API ด้วย system key จึงไม่ใช่ผู้ใช้ในระบบ |
| DB | ฐานข้อมูล |

คำศัพท์ที่ใช้บ่อย:

- **version in force** = เวอร์ชันของแผนที่กำลัง "มีผล" อยู่ (ผ่านการอนุมัติแล้วล่าสุด)
- **snapshot** = สำเนาเนื้อหาแผนทั้งหมด ณ เวลาใดเวลาหนึ่ง (เช่น ณ ตอน submit)
- **working draft** = ฉบับร่างที่นักวิจัยกำลังแก้อยู่ ยังไม่ได้ส่ง

---

## สารบัญ

**กลุ่ม A — บัญชีและโครงการ**

- [Sign-up / Sign-in](#1-sign-up--sign-in)
- [สร้างโครงการ + อัปโหลด proposal](#2-สร้างโครงการ--อัปโหลด-proposal)

**กลุ่ม B — การเขียนแผน**

- [AI สร้างแผนจาก proposal](#3-ai-สร้างแผนจาก-proposal)
- [แก้ไข draft + validation](#4-แก้ไข-draft--validation)

**กลุ่ม C — การส่งและตัดสิน**

- [Submit ครั้งแรก (institutional)](#5-submit-ครั้งแรก-institutional)
- [กรรมการตัดสิน: approve / ส่งกลับ](#6-กรรมการตัดสิน-approve--ส่งกลับ)
- [Self-finalize (independent)](#7-self-finalize-independent)

**กลุ่ม D — หลังแผนมีผล**

- [Minor edit](#8-minor-edit)
- [Submit revision (major) + minor fixes ขณะรอ](#9-submit-revision-major--minor-fixes-ขณะรอ)
- [Restore เวอร์ชัน](#10-restore-เวอร์ชัน)
- [ลบ / นำกลับ research output](#11-ลบ--นำกลับ-research-output)
- [ทำงาน tasks](#12-ทำงาน-tasks)
- [Archive แผน / ลบโครงการ](#13-archive-แผน--ลบโครงการ)
- [Export มาตรฐาน — deferred](#14-export-มาตรฐาน--deferred-adr-0019)

**กลุ่ม E — Cross-cutting (เพิ่มจากการเทียบ frontend contract, 2026-10-26)**

- [Session refresh + sign-out](#15-session-refresh--sign-out)
- [Notification lifecycle](#16-notification-lifecycle)
- [AI chat + thread](#17-ai-chat--thread)
- [File lifecycle](#18-file-lifecycle)

---

## กลุ่ม A — บัญชีและโครงการ

### 1. Sign-up / Sign-in

requirement หมวด 2.3 กำหนดว่า:

- สมัครบัญชีเองได้เฉพาะนักวิจัยเท่านั้น
- username และ email ห้ามซ้ำกับใคร
- รหัสผ่านต้องเก็บแบบ salted hash (bcrypt หรือ argon2id — ตั้งใจไม่ตาม ERD เดิมที่ใช้ SHA-256 เพราะไม่ปลอดภัยพอสำหรับรหัสผ่าน)

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: กรอก username, email, รหัสผ่าน<br/>(+ affiliation ถ้า institutional / ที่อยู่ถ้า citizen)
    FE->>BE: GET /users/username-available (check ก่อน submit)
    FE->>BE: POST /users
    BE->>DB: ตรวจว่า username นี้ยังไม่มีใครใช้ (เทียบแบบตัวพิมพ์เล็กเป๊ะ ๆ)
    BE->>DB: ตรวจว่า email นี้ยังไม่มีใครใช้ (เทียบโดยไม่สนตัวพิมพ์และช่องว่าง)
    alt username หรือ email ซ้ำ
        BE-->>FE: 409 username_taken / email_taken (สถานะขัดกัน — ADR-0014)
    else ไม่ซ้ำทั้งสองอย่าง
        BE->>BE: เข้ารหัสรหัสผ่าน (bcrypt หรือ argon2id + salt)
        BE->>DB: สร้าง USER (role=researcher, account_type, ai_token_limit)
        BE->>DB: สร้าง CREDENTIAL (username, salt, hash)
        BE-->>FE: สมัครสำเร็จ (ออก access token + refresh cookie)
    end

    Note over R,DB: Sign-in — BE เทียบรหัสผ่านที่กรอกกับค่า hash ใน CREDENTIAL<br/>ถูกต้องจึงออก session/token<br/>ทุกการกระทำที่ทำขณะ sign in อยู่ จะถูกนับเป็นของบัญชีนั้น (หมวด 2.3)
```

### 2. สร้างโครงการ + อัปโหลด proposal

requirement หมวด 2.2, หมวด 5.2 กำหนดว่า:

- โครงการใหม่ได้ `plan_mode` ตามชนิดบัญชีของคนสร้างโดยอัตโนมัติ
- ไฟล์ที่เป็น proposal มี `purpose: proposal` และ proposal ที่ถูกแทนที่จะถูกจด `superseded_at` (ไม่ลบทิ้ง)

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: สร้างโครงการ (ชื่อ, คำอธิบาย)
    FE->>BE: POST /projects
    BE->>DB: สร้าง PROJECT (status=draft)<br/>โดยตั้ง plan_mode = ค่า default ตาม account_type ของ R<br/>(institutional | independent)
    BE->>DB: สร้าง PROJECT_MEMBER ให้ R<br/>พร้อม project_role ตามบทบาท
    BE-->>FE: โครงการถูกสร้าง

    R->>FE: อัปโหลด proposal (.docx)
    FE->>BE: POST /projects/{id}/files
    BE->>BE: parse mammoth → extracted text<br/>+ chunk ตาม heading/ย่อหน้า + embed ด้วย<br/>multilingual-e5-small (in-process — ADR-0025)<br/>(embedding ไม่นับโควตา AI · ล้มเหลว → 422)
    BE->>DB: สร้าง FILE_RECORD (purpose=proposal, uploaded_by=R)<br/>+ FILE_CHUNK ทุก chunk (embedding real[] —<br/>cache ผูก file_id · เอกสารตัวเดียวใช้จนจบโปรเจกต์)
    BE-->>FE: อัปโหลดสำเร็จ

    R->>FE: ใช้ AI วิเคราะห์ proposal
    FE->>BE: POST /ai/analyze-proposal (file_id)
    BE->>DB: PROJECT.proposal_file_id = file_id<br/>(ผูก proposal เป็น side effect ของ analyze —<br/>ไม่มี PATCH /projects/{id} ตาม ADR-0024)

    Note over R,DB: เมื่ออัปโหลด proposal มาแทนไฟล์เดิม<br/>ไฟล์เก่าไม่ถูกลบ แต่ถูกจดเวลาที่ถูกแทน (superseded_at)<br/>และระบบส่ง notification proposal_superseded ให้ผู้เกี่ยวข้อง (หมวด 7)
```

---

## กลุ่ม B — การเขียนแผน

### 3. AI สร้างแผนจาก proposal

requirement หมวด 6 — AI เป็นบริการภายนอก (OpenRouter เรียกด้วย system key ของระบบ รายละเอียดนี้ไม่ปรากฏใน API contract ใด ๆ) กลไกคือ:

- ทุก action ทำงานเป็น **agent loop (ReAct)** — AI จะเรียกถอย tools ชุดเดียวกันได้หลายรอบจนได้คำตอบ
- คำตอบส่งกลับแบบ SSE streaming (ผู้ใช้เห็นข้อความไหลเข้ามาทีละชิ้น ไม่ต้องรอจบ)
- ใช้ token จำกัดด้วยโควตาต่อผู้ใช้
- ประวัติการคุยถูกเก็บเป็น AI_THREAD_ENTRY เพื่อย้อนดูได้
- สิ่งที่ AI เสนอมาเป็นแค่ "ข้อเสนอ" ผู้ใช้แก้ไขได้ทั้งหมดก่อนบันทึกจริง

ตามการตัดสินเรื่อง AI agent เมื่อ 18 ตุลาคม 2026 + ADR-0018/0023 (event set, โควตา, Idempotency-Key):

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant AI as OpenRouter (system key)
    participant DB as DB

    R->>FE: เลือก action<br/>(analyze-proposal / regenerate-field / chat /<br/>suggest / generate-tasks / checklist)
    Note over FE,BE: analyze-proposal อยู่นอก dmp path (POST /ai/analyze-proposal)<br/>chat ใช้ scope=unscoped ได้ (แผน/ thread ก่อนมีแผน)
    FE->>BE: POST /dmps/{scope}/ai/{action} (SSE)<br/>+ Idempotency-Key (บังคับ — retry ใน 24 ชม. ไม่โดนโควตาซ้ำ)
    BE->>BE: เช็ก Idempotency-Key — เคยมี → replay response เดิม
    BE->>DB: pre-flight check โควตา (เป็นแค่ hint — ไม่ปฏิเสธ run เดียวที่ล้น)
    BE->>DB: บันทึก AI_THREAD_ENTRY (kind=user, action + prompt)
    BE->>AI: เริ่ม run — agent loop (ReAct)<br/>tools ที่ AI เรียกได้: read_proposal (ข้อความที่แตกจากไฟล์),<br/>search_proposal (query RAG บนเอกสาร — ADR-0025),<br/>read_draft, read_domain_profiles
    loop จน AI ให้คำตอบสุดท้าย
        AI->>BE: ขอเรียก tool<br/>(คำถามเกี่ยวกับเอกสาร → search_proposal)
        BE->>DB: FILE_CHUNK WHERE file_id = proposal active
        BE->>BE: embed query + cosine ฝั่ง app → top-5 chunks<br/>พร้อมตำแหน่ง (chunk_index, heading path)<br/>(RAG ไม่พร้อม → บอก AI ให้ใช้ read_proposal แทน)
        BE->>BE: อ่านข้อมูลตามที่ tool ขอ<br/>(ไม่มี web search · ไม่มี tool ที่แก้ draft ได้)
        BE->>DB: จด AI_THREAD_ENTRY (kind=event, tool + ผลย่อ)
        BE-->>FE: SSE status / tool (ให้ UI โชว์ว่า AI กำลังทำอะไร — consume ไม่บังคับ)
        BE-->>AI: ส่งผลของ tool กลับให้ AI ใช้ต่อ
    end
    AI-->>BE: stream คำตอบ (คำอธิบายเป็นภาษาคน) จบด้วย proposals แบบ structured
    BE-->>FE: SSE delta (ข้อความ) ตามด้วย SSE proposal (proposals)
    BE->>BE: ตรวจ proposals ตาม schema + domain profile (หมวด 3.2)
    BE->>DB: บันทึก AI_THREAD_ENTRY (kind=assistant,<br/>proposals, token_count = ผลรวมของ run นี้)
    BE->>DB: หัก token จริง: output + uncached input<br/>(cached input นับ 10% — หักตอนจบ run เดียว<br/>ดังนั้น run เดียวอาจใช้เกินโควตานิดหน่อยได้)
    BE-->>FE: SSE done (ปิด stream — terminal event เดียว: done|error)
    R->>R: แก้ไข proposals ได้ทั้งหมดก่อนบันทึก
    FE->>BE: apply ลง draft (เข้าสู่ flow #4)
    Note over BE,DB: ถ้า AI ล้มเหลว/timeout/abort กลาง run — คืน SSE error<br/>โควตาที่ใช้ไปแล้วยังนับเต็ม (คิดทุก call รวมที่ fail)<br/>stream ที่หลุด retry ด้วย Idempotency-Key เดิม → ได้ response ที่ replay ได้
```

### 4. แก้ไข draft + validation

requirement หมวด 3.3, หมวด 3.4 + ADR-0020:

- save ส่ง **draft ทั้งก้อน** (PUT) พร้อม `draft_revision` — ตรวจเฉพาะ type/format (ร่างครึ่ง ๆ ต้อง save ได้) กฎ completeness หมวด 3.3 ตรวจตอน submit/finalize
- ถ้าข้อมูลไม่ผ่านการตรวจ ระบบต้องบอกกลับพร้อมระบุฟิลด์ที่ผิด เพื่อให้ผู้ใช้คลิกไปแก้ฟิลด์นั้นได้ทันที
- วันที่ (ไม่มีเวลา) เก็บเป็น `YYYY-MM-DD` แยกจาก timestamp

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: แก้ draft (datasets, distributions,<br/>contributors, costs, วันที่, ethics)
    FE->>BE: PUT /dmps/{id}/draft (ทั้งก้อน + draft_revision)
    alt draft_revision ไม่ตรง (มีคนแก้ไปก่อน)
        BE-->>FE: 409 draft_conflict<br/>พร้อมฝัง draft ปัจจุบันกลับมาให้ rebase
    else ตรวจ type/format ไม่ผ่าน
        BE-->>FE: 422 พร้อม param เป็น JSON pointer ของฟิลด์ที่ผิด (ให้คลิกไปแก้ได้ทันที)
    else ผ่าน
        BE->>DB: บันทึก DMP.draft (รวม nested datasets/<br/>distributions/contributors/costs)
        BE-->>FE: บันทึกสำเร็จ (สถานะยังเป็น draft)
    end
    Note over BE: กฎ completeness (หมวด 3.3) ตรวจตอน submit/finalize เท่านั้น:<br/>• วันสิ้นสุด ต้องไม่ก่อนวันเริ่มต้น<br/>• มี ethical issues ต้องเขียนคำอธิบายด้วย<br/>• contact ต้องมีพอดีหนึ่งคน (is_contact=true) และต้องมี email<br/>• contributor สองคนห้ามผูกกับบัญชีเดียวกัน<br/>• distribution แบบ open ต้องระบุ license<br/>• domain_metadata ต้องผ่าน profile ของ domain ตนเอง (หมวด 3.2)
    Note over R,DB: วงจร "แก้ → บันทึก" นี้ ทำซ้ำได้ไม่จำกัดจนพอใจ<br/>ตลอดช่วงนี้แผนยังไม่ผูกกับเวอร์ชันใดเลย
```

---

## กลุ่ม C — การส่งและตัดสิน

### 5. Submit ครั้งแรก (institutional)

requirement หมวด 4.2–4.6, หมวด 7 — จุดสำคัญของ flow นี้:

- `plan_mode` ถูก "ตรึง" ค่าไว้ตั้งแต่ submit แรก (แก้ไม่ได้อีก)
- ระบบเทียบ draft กับเวอร์ชันเดิม เพื่อจำแนกว่าการเปลี่ยนแปลงเป็น minor หรือ major
- สร้างเวอร์ชัน 1 สถานะ pending พร้อมแจ้งทั้งนักวิจัยและกรรมการทุกคน

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor C as C (กรรมการ)

    R->>FE: ส่งแผน (กด Commit)
    FE->>BE: POST /dmps/{id}/submit
    BE->>BE: ตรวจ validation (หมวด 3.3) อีกรอบ เผื่อมีอะไรเพิ่งเปลี่ยน
    BE->>DB: ตรึง plan_mode ลงบนตัว DMP (คัดลอกจากโครงการ ณ ตอนนี้)<br/>— pin ค่านี้ไว้ตลอดอายุแผน (หมวด 4.2)
    BE->>BE: จำแนกว่าการเปลี่ยนแปลงเป็น minor หรือ major ตาม field policy (หมวด 4.3)
    Note over BE: major = วันเริ่ม/สิ้นสุด, ethics, Indigenous,<br/>access/personal data/protection/security ของ output,<br/>การเพิ่มหรือลบ output — ถ้ามี major สักฟิลด์เดียว ถือว่าทั้งชุดเป็น major
    BE->>DB: สร้าง DMP_VERSION #1 (status=pending,<br/>snapshot เนื้อหาแผน ณ ตอน submit, ไม่มี based_on — เพราะเป็นเวอร์ชันแรก)
    BE->>DB: DMP.status = pending
    BE-->>FE: ส่งสำเร็จ
    BE->>DB: notification dmp_submitted → นักวิจัยทุกคนในโครงการ
    BE->>DB: notification review_requested → กรรมการทุกคน
    C-->>C: กรรมการเห็นคำขอตรวจ (การตัดสินเกิดใน flow #6)
    Note over R,C: ตอนนี้ยังไม่มี version in force — แผนยังไม่มีผล จนกว่าจะถูก approve
```

### 6. กรรมการตัดสิน: approve / ส่งกลับ

requirement หมวด 4.6, หมวด 5.1, หมวด 7:

- การตัดสินบันทึกลงตัวเวอร์ชันโดยตรง — หนึ่งเวอร์ชัน ตัดสินได้ครั้งเดียว
- ถ้าเป็นการอนุมัติครั้งแรก แผนจะเริ่มมีผล และระบบจะสร้างชุด tasks แรกให้
- ⚠️ ต่างจาก flowchart เดิม: **ไม่ต้องรอกรรมการอนุมัติครบทุกคน** — กรรมการคนใดคนหนึ่งตัดสินได้เลย

```mermaid
sequenceDiagram
    autonumber
    actor C as C (กรรมการ)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor R as R (นักวิจัย)

    C->>FE: เปิดดูเวอร์ชัน pending (snapshot + การเปลี่ยนแปลง)
    alt approve
        C->>FE: กด Approve
        FE->>BE: POST /dmps/{id}/versions/{n}/approve
        BE->>DB: บันทึกการตัดสินลงบนเวอร์ชันนี้: status=approved,<br/>decided_at, decided_by=C,<br/>พร้อม snapshot ข้อมูลกรรมการ (user_id, name, position, mbox)
        BE->>DB: DMP.status=approved, active_version=n
        alt เป็นการอนุมัติที่ทำให้แผนมีผลครั้งแรก (tasks_generated ยังเป็น false)
            BE->>DB: สร้างชุด tasks แรกจากเนื้อหาแผน (จด generated_by)
            BE->>DB: DMP.tasks_generated = true
            BE->>DB: notification tasks_generated → นักวิจัย
        end
        BE->>DB: notification dmp_approved → นักวิจัยทุกคนในโครงการ
        BE-->>FE: สำเร็จ
        R-->>R: แผนมีผลแล้ว → เริ่มทำ tasks (flow #12)
    else ส่งกลับให้แก้ (reject)
        C->>FE: กดส่งกลับ + เขียน note (เหตุผล)
        FE->>BE: POST /dmps/{id}/versions/{n}/reject
        BE->>DB: บันทึกการตัดสินลงบนเวอร์ชันนี้: status=rejected,<br/>decided_at, decided_by, note
        alt เป็น submit ครั้งแรก (ยังไม่มี version in force)
            BE->>DB: DMP.status = draft (working draft ของนักวิจัยไม่ถูกแตะ)
        else เป็น revision ของแผนที่มีผลอยู่แล้ว
            BE->>DB: DMP.status ยังคง approved — version in force เดิมทำงานต่อ<br/>(minor fixes ที่ fold ไว้ยังอยู่กับมัน)<br/>แผนกลับเป็น draft ไม่ได้ เพราะเวอร์ชันที่มีผลยังมีผลอยู่ทุกวิ
        end
        BE->>DB: notification dmp_returned → นักวิจัย
        BE-->>FE: สำเร็จ
        Note over R: นักวิจัยกลับมาแก้ต่อจาก version in force ได้ทันที<br/>ไม่ต้อง restore (หมวด 4.6)<br/>· เลขเวอร์ชัน n ที่ถูกส่งกลับ จะไม่ถูกใช้ซ้ำ (หมวด 4.3)<br/>· submit revision ใหม่ได้ทันที เพราะไม่มี pending ค้างอยู่
    end
```

### 7. Self-finalize (independent)

requirement หมวด 2.2, หมวด 4.1, หมวด 7:

- นักวิจัยแบบ citizen ไม่มีกรรมการ จึง "ปิดแผน" ด้วยตัวเองได้เลย ไม่ต้องผ่านการอนุมัติ
- flowchart เดิมไม่มี branch นี้

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย — citizen)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: กด Self-finalize
    FE->>BE: POST /dmps/{id}/finalize
    BE->>BE: ตรวจ validation (หมวด 3.3)
    BE->>DB: ตรึง plan_mode = independent ลงบนตัว DMP
    BE->>DB: สร้าง DMP_VERSION #1 (status=approved ทันที,<br/>snapshot, decided_by=R เอง, decided_at)
    BE->>DB: DMP.status=approved, active_version=1
    BE->>DB: สร้างชุด tasks แรก, tasks_generated=true
    BE->>DB: notification dmp_finalized → นักวิจัย
    BE->>DB: notification tasks_generated → นักวิจัย
    BE-->>FE: แผนมีผลทันที
    Note over R,DB: แผนแบบ independent เวลา export ออกมา<br/>ช่อง approval จะเขียนว่า "not applicable" (หมวด 8)
```

---

## กลุ่ม D — หลังแผนมีผล

### 8. Minor edit

requirement หมวด 4.3:

- contributor (รวม contact) และ cost ทั้งหมดนับเป็น minor
- การแก้ฟิลด์กลุ่มนี้ถูกแก้ลง snapshot ของ version in force **โดยตรง** — ไม่สร้างเวอร์ชันใหม่ ไม่ต้องรออนุมัติ
- **ผู้ใช้เลือกเอง** (ตาม ADR-0021): save draft เป็นกลาง (flow #4) แล้วกด "บันทึกแก้เล็ก" → `minor-edits` หรือ "ส่ง revision" → `revisions` (flow #9) — classify ยังรันฝั่ง server เพื่อตรวจว่าเลือกถูกไหม

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: แก้ draft ฟิลด์กลุ่ม minor (เช่น contributor, cost)
    FE->>BE: PUT /dmps/{id}/draft (save เป็นกลาง — flow #4)
    R->>FE: กด "บันทึกแก้เล็ก"
    FE->>BE: POST /dmps/{id}/minor-edits (+ draft_revision)
    BE->>BE: เทียบ working draft กับ snapshot ของ version in force<br/>จำแนกตาม field policy
    alt มี major ปนอยู่
        BE-->>FE: 409 edits_include_major — ต้องใช้ flow #9 แทน
    else ทุกฟิลด์ที่แตะเป็น minor
        BE->>DB: แก้ลง snapshot ของ version in force โดยตรง
        BE->>DB: จดการแก้นี้ไว้ใน minor_edits ของเวอร์ชันนั้น<br/>(at, by, changes — สำหรับลิงก์ contributor จดเป็นชื่อบัญชี ไม่ใช่ id, หมวด 4.7)
        BE-->>FE: สำเร็จ — ไม่มีเวอร์ชันใหม่ ไม่ต้องรออนุมัติ
    end
    Note over R,DB: การแก้นี้เห็นผลทันที (export เมื่อกลับมาทำตาม ADR-0019 จะอ่านจาก version in force)
```

### 9. Submit revision (major) + minor fixes ขณะรอ

requirement หมวด 4.3–4.5:

- มีเวอร์ชัน pending รอการตัดสินได้ครั้งละหนึ่งเท่านั้น
- minor fix ที่รวมเข้าเวอร์ชันใหม่ไม่ได้ ระบบจะจดไว้ใน `dropped_minor_edits` เพื่อไม่ให้การแก้ไขเหล่านั้นหายไปเงียบ ๆ

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor C as C (กรรมการ)

    R->>FE: แก้ draft โดยแตะฟิลด์ major (เช่น ลบ output)
    FE->>BE: PUT /dmps/{id}/draft (save เป็นกลาง — flow #4)
    R->>FE: กด "ส่ง revision"
    FE->>BE: POST /dmps/{id}/revisions (+ draft_revision)
    BE->>BE: เทียบ draft กับ version in force → มี major → ต้องสร้างเวอร์ชันใหม่
    BE->>DB: เช็กว่ามีเวอร์ชัน pending ค้างอยู่หรือไม่ (หมวด 4.4)
    alt มี pending อยู่
        BE-->>FE: ปฏิเสธ — ต้องรอกรรมการตัดสินเวอร์ชันเดิมก่อน
    else ไม่มี pending
        BE->>DB: สร้าง DMP_VERSION #k+1<br/>(เลขเวอร์ชันไม่ถูกใช้ซ้ำ แม้เวอร์ชันเก่าถูก rejected)<br/>snapshot ณ ตอน submit, based_on = version in force ปัจจุบัน
        BE->>DB: DMP.status=pending → review_requested → แจ้งกรรมการทุกคน
        Note over R: ระหว่างรอ: minor fix ยังแก้ลง version in force ตรง ๆ ได้ (หมวด 4.5)<br/>· ส่วนการแก้ที่ไม่ตรงกับทั้ง in force และ pending snapshot<br/>บันทึกได้เฉพาะเมื่อทุกฟิลด์ที่แตะเป็น minor
        C->>FE: กด Approve
        FE->>BE: POST approve
        BE->>BE: เทียบ (replay) diff ระหว่าง based_on<br/>กับ version in force ปัจจุบัน โดยเทียบทีละ entity id
        BE->>DB: รวม minor fix ที่ตามได้เข้าเวอร์ชันใหม่<br/>จดว่าอะไรถูกพาไปด้วย (carried_minor_edits)
        BE->>DB: minor fix ที่ชี้ไปที่ output ที่ revision นี้ลบทิ้งไปแล้ว<br/>ไม่ถูกพาไป — จดทิ้งไว้แทน (dropped_minor_edits)
        BE->>DB: status=approved, active_version=k+1
        BE->>DB: rebase working copy บนเวอร์ชันที่เพิ่งอนุมัติ<br/>(คงเหลือเฉพาะการแก้ที่ยังไม่เคยถูกบันทึกหรือส่งเข้าเวอร์ชันใด)
        BE->>DB: notification dmp_approved → นักวิจัย
    end
    Note over R,C: ถ้าถูกส่งกลับแทน (flow #6) — DMP.status ยังคง approved<br/>version in force ทำงานต่อ และ minor fix เหล่านั้นยังอยู่กับมันเหมือนเดิม (หมวด 4.5)
```

### 10. Restore เวอร์ชัน

requirement หมวด 4.8 — ทำไม rollback ข้ามการอนุมัติไม่ได้:

- ระบบถือว่า restore เป็นเพียง "การแก้ไขธรรมดา"
- ดังนั้นถ้า restore ไปที่เนื้อหาที่ต่างจาก version in force ในฟิลด์ major ก็ต้องผ่านการอนุมัติใหม่เหมือนแก้ไขทั่วไป

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: เลือก restore กลับไปที่เวอร์ชัน X
    FE->>BE: POST /dmps/{id}/draft/restore (ระบุเวอร์ชัน X + draft_revision)
    alt X คือเวอร์ชันที่ยังรอการตัดสิน
        BE-->>FE: ปฏิเสธ — restore ไปที่เวอร์ชันที่รออนุมัติไม่ได้
    else X คือ version in force
        BE->>DB: โหลด snapshot เข้า working draft<br/>และทิ้งการแก้ที่ยังไม่ submit — ไม่จดอะไรเพิ่ม<br/>(เพราะสิ่งที่มีผลอยู่ไม่เปลี่ยนแปลง)
    else X คือเวอร์ชันอื่น (approved เก่า / rejected)
        BE->>DB: โหลด snapshot เข้า working draft<br/>จด restored_from = X
        BE->>BE: เทียบกับ version in force ถือเป็นการแก้ไขธรรมดาครั้งหนึ่ง
        alt ผลต่างทั้งหมด minor
            BE->>DB: แก้ลง version in force ตรง ๆ (เหมือน flow #8)
        else มี major
            BE->>DB: ต้อง submit ขออนุมัติใหม่ (เหมือน flow #9)
        end
    end
    BE-->>FE: restore สำเร็จ
```

### 11. ลบ / นำกลับ research output

requirement หมวด 4.9, หมวด 5.3, หมวด 7 — จุดสำคัญ:

- การ "ลบ" output จากแผนที่มีผลอยู่เป็นแค่ **ข้อเสนอ** — ต้องผ่านการอนุมัติก่อนจึงจะลบได้จริง
- tasks ที่เกี่ยวข้องถูก cancel (ไม่ใช่ลบ) จึงเปิดคืนได้เมื่อ output ถูกนำกลับมา

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: ขอลบ dataset ออกจากแผนที่มีผลอยู่
    FE->>BE: PUT /dmps/{id}/draft (ส่ง list datasets ทั้งก้อนที่ไม่มีตัวนี้ —<br/>ไม่มี endpoint ลบรายตัว ตามโมเดล PUT ทั้งก้อน ADR-0020)
    BE-->>FE: บันทึกไว้ใน draft เป็นข้อเสนอการลบ (นับเป็น major edit)
    Note over R,BE: ระหว่างรอเวอร์ชันใหม่: output ตัวนี้ยังนับว่ามีอยู่<br/>(ยังอ่านจาก version in force) — tasks ของมันยังทำต่อได้ตามปกติ
    R->>FE: submit revision (flow #9)
    BE->>BE: เวอร์ชันที่ลบ output นี้ ได้รับอนุมัติ → มีผล
    BE->>DB: cancel tasks ที่ผูกกับ output นั้น:<br/>cancelled_from = สถานะเดิมของแต่ละ task,<br/>cancel_reason = output_removed,<br/>cancelled_dataset_title = ชื่อ output (เก็บไว้ตามหาเวลานำกลับ)
    BE->>DB: notification tasks_cancelled → นักวิจัย
    BE-->>FE: แจ้งรายการ tasks ที่ถูก cancel

    R->>FE: (ภายหลัง) เพิ่ม output ตัวเดิมกลับมาในเวอร์ชันใหม่
    BE->>BE: เวอร์ชันที่นำ output กลับมา ได้รับอนุมัติ → มีผล
    BE->>DB: หา tasks ที่ cancel_reason=output_removed<br/>และ output ตรงกัน (เทียบ id หรือชื่อที่จดไว้)<br/>→ สร้าง reopen offer เป็น entity (จดว่าเสนออะไรไปแล้ว — ADR-0022)
    BE-->>FE: เสนอให้ผู้ใช้เลือกเปิดคืนทีละ task<br/>(ระบบไม่เปิดคืนเองอัตโนมัติ เพราะการ cancel ครั้งนั้นผ่านการอนุมัติมาแล้ว หมวด 5.3)
    R->>FE: ดูรายการข้อเสนอ
    FE->>BE: GET /dmps/{id}/reopen-offers
    R->>FE: เลือกเปิดคืนทีละตัว / ปัดทิ้ง
    FE->>BE: POST /reopen-offers/{offer_id}/accept<br/>(หรือ /dismiss — user ตัดสินใจเอง ระบบจดไว้ไม่ถามซ้ำ)
    BE->>DB: task กลับไปสถานะเดิม + ผูกกลับกับ output
    Note over R,DB: tasks ที่ถูก cancel ด้วยมือเอง (reason=manual) จะไม่ถูกเสนอให้เปิดคืน
```

### 12. ทำงาน tasks

requirement หมวด 5.1–5.3:

- progress_percent เป็นค่าที่คำนวณ (derive) จาก checklist เสมอ ไม่ใช่ค่าที่ใครตั้งเองได้
- กฎ preservation: สิ่งที่บันทึกการทำงานจริง (evidence, checklist, การปิดงาน) ห้ามถูกทำลาย

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    Note over R,DB: tasks เกิดขึ้นจาก flow #6/#7 (ชุดแรก)<br/>และเพิ่มได้เรื่อย ๆ ทั้งจาก AI (generated_by=ai — POST /dmps/{id}/tasks/generated mode add|replace)<br/>และจากผู้ใช้เอง (generated_by=user — POST /tasks ได้เมื่อแผนมี version in force)

    R->>FE: เริ่ม task / ติก checklist / เปลี่ยน priority
    FE->>BE: PATCH /tasks/{id} (ส่ง checklist เป็น array เต็ม — ADR-0022)
    BE->>BE: คำนวณ progress_percent จาก checklist<br/>(ไม่ใช่ค่าที่ตั้งขึ้นเอง)
    BE->>DB: บันทึกสถานะ (todo | in_progress | done | cancelled)

    R->>FE: แนบ evidence
    alt เป็นไฟล์
        FE->>BE: POST /projects/{id}/files (purpose=evidence)<br/>แล้ว PUT /tasks/{id}/evidence (file_id)<br/>— ไฟล์เป็นของโครงการ, task เพียงอ้างถึง (ADR-0022)
        BE->>DB: ผูก evidence กับ task — ไฟล์นี้ลบไม่ได้ archive เท่านั้น
    else เป็น URL หรือ rdm_deposit (DOI อยู่ใน ref)
        FE->>BE: PUT /tasks/{id}/evidence (url | rdm_deposit)
        BE->>DB: บันทึก evidence แบบ polymorphic (หมวด 3.2)
    end

    R->>FE: ปิดงาน
    FE->>BE: POST /tasks/{id}/complete
    BE->>DB: status=done, completed_at, completed_by=R

    alt ขอ cancel task ที่มีงานบันทึกไว้แล้ว<br/>(มี evidence / checklist ถูกติก / ปิดงานไปแล้ว)
        BE-->>FE: ปฏิเสธ — จะ cancel ได้ต้องเก็บ evidence ไว้ครบ<br/>และ task ที่เสร็จแล้ว cancel ไม่ได้เลย<br/>(เพราะจะทับบันทึกการทำงาน) — ทำได้แค่ reopen
    else ขอ cancel task ที่ยังไม่มีใครเริ่มทำ
        BE->>DB: จด cancelled_from, cancel_reason=manual<br/>→ status=cancelled (record ไม่ถูกลบ)
    else ขอลบ task
        alt มีงานบันทึกไว้แล้ว
            BE-->>FE: ปฏิเสธ — ทำได้แค่ cancel
        else ยังไม่มีใครเริ่มทำ
            BE->>DB: ลบได้
        end
    end
```

### 13. Archive แผน / ลบโครงการ

requirement หมวด 4.2, หมวด 5.3:

- ไม่มีทางไหนที่ลบแผนได้เลย
- โครงการจะลบได้ก็ต่อเมื่อในนั้นไม่มีแผนเหลืออยู่เลย

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: กด Archive แผน
    FE->>BE: POST /dmps/{id}/archive
    alt แผนมีผลอยู่ (มี version in force)
        BE-->>FE: ปฏิเสธ — แผนที่มีผลอยู่ archive ไม่ได้
    else แผนยังไม่เคย submit / ไม่มีผล
        BE->>DB: DMP.archived_at = now (ไม่ลบ — ระบบเก็บทุกอย่างไว้)
        BE-->>FE: สำเร็จ — แผนหายไปจาก My DMPs / Tasks / โครงการ<br/>แต่ค้นเจอได้ผ่าน filter "Archived"
    end
    R->>FE: (ภายหลัง) กด Unarchive
    FE->>BE: POST /dmps/{id}/unarchive
    BE->>DB: archived_at = null — แผนกลับมาเหมือนเดิมทุกอย่าง

    R->>FE: กดลบโครงการ
    FE->>BE: DELETE /projects/{id}
    alt โครงการยังมีแผนอยู่ (นับรวมแผนที่ archive แล้วด้วย)
        BE-->>FE: ปฏิเสธ — ต้องไม่มีแผนเหลืออยู่เลยจึงลบได้ (หมวด 4.2)
    else ไม่มีแผนเลย
        BE->>DB: ลบโครงการ
    end
    Note over R,DB: การเปลี่ยน plan_mode ของโครงการ หรือการลบโครงการ<br/>ไม่มีผลกับแผนที่ submit ไปแล้ว — เพราะ plan_mode ของแผนถูกตรึงไว้แล้ว (หมวด 4.2)
```

### 14. Export มาตรฐาน — deferred (ADR-0019)

requirement หมวด 8 + ADR-0019:

- **ตัดสินใหม่แล้ว:** "Exports stay in the browser, out of the API" — v1 ไม่มี `GET /dmps/{id}/export` ฝั่ง backend, FE ทำ export ใน browser
- flow นี้คงไว้เป็น **design สำรอง** กรณี browser export ไม่พอ (ไฟล์ใหญ่, audit ต้อง signature ฝั่ง server)
- export ไม่ได้เป็น object ที่เก็บในฐานข้อมูล แต่เป็นการ "ฉาย" (projection) ข้อมูลที่มีอยู่ออกมาเป็นไฟล์ ณ เวลานั้น

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE

    R->>FE: ขอ export<br/>(GCWG-RDA maDMP v3.0 หรือ RDA Common Standard v1.3)
    FE->>BE: GET /dmps/{id}/export?format=…
    alt แผนมี version in force แล้ว
        BE->>BE: ฉายข้อมูลจาก snapshot ของ version in force<br/>(ไม่ใช่จาก working draft)
        BE->>BE: เติม approval block จากสถานะแผน, plan_mode,<br/>และ approver ของ active version
        alt plan_mode = independent
            BE->>BE: approval = "not applicable"
        end
        BE-->>FE: export + แจ้งบน panel ว่า<br/>การแก้ที่ยังไม่บันทึก/ไม่อนุมัติ จะไม่ปรากฏในไฟล์นี้
    else ยังก่อนการอนุมัติครั้งแรก
        BE->>BE: ฉายข้อมูลจาก draft
        alt ยังไม่เคย submit
            BE->>BE: ระบุสถานะ "not submitted"
        else มี pending อยู่
            BE->>BE: ระบุสถานะ "submitted"
        end
        BE-->>FE: export
    end
    Note over R,BE: ข้อแตกต่างของสองรูปแบบ:<br/>maDMP v3.0 มี approval block + classification fields<br/>RDA v1.3 ไม่มีทั้งสองอย่าง (เรื่อง protection/security ไปอยู่ใน security_and_privacy แทน)<br/>สิ่งที่เหมือนกัน: domain + domain_metadata เขียนเป็น extensions,<br/>วันที่ปฏิทินเขียนเป็น YYYY-MM-DD (หมวด 3.4)
```

---

## กลุ่ม E — Cross-cutting

### 15. Session refresh + sign-out

พฤติกรรมที่ทุกคำขอของ FE ใช้ — access token หมดอายุ (15 นาที) ต้อง refresh ได้เงียบ ๆ + ADR-0016:

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    FE->>BE: คำขอใด ๆ (Authorization: Bearer access token)
    BE-->>FE: 401 token_expired
    FE->>BE: POST /auth/refresh<br/>(refresh token ส่งผ่าน httpOnly cookie อัตโนมัติ)
    BE->>DB: ตรวจ refresh token
    alt token ถูกใช้ซ้ำ (reuse detection)
        BE->>DB: revoke refresh token ทั้ง token family<br/>(สัญญาณว่า token หลุด — บังคับ sign-in ใหม่)
        BE-->>FE: 401 — ไปหน้า sign-in
    else token ใช้ได้
        BE->>DB: rotation — ตัวเก่า mark ว่าใช้แล้ว, ออกคู่ใหม่<br/>(access ใหม่ + refresh ใหม่ใน cookie, TTL 14 วัน)
        BE-->>FE: access token ใหม่
        FE->>BE: retry คำขอเดิม (โปร่งใสต่อผู้ใช้)
        BE-->>FE: สำเร็จ
    end

    R->>FE: กด Sign out
    FE->>BE: DELETE /auth/sessions/current
    BE->>DB: revoke refresh token ของ session นี้
    BE-->>FE: ออกจากระบบ (cookie ถูกล้าง)
    Note over BE,DB: การปิดบัญชี (admin disable) revoke refresh token ทั้งหมดของบัญชี
```

### 16. Notification lifecycle

ADR-0013 — polled, no push; notification คือ UX ไม่ใช่ record จึงลบได้:

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    loop ทุก ~60 วิ + ตอนผู้ใช้กลับมาที่ tab (refocus)
        FE->>BE: GET /notifications (cursor pagination)
        BE->>DB: SELECT ... WHERE user_id = ? AND read_at IS NULL (indexed)
        BE-->>FE: list + unread_count
    end
    Note over BE,DB: rows ถูกสร้างใน transaction ของเหตุการณ์ (flows #5-#11)<br/>8 type — ไม่มี push/SSE สำหรับ notification

    R->>FE: กดอ่านแจ้งเตือน
    FE->>BE: POST /notifications/{id}/read
    BE->>DB: read_at = now
    R->>FE: กด "อ่านทั้งหมด"
    FE->>BE: POST /notifications/read_all
    BE->>DB: read_at = now ทุกตัวที่ยังไม่อ่าน
    R->>FE: ลบแจ้งเตือน (ตัวเดียว / ทั้งหมด)
    FE->>BE: DELETE /notifications/{id} (หรือ DELETE /notifications)
    BE->>DB: ลบ — ไม่ขัด preservation (ไม่ใช่บันทึกการทำงาน)
```

### 17. AI chat + thread

ต่อจาก flow #3 — การคุยอิสระ + การจัดการ thread (ADR-0023); chat เกิดก่อนแผนได้ (scope=`unscoped`):

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: พิมพ์คุยกับ AI (บางครั้งก่อนจะมีแผน)
    FE->>BE: POST /dmps/{scope}/ai/chat (SSE + Idempotency-Key)<br/>scope = dmp_id หรือ unscoped
    BE-->>FE: SSE status/tool → delta → done|error (flow #3)
    BE->>DB: บันทึก AI_THREAD_ENTRY (scope ตามที่ส่งมา)

    R->>FE: เปิดดู thread
    FE->>BE: GET /dmps/{scope}/ai-thread?before=&limit=<br/>(paging ย้อนหลัง)
    BE-->>FE: entries + กฎ hidden/kept

    alt ผู้ใช้ตัดสินข้อเสนอใน thread
        FE->>BE: PUT /dmps/{scope}/ai-thread/{entry_id}<br/>(decision: accepted | rejected | stale)
        BE->>DB: จด decision
        BE-->>FE: สำเร็จ
    else ข้อเสนอถูก apply ไปแล้วจึงตัดสินไม่ได้
        BE-->>FE: 409 proposal_settled
    end
    R->>FE: ล้าง thread / รับ thread เป็นของแผน
    FE->>BE: POST /dmps/{scope}/ai-thread/clear<br/>(หรือ POST /ai-thread/adopt — ย้าย unscoped เข้า scope ของแผน)
    BE->>DB: อัปเดต/ลบ entries
    Note over R,DB: tools ของ chat ยังเป็น read-only เท่าเดิม —<br/>ทุกอย่างที่ AI เสนอเป็น "ข้อเสนอ" ไม่เขียน draft ตรง (หมวด 6)
```

### 18. File lifecycle

ไฟล์เป็นของโครงการ — upload เดียวจุดเดียว, evidence อ้างทีหลัง (ADR-0022/0024):

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant FS as FileStorage (port)
    participant DB as DB

    R->>FE: อัปโหลดไฟล์ (.docx)
    FE->>BE: POST /projects/{id}/files (purpose)
    alt ไฟล์เกิน 25 MB
        BE-->>FE: 413/400 — เกินขีดจำกัด
    else MIME ไม่ใช่ .docx
        BE-->>FE: 400 mime_type_not_allowed
    else parse เนื้อหาไม่ได้ (เสียหาย/ไม่ใช่เอกสารจริง)<br/>หรือ embed ล้มเหลว (ADR-0025)
        BE-->>FE: 422 proposal_unreadable
    else ผ่าน
        BE->>FS: เก็บไฟล์
        BE->>DB: สร้าง FILE_RECORD (extracted text เก็บไว้ในตาราง)<br/>+ FILE_CHUNK (chunk → embed in-process — เอกสาร<br/>ตัวเดียวใช้จนจบโปรเจกต์ ไม่ embed ซ้ำ)
        BE-->>FE: สำเร็จ
    end

    R->>FE: ดูไฟล์ในโครงการ / ดาวน์โหลด
    FE->>BE: GET /files?project_id=&purpose=
    FE->>BE: GET /files/{id}/content (stream bytes + Content-Disposition)

    R->>FE: ลบไฟล์
    FE->>BE: DELETE /files/{id}
    alt ไฟล์ถูกใช้เป็น evidence / ผูกกับแผนอยู่
        BE-->>FE: 409 file_in_use — archive เท่านั้น
    else ไม่มีใครใช้
        BE->>DB: ลบ FILE_RECORD + ไฟล์จริง<br/>(FILE_CHUNK CASCADE ตาม — ADR-0025)
    end
    R->>FE: archive ไฟล์ (เก็บร่องรอยไว้)
    FE->>BE: POST /files/{id}/archive
    BE->>DB: archived_at = now — หายจาก list ปกติ แต่ไม่มีทางหาย
    Note over R,DB: ไฟล์ที่เป็น evidence ของ task: ลบไม่ได้ — archive เท่านั้น (preservation หมวด 5.3)
```

---

## สรุปความต่างจาก `main-flowchart.md`

| Flowchart ว่าอย่างนี้ | เอกสารฉบับนี้เข้าใจว่า | ที่มา |
| --- | --- | --- |
| "กรรมการอนุมัติครบทุกคน" | กรรมการคนใดคนหนึ่งตัดสินได้เลย — หนึ่งเวอร์ชัน ตัดสินได้ครั้งเดียว (flow #6) | หมวด 4.6, ตามการตัดสิน |
| ไม่มี branch สำหรับคนไม่มีสังกัด | เพิ่ม self-finalize ให้นักวิจัย citizen (flow #7) | หมวด 2.2, หมวด 4.1 |
| "แก้ไขแผน" เป็น loop เดียว | แยกชัด: minor edit แก้ลงเวอร์ชันเดิมตรง ๆ (flow #8) ส่วน major revision ต้องสร้างเวอร์ชันใหม่รออนุมัติ (flow #9) | หมวด 4.3–4.5 |
| "แจ้งให้แก้ไข → กลับไป draft" | นักวิจัยกลับมาแก้ต่อจาก version in force ได้เลย ไม่ต้อง restore และเลขเวอร์ชันที่ถูกส่งกลับจะไม่ถูกใช้ซ้ำ | หมวด 4.6 |
| Progress bar ปลายทางเท่านั้น | แตกเป็นสองเรื่อง: การสร้าง tasks อัตโนมัติ + การทำงานของ tasks (flow #6, #12) | หมวด 5.1–5.3 |
| — | เพิ่ม restore, ลบ/นำกลับ output, archive, export (flow #10, #11, #13, #14) | หมวด 4.8–4.9, หมวด 5.3, หมวด 8 |
| เรียก AI service ครั้งเดียวต่อ action | ทุก action ทำงานเป็น agent loop (ReAct) บน OpenRouter ด้วย tools 4 ตัว (รวม `search_proposal` — RAG, ADR-0025) ตอบกลับแบบ SSE (flow #3) | หมวด 6, การตัดสิน AI agent |
