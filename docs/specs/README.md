# Specs

Spec คือ source of truth ของ "สร้างอะไร ทำไม และรู้ได้ยังไงว่าเสร็จ" — เขียนก่อนโค้ด, review โดย human, และอัปเดตเมื่อการตัดสินเปลี่ยน (แก้ spec ก่อนแก้โค้ดเสมอ)

## ไฟล์

| ไฟล์ | คืออะไร | Status |
| --- | --- | --- |
| [`SPEC.md`](SPEC.md) | โปรเจคโดยรวม + **capability map** (5 modules, dependency, build order) — index ของทุก spec | Approved 2026-11-04 |
| [`SPEC-foundation.md`](SPEC-foundation.md) | ฐานราก: tooling, contracts, DB constraints, domain-engine, registry (port จาก FE) | Approved 2026-11-04 |
| [`SPEC-accounts.md`](SPEC-accounts.md) | users + auth (argon2id, refresh rotation, guards) | Approved 2026-11-04 |
| [`SPEC-projects-files.md`](SPEC-projects-files.md) | projects + files + docx parse + RAG embed | Approved 2026-11-04 |
| [`SPEC-dmp-lifecycle.md`](SPEC-dmp-lifecycle.md) | วงจร DMP ครบ + tasks + reviews + notifications | Approved 2026-11-04 |
| [`SPEC-ai.md`](SPEC-ai.md) | ReAct loop + SSE + quota + idempotency | Approved 2026-11-04 |

## Build order (จาก capability map)

```
foundation → accounts → projects-files → dmp-lifecycle → ai
```

Dependency ทางเดียว ไม่มี cycle — module ลูกเรียกขอบเขต (interface) ที่ spec ของ module แม่นิยามไว้เท่านั้น

## Plans

แผน implement ราย module (tasks + acceptance + checkpoints) อยู่ที่ [`../plans/`](../plans/) — ชื่อไฟล์ตรงกับ module id: `plan-foundation.md`, `plan-accounts.md`, ฯลฯ

## กฎการอัปเดต

- แก้พฤติกรรม/ขอบเขต → แก้ spec ก่อน แล้ว implement
- ตัดสินใจสถาปัตยกรรมใหม่ระหว่างทำ → เพิ่ม ADR ที่ `docs/decisions/` แล้วอ้างจาก spec
- ทุก PR อ้าง section ของ spec ที่ implement
