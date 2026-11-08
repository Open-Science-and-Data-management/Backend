# meta

> เสิร์ฟ domain profiles และ field policy จาก in-memory registry ให้ frontend อ่าน — โมดูลนี้เป็นเมทาดาทาแบบอ่านอย่างเดียว เพื่อไม่ให้ FE ต้อง hardcode ค่าเหล่านี้เอง

## Table of Contents

- [Overview](#overview)
- [Folder Structure](#folder-structure)
- [Business Rules](#business-rules)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Diagrams](#diagrams)

## Overview

- เปิดข้อมูล 2 ชุดให้ frontend อ่าน:
  - domain profiles — โครงฟอร์มตาม research domain 8 แบบ
  - field policy — สิทธิ์ per-field ระหว่าง AI กับมนุษย์
- อ่านจาก in-memory registry ใน `shared/domain-profiles` ชุดเดียวกับที่ domain engine ใช้ตรวจ metadata — จึงไม่มีทางเหลื่อมล้ำกับฝั่ง backend
- ไม่มี repository และไม่เขียนฐานข้อมูล — ทุก response สร้างจาก object คงที่ในโค้ด
- **Out of scope:**
  - การเสิร์ฟ OpenAPI spec — `SwaggerModule` ใน `main.ts` ดูแลแล้ว (`/api-docs`, `/openapi-json`, ADR-0010)
  - การ validate metadata ที่ส่งเข้ามา — feature อื่นเรียก `validateDomainMetadata` จาก `shared/domain-profiles` โดยตรง โมดูลนี้ไม่รับ input ใด ๆ

## Folder Structure

```text
meta/
├── meta.module.ts      # wiring NestJS — ลงทะเบียน MetaController และ MetaService
├── meta.controller.ts  # GET /domain-profiles, GET /field-policy (ไม่มี @Public → ต้อง sign-in)
└── meta.service.ts     # serialize registry → response shape (ตัด schema ออก, คัดลอก policy)
```

หมายเหตุ: โฟลเดอร์นี้ไม่มี `*.repository.ts` — ไม่มีการเขียนข้อมูลและไม่รับ request body

## Business Rules

**สิทธิ์เข้าถึง**

- ทั้งสอง endpoint อยู่ใต้ AuthGuard ระดับ global (`APP_GUARD` ใน `app.module.ts`) — controller ไม่ประกาศ `@Public()`
- ผู้เรียกจึงต้องแนบ Bearer JWT ทุกครั้ง

**รูปแบบ response — domain profiles**

- คืน profile ทั้งหมดใน ListEnvelope ครั้งเดียว — ไม่มี pagination
  - `has_more` เป็น `false` เสมอ
  - `total_count` เท่ากับขนาด registry (8 profiles)
- registry มี 8 profile: `generic`, `life_sciences`, `health_medical`, `social_science`, `humanities`, `geospatial`, `physical_sciences`, `engineering_computing`
- ทุก profile ถูกตัด member `schema` ออกก่อนส่ง — `schema` คือตัว Zod schema ที่ derive จาก field list
- FE ได้เฉพาะ `key`, `label`, `description`, `fields` — ไม่ได้ logic validate

**รูปแบบ response — field policy**

- คืนสำเนาของทุก policy entry (`{ ...v }`) ไม่ใช่ reference เข้า registry — การแก้ค่าใน response ไม่กระทบค่าที่ engine ใช้จริง
- มี 3 กลุ่มตาม envelope `object: "field_policy"`: `dmp`, `dataset` และ `lists`
- `lists` จำกัดเฉพาะ 3 key คือ `dataset`, `contributor`, `cost`
- ทุก policy มี `permission` เป็น `"ai" | "human" | "locked"` เสมอ พร้อม flag เสริม `isMajorTrigger`, `editableBeforeApproval`, `noAiAssist`

## Usage

| Route | Purpose |
| --- | --- |
| `GET /domain-profiles` | รายการ domain profile ทั้งหมดในรูป ListEnvelope (ต้อง sign-in) |
| `GET /field-policy` | สิทธิ์ per-field ของ `dmp` / `dataset` / `lists` ในรูป field_policy envelope (ต้อง sign-in) |

```ts
const res = await fetch(`${BASE_URL}/field-policy`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
// { object: "field_policy", dmp: {...}, dataset: {...},
//   lists: { dataset: {...}, contributor: {...}, cost: {...} } }
```

- Prerequisites: `MetaModule` ถูกลงทะเบียนใน `app.module.ts` เรียบร้อยแล้ว (default)
- server ต้องตั้ง `JWT_SECRET` — ไม่มีค่านี้ `main.ts` exit ทันที
- เอกสาร OpenAPI ของทั้งระบบดูได้ที่ `/api-docs` และ `/openapi-json` (จัดเสิร์ฟโดย `main.ts` ไม่ได้อยู่ในโฟลเดอร์นี้)

## Dependencies

### Internal

| Module | Used in | Used for |
| --- | --- | --- |
| `shared/contracts/envelope` | `meta.service.ts` | `listOf()` สร้าง ListEnvelope มาตรฐาน (`object: "list"`, `has_more`, `total_count`) |
| `shared/domain-profiles/domain-profiles` | `meta.service.ts` | registry `domainProfiles` และ type `DomainProfile` เป็นต้นทางของ response |
| `shared/domain-profiles/field-policy` | `meta.service.ts` | `dmpFieldPolicy`, `datasetFieldPolicy`, `planListPolicy` และ type `FieldPolicy` |

### External packages

| Package | Used in | Used for |
| --- | --- | --- |
| `@nestjs/common` | ทุกไฟล์ .ts | `Module`, `Injectable`, `Controller`, `Get`, `Inject` สำหรับ wiring ของ NestJS |

### External services

N/A — โมดูลคืนข้อมูลจาก in-memory registry ล้วน ไม่ติดต่อฐานข้อมูลหรือบริการภายนอกใด จึงไม่มีจุดล่มภายนอก

## Diagrams

N/A — เป็น endpoint อ่านอย่างเดียวเพียง 2 เส้นทาง ที่ map ค่าจาก in-memory registry ส่งออกตรง ๆ ไม่มี branch, external service, state machine หรือ schema relation จึงไม่มี diagram ใดผ่านเกณฑ์ความจำเป็น
