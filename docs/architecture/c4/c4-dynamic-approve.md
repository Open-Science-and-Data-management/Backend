# C4 — Dynamic Diagram: Approve revision (flow #9)

_แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 5.3 · `docs/architecture/requirement.md` หมวด 4.5–4.6, หมวด 4.9, หมวด 5.1, หมวด 5.3_

นี่คือ flow ที่ซับซ้อนที่สุดของระบบ สถานการณ์คือ: กรรมการกด approve เวอร์ชัน pending ซึ่งถูก submit ไปก่อนหน้านั้น แต่ระหว่างที่รออยู่ version in force ได้มี minor fixes เกิดขึ้นเพิ่มแล้ว คำถามคือ fix เหล่านั้นจะเป็นอย่างไรเมื่อเวอร์ชันใหม่กลายเป็นตัวมีผล — คำตอบอยู่ที่ขั้นตอน 2 และ 4 (carry / drop)

ขั้นตอนที่ 4–7 ทั้งหมดรวมอยู่ใน **transaction Drizzle เดียว** หมายความว่าสำเร็จพร้อมกันทั้งชุด หรือถ้าพลาดก็ย้อนกลับหมด (atomic) ไม่มีทางอยู่ครึ่ง ๆ กลาง ๆ

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

## กฎ preservation ที่ flow นี้ห้ามละเมิด (requirement หมวด 4.5, หมวด 4.9, หมวด 5.3)

เป้าหมายร่วมของทุกข้อคือ: **งานของใครไม่หายไปเงียบ ๆ ไม่ว่ากรณีใด**

- **Fix ที่ลง output ซึ่ง revision นี้ลบทิ้ง** ไม่หายเงียบ ๆ — จดไว้ใน `dropped_minor_edits` (ขั้นตอนที่ 4) ใครอยากตามรอยยังตามได้
- **Working copy ของนักวิจัยถูก rebase** — ขั้นตอนที่ 5 ปรับ draft ที่ค้างแก้อยู่ให้ตั้งอยู่บน snapshot ใหม่ โดยเหลือเฉพาะการแก้ที่ยังไม่มีใครบันทึก/ส่ง (ส่วนที่ซ้ำกับที่ระบบจัดการไปแล้วถูกทิ้งไป)
- **Tasks ถูก cancel ไม่ได้ถูกลบ** — ถ้า output ที่ task ผูกอยู่ถูกลบ ระบบ cancel task (ขั้นตอนที่ 6) แต่เก็บแถวไว้พร้อม `cancelled_from`, `cancel_reason: output_removed` และชื่อ output เดิม เพื่อตามหาได้เมื่อ output กลับมา และถ้ากลับมาจริง ระบบจะ**เสนอให้เปิดคืน** — ไม่เปิดเอง เพราะการ cancel ของมันก็ผ่านการอนุมัติมาแล้วเช่นกัน
- **เวอร์ชันแรกของแผน institutional เริ่มต้นงานให้** — ขั้นตอนที่ 6 สร้างชุด tasks แรก (`tasks_generated = true` + notification `tasks_generated`, requirement หมวด 5.1)
- **การตัดสินถูกบันทึกบนตัวเวอร์ชัน** — หนึ่งเวอร์ชันมี decision ได้ครั้งเดียว และ `approver` เป็น snapshot ของผู้อนุมัติ ณ ตอนตัดสิน (หมวด 4.6)

**กรณีส่งกลับ (return)** ใช้ flow เดียวกันนี้แต่ข้ามขั้นตอน 4–6: fix เหล่านั้นยังอยู่กับ version in force ตามเดิมอยู่แล้ว จึงทำงานต่อจาก version in force ได้ทันที ไม่ต้อง restore อะไร
