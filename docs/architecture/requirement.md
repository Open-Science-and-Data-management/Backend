# เอกสารความต้องการระบบ (Requirement)
**ระบบหลังบาน (Backend) — ระบบติดตามความคืบหน้าโครงการวิจัย**
*อัปเดต 18 ตุลาคม 2026 · เขียนทับฉบับ 16 กันยายน 2026*

> เอกสารฉบับนี้อิงข้อมูลจาก `docs/sources/project-erd.md` (ตรวจสอบกับโค้ด frontend
> ล่าสุดวันที่ 18 ตุลาคม 2026) เป็น primary source เพียงแหล่งเดียว เนื้อหาของ
> requirement ฉบับก่อนหน้าที่ไม่ปรากฏใน ERD ถูกตัดออกทั้งหมด

---

## 1. ภาพรวมของระบบ

ระบบหลังบานสำหรับ**นักวิจัยและคณะกรรมการ** ทำหน้าที่รองรับการเขียน **DMP (แผนการจัดการข้อมูลวิจัย ตามรูปแบบ maDMP v3.0)** — ประกอบด้วย research outputs (datasets), distributions, contributors และ costs — โดยนักวิจัยเขียนแผนได้เองหรือให้ AI ช่วยสร้าง แผนแบบ**มีสังกัด**ต้องผ่านการอนุมัติจากกรรมการก่อนมีผล ส่วนแผนแบบ**ไม่มีสังกัด**นักวิจัยสรุปเองได้ เมื่อแผนมีผลแล้วงานถูกทำตามเป็น **tasks** พร้อมหลักฐาน ทั้งแผนและ task ถูกออกแบบตามหลัก **preservation** — สิ่งที่บันทึกการทำงานจริงไม่มีทางถูกทำลาย มีเพียงการจัดเก็บพักไว้ (archive) และการยกเลิกที่จดบันทึกร่องรอย

ระบบหลังบานนี้ให้บริการ frontend ที่มีอยู่ (repo `Frontend`) โมเดลข้อมูลและพฤติกรรมทั้งหมดออกแบบให้สอดคล้องกับโมเดลฝั่ง client ปัจจุบัน ณ วันที่ตรวจสอบล่าสุด

## 2. ผู้ใช้ บัญชี และบทบาท

### 2.1 บทบาท (Roles)

| บทบาท | ที่มาของบัญชี | หน้าที่ |
|---|---|---|
| **Researcher** | สมัครเองผ่านหน้า sign-up | สร้างโครงการ เขียน/แก้ไข/ส่งแผน DMP อัปโหลดไฟล์ ทำ tasks และ self-finalize แผนแบบ independent |
| **Committee** | สถาบันมอบให้ | ตัดสินเวอร์ชันของแผนแบบ institutional (approve หรือส่งกลับ) |
| **Chief** | สถาบันมอบให้ | *ยังไม่มีพฤติกรรมเฉพาะ* นอกเหนือจากการเป็นสมาชิกโครงการ (`project_role: chief`) |
| **Admin** | สถาบันมอบให้ | บทบาทระดับระบบ ไม่มีพฤติกรรมแก้ไข DMP ของนักวิจัยโดยตรง |

### 2.2 ประเภทบัญชี (Account types)

**เฉพาะนักวิจัยเท่านั้นที่สมัครบัญชีเองได้** และบัญชีนักวิจัยมี `account_type` หนึ่งในสองค่า:

- **Institutional (มีสังกัด)** — ต้องระบุหน่วยงาน (affiliation: organization, department, position) โครงการใหม่ของนักวิจัยกลุ่มนี้ default เป็น `plan_mode: institutional` (ต้องผ่านกรรมการ)
- **Citizen (ไม่มีสังกัด)** — ไม่มี affiliation อาจระบุที่อยู่แทน โครงการใหม่ default เป็น `plan_mode: independent` (self-finalize)

Default นี้ถูกใช้ตอน**สร้างโครงการ**เท่านั้น หลังจากนั้นแผนแต่ละแผนจะ pin โหมดของตัวเองตอน submit ครั้งแรก (ดู หมวด 4.2)

