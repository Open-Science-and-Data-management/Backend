# ADR-0023: ชุด AI actions ตาม frontend, scope unscoped, นโยบายโควตา, Idempotency-Key

## Status
Accepted

## Date
2026-10-26

## Context
ชุด action ของ arc42 (`analyze_proposal/regenerate_field/batch_regenerate/generate_tasks/redraft_steps`) ต่างจากที่ frontend ใช้จริง (`analyze-proposal/regenerate-field/chat/suggest/generate-tasks/checklist`) — และ arc42 ผูกทุก action กับ dmp เสมอ ทั้งที่ analyze-proposal กับ chat เกิดก่อนแผนจะมี; นโยบายโควตาของ FE ละเอียดกว่า (cached input, reset รายเดือน) และ FE บังคับ Idempotency-Key ซึ่ง arc42 ไม่มีเลย

## Decision
1. **ชื่อ action ตาม frontend**: `analyze-proposal` (อยู่นอก dmp path — แผนยังไม่เกิด), `chat`, `suggest`, `generate-tasks`, `checklist`, `regenerate-field` — tools ยังเป็น read-only (FE `proposeRewrite` ตีความเป็น "ข้อเสนอ" ไม่เขียน draft ตรง)
2. **Scope `unscoped`**: `ai_thread_entries.scope` เป็น nullable dmp — รองรับ chat/analyze ก่อนมีแผน + thread `PUT` (decision accepted/rejected/stale) / `clear` / `adopt`
3. **โควตา**: นับ output + uncached input, cached input ลดเหลือ 10%, reset รายเดือนพร้อม `resets_at`, **คิดทุก call รวมที่ fail/abort** — pre-flight check เป็นแค่ hint (ยอมให้ run เดียวล้นได้ ตาม reconcile เดิม)
4. **`Idempotency-Key` บังคับบน AI actions** — retry ภายใน 24 ชม. ไม่โดนโควตาซ้ำ (POST+SSE ที่หลุดกลางทางต้องไม่จ่าย token สองรอบ) — เพิ่มตาราง idempotency keys (key, action, replay response, expires 24 ชม.)

## Consequences
- flow #3 ต้องเพิ่มเติม chat/unscoped + idempotency; arc42 5.2 แก้รายชื่อ action
- quota fields ย้าย/เพิ่มที่ user: `ai_token_limit/used` + `quota_resets_at`
