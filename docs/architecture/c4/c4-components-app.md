# C4 — Component Diagram (Level 3) — NestJS App และชั้น shared

*แหล่งอ้างอิง: `docs/architecture/arc42.md` หมวด 5.2–5.3*

ไดอะแกรมนี้เน้นสองอย่างที่เป็นกฎของระบบ: **domain engine เป็น pure function**
(ห้าม import `@nestjs/*`, ไม่แตะ DB/HTTP) และ **ทุก I/O ที่เปลี่ยน implementation ได้
ต้องผ่าน port** feature modules ที่เหลือ (`auth`, `users`, `projects`, `files`)
มีรูปแบบเดียวกัน (controller บาง → service → repository) จึงไม่วาดทั้งหมด

```mermaid
C4Component
  title Component Diagram - NestJS App: domain engine, ports and core services

  ContainerDb(postgres, "PostgreSQL", "Drizzle", "ตาราง relational + draft JSONB")
  System_Ext(openrouter, "OpenRouter", "AI API")
  System_Ext(smtp, "SMTP", "อีเมล reset")
  Container_Ext(sse, "SSE Clients", "Frontend ผ่าน Caddy")

  Container_Boundary(app, "NestJS App — 1 process") {
    Component(dmpsSvc, "DmpsService", "service", "draft, submit, versions, decisions, archive")
    Component(tasksSvc, "TasksService", "service", "lifecycle, evidence, preservation rules")
    Component(aiSvc, "AiService", "service", "ReAct loop + SSE, token budget")
    Component(notifSvc, "NotificationsService", "service", "8 ชนิด, rows สร้างใน tx ของเหตุการณ์")
    Component(exportsSvc, "ExportsService", "service", "projection madmp-v3 / rda-v1.3 ไม่เก็บ")

    Component(engine, "domain-engine", "pure functions", "diff, classify, foldMinor, carryEdits, rebaseWorkingCopy, validateDraft, task generator")
    Component(profiles, "domain-profiles", "code registry", "DOMAIN_PROFILE 8 โปรไฟล์ + field policy path-based")
    Component(contracts, "contracts", "zod", "draft schema, error envelope, SSE events — source of truth ของ API")
    Component(ports, "ports", "interface", "FileStorage, NotificationPublisher, AiClient, MailSender")
    Component(adapters, "adapters", "adapters", "DiskStorage, SsePublisher + InProcessEventBus, OpenRouterClient, SmtpMailer")
  }

  Rel(dmpsSvc, engine, "diff/classify ตอนบันทึก, carry/rebase ตอนตัดสิน")
  Rel(tasksSvc, engine, "generateTasks ตอนแผนมีผล")
  Rel(aiSvc, ports, "เรียกผ่าน AiClient")
  Rel(notifSvc, ports, "push ผ่าน NotificationPublisher")
  Rel(dmpsSvc, profiles, "validate ตาม profile + field policy")
  Rel(dmpsSvc, contracts, "validate request/response")
  Rel(ports, adapters, "implement โดย")
  Rel(adapters, postgres, "Drizzle")
  Rel(adapters, openrouter, "HTTPS")
  Rel(adapters, smtp, "SMTP")
  Rel(adapters, sse, "push event", "text/event-stream")
```

## กฎการเชื่อมข้าม feature (`docs/architecture/arc42.md` หมวด 5.3)

1. **Direct service inject เป็น default** — `DmpsService` inject `TasksService`,
   `ExportsService` inject `DmpsService` ได้ตรง ๆ (monolith instance เดียว)
2. **Port เฉพาะ I/O ที่เปลี่ยน implementation ได้** — notifications, ไฟล์, AI, email
3. **ไม่มี event bus ทั่วไป** — `InProcessEventBus` มีอยู่แค่ภายใน adapter ของ
   `NotificationPublisher` ธุรกรรม business (approve → สร้าง tasks → notifications)
   ยังเป็น transaction Drizzle เดียวใน service ผู้เรียก

## Domain engine (`docs/architecture/arc42.md` หมวด 5.3)

| ฟังก์ชัน | หน้าที่ | ใช้ใน flow |
|---|---|---|
| `diffDraft(draft, baseSnapshot)` | JSON tree diff ตาม entity id → `FieldChange[]` | #4, #8, #9, #10 |
| `classify(changes, fieldPolicy)` | มี major ฟิลด์เดียว = ทั้งชุด major | #5, #8, #9 |
| `foldMinor(snapshot, changes)` | บันทึกลง version in force + จด `minor_edits` | #8, #9 |
| `carryEdits(basedOn, currentInForce, newSnapshot)` | replay ตาม entity id → carried + dropped | #9 |
| `rebaseWorkingCopy(draft, newSnapshot)` | เหลือเฉพาะการแก้ที่ยังไม่มีใครบันทึก/ส่ง | #9 |
| `validateDraft(draft, profiles)` | กฎ หมวด 3.3 → `errors: [{path, code, message}]` (JSON pointer) | #4, #5, #7 |

flow # = เลข flow ใน `docs/architecture/sequence-diagrams.md`
