# ADR-0005: เขียน ReAct loop เอง ไม่ใช้ LangChain

## Status
Accepted

## Date
2026-10-19

## Context
ต้องควบคุม SSE event ที่ส่งหา frontend ให้ตรง contract เป๊ะ และ tools เป็นชุด read-only ของระบบเอง (ดู ADR-0018)

## Decision
เขียน ReAct loop เองบน `AiClient` port (OpenRouter, system key จาก env) — ไม่ใช้ LangChain หรือ framework agent สำเร็จรูป

## Consequences
- backend เป็น anti-corruption layer: wire format ของ provider (OpenAI-compatible) แปลงภายใน adapter ห้ามรั่วถึง FE
- เปลี่ยน provider ได้โดยไม่แตะ FE contract
