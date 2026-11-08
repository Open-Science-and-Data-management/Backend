# meta

> โมดูลเมทาดาทาของระบบ: จัดเสิร์ฟ schema registry ให้ frontend ผ่าน `GET /domain-profiles` และ `GET /field-policy` แทนการให้ FE hardcode ค่าเหล่านี้เอง

## Overview

- จัดเสิร์ฟ "ระบบประกาศ schema" ฝั่ง frontend: domain profiles (โครงฟอร์มตาม research domain) และ field policy (สิทธิ์ per-field ระหว่าง AI กับมนุษย์)
- อ่านอย่างเดียว (read-only) จาก in-memory registry ใน `shared/domain-profiles` — ชุดข้อมูลเดียวกับที่ domain engine ใช้ตรวจ metadata จึงไม่มีทางเหลื่อมล้ำกับฝั่ง backend
- ไม่มี repository และไม่เขียนฐานข้อมูล — ทุก response สร้างจาก object คงที่ในโค้ด
- **ไม่ควรทำ / Out of scope:**
  - การเสิร์ฟ OpenAPI spec — SwaggerModule ใน `main.ts` ดูแลแล้ว (`/api-docs`, `/openapi-json`, ADR-0010)
  - การ validate metadata ที่ส่งเข้ามา — features อื่นเรียก `validateDomainMetadata` จาก `shared/domain-profiles` โดยตรง โมดูลนี้ไม่รับ input ใด ๆ

## Folder Structure

```text
meta/
├── meta.module.ts      # NestJS wiring — ลงทะเบียน MetaController และ MetaService
├── meta.controller.ts  # GET /domain-profiles, GET /field-policy (ไม่มี @Public → ต้อง sign-in)
└── meta.service.ts     # serialize registry → response shape (ตัด schema ออก, คัดลอก policy)
```

หมายเหตุ: โฟลเดอร์นี้ไม่มี `repositories/` และไม่มี `dto/` — ไม่มีการเขียนข้อมูลและไม่รับ request body

## Business Rules

- ทั้งสอง endpoint ถูกป้องกันโดย AuthGuard แบบ global (`APP_GUARD` ใน `app.module.ts`) — controller ไม่ประกาศ `@Public()` ผู้เรียกต้องแนบ Bearer JWT ทุกครั้ง ไม่เช่นนั้นได้ 401
- `GET /domain-profiles` คืน profile ทั้งหมดใน ListEnvelope ในครั้งเดียว: `has_more` เป็น `false` เสมอ และ `total_count` เท่ากับจำนวน profile ใน registry (ไม่มี pagination)
- ทุก profile ถูกตัด member `schema` (ตัว Zod schema ที่ derive จาก field list) ออกก่อนส่ง — FE ได้เฉพาะ `key`, `label`, `description`, `fields` ไม่ได้ logic validate
- `GET /field-policy` คืนสำเนาของ policy ทุก entry (`{ ...v }`) ไม่ใช่ reference ตรงเข้า registry — การแก้ค่าใน response ไม่กระทบค่าที่ engine ใช้จริง
- กลุ่ม policy มี 3 ชุดตาม response envelope `object: "field_policy"`: `dmp`, `dataset`, และ `lists` โดย `lists` จำกัดเฉพาะ 3 key คือ `dataset`, `contributor`, `cost`
- ทุก policy มี `permission` เป็น `"ai" | "human" | "locked"` เสมอ พร้อม flag เสริม `isMajorTrigger`, `editableBeforeApproval`, `noAiAssist`

## Usage

HTTP routes (ต้อง sign-in ก่อนเรียก — ไม่มี `@Public()`):

| Route | คำอธิบาย |
| --- | --- |
| `GET /domain-profiles` | รายการ domain profile ทั้งหมดในรูป ListEnvelope |
| `GET /field-policy` | สิทธิ์ per-field ของ `dmp` / `dataset` / `lists` ในรูป field_policy envelope |

```ts
const res = await fetch(`${BASE_URL}/field-policy`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
// { object: "field_policy", dmp: {...}, dataset: {...},
//   lists: { dataset: {...}, contributor: {...}, cost: {...} } }
```

- Prerequisites: `MetaModule` ลงทะเบียนใน `app.module.ts` เรียบร้อยแล้ว (default) และ server ต้องตั้ง `JWT_SECRET` — ไม่มีค่านี้ `main.ts` จะ exit ทันที
- เอกสาร OpenAPI ของทั้งระบบดูได้ที่ `/api-docs` และ `/openapi-json` (จัดเสิร์ฟโดย `main.ts` ไม่ได้อยู่ในโฟลเดอร์นี้)

## Dependencies

### Internal

- `shared/contracts/envelope` — ใช้ `listOf()` สร้าง ListEnvelope มาตรฐาน (`object: "list"`, `has_more`, `total_count`)
- `shared/domain-profiles/domain-profiles` — ใช้ registry `domainProfiles` และ type `DomainProfile` เป็นต้นทางของ response
- `shared/domain-profiles/field-policy` — ใช้ `dmpFieldPolicy`, `datasetFieldPolicy`, `planListPolicy` และ type `FieldPolicy`
- `app.module.ts` — ผู้บริโภค: ลงทะเบียน `MetaModule` เข้ากับแอป

### External packages

- `@nestjs/common` — `Module`, `Injectable`, `Controller`, `Get`, `Inject` สำหรับ wiring ของ NestJS

### External services

N/A — โมดูลนี้คืนข้อมูลจาก in-memory registry ล้วน ไม่ติดต่อฐานข้อมูลหรือบริการภายนอกใดจึงไม่มีจุดล่มภายนอก

## Diagrams

N/A — เป็น endpoint อ่านอย่างเดียวเพียง 2 เส้นทางที่ map ค่าจาก in-memory registry ส่งออกตรง ๆ ไม่มี branch, external service, state machine หรือ schema relation จึงไม่มี diagram ใดผ่านเกณฑ์ความจำเป็น
