# ทำไมกราฟภาระงานจึงเป็นรูปนั้น — คำอธิบาย ที่มา และแนวทางพัฒนาต่อ

อ้างอิงผลทดสอบภาระงานหัวข้อ 4.4 (backend commit 6d8c603, เครื่อง 2 vCPU / 8 GB ใช้ร่วมกับโปรแกรมสร้างภาระงานและ Postgres)

## สรุปสั้น

กราฟไม่ได้บอกว่า "ระบบช้า" แต่บอกว่า **ระบบมีขีดความสามารถ (capacity) ประมาณ 550–570 คำขอ/วินาที และเมื่อปริมาณงานที่ขอ (offered load) เกินจุดนั้น CPU เต็ม → คำขอต่อคิว → เวลารอพุ่งตามกฎคิวแบบไฮเปอร์โบลิก** ทุกตัวเลขในกราฟสอดคล้องกับโมเดล closed-loop queueing แบบเดียวกัน และระบบยังตอบทุกคำขอโดยไม่มี error (0.00%) เพราะอาการ "ช้าลง" คือคิวรอ ไม่ใช่ความล้มเหลว

## 1. อ่านกราฟเป็น 3 ช่วง

| ช่วง | ผู้ใช้พร้อมกัน | อาการ | สาเหตุเชิงกลไก |
|---|---|---|---|
| เชิงเส้น | 50–1,000 | throughput ≈ 0.5 req/s/คน, P95 ≤ 67 ms, error 0 | utilization ต่ำกว่า 60% ทุก resource ยังมี headroom |
| จุดหักศอก (knee) | ~1,250 | throughput อิ่มตัว ~557, P95 พุ่ง 67 → 765 ms (11 เท่า) | ปริมาณงานที่ขอแตะ capacity ~550–570 req/s, ρ→1 |
| คิวโต | 1,500–2,000 | throughput แบน ~536–551, P95 1,495 → 2,607 ms | คำขอใหม่เข้าคิวรอ CPU ต่อหน้า (front-of-queue) แทนที่จะเพิ่ม throughput |

## 2. พิสูจน์ด้วยตัวเลข (closed-loop model)

ผู้ใช้เสมือนแต่ละคนทำงานวนซ้ำ: ยิง 1 คำขอ → พักสุ่ม 1–3 วินาที (เฉลี่ย 2 s) แบบนี้เป็น closed-loop ผ่าน Little's Law:

```
throughput = จำนวนผู้ใช้ ÷ (เวลาพักเฉลี่ย + เวลาตอบสนองเฉลี่ย)
```

| ผู้ใช้ | คาดจากสูตร (ใช้ P50 เป็นเวลาตอบสนองเฉลี่ย) | ที่วัดได้ | ตรงกันไหม |
|---|---|---|---|
| 1,000 | 1000 ÷ (2 + 0.011) ≈ 497 | 497 | ✓ แท้ |
| 1,250 | 1250 ÷ (2 + 0.203) ≈ 567 | 557 | ✓ (คิวเริ่มก่อตัว) |
| 1,500 | 1500 ÷ (2 + 0.745) ≈ 546 | 536 | ✓ |
| 2,000 | 2000 ÷ (2 + 1.629) ≈ 551 | 551 | ✓ แท้ |

แปลกลับกัน: ที่ 2,000 คน ถ้าระบบยังเร็ว ควรได้ 2000 ÷ 2.02 ≈ 990 req/s แต่วัดได้แค่ 551 → เวลาตอบสนอง "ยืดตัวเอง" ขึ้นมาให้เศษส่วนติดเพดานพอดี **เพดาน ≈ 550–570 req/s จึงเป็นคุณสมบัติของฝั่งรับบริการ ไม่ใช่ของจำนวนผู้ใช้** และผลทดสอบแบบไม่พัก (no think time) ที่ทุกระดับได้ 550–600 req/s ยืนยันว่าเป็นขีดของเซิร์ฟเวอร์ ไม่ใช่ของ client

ทำไม P95 พุ่งเร็วกว่า P50: เวลารอในคิวแปรผันสูง เมื่อ utilization ρ เข้าใกล้ 1 ทั้งค่าเฉลี่ย (โตแบบ ~1/(1−ρ)) และส่วนเบี่ยงเบนโตพร้อมกัน หางกราฟ (P95/P99) จึงพุ่งกว่าค่ากลางหลายเท่า — 67 ms → 765 → 1,495 → 2,607 ms คือลวดลายมาตรฐานของระบบรอ CPU

## 3. เพดาน 550 req/s มาจากไหน — หลักฐานในโค้ด

งานต่อคำขอส่วนใหญ่เป็น CPU (parse/serialize JSON, validate, verify token) กระจายอยู่ 3 ผู้เล่นบนเครื่องเดียวกัน 2 แกน: โปรแกรมสร้างภาระงาน + backend + Postgres

### 3.1 backend เป็นโปรเซสเดียวหนึ่ง event loop

