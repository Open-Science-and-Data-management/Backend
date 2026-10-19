# Main Flowchart

ผังการทำงานหลักของระบบติดตามงานวิจัย — นักวิจัยอัปโหลด proposal สร้างแผน DMP ด้วย AI หรือเขียนเอง แก้ไขจนพอใจ ส่ง Commit ให้กรรมการตรวจ หากอนุมัติครบทุกคนจึงเข้าสู่ Progress bar หากไม่ครบจะแจ้งให้กลับไปแก้ไข

```mermaid
flowchart TD
    researcher(["นักวิจัย"]) --> upload["อัปโหลด Proposal<br><code>file: .docx</code>"]
    upload --> aiDecision{"ให้ AI สร้างแผน?"}
    aiDecision -- ใช่ --> aiGen["AI สร้าง DMP"]
    aiDecision -- ไม่ --> manual["เขียน DMP เอง"]
    aiGen --> draft["DMP ฉบับร่าง"]
    manual --> draft
    draft --> editDecision{"แก้ไขแผน?"}
    editDecision -- ใช่ --> update["อัปเดตแผน"]
    update --> draft
    editDecision -- ไม่ --> commit["ส่งแผน (Commit)"]
    commit --> approve{{"กรรมการอนุมัติครบทุกคน?"}}
    committee["กรรมการตรวจ DMP<br>ทุกคนต้องกด approve"] --> approve
    approve -- ครบทุกคน --> notifyApproved["แจ้งอนุมัติทุกคน"]
    approve -- ไม่ครบ --> notifyFix["แจ้งให้แก้ไข"]
    notifyFix --> draft
    notifyApproved --> progress(["Progress bar"])

    %% 0.10 -> 1A, 0.05 -> 0D, 0.08 -> 14 (8-digit hex; mermaid classDef ห้าม comma ใน rgba)
    classDef endpoint fill:#4f5d751a,stroke:#7a8399,stroke-width:1px,color:#2d3142
    classDef process fill:#ffffff,stroke:#2d3142,stroke-width:1px,color:#2d3142
    classDef draftNode fill:#2d31420d,stroke:#4f5d75,stroke-width:1px,color:#2d3142
    classDef decision fill:#eb6c3614,stroke:#eb6c36,stroke-width:1.2px,color:#2d3142
    classDef actor fill:#4f5d751a,stroke:#7a8399,stroke-width:1px,color:#2d3142

    class researcher,progress endpoint
    class upload,aiGen,manual,update,commit,notifyApproved,notifyFix process
    class draft draftNode
    class aiDecision,editDecision,approve decision
    class committee actor
```

---

original ref: figma (18/10/2026)