### 2.3 การสมัครและการยืนยันตัวตน

- การ sign-up สร้าง **USER** หนึ่งรายการ และ **CREDENTIAL** หนึ่งรายการ (`role` เป็น `researcher` เสมอ)
- **Username** ต้องไม่ซ้ำ (เก็บเป็นตัวพิมพ์เล็ก)
- **Email** ต้องไม่ซ้ำ โดยเทียบแบบไม่สนตัวพิมพ์และช่องว่าง ตรวจทั้งตอน sign-up และตอนแก้ email ใน profile — ความ unique นี้ใช้หาบัญชีที่ตรงกับ email ของ contributor ในแบบฟอร์ม (ดู หมวด 4.7)
- **รหัสผ่าน**เก็บเฉพาะใน CREDENTIAL เป็น salted hash — ⚠️ **เบี่ยงจาก ERD อย่างมีเจตนา**: ERD ฝั่ง frontend ใช้ SHA-256 และระบุเองว่าไม่ปลอดภัยพอสำหรับ production ระบบหลังบานต้องใช้ **bcrypt หรือ argon2id** แทน
- **การระบุตัวผู้กระทำ**: รายการที่ถูกสร้างขณะมีผู้ sign in อยู่ถูก attribute ให้ผู้ใช้นั้น — project membership ตอนสร้างโครงการ, การอัปโหลดไฟล์, minor edits, การ self-finalize, การปิด tasks

## 3. โมเดลข้อมูล

### 3.1 ER Diagram

