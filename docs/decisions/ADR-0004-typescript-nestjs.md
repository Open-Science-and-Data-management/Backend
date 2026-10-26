# ADR-0004: TypeScript + NestJS

## Status
Accepted

## Date
2026-10-19

## Context
ต้องแชร์ type กับ frontend (React 19 + TS) ผ่าน zod ชุดเดียว, SSE เป็นหัวใจของระบบ, workload ไม่มีงานหนักทาง CPU (TC-3)

## Decision
TypeScript + NestJS — ปฏิเสธ Go (ต้องนิยาม type สองครั้งสองฝั่ง, raw performance ไม่ใช่ตัวตัดสินที่ scale นี้) และ Python/FastAPI (เหตุผลเดียวกัน)

## Consequences
- ความเร็ว raw ต่ำกว่า Go เป็นสิ่งยอมรับ (R-4) — ถ้ากลายเป็นคอขวด จุดแก้คือ topology ไม่ใช่ภาษา
