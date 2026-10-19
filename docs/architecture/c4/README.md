# C4 Architecture Diagrams

*แผนภาพสถาปัตยกรรมระบบติดตามความคืบหน้าโครงการวิจัย (Uni Backend) ตามโมเดล C4*

*แหล่งตั้งต้น: `docs/architecture/arc42.md` · `docs/architecture/requirement.md`*

---

## อ่านตามลำดับนี้

### 1. [c4-context.md](c4-context.md) — อ่านก่อนเสมอ

ระบบอยู่ตรงไหนของโลก: ใครใช้, อะไรอยู่นอกขอบเขต (Frontend, OpenRouter, SMTP)
ใครก็อ่านได้ทุกบทบาท รวมถึงคนไม่ใช่ technical

### 2. [c4-containers.md](c4-containers.md) — อ่านทันทีหลัง context

ระบบแบ่งเป็นอะไรรันอยู่ที่ไหน: Caddy, NestJS 1 process, PostgreSQL, file volume
ใน docker-compose เดียวบน VM พร้อมเหตุผลว่า**ทำไมไม่มี** Redis/queue

### 3. แยกตามสิ่งที่ต้องการ

| ถ้าต้องการรู้ว่า… | อ่านไฟล์นี้ |
|---|---|
| กฎภายใน app — domain engine, port/adapter, การเรียกข้าม feature | [c4-components-app.md](c4-components-app.md) |
| draft ถูกบันทึกอย่างไร, minor/major ตัดสินตรงไหน, 409 มาจากไหน | [c4-dynamic-submit.md](c4-dynamic-submit.md) |
| การอนุมัติดำเนินการอย่างไร — carry/drop minor edits, rebase, cancel tasks | [c4-dynamic-approve.md](c4-dynamic-approve.md) |
| ระบบ deploy จริงอย่างไร — container, volume, backup, config | [c4-deployment.md](c4-deployment.md) |

---

## คำแนะนำตามบทบาทผู้อ่าน

| ผู้อ่าน | ไฟล์ที่พอ |
|---|---|
| ผู้บริหาร / คนไม่ใช่ technical | #1 เท่านั้น |
| Product / คนดูแล requirement | #1 → #2 |
| Developer เข้าใหม่ | #1 → #2 → dynamic ทั้งสองไฟล์ → component |
| Developer แก้ domain engine / version flow | ทั้งหมด — เริ่มจาก #1 ตามลำดับ |
| DevOps / ops ของสถาบัน | #1 → #2 → deployment |

## เอกสารตั้งต้นที่ควรมีคู่มือ

แผนภาพเหล่านี้**สรุป** ไม่ได้แทนที่ — รายละเอียดเต็มอยู่ใน:

- [`docs/architecture/arc42.md`](../arc42.md) — เอกสารสถาปัตยกรรมฉบับเดียว + เหตุผล (กฎ layering, ตาราง, error model, testing)
- [`docs/architecture/requirement.md`](../requirement.md) — ความต้องการเชิงพฤติกรรม (กฎแผน, preservation, AI, notification)

## หมายเหตุ

- แผนภาพใช้ Mermaid C4 syntax — GitHub render ได้ตรง ๆ; renderer รุ่นเก่าอาจต้องอัปเดต Mermaid
- เลข flow (#4, #9 ฯลฯ) ใน dynamic diagrams อ้างอิง flow ใน `docs/architecture/sequence-diagrams.md`
- แผนภาพเป็น snapshot ของการตัดสิน ณ วันที่เอกสารตั้งต้นเขียน — เมื่อแก้สถาปัตยกรรม
  ให้แก้ `docs/architecture/arc42.md` ก่อนแล้วอัปเดตแผนภาพตาม
