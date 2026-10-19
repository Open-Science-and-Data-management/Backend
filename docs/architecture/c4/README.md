# C4 Architecture Diagrams

_แผนภาพสถาปัตยกรรมระบบติดตามความคืบหน้าโครงการวิจัย จัดวางตามโมเดล C4_

โมเดล C4 คือวิธีอธิบายระบบแบบ "ซูมเข้าไปทีละระดับ" — เริ่มจากภาพกว้างที่สุด (ระบบทั้งหมดมีความสัมพันธ์กับใครบ้าง) แล้วค่อย ๆ ซูมเข้าไปจนถึงรายละเอียดว่าโค้ดแต่ละส่วนประกอบกันอย่างไร และระบบรันอยู่บนเครื่องจริงแบบไหน

## อ่านตามลำดับนี้

### 1. [c4-context.md](c4-context.md) — อ่านก่อนเสมอ

ภาพกว้างที่สุด: ระบบนี้มีใครใช้บ้าง และมีอะไรอยู่นอกตัวระบบ (Frontend, OpenRouter, SMTP) เขียนไว้ให้คนที่ไม่ได้เขียนโค้ดก็อ่านเข้าใจได้ทุกบทบาท

### 2. [c4-containers.md](c4-containers.md) — อ่านทันทีหลัง context

ซูมเข้ามาดูว่าระบบประกอบจากชิ้นส่วนที่รันอยู่จริงอะไรบ้าง: Caddy, NestJS 1 process, PostgreSQL และ file volume ซึ่งทั้งหมดอยู่ใน docker-compose เดียวบน VM เครื่องเดียว พร้อมเหตุผลว่า**ทำไมระบบนี้ไม่ต้องมี** Redis หรือ message queue

### 3. ต่อจากนี้เลือกอ่านตามสิ่งที่ต้องการ

| ถ้าต้องการรู้ว่า… | อ่านไฟล์นี้ |
| --- | --- |
| โค้ดภายใน app จัดระเบียบกันอย่างไร — domain engine, port/adapter, การเรียกข้าม feature | [c4-components-app.md](c4-components-app.md) |
| draft ถูกบันทึกอย่างไร, ระบบตัดสิน minor/major ตรงไหน, แล้ว error 409 มาจากไหน | [c4-dynamic-submit.md](c4-dynamic-submit.md) |
| กรรมการกดอนุมัติแล้วเกิดอะไรขึ้น — การ carry/drop minor edits, rebase, การ cancel tasks | [c4-dynamic-approve.md](c4-dynamic-approve.md) |
| ระบบถูก deploy จริงอย่างไร — container, volume, backup, config | [c4-deployment.md](c4-deployment.md) |

---

## คำแนะนำตามบทบาทผู้อ่าน

| ผู้อ่าน | ไฟล์ที่พอ |
| --- | --- |
| ผู้บริหาร / คนไม่ได้ทำงานสายเทคนิค | #1 เท่านั้น |
| Product / คนดูแล requirement | #1 → #2 |
| Developer ที่เพิ่งเข้าใหม่ | #1 → #2 → dynamic ทั้งสองไฟล์ → component |
| Developer ที่ต้องแก้ domain engine / version flow | ทั้งหมด — เริ่มจาก #1 ตามลำดับ |
| DevOps / ops ของสถาบัน | #1 → #2 → deployment |

## เอกสารตั้งต้นที่ควรมีคู่มือ

แผนภาพเหล่านี้เป็นเพียง**สรุป** ไม่ได้แทนที่เอกสารหลัก — รายละเอียดเต็มอยู่ใน:

- [`docs/architecture/arc42.md`](../arc42.md) — เอกสารสถาปัตยกรรมฉบับเดียว + เหตุผล (กฎ layering, ตาราง, error model, testing)
- [`docs/architecture/requirement.md`](../requirement.md) — ความต้องการเชิงพฤติกรรม (กฎแผน, preservation, AI, notification)

## หมายเหตุ

- แผนภาพเขียนด้วย Mermaid C4 syntax — GitHub render ได้ตรง ๆ; renderer รุ่นเก่าอาจต้องอัปเดต Mermaid
- เลข flow (#4, #9 ฯลฯ) ใน dynamic diagrams อ้างอิง flow ใน `docs/architecture/sequence-diagrams.md`
- แผนภาพเป็น snapshot ของการตัดสินใจ ณ วันที่เอกสารตั้งต้นเขียน — เมื่อแก้สถาปัตยกรรม ให้แก้ `docs/architecture/arc42.md` ก่อนแล้วค่อยอัปเดตแผนภาพตาม