```mermaid
erDiagram
    USER ||--o| CREDENTIAL : signs_in_with
    USER ||--o{ PROJECT_MEMBER : participates_in
    PROJECT ||--o{ PROJECT_MEMBER : has_members
    PROJECT o|--o{ DMP : groups
    PROJECT ||--o{ FILE_RECORD : stores
    USER ||--o{ FILE_RECORD : uploads
    PROJECT o|--o| FILE_RECORD : selects_active_proposal
    DMP ||--o{ DMP_VERSION : has_revisions
    USER o|--o{ DMP_VERSION : decides_as_approver
    DMP ||--o{ TASK : produces
    DMP o|--o{ NOTIFICATION : may_reference
    PROJECT o|--o{ NOTIFICATION : may_reference
    USER ||--o{ NOTIFICATION : receives
    DMP ||--|{ DATASET : contains_in_draft
    DMP ||--|{ CONTRIBUTOR : names_in_draft
    USER o|--o{ CONTRIBUTOR : may_be_linked_as
    DMP ||--o{ COST : budgets_in_draft
    DATASET ||--o{ DISTRIBUTION : describes
    DATASET }o--|| DOMAIN_PROFILE : validated_by
    DATASET o|--o{ TASK : may_scope
    FILE_RECORD o|--o{ TASK : may_be_attached_to
    FILE_RECORD o|--o{ DISTRIBUTION : may_back
    DMP o|--o{ AI_THREAD_ENTRY : scopes

    USER {
        string user_id PK "optional in schema"
        string title
        string name
        string surname
        string email "unique per account, ignoring case and spaces"
        UserRole role "admin | chief | committee | researcher"
        int ai_token_limit
        int ai_token_used
        string username "optional; set at sign-up, mirrors CREDENTIAL"
        AccountType account_type "optional; institutional | citizen, researchers only"
        string phone "optional"
        string orcid "optional; same format as CONTRIBUTOR.orcid"
        json affiliation "optional; organization, department, position. Institutional only"
        string address "optional; citizen researchers only"
    }

    CREDENTIAL {
        string username PK "lowercase; unique"
        string user_id FK
        string salt "random per account"
        string hash "password hash (bcrypt/argon2id on backend); never the password"
    }

    PROJECT {
        string project_id PK "optional in schema"
        string project_name
        string description
        string proposal_file_id FK "optional"
        ProjectStatus status "draft | active | done"
        PlanMode plan_mode "institutional | independent"
        date created_at
        date updated_at
    }

    PROJECT_MEMBER {
        string project_id PK, FK
        string user_id PK, FK
        ProjectRole project_role "researcher | committee | chief"
    }

    DMP {
        string dmp_id PK
        string project_id FK "optional"
        string title
        string description
        string language
        DmpStatus status "draft | pending | approved"
        int active_version "optional; DMP_VERSION.number in force"
        PlanMode plan_mode "optional; pinned at first submission"
        date archived_at "optional; plans are archived, never deleted"
        bool tasks_generated
        int dataset_count "summary for the library list"
        int contributor_count "summary for the library list"
        date created_at
        date updated_at
        json draft "dates, ethics, indigenous, alternate_identifier, schema_version v3.0, and the nested lists"
    }

    DMP_VERSION {
        int number "per-DMP; a rejected number is not reused"
        VersionStatus status "pending | approved | rejected (draft unused)"
        EditType edit_type "minor | major"
        json changes "FieldChange list: path, label, from, to, edit_type"
        json snapshot "the plan as submitted"
        date created_at
        date decided_at "optional"
        string decided_by "optional; reviewer's user_id, committee, or the researcher's user_id when self-finalized"
        json approver "optional; user_id, name, position, mbox at decision time"
        string note "optional; reason when sent back"
        json minor_edits "at, by, changes, restored_from; folded in without review"
        int restored_from "optional; the version whose content this brings back"
        json based_on "version in force at submission: number + snapshot"
        json carried_minor_edits "fixes to that version merged in on approval"
        json dropped_minor_edits "fixes that couldn't merge (output removed)"
    }

    DATASET {
        string dataset_id "optional in schema"
        string type "raw | software | publication | other"
        string title
        string description
        DatasetStatus status "planned | collected | processed | preserved | shared"
        DataAccess access "open | shared | closed"
        YesNoUnknown personal_data
        YesNoUnknown sensitive_data
        string personal_data_plan
        string protection_level "maDMP v3.0 list or other"
        string protection_level_other_nomenclature "when other"
        string protection_level_other "level, when other"
        string security_classification_level "maDMP v3.0 list or other"
        string security_classification_level_other_nomenclature "when other"
        string security_classification_level_other "level, when other"
        string keyword "array"
        string language
        DomainKey domain "generic and 7 research domains"
        json domain_metadata "validated strictly by the domain's profile"
        json preservation
    }

    DISTRIBUTION {
        string distribution_id "optional in schema"
        string file_id FK "optional"
        string title
        string access_url
        string download_url
        string format
        int byte_size
        DataAccess data_access
        string license "required when data_access is open"
    }

    CONTRIBUTOR {
        string contributor_id "optional in schema"
        string title
        string name
        string surname
        string role
        string email "required for the contact"
        string orcid "optional"
        bool is_contact "exactly one per plan"
        string user_id FK "optional; one contributor per account per plan"
    }

    COST {
        string cost_id "optional in schema"
        string title
        string description
        number value
        string currency_code "ISO 4217, default THB"
    }

    DOMAIN_PROFILE {
        DomainKey key PK "code registry, not stored"
        string label
        json fields "key, label, type, required, options, help, permission"
    }

    TASK {
        string task_id PK "optional in schema"
        string dmp_id FK
        string dataset_id FK "optional"
        string source_version_id "optional; never written"
        string file_id FK "optional"
        string title
        string details
        date start_date
        date end_date
        int progress_percent "derived from checklist"
        TaskStatus status "todo | in_progress | done | cancelled"
        Priority priority "low | medium | high"
        LifecycleStage lifecycle_stage
        GeneratedBy generated_by "ai | user"
        json checklist
        json evidence "none | file | url | rdm_deposit"
        date completed_at
        string completed_by
        TaskStatus cancelled_from "status a cancellation replaced"
        string cancel_reason "manual | output_removed"
        string cancelled_dataset_title "to find the output if it returns"
    }

    FILE_RECORD {
        string file_id PK "optional in schema"
        string project_id FK
        string uploaded_by FK
        string filename
        FileType file_type "docx | pdf | other"
        FilePurpose purpose "proposal | task_deliverable | evidence"
        json metadata
        date uploaded_at
        date superseded_at
    }

    NOTIFICATION {
        string notification_id PK "optional in schema"
        string user_id FK
        string dmp_id FK "optional"
        string project_id FK "optional"
        NotificationType type "see หมวด 7"
        string title
        string message
        string link
        date read_at
        date created_at
    }

    AI_THREAD_ENTRY {
        string id PK
        string scope "dmp_id, or unscoped"
        string kind "event | user | assistant"
        string action "for events"
        int token_count
        json proposals "for assistant turns"
        date at
    }
```

