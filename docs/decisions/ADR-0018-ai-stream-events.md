# ADR-0018: ชุด SSE events ของ AI + anti-corruption layer เหนือ OpenRouter

## Status
Accepted

## Date
2026-10-26

## Context
arc42 เดิมใช้ `status/tool/token/result` ขณะที่ frontend contract ใช้ `delta/proposal/done/error` — ไม่ตรงกันแม้แต่ตัวเดียว OpenRouter ส่งข้อมูลเป็น OpenAI-compatible SSE (`choices[].delta` chunks + `[DONE]`) ซึ่งไม่มี event ระดับ "tool/status" ให้อยู่แล้ว — backend ต้องแปลชุดหนึ่งเป็นอีกชุดหนึ่งเสมอ (ADR-0005)

## Decision
ชุด event ฝั่ง FE: `status`, `tool`, `delta`, `proposal`, จบด้วย `done` **หรือ** `error` ตัวเดียว
- `status`/`tool`: progress events ที่ BE สร้างเองจาก ReAct loop (upstream ไม่มี) — FE ใช้โชว์ activity แต่**ไม่บังคับ consume**
- `delta` ≈ `token` เดิม (chunk ข้อความ), `proposal` ≈ `result` เดิม (structured proposals)
- กฎ forward compatibility: FE ต้องเมิน event ที่ไม่รู้จัก

## Alternatives Considered
- ชุด arc42 เดิม: ไม่มี terminal event ชัด และ FE ต้องแกะ `token` ทั้งชุด — ปฏิเสธ
- ชุด FE เปล่า ๆ ไม่มี status/tool: เสีย agent transparency (UI เงียบ 3–10 วินาทีระหว่าง run — user คิดว่าค้าง) — ปฏิเสธ

## Consequences
- แก้ ai.md, arc42 8.1/8.6 และ flow #3 พร้อมกัน
- wire format ของ provider ห้ามรั่วถึง FE — แปลงภายใน `AiClient` adapter (อ้างอิงรูปร่าง chunk: OpenRouter streaming docs, `@openrouter/ai-sdk-provider`)
