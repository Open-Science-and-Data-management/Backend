# ADR-0008: SSE auth ผ่าน fetch + ReadableStream (ไม่ใช้ EventSource)

## Status
Accepted

## Date
2026-10-19

## Context
EventSource แนบ Authorization header ไม่ได้ และ AI action เป็น POST ซึ่ง EventSource ใช้ไม่ได้อยู่แล้ว

## Decision
ฝั่ง frontend ใช้ fetch + ReadableStream ทุกจุดที่รับ SSE — token ส่งผ่าน header เท่านั้น ไม่หลุดเข้า access log

## Consequences
- ต้องเขียน parser ของ stream เองฝั่ง client (แลกกับ security)
