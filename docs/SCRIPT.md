# SCRIPT.md — Dev scripts

## `pnpm seed:ai` — เตรียมข้อมูลเดโมสำหรับทดสอบ AI API ด้วยมือ

Script ที่ไฟล์ `scripts/seed-ai.ts` — เตรียมชุดข้อมูลครบที่มนุษย์ต้องใช้ทดสอบ AI API (SPEC-ai)
ผ่าน HTTP ล้วน (ไม่แตะ DB ตรง) แล้วพิมพ์ token + ids + ตัวอย่าง `curl` ให้ copy ไปใช้ต่อได้ทันที
ครอบคลุมเงื่อนไขของทุก action: แผนร่างไว้ทดสอบ `chat`/`suggest`/`regenerate-field` และแผนที่
คณะกรรมการอนุมัติแล้วไว้ทดสอบ `generate-tasks`/`checklist`

### ข้อกำหนดก่อนรัน

1. **Postgres + migration** — `docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate`
2. **Dev server รันอยู่** — `pnpm dev` ค้างไว้ (default `http://localhost:3000`, เปลี่ยนที่ `PORT`/
   ชี้ที่อื่นด้วย `BASE_URL=<url> pnpm seed:ai`)
3. **`OPENROUTER_KEY` ใน `.env`** — ขาดได้ แต่ AI action จะ error ตอนเรียกจริง (upload/embed
   ยังใช้ได้เพราะ embedding เป็นโมเดล ONNX ในเครื่อง)
4. **`ai.mock = false` ใน `config.toml`** (default แล้ว) — ถ้าเป็น `true` script จะเตือนว่าคำตอบ
   เป็น canned ไม่ใช่โมเดลจริง
5. **role ของ `demo-committee` (ทำครั้งแรกครั้งเดียว)** — สมัครเองได้เฉพาะ researcher (OC-1)
   จึงต้องเลื่อน role ใน DB ก่อน script จะ approve แผนได้; script จะ register บัญชีนี้ให้เองแล้ว
   พิมพ์คำสั่ง psql นี้ให้ copy:

   ```bash
   docker compose -f docker-compose.dev.yml exec postgres psql -U postgres -d uni \
     -c "update users set role='committee' where username='demo-committee'"
   ```

   ยังไม่ได้เลื่อน → แผนเดโมค้าง `pending` และ `generate-tasks`/`checklist` ยังโดน
   409 `plan_not_approved` (ส่วนอื่นของ script ใช้ได้ปกติ); เลื่อนแล้วรัน `pnpm seed:ai` ซ้ำ
   script approve ต่อให้เอง

### วิธีใช้

```bash
pnpm seed:ai
```

ตัวอย่าง output:

```text
✓ user: demo-researcher — สมัครใหม่
✓ user: demo-committee — สมัครใหม่ (role researcher — รอเลื่อนเป็น committee)
✓ project: [DEMO] ข้อเสนอโครงการ FF2569 — สร้างใหม่
✓ proposal: ข้อเสนอโครงการ FF2569.docx — upload + parse + embed เสร็จ (form_parsed=true)
✓ แผนร่าง: สร้างใหม่ (ไว้ทดสอบ chat/suggest/regenerate-field ทันที)
✓ แผนอนุมัติ: สร้างใหม่
✓ แผนอนุมัติ: เขียน draft ครบ + ส่งเข้าการพิจารณา (version 1 pending)
⚠ บัญชี demo-committee ยังไม่ใช่ committee — approve แผนให้ไม่ได้ (สมัครเองได้เฉพาะ researcher — OC-1)
✓ quota: ใช้ไป 2442 token / ไม่จำกัด (limit 0)
ids → user … | project … | file … | dmp(ร่าง) … | dmp(อนุมัติ=pending) …

─── ทดสอบด้วย curl (copy ได้เลย) ─────────────────────────────
export API=http://localhost:3000
export TOKEN='eyJ…'
...
```

รอบถัดไปหลังเลื่อน role แล้ว (`update users set role='committee' …`) แผน pending จะถูก
approve ต่อให้เอง: `✓ แผนอนุมัติ: committee approve version 1 แล้ว — พร้อมทดสอบ generate-tasks/checklist`

### สิ่งที่ script สร้าง (upsert — รันซ้ำได้)

