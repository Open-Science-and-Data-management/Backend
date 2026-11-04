# ADR-0026: ปิด TC-5 จาก repo Frontend — port domain profiles + task generator ตาม STAGE_PLAN + กฎ evidence แบบ mode-conditional

## Status
Accepted

## Date
2026-11-04

## Context
TC-5/R-2 ค้างไว้ 2 การตัดสินเพราะเข้าใจว่า repo `Frontend` ยังไม่อยู่บนดิสก์ ปัจจุบัน repo อยู่ที่ `~/Projects/uni/Frontend` และการสำรวจ (scout, 2026-11-04) ยืนยัน:

- `src/schemas/dataset/domain-profiles.ts` มี **ข้อมูลจริงครบ 8 profiles** (generic + 7 domains) — field มี label/help/required พร้อม zod schema สร้างจาก field list และมี test ประกอบ
- ชุด tasks แรกมีต้นแบบทำงานจริงที่ `src/api/aiApi.ts` (`generateTasks` + `STAGE_PLAN`): **ต่อ dataset หนึ่ง task ต่อ lifecycle stage** จาก 5 stages (collect / process / analyse / preserve / share), ชื่อ `"${verb}: ${output.title}"`, มี `dataset_id`, `lifecycle_stage`, `priority` (high/medium/medium/high/low), **ข้าม stage `share` เมื่อ `output.access === "closed"`**
- กฎ evidence requirement (`src/config/task-evidence.ts`): `rdm_deposit` ถูก**บังคับเฉพาะแผน independent** ที่ stage preserve/share; แผน institutional รับ `file|url` ชั่วคราว ("awaiting verification")

## Decision
1. **Domain profiles**: port `domain-profiles.ts` เข้า `shared/domain-profiles/` เป็น registry ชุดเดียว — backend validate `domain_metadata` ด้วยชุดเดียวกับที่ FE render — **ปิด TC-5 ข้อ domain profiles**
2. **Task generator**: ยอมรับ semantics ของ STAGE_PLAN เป็น canonical — implement เป็น **pure function ใน domain-engine** ที่ approve/finalize เรียกใน transaction เดียวกับการ set `active_version`; AI action `generate-tasks` (ถ้าทำ) เรียก function เดียวกัน ไม่มี logic ซ้ำ — **ปิด TC-5 ข้อชุด tasks แรก**
3. **Evidence requirement แบบ mode-conditional**: ทำตาม FE — `rdm_deposit` บังคับเฉพาะ preserve/share ของแผน `independent`, แผน `institutional` รับ `file|url` ไปก่อน — การบังคับทุก plan_mode เป็น requirement ใหม่ต้องแก้ทั้งสองฝั่งพร้อมกัน (ปรับความหมายของ "evidence requirement 3 ระดับ" ใน ADR-0022)

## Consequences
- TC-5 และ R-2 **ปิดครบ** — arc42 หมวด 9/11 แก้ตาม; ระลอก 0 port ได้ทันที ไม่ต้องครอบค่าชั่วคราว
- test-first ของ engine (validateDraft, task generator) ใช้ fixtures จาก registry ที่ port จริง ไม่ใช่ค่าสมมติ
- ต้นแบบ FE รัน client-side เป็น mock — port เป็น read-only reference ตาม OC-2 ไม่ใช่ code sharing
- หมายเหตุ: FE ใช้ React 18 (package.json) ไม่ใช่ 19 ตามที่เอกสารระบุ — ไม่กระทบ backend
