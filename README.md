# uni-backend 🎓

ระบบแบ็กเอนด์สำหรับแพลตฟอร์มจัดการโครงการวิชาการของมหาวิทยาลัย พร้อมการวิเคราะห์เอกสารด้วย AI

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)

---

## Overview

uni-backend เป็นเซิร์ฟเวอร์ API ที่พัฒนาด้วย NestJS (เฟรมเวิร์ก TypeScript บน Node.js) และฐานข้อมูล PostgreSQL ผ่าน Drizzle ORM ทำหน้าที่จัดการผู้ใช้ การยืนยันตัวตน โครงการ เอกสาร DMP งาน และการตรวจสอบ (review)

ระบบรองรับการอัปโหลดไฟล์ (.docx) แยกเป็นชิ้นย่อย (chunk) สร้าง embedding ด้วยโมเดล `Xenova/multilingual-e5-large` และค้นหาแบบ RAG (Retrieval-Augmented Generation) เพื่อประกอบการวิเคราะห์ข้อเสนอโครงการด้วย AI

```mermaid
graph LR
  A[ผู้ใช้ / Frontend] -->|ส่งคำขอ HTTP| B[NestJS API]
  B -->|จัดการข้อมูล| C[(PostgreSQL)]
  D[ไฟล์ .docx] -->|อัปโหลด| B
  B -->|สร้าง embedding| E[โมเดล e5-large]
  B -->|วิเคราะห์ด้วย AI| F[โมดูล AI]
```

---

## Features

- จัดการผู้ใช้และการยืนยันตัวตนด้วย JWT (access/refresh token) และ Argon2
- จัดการโครงการ เอกสาร DMP งาน (tasks) และกระบวนการตรวจสอบ
- อัปโหลดและประมวลผลไฟล์ .docx พร้อมแยกเนื้อหาเป็นชิ้นย่อย
- สร้าง embedding และค้นหาเชิงความหมายแบบ RAG รองรับหลายภาษา
- แจ้งเตือนผู้ใช้ผ่านอีเมล (ทดสอบด้วย MailPit ในสภาพแวดล้อมพัฒนา)
- สร้างเอกสาร OpenAPI อัตโนมัติจาก schema ที่นิยามด้วย Zod

---

## Project Structure

```text
backend/
├── src/                    # ซอร์สโค้ดหลักของแอปพลิเคชัน
│   ├── features/           # โมดูลตามฟีเจอร์ (users, auth, projects, files, dmps, reviews, tasks, notifications)
│   ├── shared/             # โค้ดที่ใช้ร่วมกัน (config, contracts, http, domain-engine, ports, adapters)
│   ├── database/           # schema, migrations ของ Drizzle ORM
│   ├── app.module.ts       # โมดูลรากของ NestJS
│   └── main.ts             # จุดเริ่มต้นของเซิร์ฟเวอร์
├── tests/                  # การทดสอบ (unit, integration, e2e, fixtures)
├── docs/                   # เอกสารสถาปัตยกรรม ข้อตัดสินใจ (ADRs) และสเปก
├── data/                   # พื้นที่จัดเก็บไฟล์ที่ผู้ใช้อัปโหลด
├── config.toml             # ค่าตั้งค่าที่ปรับได้ของระบบ (auth, files, AI, notifications)
├── docker-compose.dev.yml  # บริการสำหรับพัฒนา (PostgreSQL + MailPit)
└── package.json            # dependencies และสคริปต์ต่าง ๆ
```

---

## Prerequisites

**ซอฟต์แวร์:**

- Node.js 24 ขึ้นไป — รันไทม์ของเซิร์ฟเวอร์
- pnpm — ตัวจัดการแพ็กเกจ
- Docker และ Docker Compose — รัน PostgreSQL และ MailPit สำหรับพัฒนา

**ฮาร์ดแวร์:**

