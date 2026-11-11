# meta

> โมดูลข้อมูลกำกับสำหรับ frontend: เปิด endpoint อ่านอย่างเดียว 2 ตัว ให้ FE ดึง domain profiles และ field policy จาก backend แทนการ hardcode

## Table of Contents

- [Overview](#overview)
- [Folder Structure](#folder-structure)
- [Business Rules](#business-rules)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Diagrams](#diagrams)

## Overview

- เปิด endpoint อ่านอย่างเดียว 2 ตัว ให้ frontend ดึง domain profiles (นิยามฟิลด์ metadata ของแต่ละ domain วิจัย) และ field policy (กฎการแก้ไขฟิลด์ของแผน) โดยไม่ต้อง hardcode ในโค้ด FE
- เสิร์ฟข้อมูลจาก registry ชุดเดียวกับที่ backend ใช้ตรวจข้อมูลจริง

**Out of scope:**

- ไม่แตะฐานข้อมูลและไม่มีการเขียนข้อมูลใด ๆ — อ่านจาก in-memory registry เท่านั้น
- การนำ registry ไปตรวจหรือบังคับใช้กับ draft — อยู่ที่ `shared/domain-engine` และ feature ที่ import ไปใช้

## Folder Structure

```text
meta/
├── meta.controller.ts   # รับ HTTP Request — ประกาศ 2 GET routes
├── meta.service.ts      # อ่าน registry ตัด schema ออก และจัดรูปแบบ response
└── meta.module.ts       # ผูก controller + service เข้ากับ AppModule
```

## Business Rules

**การเข้าถึง**

- ทั้งสอง endpoint ต้องยืนยันตัวตนด้วย Bearer JWT ทุกครั้ง — global AuthGuard ครอบทุก endpoint และโมดูลนี้ไม่ได้ประกาศ @Public

**ความถูกต้องของ registry**

- ต้องเสิร์ฟ registry ชุดเดียวกับที่ domain-engine ใช้ validate จริง ห้าม fork เป็นสำเนาแยก — เมื่อสองชุดเหลื่อมกัน FE จะยอมรับค่าที่ backend ปฏิเสธทันที

## Usage

| Route | Purpose |
| --- | --- |
| `GET /domain-profiles` | ดึง domain วิจัยทั้งหมด พร้อมนิยามฟิลด์ metadata ของแต่ละ domain |
| `GET /field-policy` | ดึงกฎการแก้ไขฟิลด์ของแผน (DMP, dataset และ list ภายในแผน) |

```bash
# ดึง domain profiles ทั้งหมด — ต้องแนบ Bearer token ทุกครั้ง
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/domain-profiles
```

- ลงชื่อเข้าใช้ผ่าน feature `auth` เพื่อรับ token ก่อนเรียก
- แอปต้องมี `JWT_SECRET` ใน `.env` — bootstrap จะ fail-fast ถ้าไม่มี

## Dependencies

### Internal

| Module | Used for |
| --- | --- |
| `shared/domain-profiles` | แหล่งข้อมูลจริงที่เสิร์ฟออกไป — profiles และ field policies |
| `shared/contracts/envelope` | จัดรูป response รายการเป็น list envelope ผ่าน `listOf` |

### External packages

| Package | Used for |
| --- | --- |
| `@nestjs/common` | ประกาศ controller, route และ DI |

### External services

N/A — ไม่ติดต่อ external service ใด ๆ (ไม่แตะฐานข้อมูล ไม่มี client ภายนอก)

## Diagrams

N/A — โฟลว์เป็น passthrough ตรง ๆ (controller → service → registry) ไม่มีการตัดสินใจหรือลำดับการเรียกที่ซับซ้อนพอจะวาด
