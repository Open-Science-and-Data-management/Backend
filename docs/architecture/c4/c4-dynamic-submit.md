# C4 — Dynamic Diagram: บันทึก draft (flow #4–#5)

_แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 5.3, หมวด 8.3 · `docs/architecture/requirement.md` หมวด 3.3, หมวด 4.3–4.4_

ไดอะแกรม dynamic ไม่ได้วาดโครงสร้าง แต่วาด "ลูกศรทีละขั้น" ว่าเมื่อเกิดเหตุการณ์หนึ่ง ระบบทำอะไรตามลำดับไหน

เหตุการณ์ในไฟล์นี้คือ นักวิจัยกดบันทึก draft ของแผนที่มีผลแล้ว จุดตัดสินใจหลักอยู่ที่ `classify` ซึ่งแยกการแก้เป็นสองทาง:

- **minor เท่านั้น** (แก้เล็ก ๆ ไม่กระทบสาระแผน) → fold ลง version in force ทันที ("version in force" = เวอร์ชันที่กำลังมีผลอยู่ตอนนี้ ส่วน "fold" = รวมเข้าเวอร์ชันนั้นตรง ๆ โดยไม่สร้างเวอร์ชันใหม่)
- **มี major สักฟิลด์เดียว** (แก้สาระสำคัญ) → **ทั้งชุดถือเป็น major** และสร้างเวอร์ชัน pending (pending = รอกรรมการตัดสิน) เลขเวอร์ชันไม่ซ้ำกันด้วย constraint `UNIQUE (dmp_id, number)` และแต่ละแผนมี pending ได้ครั้งละหนึ่งเท่านั้น ด้วย partial unique index

```mermaid
C4Dynamic
  title Dynamic Diagram - Save draft on a plan in force (flow #4-5)

  Container_Ext(fe, "Frontend", "React 19")
  ContainerDb(db, "PostgreSQL", "Drizzle", "dmps, dmp_versions, notifications")

  Container_Boundary(api, "NestJS App") {
    Component(ctrl, "DmpsController", "controller", "เช็ค draft_revision")
    Component(svc, "DmpsService", "service", "ธุรกรรม Drizzle เดียว")
    Component(engine, "domain-engine", "pure functions", "diff + classify")
    Component(pub, "NotificationPublisher", "port + adapter", "InProcessEventBus → SSE")
  }

  Rel(fe, ctrl, "1. PUT /dmps/{id}/draft — แนบ draft_revision")
  Rel(ctrl, svc, "2. revision ไม่ตรง → 409 ให้โหลดใหม่")
  Rel(svc, engine, "3. diffDraft(draft, snapshot) + classify(changes, policy)")
  Rel(svc, db, "4a. minor-only → foldMinor ลง version in force + จด minor_edits")
  Rel(svc, db, "4b. มี major → INSERT pending version (เลขถัดไป)")
  Rel(svc, db, "5. สร้าง notification rows ใน tx เดียวกัน")
  Rel(svc, pub, "6. publish หลัง commit")
  Rel(pub, fe, "7. push SSE", "text/event-stream")

  UpdateRelStyle(fe, ctrl, $offsetY="-40")
  UpdateRelStyle(svc, db, $offsetX="-160")
  UpdateRelStyle(svc, pub, $offsetX="60", $offsetY="20")
```

## กฎที่ไดอะแกรมนี้คุ้มกันไว้

- **Optimistic concurrency** — ขั้นตอนที่ 2: ถ้า `draft_revision` ที่ส่งมาไม่ตรงกับ revision ปัจจุบัน แปลว่ามีคนอื่นแก้อยู่ระหว่างนั้น → คืน `409` ให้โหลดใหม่ เพื่อไม่ให้การบันทึกทับงานของกันและกันโดยไม่รู้ตัว (preservation, requirement หมวด 5.3)
- **หนึ่ง revision รออนุมัติได้ครั้งเดียว** — ขั้นตอนที่ 4b จะถูกปฏิเสธถ้ายังมี pending version อยู่ (หมวด 4.4) ส่วน race กรณี submit พร้อมกันสองครั้งเป็นไปไม่ได้ เพราะ partial unique index ของ Postgres กันไว้ที่ระดับ database เอง
- **Minor fix ทำได้แม้ระหว่างรออนุมัติ** (หมวด 4.5) — ขั้นตอนที่ 4a ยังทำงานปกติแม้มี pending version อยู่: แก้เล็ก ๆ fold ลง version in force ส่วน snapshot ของ pending version ยังคง freeze ตามที่กรรมการเห็น
- **Validation ก่อนบันทึก** — `validateDraft` (กฎ หมวด 3.3) ตรวจก่อนเสมอ ถ้าไม่ผ่านคืน `422` พร้อม `path` เป็น JSON pointer เพื่อให้ FE ชี้ไปที่ฟิลด์ที่ผิดแล้วทำปุ่ม "คลิกไปแก้" ได้ — ดู error envelope ใน `docs/architecture/arc42.md` หมวด 8.3

จากจุดนี้ ถ้าเป็น revision รออนุมัติ ลำดับถัดไปคือการตัดสินของกรรมการ (approve / ส่งกลับ) — ดูที่ [c4-dynamic-approve.md](c4-dynamic-approve.md)
