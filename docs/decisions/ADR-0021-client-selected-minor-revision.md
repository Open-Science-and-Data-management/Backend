# ADR-0021: ผู้ใช้เลือกเองระหว่าง minor edits / revision; reject ของ revision ไม่ปัดแผนกลับ draft

## Status
Accepted

## Date
2026-10-26

## Context
arc42 เดิมให้ server classify ตอน save แล้ว route เอง (minor → fold ทันที, major → สร้างเวอร์ชัน) โดยผู้ใช้ไม่รู้ล่วงหน้าว่าจะโดนอะไร — frontend contract แยก endpoint ให้ผู้ใช้เลือก: `POST .../minor-edits` หรือ `POST .../revisions` (เรียกผิด → `409 edits_include_major`) นอกจากนี้ flow #6 รวบว่า return แล้ว `DMP.status = draft` เสมอ ซึ่งผิดสำหรับ revision ของแผนที่มีผลอยู่แล้ว และ flow #7 ใช้ finalize เฉพาะเวอร์ชันแรกซึ่งไม่ครอบ major edit รายถัดไปของแผน independent

## Decision
1. **Client เลือก endpoint** — เหตุผล UX: ผู้ใช้ต้องรู้ก่อนกดว่าการแก้จะ "มีผลทันที" หรือ "ต้องรอกรรมการ" — classify ยังเป็น pure function ฝั่ง server เพียงย้ายจุดเรียกมาไว้ตอนกด minor-edits/revisions
2. **Reject ของ revision**: แผนที่มี version in force อยู่แล้ว **ยัง `approved` ต่อ** (version in force เดิมทำงานต่อ, minor fixes ค้างอยู่กับมัน) — `status = draft` เฉพาะกรณี submit แรกที่ยังไม่เคยมีผล (แก้ flow #6/#9 แยกสองกรณี)
3. **Finalize ครอบทุก major edit ของแผน independent** — independent ไม่มีใครอนุมัติให้ จึงไม่มี "ส่ง revision รออนุมัติ" ให้ทำ ทางเดียวที่ major edit จะมีผลคือ finalize

## Consequences
- flow #6, #7, #8, #9 ของ sequence-diagrams ต้องแก้ให้ตรงสามข้อนี้
