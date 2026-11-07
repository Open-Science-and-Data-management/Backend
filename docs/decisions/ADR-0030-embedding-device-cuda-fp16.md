# ADR-0030: Embedding device = CUDA/fp16 เป็นหลัก ตกกลับ CPU/q8 + แบ่ง batch

## Status
Accepted — ปรับส่วน dtype/device ของ ADR-0028 (Decision 2); โมเดล, in-process (ADR-0025) และกลไก re-embed คงเดิมทั้งหมด

## Date
2026-11-08

## Context
ADR-0028 ระบุ quantized (q8) บน onnxruntime-node โดยไม่ระบุ device — ตกค้างเป็น CPU ทั้งที่ workstation/dev server มี NVIDIA GPU (RTX 5060 Ti) ผลคือ upload เอกสารจริงช้ามาก: วัด e5-large บน 9 MB docx (24 chunks × 512 tokens, AMD 7500F):

| config | embed 24 chunks |
|---|---|
| CPU/q8 | 12,372 ms (~0.5 วิ/chunk) |
| CUDA/q8 | 6,806 ms — int8 op บน GPU ช้ากว่า fp16 ~11x |
| **CUDA/fp16** | **605 ms (~25 ms/chunk, ~20x)** |

ประเด็นอื่นที่วัดพร้อมกัน:
- one-shot embed ทั้งเอกสารในครั้งเดียวจัดสรร activation ทั้ง batch พร้อมกัน — 48 chunks เด้ง RSS ~2.5 GB; เอกสารหลายร้อย chunks เสี่ยง OOM/swap → แบ่ง batch 16 (เร็วขึ้น ~10% บน CPU และจำกัด memory ไม่ว่า device)
- onnxruntime-node (npm) **ไม่แถม CUDA EP** — ต้องติดตั้งเพิ่มด้วย `ONNXRUNTIME_NODE_INSTALL=cuda12` (~272 MB จาก nuget); CI ไม่มี GPU

## Decision
1. **Device/dtype**: `pipeline(..., { dtype: "fp16", device: "cuda" })` เป็นเส้นทางหลัก (`src/shared/adapters/embedding/transformers-embedding.ts`)
2. **Fallback**: โหลด pipeline ไม่สำเร็จ (ไม่มี GPU / ไม่มี CUDA EP / driver เก่า) → ตกกลับ CPU/q8 พร้อม `console.warn` หนึ่งครั้งต่อ process — upload ต้องไม่ fail เพราะ device
3. **Batch**: แบ่ง input เป็น batch 16 ใน `run()` ทุก device — จำกัด allocation ไม่ผูกกับขนาดเอกสาร
4. ไม่แตะ ADR-0025 (embed ใน request path, 422-or-nothing) — ผู้ใช้เลือกยอมรับ latency ที่เหลือ; เกณฑ์ ~15 วิ ของ SPEC ยังใช้ได้เพราะ CUDA ทำให้ embed เอกสารใหญ่ ~นับวินาที

## Consequences
- ต้นทุนต่อเอกสารลดจาก ~0.5 วิ/chunk → ~25 ms/chunk (300 chunks: ~2.5 นาที → ~8 วิ); CUDA session init ~2 วิ ต่อ process หนึ่งครั้ง
- **Ops**: เครื่องที่มี GPU ต้องรัน `cd node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node && ONNXRUNTIME_NODE_INSTALL=cuda12 node ./script/install` หลัง `pnpm install` ทุกครั้ง (ดู AGENTS.md) — ไม่รันก็ยังทำงานผ่าน fallback แต่ช้าเดิม
- fp16 weights `Xenova/multilingual-e5-large` (~1.1 GB) โหลดจาก HF ครั้งแรกครั้งเดียว แล้ว cache บนดิสก์; VRAM ถือ model ~1.4 GB ตลอดอายุ process
- เครื่องไม่มี GPU เห็น error log ของ ORT (stderr) หนึ่งบรรทัดก่อน fallback — noise ที่ยอมรับได้
- CI คงใช้ fallback CPU/q8 ตามเดิม — ไม่เปลี่ยน pipeline, เวลา test ไม่เปลี่ยน
