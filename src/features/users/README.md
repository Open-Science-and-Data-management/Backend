# users

> โมดูลบัญชีผู้ใช้: สมัครสมาชิก เช็ค username ว่าง และดู/แก้โปรไฟล์ของตัวเอง — พร้อมเป็นแหล่งเดียวของการ hash และตรวจรหัสผ่านของทั้งระบบ

## Table of Contents

- [Overview](#overview)
- [Folder Structure](#folder-structure)
- [Business Rules](#business-rules)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Diagrams](#diagrams)

## Overview

- จัดการบัญชีผู้ใช้ตอนเริ่มต้น: สมัครสมาชิก (สมัครแล้วได้ session ใช้งานได้ทันที) เช็คว่า username ว่างหรือไม่ และดู/แก้โปรไฟล์ของตัวเอง
- เป็นแหล่งเดียวที่ hash และตรวจรหัสผ่าน — โมดูลอื่น (เช่น `auth`) ต้องเรียกใช้ function จากโฟลเดอร์นี้

**Out of scope:**

- การ sign-in/ออกจากระบบ และการออก/ต่ออายุ token — อยู่ที่ `features/auth`
- การสร้างบัญชี role อื่นนอกจาก researcher — สถาบันเป็นผู้สร้างให้ ไม่ได้สมัครเอง

## Folder Structure

```text
users/
├── users.controller.ts   # ขอบเขต HTTP — routes ทั้งหมดของ /users (บาง ไม่มี logic)
├── users.service.ts      # use cases: ตรวจสิทธิ์สมัคร → validate → เช็คซ้ำ → hash → บันทึก
├── users.repository.ts   # Drizzle queries ตาราง users/credentials (plain functions รับ Db)
├── users.module.ts       # Nest module — imports DatabaseModule + AuthModule, export UsersService
└── argon2.ts             # hash/verify รหัสผ่าน argon2id (ค่า params จาก config.toml)
```

## Business Rules

**การสมัครสมาชิก**

- สมัครด้วยตัวเองได้เฉพาะ `researcher` — หาก body แนบ `role` มาด้วยถือเป็นการข้ามสิทธิ์ ปฏิเสธทันที (OC-1)

**ความซ้ำของข้อมูล**

- `username` และ `email` ห้ามซ้ำในระบบ — `email` ตรวจแบบ normalize (lower + trim) และบังคับซ้ำด้วย unique constraint ที่ฐานข้อมูล (`users_email_normalized_uq`) อีกชั้น

**รหัสผ่าน**

- เก็บรหัสผ่านเป็น argon2id hash ในตาราง `credentials` เท่านั้น — ห้ามมี plaintext ทุกกรณี
- object ผู้ใช้ที่ส่งออกทุกทาง (`toUserResponse`) ต้องไม่มี password hash หลุดออกไป

**การเข้าถึง**

- ดู/แก้โปรไฟล์ได้เฉพาะบัญชีตัวเอง — `GET`/`PATCH /users/me` อิงตัวตนจาก token ที่ sign-in แล้วเท่านั้น ไม่รับ username จาก request

## Usage

| Route | Purpose |
| --- | --- |
| `POST /users` | สมัครสมาชิก — ได้ session + refresh cookie ทันที |
| `GET /users/username-available` | เช็คว่า username ว่างหรือไม่ |
| `GET /users/me` | ดูโปรไฟล์ของผู้ใช้ที่ sign-in อยู่ |
| `PATCH /users/me` | แก้ไขโปรไฟล์ (คำนำหน้า ชื่อ อีเมล ข้อมูลติดต่อ) |

Entry point สำหรับโมดูลอื่น: `verifyPassword(hash, password)` และ repository functions (`findCredential`, `findByUsername`, `toUserResponse`) — `auth` ใช้ตรวจรหัสผ่านและค้นบัญชีตอน sign-in

```ts
import { findCredential } from "@/features/users/users.repository.js";
import { verifyPassword } from "@/features/users/argon2.js";

// ใน auth.service — ตรวจรหัสผ่านตอน sign-in
const cred = (await findCredential(db, username)).at(0);
const ok = cred !== undefined && (await verifyPassword(cred.passwordHash, password));
```

- ตาราง `users`/`credentials` ต้อง migrate แล้ว (`pnpm db:migrate`)
- config ต้องมีค่า `auth.argon2` ใน `config.toml` — โหลด fail-fast ตอนบูต

## Dependencies

### Internal

| Module | Used for |
| --- | --- |
| `features/auth` | ออก session + refresh cookie ทันทีหลังสมัคร (`issueSessionFor`, `setRefreshCookie`) |
| `shared/contracts` | Zod schema ตรวจ input — `registrationSchema`, `userProfileSchema` |
| `shared/http` | `ApiError`/`fieldInvalid` — โยน error เข้า error envelope กลาง |
| `shared/config` | ค่า argon2 (memoryCost/timeCost/parallelism) จาก `config.toml` |
| `database` | `DatabaseModule` ให้ connection (`DB`) และ schema ตาราง users/credentials |

### External packages

| Package | Used for |
| --- | --- |
| `argon2` | hash และตรวจรหัสผ่าน argon2id |
| `drizzle-orm` | query และ transaction กับ Postgres |
| `zod` | ตรวจความถูกต้องของ input (`safeParse`) |
| `@nestjs/common` | decorator controller/DI (`@Controller`, `@Inject`, `@Injectable`) |

### External services

| Service | Used for | Impact |
| --- | --- | --- |
| PostgreSQL | เก็บตาราง `users` และ `credentials` | ล่ม → สมัคร/ดู/แก้โปรไฟล์ไม่ได้ทั้งโมดูล |

## Diagrams

### Workflow — Registration

```mermaid
swimlane-beta LR
    subgraph ctrl [users.controller]
        A[POST /users]
    end
    subgraph svc [users.service]
        B{body แนบ role?}
        C{registrationSchema ผ่าน?}
        D{username/email ซ้ำ?}
        E[hashPassword]
    end
    subgraph repo [users.repository]
        F[transaction insert users + credentials]
    end
    subgraph auth [auth.service]
        G[issueSessionFor + set refresh cookie]
    end
    subgraph res [Response]
        H[400 role_not_allowed / field_invalid]
        I[409 username_taken / email_taken]
        J[session ใหม่]
    end
    A --> B
    B -->|แนบมา| H
    B -->|ไม่มี| C
    C -->|ไม่ผ่าน| H
    C -->|ผ่าน| D
    D -->|ซ้ำ| I
    D -->|ไม่ซ้ำ| E
    E -->|password hash| F
    F -->|user ใหม่| G
    G -->|session + Set-Cookie| J
```
