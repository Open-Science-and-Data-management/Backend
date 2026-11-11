# projects

> โมดูลจัดการ "โครงการวิจัย": สร้าง ดูรายการ ดูรายละเอียด ดูสมาชิก และลบโครงการ พร้อมบังคับสิทธิ์การมองเห็นตามบทบาท

## Table of Contents

- [Overview](#overview)
- [Folder Structure](#folder-structure)
- [Business Rules](#business-rules)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Diagrams](#diagrams)

## Overview

- เป็นจุดเข้า HTTP สำหรับทุกอย่างที่เกี่ยวกับโครงการ และกำหนดว่าใครเห็นโครงการใด (researcher เห็นเฉพาะที่ตัวเองเป็นสมาชิก, committee/chief เห็นเฉพาะ institutional)
- ให้บริการ `assertVisible()` เป็นด่านตรวจสิทธิ์กลางให้ feature อื่น (เช่น files) ก่อนเข้าถึงทรัพยากรของโครงการ

**Out of scope:**

- การจัดการสมาชิก (เพิ่ม/ลบ/แก้บทบาท) — อ่านได้อย่างเดียวในโมดูลนี้
- การสร้าง/อนุมัติแผน DMP — เป็นหน้าที่ของ `features/dmps` และ `features/reviews`

## Folder Structure

```text
projects/
├── projects.controller.ts   # HTTP boundary เท่านั้น — รับ request แล้วส่งต่อ service
├── projects.service.ts      # use-case layer: กฎบทบาท, derive plan_mode, delete protection
├── projects.repository.ts   # query Drizzle ทั้งหมด + แปลง response เป็น snake_case
└── projects.module.ts       # ผูก controller + service, exports ProjectsService ให้ feature อื่น
```

## Business Rules

**สิทธิ์และการมองเห็น**

- เฉพาะ researcher เท่านั้นที่สร้างโครงการได้ — committee/chief/admin เรียก create แล้วโดนปฏิเสธ
- researcher ที่ไม่ได้เป็นสมาชิกของโครงการ ต้องเห็น 404 เหมือนโครงการไม่มีอยู่ เพื่อซ่อนการมีอยู่ของข้อมูลผู้อื่น
- admin ไม่มีสิทธิ์เข้าถึงโครงการใด ๆ (403) ในขณะที่ committee/chief เห็นได้เฉพาะโครงการ institutional
- ถ้า `plan_mode` filter ไม่ใช่ `institutional` committee ต้องได้รายการว่างเปล่า ห้ามปล่อยให้ query หลุดผ่าน

**ความถูกต้องของข้อมูล**

- `plan_mode` ต้อง derive จาก `account_type` ของผู้สร้างฝั่ง server เสมอ — ห้ามรับค่าจาก client เพราะผู้ใช้ citizen ห้ามเป็น institutional
- การตั้งชื่อโครงการว่าง (blank) ต้องถูกปฏิเสธทั้งกรณี schema fail และกรณีเป็น whitespace ล้วน

**การลบและข้อมูลอ้างอิง**

- ห้ามลบโครงการที่ยังมีแผน DMP เหลืออยู่แม้แต่แผนเดียว (รวม archived) — ต้องลบแผนออกก่อน จึงจะไม่ทำข้อมูลวิจัยหาย

**Pagination**

- `limit` ที่รับจาก client ต้อง cap ที่ 100 และค่าที่ไม่ใช่จำนวนเต็มบวกต้อง fallback เป็นค่า default เพื่อไม่ให้ request หนึ่งดึงตารางทั้งตาราง

## Usage

| Route | Purpose |
| --- | --- |
| `POST /projects` | สร้างโครงการใหม่ (researcher เท่านั้น) |
| `GET /projects` | รายการโครงการที่ผู้ใช้ปัจจุบันเห็น พร้อม `plan_mode`/`limit`/`starting_after` |
| `GET /projects/:projectId` | รายละเอียดโครงการหนึ่ง |
| `GET /projects/:projectId/members` | รายชื่อสมาชิกของโครงการ |
| `DELETE /projects/:projectId` | ลบโครงการ (ต้องไม่มีแผนเหลือ) |

Entry point สำหรับโมดูลอื่น: `ProjectsService.assertVisible(claims, projectId)` — ใช้เป็นด่านตรวจสิทธิ์ก่อนเข้าถึงทรัพยากรที่ผูกกับโครงการ

```ts
// ใน service ของ feature อื่น เช่น files.service.ts
await this.projects.assertVisible(user, projectId);
// ผ่าน = ผู้ใช้เห็นโครงการนี้ / ไม่ผ่าน = throw 404 หรือ 403 ตามบทบาท
```

- ต้อง migrate schema ก่อน (`pnpm db:migrate`) เพราะ query อ้างตาราง `projects`, `project_members`, `dmps`, `file_records`

## Dependencies

### Internal

| Module | Used for |
| --- | --- |
| `features/auth` | `CurrentUser` decorator และ type `AccessClaims` (role, sub) จาก global AuthGuard |
| `database` (DatabaseModule) | inject `Db` token สำหรับทุก query |
| `shared/contracts` | Zod schema `createProjectSchema` + `ListEnvelope` สำหรับ validate และจัดรูป response |
| `shared/http` | `ApiError` / `fieldInvalid` สำหรับ error envelope |

### External packages

| Package | Used for |
| --- | --- |
| `@nestjs/common` | decorator controller, DI และ HTTP method binding |
| `drizzle-orm` | สร้าง query / subquery นับ counts |
| `zod` | validate body ตอนสร้างโครงการ |

### External services

| Service | Used for | Impact |
| --- | --- | --- |
| PostgreSQL | เก็บตาราง `projects`, `project_members`, `dmps`, `file_records`, `users` | ล่ม → list/create/get โครงการไม่ได้ทั้งโมดูล |

## Diagrams

### Workflow — Project deletion guard

```mermaid
swimlane-beta LR
    subgraph svc [projects.service]
        A[DELETE /projects/:projectId]
        B{researcher เป็นสมาชิก?}
        D{มีแผน DMP เหลืออยู่?}
    end
    subgraph repo [projects.repository]
        C[hasPlans]
        F[remove — delete projects]
    end
    subgraph res [Response]
        E[404 project_not_found]
        G[409 project_has_plans]
        H[200 deleted]
    end
    A --> B
    B -->|ไม่ใช่สมาชิก| E
    B -->|ผ่าน| C
    C -->|นับได้ > 0| D
    C -->|0| F
    D -->|มี| G
    F --> H
```
