# Sequence Diagrams — ระบบติดตามความคืบหน้าโครงการวิจัย

อ้างอิง primary source: `docs/sources/project-erd.md` ผ่าน `docs/architecture/requirement.md`
คู่เทียบ: `docs/sources/main-flowchart.md` (ฉบับย่อ happy path ของ flow แบบ institutional)

> **หมายเหตุการตัดสิน**: flowchart เดิมเขียนว่า "กรรมการอนุมัติครบทุกคน" แต่ requirement หมวด 4.6
> กำหนด **หนึ่งเวอร์ชัน หนึ่ง decision** (`decided_by` คนเดียว, `review_requested` แจ้ง reviewer
> ทุกคนแต่ decision บันทึกบนเวอร์ชันครั้งเดียว) — diagram ทั้งหมดนี้**ยึด requirement**
> ตามการตัดสิน 18 ตุลาคม 2026

สัญลักษณ์ผู้เล่นที่ใช้ซ้ำ:

| ตัวย่อ | หมายถึง |
|---|---|
| R | นักวิจัย (Researcher) |
| C | กรรมการ (Committee) |
| FE | Frontend (repo `Frontend`) |
| BE | Backend ระบบนี้ |
| AI | AI service ภายนอก — OpenRouter เรียกผ่าน API ด้วย system key (ไม่ใช่ผู้ใช้ในระบบ) |
| DB | ฐานข้อมูล |

---

## สารบัญ