### 3.2 ข้อสังเกตสำคัญเรื่องโมเดล

- **`DATASET`, `DISTRIBUTION`, `CONTRIBUTOR` และ `COST` เป็นค่า nested ใน draft ของ DMP** ไม่ใช่ record อิสระ — ERD วาดแยกเพื่อให้เห็นความสัมพันธ์ชัด แต่ backend เก็บรวมใน draft/วิเคราะห์ตามโครงสร้างนี้ `DMP_VERSION` เช่นกันเป็นรายการ embedded ใน DMP record
- **`DOMAIN_PROFILE` เป็น code registry** ไม่ใช่ข้อมูลที่เก็บ — `domain_metadata` ของทุก dataset ถูก validate อย่างเคร่งครัดตาม profile ของ domain นั้น (generic + 7 research domains)
- **PK/FK ในไดอะแกรมเป็นข้อเสนอเชิงตรรกะ** ไม่ใช่ constraint ที่บังคับในโมเดลเดิม — ID จำนวนมาก optional และ reference เป็น plain string ID ของรายการ nested unique เฉพาะภายในแผนของตัวเอง ฝั่ง backend ควร enforce เป็น constraint จริง: คู่ `(project_id, user_id)` ใน PROJECT_MEMBER ต้อง unique
- **DMP ↔ PROJECT**: แผนหนึ่งแผนอาจไม่มี `project_id` ได้ และหนึ่งโครงการมีหลายแผนได้ — ไม่ใช่ one-to-one
- **`contact` ไม่ใช่ฟิลด์ของ DMP** — contact คือ contributor ที่ `is_contact = true` (มีได้แน่นอนหนึ่งคนต่อแผน) ส่วน classification ระดับแผนไม่มี — export จะ roll up จาก datasets
- **`source_version_id` ของ TASK ถูกประกาศไว้แต่ไม่เคยถูกเขียน** — task ไม่จดว่าเวอร์ชันไหนสร้างมัน
- **Evidence เป็น polymorphic** (file / URL / DOI) ไม่ใช่ FK ไปที่ไฟล์เสมอ

### 3.3 กฎ validation ของแผน

ระบบปฏิเสธแผน (พร้อมระบุฟิลด์ให้ผู้ใช้คลิกไปแก้) เมื่อ:

- วันสิ้นสุดก่อนวันเริ่มต้น
- มี ethical issues แต่ไม่มีคำอธิบาย
- ไม่มี contact พอดีหนึ่งคนในบรรดา contributors
- มี contributor สองคนลิงก์กับบัญชีเดียวกัน
- contact ไม่มี email (maDMP v3.0 กำหนด `contact.mbox`)
- distribution แบบ open ไม่มี license (maDMP v3.0 กำหนด)
- `domain_metadata` ของ dataset ไม่ผ่าน profile ของ domain ตนเอง

### 3.4 ปฏิทินและวันที่

วันที่ที่ไม่มีเวลา (begin/end ของแผน, start/end ของ task, วันที่ใน domain metadata) เก็บเป็นวันที่ปฏิทิน (`YYYY-MM-DD`) ไม่ผูกเวลา ส่วน timestamp (`created_at`, `decided_at`, `uploaded_at` ฯลฯ) เป็น date-time เต็มรูปแบบ ทั้งสองชนิดไม่ปะปนกัน

## 4. กฎของแผนงาน (Plan rules)