- RAM อย่างน้อย 8 GB (โมเดล embedding ทำงานในเครื่อง)
- พื้นที่ดิสก์ว่าง 4 GB สำหรับโมเดลและข้อมูลพัฒนา

**ข้อมูล:**

- ตั้งค่า `DATABASE_URL` (ค่าเริ่มต้น: `postgres://postgres:postgres@localhost:5432/uni`) และ `PORT` (ค่าเริ่มต้น 3000) ผ่านตัวแปรสภาพแวดล้อม

---

## Installation

1. โคลน repository และติดตั้ง dependencies

   ```bash
   # โคลน repository ลงเครื่อง
   git clone <repository-url>
   cd backend

   # ติดตั้ง dependencies ด้วย pnpm
   pnpm install
   ```

2. เตรียมฐานข้อมูล PostgreSQL — เลือกอย่างใดอย่างหนึ่ง

   **วิธีที่ 1: ใช้ Docker (แนะนำ)**

   ```bash
   # รัน PostgreSQL และ MailPit แบบ background (postgres/postgres, ฐานข้อมูล uni, พอร์ต 5432)
   docker compose -f docker-compose.dev.yml up -d
   ```

   **วิธีที่ 2: ติดตั้ง PostgreSQL ในเครื่องโดยตรง (ไม่ใช้ Docker)**

   ```bash
   # ติดตั้ง PostgreSQL (ตัวอย่างบน Arch Linux)
   sudo pacman -S postgresql

   # เริ่มบริการ PostgreSQL
   sudo systemctl enable --now postgresql

   # สร้างผู้ใช้และฐานข้อมูลให้ตรงกับค่าเริ่มต้นของโปรเจกต์
   sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres';"
   sudo -u postgres psql -c "CREATE DATABASE uni OWNER postgres;"

   # (ถ้าต้องการทดสอบอีเมล) ติดตั้ง MailPit แยกต่างหาก
   # TODO: confirm วิธีติดตั้ง MailPit บนระบบที่ไม่ใช้ Docker
   ```

   > [!NOTE]
   > หากใช้ผู้ใช้/รหัสผ่าน/พอร์ตไม่เหมือนค่าเริ่มต้น ให้ตั้ง `DATABASE_URL` ให้ตรงกับการตั้งค่าของคุณ

3. สร้างและรัน database migration

   ```bash
   # สร้างไฟล์ migration จาก Drizzle schema
   pnpm db:generate

   # รัน migration กับฐานข้อมูล
   pnpm db:migrate
   ```

---

## Development

1. เริ่มเซิร์ฟเวอร์ในโหมดพัฒนา

   ```bash
   # รันเซิร์ฟเวอร์ที่ http://localhost:3000 — .env โหลดอัตโนมัติ (tsx alias มี --env-file=.env)
   # แก้ค่า tunable ที่ config.toml
   pnpm dev
   ```

   เอกสาร API:

   - Swagger UI — http://localhost:3000/api-docs
   - OpenAPI JSON — http://localhost:3000/openapi-json

| ตัวแปรสภาพแวดล้อม | ค่าเริ่มต้น | คำอธิบาย |
| --- | --- | --- |
| `PORT` | `3000` | พอร์ตที่เซิร์ฟเวอร์รับการเชื่อมต่อ |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/uni` | connection string ของ PostgreSQL |

2. เติมข้อมูลตัวอย่าง (ถ้าต้องการ)

   ```bash
   # รัน seed script เพื่อเติมข้อมูลเริ่มต้น
   pnpm db:seed
   ```

### Tests

```bash
# รันชุดทดสอบทั้งหมดครั้งเดียว (unit, integration, e2e)
pnpm test

# รันชุดทดสอบแบบ watch mode สำหรับพัฒนา
pnpm test:watch
```

### Quality Checks

```bash
# ตรวจสอบ style และ import ด้วย ESLint
pnpm lint

# ตรวจสอบ type ด้วย TypeScript โดยไม่ emit ไฟล์
pnpm typecheck
```