`src/main.ts` bootstrap ด้วย tsx กระบวนการเดียว ไม่มี cluster/pm2 — Node ใช้แกนเดียวจริงสำหรับ logic ทั้งหมด (JSON.stringify คำตอบ, Zod validate ทุก boundary ตาม CON-3, JWT verify ทุก request ใน AuthGuard) เมื่อ backend CPU แตะ ~84% ที่ 1,250+ คน event loop เริ่มต่อคิวงานทิ้งในตัวเอง → latency พุ่งแบบเดียวกับทฤษฎีคิว

### 3.2 payload ใหญ่และมีงานซ้ำที่ตัดได้ (จุดความร้อนจริงในโค้ด)

| ไฟล์:บรรทัด | ปัญหา | กระทบ endpoint หลักตามตาราง 4.38 |
|---|---|---|
| `src/features/dmps/dmps.service.ts:575` | `toResponse` **เรียก `listVersions` เสมอ** แม้ไม่ขอ `include=versions` | GET /dmps/{id} (20%), GET /dmps (12%) |
| `src/features/dmps/dmps.service.ts:137-139` | `list()` วน `await this.toResponse` ทีละแถว → N+1 แบบ **อนุกรม** (default limit 50!) | GET /dmps = 1 count + 1 list + ~50 queries ต่อคำขอ |
| `src/features/dmps/dmps.repository.ts:44-46` | `listVersions` `select *` ดึง `snapshot` (JSONB เต็มฉบับ) ทั้งที่ `toVersionResponse` (service:619) ไม่ใช้ snapshot | ย้ายข้อมูล PG→Node ฟรีไม่ได้ทุกคำขอ detail |
| `src/features/dmps/dmps.service.ts:605-607` | `readiness` คำนวณด้วย `validateDraft` (Zod ทั้งฉบับ) **ทุก request** ทั้งที่เปลี่ยนเฉพาะตอนเขียน draft | include=readiness ใน 20% ของ actions |
| `src/database/client.ts` | `new Pool({ connectionString })` ไม่ตั้ง `max` → pg default **10 connections** | คิวรอ connection ซ้อนบนคิวรอ CPU |
| `src/database/schema/index.ts` (D1/D2, ADR-0031) | CHECK `jsonb_path_exists` ตรวจโครงสร้าง JSONB ทุกครั้งที่เขียน draft/snapshot | PUT /dmps/{id}/draft (10%) — ต้นทุนฝั่ง Postgres CPU |

หมายเหตุ: `GET /notifications` และ `GET /tasks?dmp_id=` มี index ครอบอยู่แล้ว (`notifications_user_idx`, `tasks_dmp_idx`) — ไม่ใช่ปัญหา query plan แต่ยังจ่ายค่า parse/serialize/verify ต่อคำขอเหมือนกัน

### 3.3 ทำไมรุ่นใหม่ช้ากว่ารุ่นแรก (630 → 536 ที่ 1,500 คน)

สองปัจจัยที่วิธีทดสอบแยกออกจากกันไม่ได้ สอดคล้องกับขนาดผลที่วัด:

1. **ADR-0031 CHECK constraints** (D1 key-set + D2 FieldChange ด้วย `jsonb_path_exists` บน 6 คอลัมน์ JSONB) — ต้นทุน CPU ฝั่ง Postgres ทุกครั้งที่เขียน draft/version บวกเพิ่มโครงสร้างตรวจซ้ำที่ 3.2
2. **สัญญาณนาฬิกาลดจาก 2.30 → 2.10 GHz (−8.7%)** — ทุกงาน CPU-bound ช้าลงตามโดยตรง

ช่องว่างที่วัด (700→590 ไม่มีพัก, 630→536 ที่ 1,500 คน ≈ −15%) มีขนาดพอดีกับผลรวมสองปัจจัยนี้ ถ้าต้องการตัดแยก: รัน migration ลด CHECK บนเครื่อง clock เดิมแล้วเทียบ — แต่ไม่จำเป็นเพราะทิศทางแก้ (ข้อ 4) จัดการทั้งสองอย่างพร้อมกันอยู่แล้ว

### 3.4 ทำไม error 0.00%

ทุกชั้นยอมให้ "รอ" แทน "ปฏิเสธ": pg Pool ต่อคิวรอ connection ไม่มี connection/statement timeout ที่ตัด, Node event loop ต่อคิว callback, ไม่มี circuit breaker ทิ้งงาน และ queue ของ TCP backlog ยังรับ connection ได้ อาการจึงเป็น latency โตอย่างเดียว — ซึ่งดีต่อ correctness แต่แฝงความเสี่ยง: ถ้า load สูงกว่านี้ client timeout จะมาถึงก่อน และตอนนั้น error จะโผล่ทั้งชุด

## 4. แผนพัฒนาต่อ (เรียงตามผลต่อราคา)

### P0 — วัดให้เห็นก่อนแก้ (ครึ่งวัน)