### 4.1 Lifecycle และการมีผลของแผน

แผนเริ่มเป็น **draft** แผนแบบ institutional มีผลครั้งแรกเมื่อกรรมการ approve เวอร์ชัน 1 ส่วนแผนแบบ independent นักวิจัย **self-finalize** เองได้ หลังจากนั้น working draft จะถูกเทียบกับ snapshot ของ **version in force** เสมอ

### 4.2 Plan mode ถูก freeze ตอน submit ครั้งแรก

แผนบันทึก `plan_mode` ของตัวเองเมื่อถูก submit ครั้งแรก (หรือตอน self-finalize) และใช้ค่านั้นตลอดไป — การเปลี่ยนโหมดของโครงการ หรือการลบโครงการ ไม่มีผลต่อแผนที่ส่งแล้ว แผนที่ยังไม่ submit จะเดินตามโครงการจนกว่าจะส่ง **การลบโครงการถูกปฏิเสธ** ตราบใดที่โครงการยังมีแผนอยู่ (รวมแผนที่ archive แล้ว)

### 4.3 การจำแนก minor/major edits

การแก้ไขถูกจำแนกเป็น minor หรือ major **จาก field policy เท่านั้น** (ชุดเดียวกับที่ใช้แสดงรายการ "ต้องขออนุมัติใหม่" ให้ผู้ใช้) ปัจจุบันเป็น **major**:

- วันเริ่มต้น / วันสิ้นสุดของแผน
- ข้อมูล ethical issues และ Indigenous considerations
- ของ research output แต่ละชิ้น: access, personal data, personal data plan, protection level, security classification
- **การเพิ่มหรือลบ** research output

ส่วนการแก้ contributor (รวม contact) และ cost เป็น **minor** ทั้งหมด

พฤติกรรม:

- **Minor-only** — บันทึกลง version in force โดยตรง จดใน `minor_edits` ของเวอร์ชันนั้น ไม่สร้างเวอร์ชันใหม่ ไม่มีการ review
- **มี major เพียงฟิลด์เดียว** — ทั้งชุดการแก้ไขกลายเป็น major การ submit สร้างเวอร์ชันถัดไป (เลขไม่ซ้ำ — เลขที่ถูก reject ไม่ถูกใช้ซ้ำ) สถานะ `pending` โดย version in force ยังคงมีผลจนกว่าจะมี decision

### 4.4 หนึ่ง revision รอได้ครั้งเดียว

การ submit revision ใหม่ถูกปฏิเสธขณะยังมีเวอร์ชัน pending อยู่ เพราะเวอร์ชันใหม่จะถูกสร้างบนเวอร์ชันที่อาจไม่ได้รับอนุมัติ

### 4.5 Minor fixes ขณะ revision รออนุมัติ

- Minor fix ระหว่างรอ ถูกบันทึกลง version in force เหมือน minor edit ทั่วไป snapshot ของเวอร์ชัน pending ยังคง freeze
- *การแก้ใหม่* คือการแก้ที่ไม่ตรงกับทั้ง version in force และ pending snapshot — บันทึกได้เฉพาะเมื่อทั้งหมดเป็น minor
- เมื่อ revision ได้รับอนุมัติ: ความต่างระหว่าง snapshot ตอน submit (`based_on`) กับ version in force ปัจจุบัน ถูก replay ลงเวอร์ชันใหม่ตาม entity id และจดใน `carried_minor_edits` — fix ที่ไปลง output ที่ revision นั้นลบทิ้งไม่สามารถลงได้ จะถูกจดใน `dropped_minor_edits` แทนการหายเงียบ ๆ และ working copy ถูก rebase บนเวอร์ชันที่อนุมัติใหม่ (เหลือเฉพาะการแก้ที่ไม่มีใครบันทึก/ส่ง)
- ถ้า revision ถูกส่งกลับ: fix เหล่านั้นอยู่กับ version in force ตามเดิม

### 4.6 การตัดสิน หนึ่งเวอร์ชัน หนึ่ง decision

