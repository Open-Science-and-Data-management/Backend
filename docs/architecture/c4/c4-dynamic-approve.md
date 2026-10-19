# C4 — Dynamic Diagram: Approve revision (flow #9)

*แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 5.3 · `docs/architecture/requirement.md` หมวด 4.5–4.6, หมวด 4.9, หมวด 5.1, หมวด 5.3*

flow ที่ซับซ้อนที่สุดของระบบ — กรรมการ approve เวอร์ชัน pending ระหว่างที่
version in force มี minor fixes เกิดขึ้นหลังจากที่ revision ถูก submit ไปแล้ว
ทุกอย่างในขั้นตอน 4–7 เกิดใน **transaction Drizzle เดียว** (atomic)

```mermaid
C4Dynamic
  title Dynamic Diagram - Approve revision with carry/drop minor edits (flow #9)

  Person(committee, "กรรมการ", "ตัดสินจาก global queue")
  Container_Ext(fe, "Frontend", "React 19")
  ContainerDb(db, "PostgreSQL", "Drizzle", "dmp_versions, tasks, notifications")

  Container_Boundary(api, "NestJS App") {
    Component(svc, "DmpsService", "service", "ธุรกรรมเดียว")
    Component(tasksSvc, "TasksService", "service", "preservation rules")
    Component(engine, "domain-engine", "pure functions", "carry + rebase")
    Component(notifSvc, "NotificationsService", "service", "rows + push")
  }

  Rel(committee, fe, "approve เวอร์ชัน n")
  Rel(fe, svc, "1. POST /dmps/{id}/versions/{n}/approve", "JSON/HTTPS")
  Rel(svc, engine, "2. carryEdits(based_on, inForce, newSnapshot)")
  Rel(svc, db, "3. เวอร์ชัน n → approved + decided_at/by + approver snapshot")
  Rel(svc, db, "4. merge carried_minor_edits ลง snapshot ใหม่ / จด dropped_minor_edits")
  Rel(svc, engine, "5. rebaseWorkingCopy(draft, newSnapshot)")
  Rel(svc, tasksSvc, "6. output ถูกลบ → cancel tasks (ไม่ลบ) · เวอร์ชัน 1 → generateTasks")
  Rel(svc, notifSvc, "7. rows: dmp_approved / tasks_generated / tasks_cancelled")
  Rel(notifSvc, fe, "8. push SSE ถึงนักวิจัยของโครงการ", "text/event-stream")

  UpdateRelStyle(committee, fe, $offsetY="-30")
  UpdateRelStyle(svc, db, $offsetX="-120", $offsetY="-10")
  UpdateRelStyle(notifSvc, fe, $offsetX="80")
```

## กฎ preservation ที่ flow นี้ต้องไม่ละเมิด (requirement หมวด 4.5, หมวด 4.9, หมวด 5.3)

- **Fix ที่ลง output ที่ revision นั้นลบทิ้ง** ไม่หายเงียบ ๆ — จดใน
  `dropped_minor_edits` (ขั้นตอนที่ 4)
- **Working copy ถูก rebase** — เหลือเฉพาะการแก้ที่ยังไม่มีใครบันทึก/ส่ง (ขั้นตอนที่ 5)
- **Tasks ถูก cancel ไม่ใช่ลบ** — จด `cancelled_from`, `cancel_reason: output_removed`,
  ชื่อ output ไว้ตามหาเมื่อ output กลับมา — และจะถูก**เสนอให้เปิดคืน** ไม่เปิดเอง
  เพราะการ cancel ของมันผ่านการอนุมัติมาแล้ว
- **เวอร์ชันแรกของแผน institutional** — ขั้นตอนที่ 6 สร้างชุด tasks แรก
  (`tasks_generated = true` + notification `tasks_generated`, requirement หมวด 5.1)
- **การตัดสินบันทึกบนตัวเวอร์ชัน** — หนึ่งเวอร์ชัน หนึ่ง decision, `approver`
 เป็น snapshot ของผู้อนุมัติ ณ ตอนตัดสิน (หมวด 4.6)

การส่งกลับ (return) ใช้ flow เดียวกันแต่ไม่มีขั้นตอน 4–6: fix เหล่านั้นอยู่กับ
version in force ตามเดิม และทำงานต่อจาก version in force ได้ทันทีโดยไม่ต้อง restore