**กลุ่ม A — บัญชีและโครงการ**
1. [Sign-up / Sign-in](#1-sign-up--sign-in)
2. [สร้างโครงการ + อัปโหลด proposal](#2-สร้างโครงการ--อัปโหลด-proposal)

**กลุ่ม B — การเขียนแผน**
3. [AI สร้างแผนจาก proposal](#3-ai-สร้างแผนจาก-proposal)
4. [แก้ไข draft + validation](#4-แก้ไข-draft--validation)

**กลุ่ม C — การส่งและตัดสิน**
5. [Submit ครั้งแรก (institutional)](#5-submit-ครั้งแรก-institutional)
6. [กรรมการตัดสิน: approve / ส่งกลับ](#6-กรรมการตัดสิน-approve--ส่งกลับ)
7. [Self-finalize (independent)](#7-self-finalize-independent)

**กลุ่ม D — หลังแผนมีผล**
8. [Minor edit](#8-minor-edit)
9. [Submit revision (major) + minor fixes ขณะรอ](#9-submit-revision-major--minor-fixes-ขณะรอ)
10. [Restore เวอร์ชัน](#10-restore-เวอร์ชัน)
11. [ลบ / นำกลับ research output](#11-ลบ--นำกลับ-research-output)
12. [ทำงาน tasks](#12-ทำงาน-tasks)
13. [Archive แผน / ลบโครงการ](#13-archive-แผน--ลบโครงการ)
14. [Export มาตรฐาน](#14-export-มาตรฐาน)

---

## กลุ่ม A — บัญชีและโครงการ

### 1. Sign-up / Sign-in

> requirement หมวด 2.3 — เฉพาะนักวิจัยสมัครเองได้, username/email ไม่ซ้ำ,
> รหัสผ่านเป็น salted hash (bcrypt/argon2id — เบี่ยงจาก ERD ที่ใช้ SHA-256 อย่างมีเจตนา)

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: กรอก username, email, รหัสผ่าน<br/>(+ affiliation ถ้า institutional / ที่อยู่ถ้า citizen)
    FE->>BE: POST /sign-up
    BE->>DB: ตรวจ username ไม่ซ้ำ (เก็บตัวพิมพ์เล็ก)
    BE->>DB: ตรวจ email ไม่ซ้ำ (ไม่สนตัวพิมพ์และช่องว่าง)
    alt username หรือ email ซ้ำ
        BE-->>FE: 422 ระบุฟิลด์ที่ชน
    else ผ่านทั้งหมด
        BE->>BE: hash รหัสผ่าน (bcrypt หรือ argon2id + salt)
        BE->>DB: สร้าง USER (role=researcher, account_type, ai_token_limit)
        BE->>DB: สร้าง CREDENTIAL (username, salt, hash)
        BE-->>FE: สมัครสำเร็จ
    end

    Note over R,DB: Sign-in — BE ตรวจ hash กับ CREDENTIAL แล้วออก session/token<br/>การกระทำทั้งหมดขณะมีผู้ sign in อยู่ ถูก attribute ให้ผู้ใช้นั้น (หมวด 2.3)
```

### 2. สร้างโครงการ + อัปโหลด proposal

> requirement หมวด 2.2, หมวด 5.2 — plan_mode default ตาม account_type ของผู้สร้าง,
> ไฟล์มี `purpose: proposal` และ proposal ที่ถูกแทนจด `superseded_at`

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: สร้างโครงการ (ชื่อ, คำอธิบาย)
    FE->>BE: POST /projects
    BE->>DB: สร้าง PROJECT<br/>plan_mode = default ตาม account_type ของ R<br/>(institutional | independent), status=draft
    BE->>DB: สร้าง PROJECT_MEMBER (R, project_role ตามบทบาท)<br/>attribute ให้ผู้สร้าง
    BE-->>FE: โครงการถูกสร้าง

    R->>FE: อัปโหลด proposal (.docx)
    FE->>BE: POST /projects/{id}/files
    BE->>DB: สร้าง FILE_RECORD (purpose=proposal, uploaded_by=R)
    BE-->>FE: อัปโหลดสำเร็จ

    R->>FE: เลือก proposal นี้เป็น active
    FE->>BE: PATCH /projects/{id} (proposal_file_id)
    BE->>DB: PROJECT.proposal_file_id = file_id

    Note over R,DB: การแทนที่ proposal — ไฟล์เก่าถูกจด superseded_at (ไม่ลบ)<br/>และแจ้ง notification proposal_superseded (หมวด 7)
```

---

## กลุ่ม B — การเขียนแผน

### 3. AI สร้างแผนจาก proposal

> requirement หมวด 6 — AI เป็นบริการภายนอก (OpenRouter ผ่าน system key — internal detail
> ไม่ปรากฏใน API contract), ทุก action รันเป็น **agent loop (ReAct)** ด้วย tools ชุดเดียว,
> ตอบกลับแบบ SSE streaming, จำกัดด้วย token budget ต่อผู้ใช้, thread persist เป็น
> AI_THREAD_ENTRY, ทุกผลลัพธ์เป็นข้อเสนอที่ผู้ใช้แก้ต่อได้ทั้งหมด
> ตามการตัดสิน AI agent 18 ตุลาคม 2026

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant AI as OpenRouter (system key)
    participant DB as DB

    R->>FE: เลือก action<br/>(analyze_proposal / regenerate_field /<br/>batch_regenerate / generate_tasks / redraft_steps)
    FE->>BE: POST /dmps/{id}/ai/{action} (SSE)
    BE->>DB: เช็ก token budget ของ R<br/>(ai_token_used + estimate < ai_token_limit)
    alt budget ไม่พอ
        BE-->>FE: ปฏิเสธ — token เกินโควตา (ตั้งแต่ก่อนเริ่ม run)
    else budget พอ
        BE->>DB: บันทึก AI_THREAD_ENTRY (kind=user, action + prompt)
        BE->>AI: เริ่ม run — agent loop (ReAct)<br/>tools: read_proposal (extracted text),<br/>read_draft, read_domain_profiles
        loop จน AI คืนคำตอบสุดท้าย
            AI->>BE: ขอเรียก tool
            BE->>BE: อ่านข้อมูลตาม tool<br/>(ไม่มี web search · ไม่มี tool เขียน draft)
            BE->>DB: จด AI_THREAD_ENTRY (kind=event, tool + ผลย่อ)
            BE-->>FE: SSE event ประเภท tool
            BE-->>AI: ผลของ tool
        end
        AI-->>BE: stream คำตอบ (prose อธิบาย) จบด้วย proposals แบบ structured
        BE-->>FE: SSE token (prose) แล้ว SSE result (proposals)
        BE->>BE: validate proposals (schema + domain profile หมวด 3.2)
        BE->>DB: บันทึก AI_THREAD_ENTRY (kind=assistant,<br/>proposals, token_count = รวมของ run)
        BE->>DB: USER.ai_token_used += token จริง<br/>(reconcile ตอนจบ — run เดียวล้นโควตาได้ ไม่ตัดกลางคัน)
        BE-->>FE: ปิด stream
        R->>R: แก้ไข proposals ได้ทั้งหมดก่อนบันทึก
        FE->>BE: apply ลง draft (เข้าสู่ flow #4)
    end
    Note over BE,DB: AI ล้มเหลว / timeout กลาง run — จด event แล้วคืน error<br/>budget ที่ใช้ไปแล้วยังนับเต็ม
```

### 4. แก้ไข draft + validation

> requirement หมวด 3.3 — ระบบปฏิเสธพร้อมระบุฟิลด์ให้ผู้ใช้คลิกไปแก้;
> วันที่ไม่มีเวลาเก็บเป็น `YYYY-MM-DD` แยกจาก timestamp (หมวด 3.4)

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: แก้ draft (datasets, distributions,<br/>contributors, costs, วันที่, ethics)
    FE->>BE: PUT /dmps/{id}/draft
    BE->>BE: ตรวจกฎ validation (หมวด 3.3)
    Note over BE: • วันสิ้นสุด ≥ วันเริ่มต้น<br/>• มี ethical issues ต้องมีคำอธิบาย<br/>• contact พอดีหนึ่งคน (is_contact=true) และต้องมี email<br/>• contributor สองคนห้ามลิงก์บัญชีเดียวกัน<br/>• distribution แบบ open ต้องมี license<br/>• domain_metadata ผ่าน profile ของ domain ตนเอง (หมวด 3.2)
    alt ไม่ผ่าน
        BE-->>FE: 422 พร้อมรายการฟิลด์ที่ผิด (ให้คลิกไปแก้)
    else ผ่าน
        BE->>DB: บันทึก DMP.draft (nested datasets/<br/>distributions/contributors/costs)
        BE-->>FE: บันทึกสำเร็จ (สถานะยัง draft)
    end
    Note over R,DB: loop นี้คือ "แก้ไขแผน?" ใน flowchart —<br/>ทำซ้ำได้จนพอใจ แผนยังไม่ผูกกับเวอร์ชันใด
```

---

## กลุ่ม C — การส่งและตัดสิน

### 5. Submit ครั้งแรก (institutional)

> requirement หมวด 4.2–4.6, หมวด 7 — plan_mode freeze ตอน submit แรก, จำแนก minor/major
> จาก field policy, เวอร์ชัน 1 pending, แจ้งทั้งนักวิจัยและ reviewer ทุกคน

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor C as C (กรรมการ)

    R->>FE: ส่งแผน (Commit)
    FE->>BE: POST /dmps/{id}/submit
    BE->>BE: ตรวจ validation (หมวด 3.3) อีกครั้ง
    BE->>DB: freeze plan_mode ลง DMP<br/>(จากโครงการ ณ ตอนนี้ — pin ตลอดไป หมวด 4.2)
    BE->>BE: จำแนก minor/major จาก field policy (หมวด 4.3)
    Note over BE: major = วันเริ่ม/สิ้นสุด, ethics, Indigenous,<br/>access/personal data/protection/security ของ output,<br/>การเพิ่มหรือลบ output — มีฟิลด์เดียว = ทั้งชุด major
    BE->>DB: สร้าง DMP_VERSION #1 (status=pending,<br/>snapshot ณ submit, based_on ไม่มี — เวอร์ชันแรก)
    BE->>DB: DMP.status = pending
    BE-->>FE: ส่งสำเร็จ
    BE->>DB: notification dmp_submitted → นักวิจัยของโครงการ
    BE->>DB: notification review_requested → reviewer ทุกคน
    C-->>C: เห็นคำขอตรวจ (ตัดสินใน flow #6)
    Note over R,C: version in force ยังไม่มี — แผนยังไม่มีผลจนกว่าจะ approve
```

### 6. กรรมการตัดสิน: approve / ส่งกลับ

> requirement หมวด 4.6, หมวด 5.1, หมวด 7 — หนึ่งเวอร์ชัน หนึ่ง decision บันทึกบนตัวเวอร์ชันเอง;
> approve ครั้งแรกทำให้แผนมีผลและเกิดชุด tasks แรก
> ⚠️ ต่างจาก flowchart: **ไม่ต้องอนุมัติครบทุกคน** — reviewer คนใดคนหนึ่งตัดสินได้

```mermaid
sequenceDiagram
    autonumber
    actor C as C (กรรมการ)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor R as R (นักวิจัย)

    C->>FE: เปิดเวอร์ชัน pending (snapshot + changes)
    alt approve
        C->>FE: Approve
        FE->>BE: POST /dmps/{id}/versions/{n}/approve
        BE->>DB: บันทึกบนเวอร์ชัน: status=approved,<br/>decided_at, decided_by=C,<br/>approver snapshot (user_id, name, position, mbox)
        BE->>DB: DMP.status=approved, active_version=n
        alt แผนมีผลครั้งแรก (tasks_generated ยัง false)
            BE->>DB: สร้างชุด tasks แรกจากแผน (generated_by)
            BE->>DB: DMP.tasks_generated = true
            BE->>DB: notification tasks_generated → นักวิจัย
        end
        BE->>DB: notification dmp_approved → นักวิจัยของโครงการ
        BE-->>FE: สำเร็จ
        R-->>R: แผนมีผล → เริ่มทำ tasks (flow #12)
    else ส่งกลับ
        C->>FE: ส่งกลับ + note (เหตุผล)
        FE->>BE: POST /dmps/{id}/versions/{n}/return
        BE->>DB: บันทึกบนเวอร์ชัน: status=rejected,<br/>decided_at, decided_by, note
        BE->>DB: DMP.status = draft (working draft คงเดิม)
        BE->>DB: notification dmp_returned → นักวิจัย
        BE-->>FE: สำเร็จ
        Note over R: กลับไปแก้ต่อจาก version in force ได้เลย<br/>(ไม่ต้อง restore หมวด 4.6) · เลข n ไม่ถูกใช้ซ้ำ (หมวด 4.3)<br/>· submit revision ใหม่ได้ทันทีเพราะไม่มี pending
    end
```

### 7. Self-finalize (independent)

> requirement หมวด 2.2, หมวด 4.1, หมวด 7 — นักวิจัย citizen สรุปแผนเองได้ ไม่ผ่านกรรมการ
> (flowchart ไม่มี branch นี้)

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย — citizen)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: Self-finalize
    FE->>BE: POST /dmps/{id}/finalize
    BE->>BE: ตรวจ validation (หมวด 3.3)
    BE->>DB: freeze plan_mode = independent ลง DMP
    BE->>DB: สร้าง DMP_VERSION #1 (status=approved,<br/>snapshot, decided_by=R เอง, decided_at)
    BE->>DB: DMP.status=approved, active_version=1
    BE->>DB: สร้างชุด tasks แรก, tasks_generated=true
    BE->>DB: notification dmp_finalized → นักวิจัย
    BE->>DB: notification tasks_generated → นักวิจัย
    BE-->>FE: แผนมีผลทันที
    Note over R,DB: แผน independent export ออกมาเป็น approval = "not applicable" (หมวด 8)
```

---

## กลุ่ม D — หลังแผนมีผล

### 8. Minor edit

> requirement หมวด 4.3 — contributor (รวม contact) และ cost เป็น minor ทั้งหมด;
> fold ลง version in force โดยตรง ไม่สร้างเวอร์ชันใหม่ ไม่มี review

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: แก้ draft (เช่น contributor, cost)
    FE->>BE: PUT /dmps/{id}/draft
    BE->>BE: diff working draft กับ snapshot<br/>ของ version in force
    BE->>BE: จำแนก field policy → ทั้งหมด minor
    BE->>DB: fold ลง snapshot ของ version in force โดยตรง
    BE->>DB: จดใน minor_edits ของเวอร์ชันนั้น<br/>(at, by, changes — แสดงชื่อบัญชีไม่ใช่ id สำหรับลิงก์ contributor หมวด 4.7)
    BE-->>FE: บันทึกสำเร็จ — ไม่มีเวอร์ชันใหม่ ไม่รออนุมัติ
    Note over R,DB: export (flow #14) อธิบาย version in force<br/>จึงเห็น minor edit นี้ทันที
```

### 9. Submit revision (major) + minor fixes ขณะรอ

> requirement หมวด 4.3–4.5 — หนึ่ง revision รอได้ครั้งเดียว; fix ที่ไม่ผ่านการรวม
> จด `dropped_minor_edits` แทนการหายเงียบ ๆ

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB
    actor C as C (กรรมการ)

    R->>FE: แก้ draft แตะฟิลด์ major (เช่น ลบ output)
    FE->>BE: POST /dmps/{id}/submit
    BE->>BE: diff → มี major → ต้องสร้างเวอร์ชันใหม่
    BE->>DB: เช็กเวอร์ชัน pending ค้างอยู่หรือไม่ (หมวด 4.4)
    alt มี pending อยู่
        BE-->>FE: ปฏิเสธ — รอ decision ของเวอร์ชันเดิมก่อน
    else ไม่มี pending
        BE->>DB: สร้าง DMP_VERSION #k+1 (เลขไม่ซ้ำ — เลข rejected ไม่ถูกใช้ซ้ำ)<br/>snapshot ณ submit, based_on = version in force<br/>(number + snapshot ณ ตอนนั้น)
        BE->>DB: DMP.status=pending → review_requested → reviewer ทุกคน
        Note over R: ระหว่างรอ: minor fix ยัง fold ลง version in force ได้ (หมวด 4.5)<br/>· การแก้ใหม่ (ไม่ตรงทั้ง in force และ pending snapshot)<br/>บันทึกได้เฉพาะเมื่อทั้งหมด minor
        C->>FE: Approve
        FE->>BE: POST approve
        BE->>BE: replay diff ระหว่าง based_on<br/>กับ version in force ปัจจุบัน ตาม entity id
        BE->>DB: merge fix ที่ตามได้ลงเวอร์ชันใหม่<br/>จด carried_minor_edits
        BE->>DB: fix ที่ไปลง output ที่ revision นี้ลบทิ้ง<br/>จด dropped_minor_edits แทน
        BE->>DB: status=approved, active_version=k+1
        BE->>DB: rebase working copy บนเวอร์ชันที่อนุมัติใหม่<br/>(เหลือเฉพาะการแก้ที่ยังไม่มีใครบันทึก/ส่ง)
        BE->>DB: notification dmp_approved → นักวิจัย
    end
    Note over R,C: ถ้าถูกส่งกลับ — fix เหล่านั้นอยู่กับ version in force ตามเดิม (หมวด 4.5)
```

### 10. Restore เวอร์ชัน

> requirement หมวด 4.8 — rollback ข้ามการอนุมัติไม่ได้ เพราะ restore นับเป็นการแก้ไขธรรมดา

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: เลือก restore เวอร์ชัน X
    FE->>BE: POST /dmps/{id}/versions/{x}/restore
    alt X คือเวอร์ชันที่ยังรอ decision
        BE-->>FE: ปฏิเสธ — restore ไม่ได้
    else X คือ version in force
        BE->>DB: โหลด snapshot เข้า working draft<br/>ทิ้งการแก้ที่ยังไม่ submit — ไม่จดอะไร<br/>(อะไรที่มีผลไม่เปลี่ยน)
    else X คือเวอร์ชันอื่น (approved เก่า / rejected)
        BE->>DB: โหลด snapshot เข้า working draft<br/>จด restored_from = X
        BE->>BE: เทียบกับ version in force เหมือนการแก้ทุกครั้ง
        alt ทั้งหมด minor
            BE->>DB: fold ลง version in force (เหมือน flow #8)
        else มี major
            BE->>DB: ต้อง submit ขออนุมัติใหม่ (เหมือน flow #9)
        end
    end
    BE-->>FE: restore สำเร็จ
```

### 11. ลบ / นำกลับ research output

> requirement หมวด 4.9, หมวด 5.3, หมวด 7 — การลบเป็นข้อเสนอ ไม่ใช่ลบทันที;
> tasks ถูก cancel ไม่ใช่ลบ และเปิดคืนได้เมื่อ output กลับมา

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: ขอลบ dataset จากแผนที่มีผลอยู่
    FE->>BE: DELETE /dmps/{id}/draft/datasets/{ds}
    BE-->>FE: บันทึกเป็นข้อเสนอใน draft (เป็น major edit)
    Note over R,BE: ระหว่างรอเวอร์ชันใหม่: output ยังนับว่ามีอยู่<br/>(อ่านจาก version in force) — tasks ของมันยังทำต่อได้
    R->>FE: submit revision (flow #9)
    BE->>BE: เวอร์ชันที่ลบ output ได้รับอนุมัติ → มีผล
    BE->>DB: cancel tasks ที่ scope กับ output นั้น:<br/>cancelled_from = สถานะเดิม,<br/>cancel_reason = output_removed,<br/>cancelled_dataset_title = ชื่อ output (ไว้ตามหาเมื่อกลับมา)
    BE->>DB: notification tasks_cancelled → นักวิจัย
    BE-->>FE: แจ้งรายการ tasks ที่ถูก cancel

    R->>FE: (ภายหลัง) เพิ่ม output เดิมกลับมาในเวอร์ชันใหม่
    BE->>BE: เวอร์ชันที่นำ output กลับมา ได้รับอนุมัติ → มีผล
    BE->>DB: หา tasks ที่ cancel_reason=output_removed<br/>และ output ตรง (เทียบ id หรือชื่อที่จดไว้)
    BE-->>FE: เสนอให้เปิดคืนทีละ task (ไม่เปิดเองอัตโนมัติ<br/>เพราะการ cancel ผ่านการอนุมัติมาแล้ว หมวด 5.3)
    R->>FE: เลือกเปิดคืนแต่ละตัว
    FE->>BE: POST reopen
    BE->>DB: task กลับสู่สถานะเดิม + ลิงก์กลับกับ output
    Note over R,DB: tasks ที่ถูก cancel ด้วยมือ (reason=manual) ไม่ถูกเสนอ
```

### 12. ทำงาน tasks

> requirement หมวด 5.1–5.3 — progress_percent derived จาก checklist;
> preservation: ไม่มีอะไรที่บันทึกการทำงานจริงถูกทำลาย

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    Note over R,DB: tasks เกิดจาก flow #6/#7 (ชุดแรก) และเพิ่มได้เรื่อย ๆ<br/>ทั้งจาก AI (generated_by=ai) และผู้ใช้ (generated_by=user)

    R->>FE: เริ่ม task / ติก checklist / เปลี่ยน priority
    FE->>BE: PATCH /tasks/{id}
    BE->>BE: progress_percent = derive จาก checklist<br/>(ไม่ใช่ค่าที่ตั้งเอง)
    BE->>DB: บันทึกสถานะ (todo | in_progress | done)

    R->>FE: แนบ evidence
    alt ไฟล์
        FE->>BE: POST /tasks/{id}/files (purpose=evidence<br/>หรือ task_deliverable)
        BE->>DB: สร้าง FILE_RECORD + ผูก task.file_id
    else URL หรือ DOI
        FE->>BE: PATCH /tasks/{id} (evidence: url | doi)
        BE->>DB: บันทึก evidence แบบ polymorphic (หมวด 3.2)
    end

    R->>FE: ปิดงาน
    FE->>BE: POST /tasks/{id}/complete
    BE->>DB: status=done, completed_at, completed_by=R

    alt ขอ cancel task ที่มีงานบันทึกไว้<br/>(มี evidence / checklist ถูกติก / ปิดงานแล้ว)
        BE-->>FE: ปฏิเสธ — cancel ได้โดยเก็บ evidence ไว้<br/>และ task ที่เสร็จแล้ว cancel ไม่ได้ (ทับบันทึก)<br/>ทำได้แค่ reopen
    else ขอ cancel task ที่ยังไม่มีใครเริ่ม
        BE->>DB: จด cancelled_from, cancel_reason=manual<br/>→ status=cancelled (ไม่ลบ record)
    else ขอลบ task
        alt มีงานบันทึกไว้
            BE-->>FE: ปฏิเสธ — cancel เท่านั้น
        else ยังไม่มีใครเริ่ม
            BE->>DB: ลบได้
        end
    end
```

### 13. Archive แผน / ลบโครงการ

> requirement หมวด 4.2, หมวด 5.3 — ไม่มีทางลบแผน; การลบโครงการถูกปฏิเสธตราบใดที่มีแผนอยู่

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE
    participant DB as DB

    R->>FE: Archive แผน
    FE->>BE: POST /dmps/{id}/archive
    alt แผนมีผลอยู่ (มี version in force)
        BE-->>FE: ปฏิเสธ — archive ถูกปฏิเสธขณะแผนมีผล
    else แผนยังไม่เคย submit / ไม่มีผล
        BE->>DB: DMP.archived_at = now (ไม่ลบ — เก็บทุกอย่าง)
        BE-->>FE: สำเร็จ — หายจาก My DMPs / Tasks / โครงการ<br/>ค้นเจอผ่าน filter "Archived"
    end
    R->>FE: (ภายหลัง) Unarchive
    FE->>BE: POST /dmps/{id}/unarchive
    BE->>DB: archived_at = null — กลับมาตามเดิม

    R->>FE: ลบโครงการ
    FE->>BE: DELETE /projects/{id}
    alt โครงการยังมีแผนอยู่ (รวมแผนที่ archive แล้ว)
        BE-->>FE: ปฏิเสธ — ต้องไม่มีแผนจึงลบได้ (หมวด 4.2)
    else ไม่มีแผนเลย
        BE->>DB: ลบโครงการ
    end
    Note over R,DB: การเปลี่ยน plan_mode ของโครงการหรือการลบโครงการ<br/>ไม่มีผลต่อแผนที่ submit แล้ว — mode ถูก pin ไว้แล้ว (หมวด 4.2)
```

### 14. Export มาตรฐาน

> requirement หมวด 8 — export เป็น projection ไม่ใช่ entity ที่เก็บ

```mermaid
sequenceDiagram
    autonumber
    actor R as R (นักวิจัย)
    participant FE as FE
    participant BE as BE

    R->>FE: ขอ export<br/>(GCWG-RDA maDMP v3.0 หรือ RDA Common Standard v1.3)
    FE->>BE: GET /dmps/{id}/export?format=…
    alt แผนมี version in force แล้ว
        BE->>BE: projection จาก snapshot ของ version in force<br/>(ไม่ใช่ working draft)
        BE->>BE: approval block จากสถานะแผน, plan_mode,<br/>approver ของ active version
        alt plan_mode = independent
            BE->>BE: approval = "not applicable"
        end
        BE-->>FE: export + แจ้งบน panel ว่า<br/>การแก้ที่ยังไม่บันทึก/อนุมัติไม่ปรากฏ
    else ก่อนการอนุมัติครั้งแรก
        BE->>BE: projection จาก draft
        alt ยังไม่เคย submit
            BE->>BE: สถานะ "not submitted"
        else pending อยู่
            BE->>BE: สถานะ "submitted"
        end
        BE-->>FE: export
    end
    Note over R,BE: maDMP v3.0 มี approval block + classification fields<br/>RDA v1.3 ไม่มีทั้งสอง (protection/security ไปอยู่ใน security_and_privacy)<br/>ทั้งสองรูปแบบ: domain + domain_metadata เป็น extensions,<br/>วันที่ปฏิทินเขียนเป็น YYYY-MM-DD (หมวด 3.4)
```

---

## สรุปความต่างจาก `main-flowchart.md`

| Flowchart | Sequence diagram ฉบับนี้ | ที่มา |
|---|---|---|
| "กรรมการอนุมัติครบทุกคน" | reviewer คนใดคนหนึ่งตัดสินได้ — หนึ่งเวอร์ชัน หนึ่ง decision (flow #6) | หมวด 4.6, ตามการตัดสิน |
| ไม่มี branch แบบไม่มีสังกัด | เพิ่ม self-finalize (flow #7) | หมวด 2.2, หมวด 4.1 |
| "แก้ไขแผน" loop เดียว | แยก minor edit (fold ตรง, flow #8) ออกจาก major revision (เวอร์ชันใหม่, flow #9) | หมวด 4.3–4.5 |
| "แจ้งให้แก้ไข → กลับ draft" | กลับมาทำงานต่อจาก version in force ได้เลย ไม่ต้อง restore + เลข rejected ไม่ซ้ำ | หมวด 4.6 |
| Progress bar ปลายทาง | เจาะเป็นการเกิด tasks อัตโนมัติ + การทำงาน tasks (flow #6, #12) | หมวด 5.1–5.3 |
| — | เพิ่ม restore, ลบ/นำกลับ output, archive, export (flow #10, #11, #13, #14) | หมวด 4.8–4.9, หมวด 5.3, หมวด 8 |
| เรียก AI service ครั้งเดียวต่อ action | ทุก action รันเป็น agent loop (ReAct) บน OpenRouter ด้วย tools 3 ตัว ตอบกลับแบบ SSE (flow #3) | หมวด 6, การตัดสิน AI agent |