การอนุมัติหรือการส่งกลับถูกบันทึก **บนตัวเวอร์ชันเอง**: `status`, `decided_at`, `decided_by`, `note` (เหตุผลเมื่อส่งกลับ) และ `approver` (snapshot ของผู้อนุมัติ ณ ตอนตัดสิน: user_id, name, position, mbox) — หนึ่งเวอร์ชันมีหนึ่ง decision การส่งกลับทำให้ทำงานต่อจาก version in force แล้วส่งใหม่ได้ (ไม่ต้อง restore ก่อน) การ cancel บนแผนที่รอ decision แรก: submission ยังคงอยู่กับกรรมการตามที่ส่งไป มีเพียงการแก้ที่เกิดขึ้นหลังจากนั้นเท่านั้นที่ถูกทิ้ง

### 4.7 Contributor ↔ บัญชี

- Contributor หนึ่งคนอาจลิงก์กับบัญชีผู้ใช้ผ่าน `contributor.user_id` (optional) — ฟอร์มเสนอบัญชีที่ email ตรงกัน (ไม่สนตัวพิมพ์) แต่**ไม่ลิงก์เองอัตโนมัติ** หนึ่งบัญชีลิงก์กับ contributor ได้ไม่เกินหนึ่งคนต่อแผน
- การเปลี่ยนลิงก์เป็น minor edit ธรรมดา รายการ changes แสดงชื่อบัญชี ไม่ใช่ id
- ลิงก์นี้เป็นข้อมูลภายใน — export ระบุตัวบุคคลด้วย ORCID หรือ email ถ้าบัญชีถูกลบไป ลิงก์กลายเป็น "Unknown account" ที่ฟอร์ม flag ให้
- ขณะนี้ยังไม่มีพฤติกรรมที่กระทำต่อลิงก์ (การมอบหมาย task ให้ contributor และการแจ้งเตือน contributor ยังไม่ถูกสร้าง)

### 4.8 การ restore เวอร์ชัน

การ restore โหลด snapshot ของเวอร์ชันหนึ่งเข้า working draft:

- Restore **version in force** — ทิ้งการแก้ที่ยังไม่ submit ไม่จดอะไร (อะไรที่มีผลไม่เปลี่ยน)
- Restore **เวอร์ชันอื่น** (approved เก่า หรือที่ถูกส่งกลับ) — นับเป็นการแก้ไขธรรมดาตั้งแต่บรรทัดนั้นไป: ถูกเทียบกับ version in force แล้วบันทึก (minor) หรือส่งขออนุมัติ (major) เหมือนการแก้ทุกครั้ง ทำให้ rollback ข้ามการอนุมัติไม่ได้ รายการที่เกิดขึ้นจด `restored_from`
- เวอร์ชันที่ยังรอ decision **restore ไม่ได้**

### 4.9 การลบ research output ที่แผนมีผลอยู่

เป็น**ข้อเสนอ** ไม่ใช่การลบทันที — tasks ที่ scope กับ output นั้นยังทำต่อจนกว่าเวอร์ชันที่ลบมันจะมีผล จึงถูก cancel (ไม่ลบ) พร้อม notification `tasks_cancelled` ระหว่างรอ output นั้นยังนับว่ามีอยู่ (อ่านจาก version in force)

## 5. งานและหลักฐาน (Tasks)

### 5.1 การเกิดของ tasks

- เมื่อแผน**มีผลครั้งแรก** ระบบสร้างชุด tasks แรกให้ (flag `tasks_generated` บนแผนเปลี่ยนเป็น true พร้อม notification `tasks_generated`)
- หลังจากนั้น tasks ถูกเพิ่มได้เรื่อย ๆ ทั้งจาก AI (`generated_by: ai`) และจากผู้ใช้สร้างเอง (`generated_by: user`)

### 5.2 โครงสร้างและสถานะ

