# Implementation Plan: ai

**Spec:** [`../specs/SPEC-ai.md`](../specs/SPEC-ai.md) · **Depends on:** plan-dmp-lifecycle · **Gate:** e2e ครบ 18 flows

## Overview
ReAct loop เขียนเองบน `AiClient` port → OpenRouter, SSE ตาม event shapes, tools 4 ตัว read-only, โควตา + idempotency + thread persist — ทุกผลลัพธ์เป็นข้อเสนอ ไม่มีอะไรเขียน draft อัตโนมัติ

## Architecture Decisions
- เขียน loop เอง ไม่ใช้ LangChain (ADR-0005); wire format OpenAI-compatible แปลที่ adapter เท่านั้น (TC-6)
- SSE events `status/tool/delta/proposal/done|error` จาก `shared/contracts/` (ADR-0018); client ใช้ fetch+ReadableStream (ADR-0008)
- โควตา: pre-flight hint, reconcile output+uncached input (cached 10%) ทุก call รวม fail/abort, reset รายเดือน (ADR-0023)
- `Idempotency-Key` บังคับ, replay 24 ชม. ไม่หักโควตาซ้ำ
- Tests ต่อ **mock OpenRouter server** — ไม่ยิง key จริงใน CI

## Task List

### Phase 1: Adapter + Loop
- [ ] **Task 1: AiClient port + OpenRouter adapter** — stream API, system key จาก env, model ต่อ action จาก `config.toml`
  - Acceptance: integration ต่อ mock server — request/response แปลถูกที่ adapter, error mapping เป็น `AiErrorCode` ของ contract
  - Verify: `pnpm test -- tests/integration/ai-adapter` (M)
  - Files: `shared/ports/**`, `shared/adapters/OpenRouterClient/**`, `tests/integration/` (M)
  - Deps: dmp-lifecycle จบ
- [ ] **Task 2: ReAct loop + 4 tools** — `read_proposal` (extracted text), `search_proposal` (RAG — ไม่พร้อม → บอก agent ใช้ read_proposal), `read_draft`, `read_domain_profiles`
  - Acceptance: integration ต่อ mock — loop เรียก tools ถูกลำดับจนได้คำตอบ; tools ทั้งหมด read-only (test ยืนยันไม่มี write path)
  - Verify: `pnpm test -- tests/integration/ai-loop` (M)
  - Files: `src/features/ai/**` (M)
  - Deps: 1

### Phase 2: Streaming + เงื่อนไขธุรกิจ
- [ ] **Task 3: SSE endpoint** — `POST /dmps/{scope}/ai/{action}` + `POST /ai/analyze-proposal` (ผูก proposal ให้โครงการ)
  - Acceptance: e2e flow #3 เขียว — event ไล่ status/tool → delta → proposal → done; abort/error จบด้วย terminal event เสมอ
  - Verify: `pnpm test -- tests/e2e/ai-stream` (M)
  - Files: `src/features/ai/**` (M)
  - Deps: 2
- [ ] **Task 4: quota + idempotency** — pre-flight hint, reconcile ตอนจบ (cached 10%, นับ fail/abort), reset รายเดือน, `Idempotency-Key` + replay 24 ชม.
  - Acceptance: retry ด้วย key เดิมไม่หักโควตาซ้ำ (integration); โควตาเกิน → `429 quota_exceeded` พร้อม retryable; e2e quota hint
  - Verify: `pnpm test -- tests/integration/ai-quota` (M)
  - Files: `src/features/ai/**`, `src/features/users/**` (อ่านโควตา) (M)
  - Deps: 3
- [ ] **Task 5: thread persist + endpoints ที่เหลือ + ปิด 18 flows** — ai_thread_entries (user/event/assistant, decision stale), `GET/PUT thread`, clear/adopt, `GET /ai/quota`
  - Acceptance: e2e flow #17 เขียว — chat unscoped + scoped, clear/adopt, decisions จดถูก; **suite 18 flows ครบเขียว**
  - Verify: `pnpm test -- tests/e2e` ทั้งชุด (M)
  - Files: `src/features/ai/**`, `tests/e2e/ai-thread.ts` (M)
  - Deps: 4

### Checkpoint: v1 จบ
- [ ] e2e ครบ 18 flows เขียวต่อ Postgres จริง; ทุก run จบ terminal event; ไม่มี tool เขียน draft (มี test ยืนยัน)
- [ ] ตั้งค่า `ai.models` จริงใน `config.toml` + ทดลองต่อ OpenRouter จริงหนึ่ง run กับ human

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| SSE ผ่าน Caddy buffer ค้าง | Med | ทดสอบผ่าน Caddy ตั้งแต่ M4 ไม่ใช่ปล่อยไว้ deploy; `flush` ทุก event |
| OpenRouter schema เปลี่ยน/รุ่นตอบไม่ตรง format | Med | anti-corruption ที่ adapter + mock server fixture ตาม wire format จริง |
| โควตา reconcile เพี้ยนเมื่อ abort กลาง stream | Med | integration test ยิง abort จริงต่อ mock ทุกจุดตาย (mid-delta, mid-tool) |

## Open Questions
- รุ่น OpenRouter model ต่อ action — ตัดสินตอน checkpoint จบ M4 (ทดลองจริง)
