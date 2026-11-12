# SCRIPT.md — Dev scripts

## `pnpm seed:ai` — เตรียมข้อมูลเดโมสำหรับทดสอบ AI API ด้วยมือ

Script ที่ไฟล์ `scripts/seed-ai.ts` — เตรียมชุดข้อมูลครบที่มนุษย์ต้องใช้ทดสอบ AI API (SPEC-ai)
ผ่าน HTTP ล้วน (ไม่แตะ DB ตรง) แล้วพิมพ์ token + ids + ตัวอย่าง `curl` ให้ copy ไปใช้ต่อได้ทันที

### ข้อกำหนดก่อนรัน

1. **Postgres + migration** — `docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate`
2. **Dev server รันอยู่** — `pnpm dev` ค้างไว้ (default `http://localhost:3000`, เปลี่ยนที่ `PORT`/
   ชี้ที่อื่นด้วย `BASE_URL=<url> pnpm seed:ai`)
3. **`OPENROUTER_KEY` ใน `.env`** — ขาดได้ แต่ AI action จะ error ตอนเรียกจริง (upload/embed
   ยังใช้ได้เพราะ embedding เป็นโมเดล ONNX ในเครื่อง)
4. **`ai.mock = false` ใน `config.toml`** (default แล้ว) — ถ้าเป็น `true` script จะเตือนว่าคำตอบ
   เป็น canned ไม่ใช่โมเดลจริง

### วิธีใช้

```bash
pnpm seed:ai
```

ตัวอย่าง output:

```text
✓ user: demo-researcher — สมัครใหม่
✓ project: [DEMO] ข้อเสนอโครงการ FF2569 — สร้างใหม่
✓ proposal: ข้อเสนอโครงการ FF2569.docx — upload + parse + embed เสร็จ (form_parsed=true)
✓ แผน: สร้างแผนเปล่าใหม่ (ไว้ทดสอบ scoped action ทันที)
✓ quota: ใช้ไป 2442 token / ไม่จำกัด (limit 0)
ids → user … | project … | file … | dmp …

─── ทดสอบด้วย curl (copy ได้เลย) ─────────────────────────────
export API=http://localhost:3000
export TOKEN='eyJ…'
...
```

### สิ่งที่ script สร้าง (upsert — รันซ้ำได้)

| ทรัพยากร | ค่าคงที่ | หมายเหตุ |
| --- | --- | --- |
| บัญชี researcher | `demo-researcher` / `demo-passw0rd` | sign-in ก่อน ถ้า 401 ค่อย register; โควตา `ai_token_limit = 0` = **ไม่จำกัด** ตามดีไซน์ |
| โครงการ | `[DEMO] ข้อเสนอโครงการ FF2569` | institutional |
| Proposal file | `docs/research/ข้อเสนอโครงการ FF2569.docx` | `purpose=proposal` — parse + chunk + embed เป็น **synchronous** จบใน response; มีไฟล์อยู่แล้ว → ข้าม (ไม่ embed ซ้ำ) |
| แผน (DMP) | แผนเปล่าใต้โครงการเดโม | ไว้ทดสอบ scoped action (`chat`/`suggest`/…) ได้ทันทีโดยไม่ต้องรัน `analyze-proposal` ก่อน |

โครงการ/ข้อมูลของคนอื่นไม่ถูกแตะ — จับจากชื่อคงที่ของชุดเดโมเท่านั้น

### Cheat sheet ท้าย output

พิมพ์ครบ 6 คำสั่งพร้อม id จริง: โควตา, `analyze-proposal` (SSE), scoped `chat` (SSE),
อ่าน ai-thread, ตัดสิน proposal (`PUT …/ai-thread/<entry_id>`), ซ่อนประวัติ (`clear`)
`TOKEN` อายุ 15 นาที — หมดแล้ว sign-in ใหม่ด้วยคำสั่งที่พิมพ์แนบมา

### หมายเหตุ / Troubleshooting

- **`เซิร์ฟเวอร์ … ไม่ตอบสนอง`** — ยังไม่ได้รัน `pnpm dev` (หรือ `BASE_URL` ไม่ตรง)
- **`form_parsed=false`** — เอกสารไม่ match ฟอร์ม FF2569 จึง fallback generic chunking; RAG ยัง
  ใช้ได้ แต่ chunk ไม่ผูก field ของฟอร์ม
- **ค่าใช้จ่าย OpenRouter** — ingest ครั้งแรกเรียก VLM caption รูปในเอกสาร (~2–3k token) และ
  `analyze-proposal` อ่าน proposal เต็มเล่มจึงแพงสุด; รันซ้ำเมื่อข้อมูลมีอยู่แล้วไม่เสียเพิ่ม
- **Embed รอบแรกช้า** — โมเดล ONNX (`Qwen3-Embedding-0.6B`) โหลดจาก HF ครั้งแรก; เครื่องมี
  NVIDIA GPU ต้องติดตั้ง CUDA EP ก่อน (ดูหัวข้อ GPU embedding ใน `AGENTS.md`) ไม่งั้น fallback CPU
- **`pnpm db:seed`** — เป็นแค่ alias ของ `db:migrate` (รัน migration อย่างเดียว) ไม่ได้เติมข้อมูล