- Task มี `status` (`todo | in_progress | done | cancelled`), `priority`, `lifecycle_stage`, ตารางเวลา start/end และ checklist — `progress_percent` **derived จาก checklist** ไม่ใช่ค่าที่ตั้งเอง
- Evidence แนบได้หลายรูปแบบ: ไฟล์ (จาก `FILE_RECORD`), URL หรือ DOI
- ไฟล์ในระบบมี `purpose`: `proposal` (เอกสารเสนอโครงการ — โครงการชี้ proposal ที่ active), `task_deliverable` และ `evidence`; ไฟล์ที่ถูกแทนจด `superseded_at`

### 5.3 Preservation — ไม่มีอะไรที่บันทึกการทำงานจริงถูกทำลาย

- **ไม่มีทางลบแผน** — `archive` เท่านั้น และ archive ถูกปฏิเสธขณะแผนมีผลอยู่ แผนที่ archive: หายจากรายการ My DMPs/Tasks/โครงการ, เก็บทุกอย่างที่มี, ค้นเจอผ่าน filter *Archived*, กลับมาได้ด้วย unarchive
- **การออกจาก editor ไม่ลบอะไร** — แผนที่มีผลสูญเสียเฉพาะการแก้ที่ยังไม่บันทึก แผนที่ยังไม่เคย submit ถูก archive
- **Task ที่มีงานบันทึกไว้ลบไม่ได้** (มี evidence, checklist ถูกติก หรือถูกปิดงานแล้ว) — cancel ได้โดยเก็บ evidence ไว้ ลบได้เฉพาะ task ที่ยังไม่มีใครเริ่ม
- **Task ที่เสร็จแล้ว cancel ไม่ได้** (จะทับบันทึกการเสร็จ) — ทำได้แค่ reopen
- **การ cancel จดสิ่งที่มันแทนที่**: `cancelled_from` (สถานะเดิม), `cancel_reason` (`manual` | `output_removed`) และชื่อ output ที่ถูกลบ (ใช้ตามหาเมื่อกลับมา)
- **การนำ task กลับ**: เมื่อเวอร์ชันใหม่นำ output กลับมา tasks ที่ถูก cancel จากการลบครั้งนั้นถูก**เสนอให้เปิดคืน** — ไม่เปิดเองอัตโนมัติ เพราะการ cancel ของมันผ่านการอนุมัติมาแล้ว แต่ละ task ถูกเลือกเปิดคืนทีละตัว กลับสู่สถานะเดิม และถูกลิงก์กลับกับ output (เทียบด้วย id หรือชื่อที่จดไว้) — tasks ที่ถูก cancel ด้วยมือไม่ถูกเสนอ

## 6. AI Assistant

- AI เป็นบริการภายนอก ทำงานผ่านการเรียก API ไม่ใช่ผู้ใช้ในระบบ — ผู้ให้บริการคือ **OpenRouter** ที่ backend ถือ system key เดียว (เป็นรายละเอียดภายใน ไม่ปรากฏใน API contract)
- **ทุก action รันเป็น agent loop (ReAct)** — โมเดลตัดสินใจเรียก tools เองหลายรอบก่อนคืนคำตอบสุดท้าย Tools ที่ให้ใช้มี 3 ตัว: อ่าน proposal (extracted text), อ่าน working draft และอ่าน DOMAIN_PROFILE / กฎ validation — **ไม่มี**การค้นอินเทอร์เน็ต และ**ไม่มี** tool เขียน draft (AI คืนข้อเสนอเท่านั้น)
- **Scope ของ actions** (จาก ERD ฝั่ง frontend): `analyze_proposal` (วิเคราะห์ proposal .docx), `regenerate_field`, `batch_regenerate`, `generate_tasks` และ `redraft_steps` — ทุก action ตอบกลับแบบ **SSE streaming** (`status` / `tool` / `token` / `result`: prose สตรีมระหว่างทาง จบด้วย structured proposals ที่ validate ได้ทั้งก้อน)
- **Token budget ต่อผู้ใช้**: `ai_token_limit` และ `ai_token_used` บน USER — การใช้ AI จำกัดด้วยจำนวน token ไม่ใช่จำนวนครั้ง เช็กด้วย estimate **ก่อนเริ่ม run** แล้ว reconcile ด้วย token จริง**ตอนจบ** (run เดียวล้นโควตาได้ ไม่ตัดกลางคัน ถ้าล้มเหลวกลางทาง budget ที่ใช้ไปแล้วยังนับ)
- **Extracted text ของ proposal**: parse .docx ตอนอัปโหลด แล้วเก็บ text แยกจาก `FILE_RECORD.metadata` — agent อ่าน text สำเร็จรูป ไม่ parse ซ้ำทุก run
- **Thread**: ประวัติการสนทนาและ event ถูก persist เป็น `AI_THREAD_ENTRY` — user turn (action + prompt), assistant turn สุดท้าย (พร้อม `proposals` ที่ AI เสนอ และ `token_count` รวมของ run) และ `kind=event` หนึ่งรายการต่อ tool call หนึ่งครั้ง โดย scope ตาม `dmp_id` เมื่อมี หรือเป็น unscoped activity
- ทุกผลลัพธ์จาก AI เป็นข้อเสนอที่**ผู้ใช้แก้ไขต่อได้ทั้งหมด** ก่อนบันทึกหรือส่ง

