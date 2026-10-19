# C4 — Dynamic Diagram: Submit / บันทึก draft (flow #4–#5)

*แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 5.3, หมวด 8.3 · `docs/architecture/requirement.md` หมวด 3.3, หมวด 4.3–4.4*

flow การบันทึก draft ที่แผนมีผลแล้ว — จุดตัดสินใจหลักคือ `classify`:
**minor-only** fold ลง version in force ทันที, **มี major ฟิลด์เดียว** → ทั้งชุด
major และสร้างเวอร์ชัน pending (เลขไม่ซ้ำ — บังคับด้วย `UNIQUE (dmp_id, number)`;
หนึ่ง pending ต่อแผน — บังคับด้วย partial unique index)

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

## กฎที่ไดอะแกรมนี้คุ้มกัน

- **Optimistic concurrency** — ขั้นตอนที่ 2: `draft_revision` ไม่ตรงปัจจุบัน → `409`
  ป้องกันการสูญเสียงานแก้ (preservation, requirement หมวด 5.3)
- **หนึ่ง revision รอได้ครั้งเดียว** — ขั้นตอนที่ 4b ถูกปฏิเสธถ้ายังมี pending
  (หมวด 4.4) และ race ของ submit พร้อมกันเป็นไปไม่ได้เพราะ partial unique index
  ของ Postgres เอง
- **Minor fix ระหว่างรอ** (หมวด 4.5) — ขั้นตอนที่ 4a ยังทำงานระหว่างมี pending:
  fold ลง version in force, snapshot ของ pending ยัง freeze
- **Validation ก่อนบันทึก** — `validateDraft` (กฎ หมวด 3.3) คืน `422` พร้อม
  `path` เป็น JSON pointer ให้ FE นำไปทำ "คลิกไปแก้" — ดู error envelope ใน
  `docs/architecture/arc42.md` หมวด 8.3

flow การตัดสินต่อจากนี้ (approve / ส่งกลับ) ดูที่ [c4-dynamic-approve.md](c4-dynamic-approve.md)