| ทรัพยากร | ค่าคงที่ | หมายเหตุ |
| --- | --- | --- |
| บัญชี researcher | `demo-researcher` / `demo-passw0rd` | sign-in ก่อน ถ้า 401 ค่อย register; โควตา `ai_token_limit = 0` = **ไม่จำกัด** ตามดีไซน์ |
| บัญชีคณะกรรมการ | `demo-committee` / `demo-passw0rd` | register ให้เอง (role รอเลื่อน); ต้องเลื่อน `role='committee'` ใน DB ครั้งเดียวจึง approve ได้ (ดูข้อกำหนดข้อ 5) |
| โครงการ | `[DEMO] ข้อเสนอโครงการ FF2569` | institutional |
| Proposal file | `docs/research/ข้อเสนอโครงการ FF2569.docx` | `purpose=proposal` — parse + chunk + embed เป็น **synchronous** จบใน response; มีไฟล์อยู่แล้ว → ข้าม (ไม่ embed ซ้ำ) |
| แผนร่าง (DMP) | `[DEMO] แผนร่าง (chat/suggest/regenerate-field)` | แผนเปล่า — สถานะใดก็ทดสอบ scoped action ได้ (`chat`/`suggest`/`regenerate-field`) |
| แผนอนุมัติ (DMP) | `[DEMO] แผนอนุมัติแล้ว (generate-tasks/checklist)` | script เขียน draft ครบตาม `validateDraft` → submit → รอ committee approve; approved แล้วใช้ทดสอบ `generate-tasks`/`checklist` |

โครงการ/ข้อมูลของคนอื่นไม่ถูกแตะ — จับจากชื่อคงที่ของชุดเดโมเท่านั้น

### เงื่อนไขของ AI action (server บังคับก่อนเริ่ม stream)

| Action | เงื่อนไข | ไม่ผ่าน |
| --- | --- | --- |
| `chat` | action เดียวที่อยู่ใต้ `unscoped` ได้; ใต้ `dmp_id` ทุกสถานะ | — |
| `suggest` | ต้องใต้ `dmp_id` — แผนทุกสถานะ | `unscoped` → 400 `field_invalid` |
| `regenerate-field` | ต้องใต้ `dmp_id` — แผนทุกสถานะ (ช่วยแก้ working draft และ minor edits หลังแผนมีผล) | `unscoped` → 400 `field_invalid` |
| `generate-tasks` | ต้องใต้ `dmp_id` + แผนสถานะ `approved` (committee approve หรือ independent finalize) | draft/pending → 409 `plan_not_approved` |
| `checklist` | เช่นเดียวกับ `generate-tasks` | draft/pending → 409 `plan_not_approved` |

### Cheat sheet ท้าย output

พิมพ์ครบ 10 คำสั่งพร้อม id จริง + ตารางเงื่อนไขของแต่ละ action: โควตา, `analyze-proposal` (SSE),
`chat`/`suggest`/`regenerate-field` บนแผนร่าง (SSE), `generate-tasks`/`checklist` บนแผนอนุมัติ (SSE),
อ่าน ai-thread, ตัดสิน proposal (`PUT …/ai-thread/<entry_id>`), ซ่อนประวัติ (`clear`)
`TOKEN` อายุ 15 นาที — หมดแล้ว sign-in ใหม่ด้วยคำสั่งที่พิมพ์แนบมา

### หมายเหตุ / Troubleshooting

- **`เซิร์ฟเวอร์ … ไม่ตอบสนอง`** — ยังไม่ได้รัน `pnpm dev` (หรือ `BASE_URL` ไม่ตรง)
- **`409 plan_not_approved` ตอนเรียก `generate-tasks`/`checklist`** — แผนยังไม่ผ่านการอนุมัติ;
  ใช้ `dmp(อนุมัติ)` ที่ script เตรียมให้ และถ้ายัง `pending` ให้เลื่อน role `demo-committee`
  (ข้อกำหนดข้อ 5) แล้วรัน `pnpm seed:ai` ซ้ำเพื่อ approve ต่อ
- **`⚠ บัญชี demo-committee ยังไม่ใช่ committee`** — ยังไม่ได้รันคำสั่ง psql เลื่อน role; script
  ทำงานต่อได้แต่แผนค้าง pending
- **`form_parsed=false`** — เอกสารไม่ match ฟอร์ม FF2569 จึง fallback generic chunking; RAG ยัง
  ใช้ได้ แต่ chunk ไม่ผูก field ของฟอร์ม
- **ค่าใช้จ่าย OpenRouter** — ingest ครั้งแรกเรียก VLM caption รูปในเอกสาร (~2–3k token) และ
  `analyze-proposal` อ่าน proposal เต็มเล่มจึงแพงสุด; รันซ้ำเมื่อข้อมูลมีอยู่แล้วไม่เสียเพิ่ม
- **Embed รอบแรกช้า** — โมเดล ONNX (`Qwen3-Embedding-0.6B`) โหลดจาก HF ครั้งแรก; เครื่องมี
  NVIDIA GPU ต้องติดตั้ง CUDA EP ก่อน (ดูหัวข้อ GPU embedding ใน `AGENTS.md`) ไม่งั้น fallback CPU
- **`pnpm db:seed`** — เป็นแค่ alias ของ `db:migrate` (รัน migration อย่างเดียว) ไม่ได้เติมข้อมูล