## 7. การแจ้งเตือน

Notification มี `type`, `title`, `message`, `link`, อ้าง DMP/โครงการได้ (optional) และ `read_at` (optional) ชนิดทั้งหมด:

| Type | ความหมาย |
|---|---|
| `dmp_submitted` | แผนถูกส่ง |
| `dmp_approved` | แผนได้รับอนุมัติ |
| `dmp_finalized` | แผน independent ถูก self-finalize |
| `dmp_returned` | เวอร์ชันถูกส่งกลับ (ถึงนักวิจัย) |
| `review_requested` | ขอให้ตรวจ — ถึง reviewer ทุกคนเมื่อแผน/revision ถูกส่ง |
| `tasks_generated` | ชุด tasks แรกถูกสร้าง |
| `tasks_cancelled` | tasks ถูกยกเลิกจากการลบ output |
| `proposal_superseded` | proposal ของโครงการถูกแทน |

การแจ้งเตือนเรื่องแผนหนึ่ง ๆ ไปหา**นักวิจัยของโครงการนั้น** ไม่ว่าใครเป็นผู้ trigger

## 8. การส่งออกมาตรฐาน (Standards exports)

Export เป็น **projection ของแผนที่ผ่าน validation** ไม่ใช่ entity ที่เก็บ:

- หลังแผนมี version in force — export อธิบาย **snapshot ของเวอร์ชันนั้น** ไม่ใช่ working draft (การแก้ที่ยังไม่บันทึก/อนุมัติไม่ปรากฏ และ export panel แจ้งเช่นนั้น)
- ก่อนการอนุมัติครั้งแรก — export จาก draft พร้อมสถานะ `not submitted` หรือ `submitted`

| Export | หมายเหตุ |
|---|---|
| **GCWG-RDA maDMP v3.0** | บล็อก `approval` มาจากสถานะแผน, plan mode และ `approver` ของ active version — แผน independent export เป็น `not applicable` |
| **RDA DMP Common Standard v1.3** | ไม่มี approval block และ classification fields — protection/security ไปอยู่ใน `security_and_privacy` |

ทั้งสองรูปแบบ carry `domain` และ `domain_metadata` เป็น extensions และวันที่ปฏิทินถูกเขียนเป็น `YYYY-MM-DD`

## 9. คำถามที่รอการตัดสิน (Open questions)

1. **Generated ids ซ้ำข้ามแผน** — ระบบวิเคราะห์เดิมให้ทุกแผนใช้ id ชุดเดียวกัน (`seed-dataset-1`, `seed-contributor-1` ฯลฯ) ทำให้ dataset id และ contributor identifier ใน export ชนกันข้ามแผน ระบบจริงต้อง mint id ที่ unique — คงเหลือให้ตัดสินว่า export ควร namespace id ตามแผนด้วยหรือไม่ (เช่น `dmp-id/dataset-id`) เป็น safeguard