- เปิด `pg_stat_statements` หา top query ตาม `total_exec_time`
- Nest interceptor จับ per-endpoint latency + นับ DB queries ต่อ request (จะเห็นตัวเลข N+1 ทันที)
- โปรด metric: `pool.waitingCount`, event-loop lag (`perf_hooks.monitorEventLoopDelay`)
- ตรวจสอบ: profile ด้วย `node --cpu-prof` หรือ clinic.js ที่ 1,000 VU — flame graph จะยืนยันว่าเวลาหมดที่ JSON serialize/Zod

### P1 — แก้จุดความร้อนในโค้ด (ไม่เปลี่ยนสถาปัตยกรรม)

| ลำดับ | งาน | แก้ที่ | ผลที่คาด |
|---|---|---|---|
| 1 | เอา N+1 ออกจาก `list()`: ไม่เรียก `listVersions` เมื่อไม่ขอ include และดึง versions ของทั้งหน้าด้วย `WHERE dmp_id = ANY($page_ids)` 1 query | `dmps.service.ts:137`, `:575` | GET /dmps จาก ~52 queries เหลือ 3 |
| 2 | `listVersions` select เฉพาะคอลัมน์ที่ `toVersionResponse` ใช้ (ตัด `snapshot`, `based_on_snapshot`) | `dmps.repository.ts:44` | ลดข้อมูล PG→Node ต่อคำขอ detail อย่างมาก |
| 3 | คำนวณ readiness ตอนเขียน (บันทึกผล `validateDraft` ลงคอลัมน์/cache ตอน PUT draft) แล้ว read ตอน GET | `dmps.service.ts:605` | ตัด Zod-validate ทั้งฉบับออกจาก 20% ของ actions |
| 4 | ตั้ง pool `max` ~20 + `statement_timeout` (ต่อ process) | `src/database/client.ts` | กันคิว connection ยาว, มี fail-fast เมื่อ DB ติด |
| 5 | รัน backend **หลาย process** (cluster/PM2 2 workers หลัง reverse proxy) — stateless JWT ทำได้ทันที | deployment | เพดาน backend คูณตามจำนวน core เพราะ event loop ต่อ process |

ข้อ 5 คือตัวเปลี่ยนกราฟให้เชิงเส้นยาวขึ้นชัดสุด: bottleneck ปัจจุบันคือ CPU แกนเดียวของโปรเซสเดียว ส่วน Postgres (CPU ~52-55%) ยังมีเผื่อ

### P2 — ลดงานที่ไม่ต้องทำซ้ำ

- **ETag/If-None-Match** บน GET อ่านหนัก (`/notifications` 20%, `/dmps` 12%) — ตอบ 304 ไม่ต้อง stringify payload
- การแจ้งเตือนย้ายไป SSE push (มีโครง SSE แล้วตาม ADR-0008) แทน polling `GET /notifications` เป็นระยะ — ตัด 20% ของ traffic ทิ้งได้บางส่วน
- ถ้าอนาคต list ต้อง count ถูกต้องทุกครั้ง พิจารณา cache `count(*)` ระยะสั้น (list มี `has_more` แยกอยู่แล้วตาม ADR-0015)

### P3 — สิ่งที่ไม่ควรเปลี่ยน

- **CHECK constraints ตาม ADR-0031 ไม่ควรลดทิ้งเพื่อเร็ว** — มันคือ Quality Goal (constraint หนักอยู่ที่ Postgres) และต้นทุนจริงอยู่ใน P1 ข้อ 1-3 อยู่แล้ว; ถ้าจะเก็บก็ทำหลัง P1 แล้วทดสอบซ้ำเทียบก่อนตัดสิน
- argon2id (ADR-0029) เจอเฉพาะ login ไม่อยู่ใน hot path ของตาราง 4.38 — ไม่เกี่ยวกับกราฟนี้

## 5. บริบทความพอเพียง — ต้องแก้จริงหรือไม่

QR01 กำหนด 50 concurrent users ระบบปัจจุบันรองรับ ~1,100 คนพร้อมกันที่ P95 < 100 ms คือเกิน spec **22 เท่า** และเพดาน absolute 550–600 req/s ยังไม่ทำให้ระบบล้ม (0% error) คำถามตัดสินใจจึงเป็น "แผนที่มี P95 < 1 s ที่ 1,250+ คนหรือไม่" ถ้าตอบไม่จำเป็น P1 ข้อ 1-2 + P0 คือทั้งหมดที่ควรทำ ส่วน P1 ข้อ 5/P2 จำไว้เป็น play-book เมื่อจำนวนผู้ใช้จริงโตเข้าใกล้ 2,000 คน

## แหล่งอ้างอิง

- ผลทดสอบ ตาราง 4.39–4.40, รูป 4.5 (หัวข้อ 4.4.3–4.4.4)
- ADR-0015 (ListEnvelope), ADR-0020 (PUT draft ทั้งก้อน), ADR-0029 (argon2id), ADR-0031 (JSONB integrity constraints)
- โค้ด: `src/main.ts`, `src/database/client.ts`, `src/database/schema/index.ts`, `src/features/dmps/dmps.service.ts`, `src/features/dmps/dmps.repository.ts`, `src/features/notifications/notifications.repository.ts`
