# Spec: ai

**Map:** `docs/specs/SPEC.md` · **Depends on:** `dmp-lifecycle`, `projects-files` (RAG), `accounts` (โควตา) · **Gate = จบ M4 (e2e ครบ 18 flows)**
**ADR ที่เกี่ยว:** 0005 (เขียน ReAct loop เอง), 0018 (SSE event shapes), 0023 (โควตา + idempotency), 0025/0028 (RAG + โมเดล), TC-6 (OpenRouter system key)

## Objective
ผู้ช่วย AI แบบ agent loop ช่วยร่าง/วิเคราะห์ — ทุกผลลัพธ์เป็น**ข้อเสนอ**ที่ผู้ใช้แก้ไขต่อได้ทั้งหมด ไม่มีอะไรเขียนทับ draft อัตโนมัติ; สตรีมแบบ SSE ตาม event shapes ที่ FE คาดหวังเป๊ะ

## Scope (slices)
S4.1 `AiClient` port + OpenRouter adapter (anti-corruption: แปล wire format OpenAI-compatible ภายใน adapter เท่านั้น — ไม่รั่วถึง FE) + mock server สำหรับ test → S4.2 ReAct loop + tools 4 ตัว (`read_proposal`, `search_proposal`, `read_draft`, `read_domain_profiles` — read-only, ไม่มี web search, ไม่มี tool เขียน draft) → S4.3 SSE streaming → S4.4 quota + idempotency + thread

## Interfaces (boundary)
- `POST /ai/analyze-proposal` (ผูก proposal ให้โครงการ — เติมช่อง nullable จาก projects-files), `POST /dmps/{scope}/ai/{action}` (SSE; scope = dmp_id | `unscoped`), `GET /dmps/{scope}/ai-thread`, `PUT /dmps/{scope}/ai-thread/{entry}`, `POST /dmps/{scope}/ai-thread/clear|adopt`, `GET /ai/quota`
- SSE events: `status`/`tool` (ระหว่างทาง, consume ไม่บังคับ) → `delta` (ข้อความ) → `proposal` (structured) → `done|error` (terminal) — shapes จาก `shared/contracts/`, event ที่ client ไม่รู้จักต้องเมินได้
- โควตา: pre-flight เป็น hint (ไม่ปฏิเสธ run เดียวที่ล้น); reconcile ตอนจบ = output + uncached input (cached นับ 10%), คิดทุก call รวม fail/abort; reset รายเดือน (`quota_resets_at`)
- `Idempotency-Key` บังคับทุก AI action — replay ได้ 24 ชม. ไม่โดนโควตาซ้ำ (`idempotency_keys` table)
- Thread persist: `ai_thread_entries` (kind user/event/assistant, token_count, decision accepted/rejected/stale, scope dmp_id nullable | `unscoped`)
- เรียก projects-files: extracted text + `file_chunks` (RAG ไม่พร้อม → tool บอก agent ใช้ `read_proposal` แทน — ไม่ error ทั้ง run); เรียก accounts: โควตา

## Testing
- **Seam: ports/adapters (integration)** — OpenRouter **mock server**: ReAct sequence ถูกต้อง, wire format แปลถูกที่ adapter, abort กลางทางนับ token, retry ด้วย key เดิม replay ไม่คิดโควตาซ้ำ
- **Seam: HTTP/SSE boundary (e2e)** — flow #3 (AI action จบด้วย terminal event, proposals แก้ต่อได้ → apply ลง draft ผ่าน PUT draft ปกติ), #17 (chat/thread/clear/adopt)
- unit ที่ `tests/unit/ai/`: การนับ token (cached 10%), idempotency window, quota reconcile

## Success Criteria
1. e2e ครบ 18 flows เขียว — ปิด v1
2. SSE ทุก run จบด้วย terminal event (`done`|`error`) — ไม่มี stream ค้าง
3. Retry ภายใน 24 ชม. ด้วย `Idempotency-Key` เดิมไม่ถูกหักโควตาซ้ำ (มี test คุ้มกัน)
4. ไม่มี tool ใดเขียน draft — เทสยืนยัน tools ทั้งสี่ read-only

## Out of Scope
เลือก/ปรับรุ่น model จริงต่อ action (config `ai.models` — ตั้งค่าตอน deploy ทดลอง), exports, web search, การเขียน draft แทนผู้ใช้
