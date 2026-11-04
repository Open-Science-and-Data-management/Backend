# ADR-0027: Field policy canonical คือ port จาก frontend `field-policy.ts`

## Status
Accepted

## Date
2026-11-04

## Context
arc42 §8.3 มี sample major-path list แบบ JSON pointer แต่ FE มี registry จริงที่สมบูรณ์กว่า: `Frontend/src/config/field-policy.ts` (148 บริบทบรรทัด + dataset policies) — มี `permission: "ai"|"human"|"locked"`, `kind`, `isMajorTrigger`, `noAiAssist` ต่อฟิลด์ — พร้อม `field-registry.ts`, `plan-diff.ts`, `plan-mode.ts` กำหนดกฎ major/freeze ครบชุด การใช้ sample ใน arc42 แทน registry จริงจะทำให้ classify() ตัดสินไม่ตรงกับที่ FE แสดง "ต้องขออนุมัติใหม่"

## Decision
1. **Port `field-policy.ts` เข้า `shared/domain-profiles/` เป็น registry canonical** ของ field policy (major trigger, permission, locked) — `classify()` อ่านจาก registry นี้ และ `GET /field-policy` expose ชุดเดียวกัน
2. เทียบ registry กับ sample list เดิมของ arc42 §8.3 เมื่อ port แล้ว — delta ที่พบจดไว้ใน PR ของการ port ไม่แก้ arc42 เป็นราย path (ยึด registry เป็นหลัก, arc42 อ้าง registry)
3. ระบบ JSON pointer ชุดเดียวทั้งสาย diff → classify → error path (CON เดิมคงอยู่)

## Consequences
- Quality Goal 4 (contract consistency) อิงหลักเดียวกับ OC-2 — FE เป็นแหล่งอ้างอิงหลัก
- test fixtures ของ classify สร้างจาก registry จริง (test-first ของ engine ต้องรอ port เสร็จก่อน จึงวาง port เป็น slice ก่อน classify)
- การเพิ่ม/แก้ฟิลด์ major ในอนาคตแก้ registry ที่เดียว ทั้งสองฝั่งเปลี่ยนตาม
