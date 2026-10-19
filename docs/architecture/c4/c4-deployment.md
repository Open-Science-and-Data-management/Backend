# C4 — Deployment Diagram

*แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 4.2, หมวด 7, หมวด 8.2, หมวด 8.7*

deploy เป็น **VM เดียวของสถาบัน + docker-compose** — instance เดียว, scale แนวตั้ง,
release = restart สั้น ๆ (ยอมรับได้ที่โหลด ~200/วัน, peak ~2,000)

```mermaid
C4Deployment
  title Deployment Diagram - Institution VM

  Deployment_Node(browser, "เบราว์เซอร์ผู้ใช้", "Chrome / Firefox") {
    Container_Ext(fe, "Frontend", "React 19 SPA", "static build — repo แยก")
  }

  Deployment_Node(vm, "VM ของสถาบัน", "docker-compose") {
    Deployment_Node(caddyC, "caddy", "container") {
      Container(caddy, "Caddy", "Caddy", "TLS + reverse proxy")
    }
    Deployment_Node(appC, "app", "container") {
      Container(app, "NestJS App", "Node 24 / pnpm", "1 process — REST + SSE")
    }
    Deployment_Node(pgC, "postgres", "container") {
      ContainerDb(pg, "PostgreSQL", "PostgreSQL + Drizzle", "ข้อมูลทั้งหมด")
    }
    Deployment_Node(devC, "mailpit", "container (dev เท่านั้น)") {
      Container(mailpit, "MailPit", "MailPit", "จับอีเมล dev")
    }

    Deployment_Node(dbVol, "db volume", "docker volume") {
      ContainerDb(dbData, "PGDATA", "volume", "ข้อมูล Postgres")
    }
    Deployment_Node(fileVol, "file volume", "docker volume / bind mount") {
      Container(files, "data/files", "volume", "ไฟล์อัปโหลด")
    }
  }

  System_Ext(openrouter, "OpenRouter", "AI API ภายนอก")
  System_Ext(smtp, "SMTP Provider", "production")

  Rel(fe, caddy, "เรียก API + SSE", "HTTPS")
  Rel(caddy, app, "proxy", "HTTP")
  Rel(app, pg, "SQL / Drizzle")
  Rel(pg, dbData, "เก็บข้อมูล")
  Rel(app, files, "เขียน/อ่านไฟล์", "ผ่าน FileStorage port")
  Rel(app, openrouter, "เรียกโมเดล AI", "HTTPS")
  Rel(app, smtp, "ส่งอีเมล reset (prod)", "SMTP")
  Rel(app, mailpit, "ส่งอีเมล (dev)", "SMTP")

  UpdateRelStyle(app, openrouter, $offsetY="-20")
```

## การดำเนินงาน (`docs/architecture/arc42.md` หมวด 7)

| เรื่อง | แนวทาง |
|---|---|
| Migration | SQL files (drizzle-kit) commit ลง repo — review/replay ได้ |
| Backup | `pg_dump` ตามรอบ + snapshot volume ไฟล์ — หน้าที่ ops ของสถาบัน (runbook) |
| Release | restart สั้น ๆ — ยอมรับได้ที่ scale นี้ |
| Config | `config.json` (ค่า tunable) + `.env` (credentials เท่านั้น: `DATABASE_URL`, `JWT_SECRET`, `OPENROUTER_KEY`, `SMTP_URL`) |
| TLS | Caddy จัดการ — app ไม่เห็น TLS |

## ขอบเขตที่ตัดสินไว้แล้ว

- **Scale ออก**: interface เตรียมไว้แล้ว — สลับ `DiskStorage`→`S3Storage`,
  `InProcessEventBus`→Redis pub/sub โดยไม่แตะ domain logic
- **Email verification**: defer — จดเป็นช่องที่รู้ตัว (`docs/architecture/arc42.md` หมวด 11)
