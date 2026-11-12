# ADR-0031: JSONB draft-shaped columns ได้ CHECK constraint ระดับ DB (integrity boundary)

## Status
Accepted — ขยายเงื่อนไข TD-3 ของ ADR-0003 (ไม่พลิกโครง JSONB); spec: `docs/specs/SPEC-draft-integrity.md`

## Date
2026-11-12

## Context
`dmps.draft`, `dmp_versions.snapshot` และ JSONB รอบตัว (FieldChange[], approver, ai thread content) เป็น JSONB เปลือย — Postgres ไม่มี constraint ใด ๆ รูปร่างถูก enforce ที่ชั้น application (Zod `dmpDraftSchema` ด่านหน้า) เท่านั้น ทุก write path ปกติผ่าน Zod ก่อนเข้า DB แต่ path ที่ไม่ผ่าน (query ตรง, migration ในอนาคต, bug ฝั่ง repository) ทำให้ของเสียหลุดเข้า DB ได้เงียบ ๆ และกลุ่มที่อายุยืน (`ai_thread_entries.content`) ยังถูก feed กลับเข้าเป็น context ของ LLM ทุกครั้งที่ chat — ของเสียจึงแพร่กระจาย

ADR-0003 ยอมรับการ query เจาะ JSONB ด้วย operator ในความถี่ต่ำ (TD-3) — จุดเดียวที่มีจริงคือ search `q` ด้วย `ilike(draft->>'description')` (`dmps.repository.ts:71`) ไม่มี requirement เรื่อง queryability ระดับ entity — ปัญหาที่ต้องแก้คือ **integrity at rest + กัน contract drift** ไม่ใช่ query

## Decision
1. **คง JSONB ทั้งหมดไว้ — ไม่ normalize** (ทั้ง draft/snapshot คือ working tree ของ diff/validate/fold/restore ตาม ADR-0003/0020); เพิ่ม **CHECK constraint แบบเบา** ประกาศผ่าน Drizzle `check()` ใน `src/database/schema/index.ts` เป็นด่านสุดท้าย — Zod ยังเป็น validator จริงที่ชั้น application
2. **กฎต่อคอลัมน์** (เบาหมด ไม่ลงไป nested):
   - `dmps.draft`, `dmp_versions.snapshot` — object โดยทุก key ∈ ชุด 16 keys ของ `dmpSchema` (`{}` ว่างผ่าน — แผนใหม่เริ่มเป็น `{}`)
   - `dmp_versions.based_on_snapshot` — เหมือนข้างบนแต่ nullable
   - `changes`/`minor_edits`/`carried_edits`/`dropped_edits` — null หรือ array ของ object ที่มี `path`/`label`/`from`/`to` เป็น string (`target` ไม่ตรวจ — data เก่าข้าม version ไม่มีมัน)
   - `dmp_versions.decision_approver` — null หรือ object, key ⊆ `{user_id, name, position, mbox}`, value ทั้งหมด string
   - `ai_thread_entries.content` — object แยกตาม `kind`: user → key-set `{text, section}` หรือ `{action, direction}` (ห้ามผสม), assistant → `{action, text, proposal, stale_reason}` โดยมี `action`, event → `{action, usage, dmp_id}` โดยมี `action`
3. **ไม่ enforce โดยเจตนา**: `ai response_snapshot` (replay ต้องคืน byte เดิม + TTL 24 ชม.), `affiliation` (ไม่มีสัญญา schema) — จดเป็น known gaps
4. **Error**: violation → 500 ผ่าน `ErrorEnvelopeFilter` เป็นสัญญาณ "bug ถูกจับ" — ไม่แปลงเป็น 400 (เพราะ path ปกติมี Zod ให้ 400 อยู่แล้ว)
5. **Drift guard**: unit test เทียบ key-set ที่ SQL ใช้กับ `Object.keys(dmpSchema.shape)` + engine type/constant ที่ export จาก schema — ปิดจุด drift Zod↔SQL; ไม่ยก `FieldChange` ขึ้น `contracts/` (เป็นโครงภายใน BE)
6. **Data**: dev mock — ล้าง DB แล้ว migrate ใหม่ ไม่เขียน migration แก้ข้อมูลเดิม

## Consequences
- ของเสียรูปแบบระดับบนเข้า DB ไม่ได้อีก แม้ผ่าน path ที่ลืม Zod; กลุ่มที่ feed กลับ LLM ปลอดภัยขึ้น
- ทุกครั้ง `dmpSchema` เพิ่ม/ลบ key ระดับบน → migration ปรับ constraint ตาม (drift ที่ตั้งใจให้ตก — FE ต้อง port contracts ก่อนของเขียนได้)
- ต้นทุน runtime ~0 — CHECK เฉพาะ top-level keys/typeof, ไม่ validate nested
- SQL กับ Zod มีสองสถานที่ — รอดด้วย drift-guard test; ถ้า test ตาย = จุดเดียวที่ต้องซ่อม
