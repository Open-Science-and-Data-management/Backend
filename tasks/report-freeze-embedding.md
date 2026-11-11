# Report: เครื่องแค้ง (freeze) ตอนรัน embedding — สืบสวน 2569-11-12

> บริบท: Rev2 R6 — เปลี่ยน embedding model เป็น Qwen3-Embedding-0.6B (`onnx-community/Qwen3-Embedding-0.6B-ONNX`)

## Timeline (หลักฐานจาก kernel/systemd log)

| เวลา | เหตุการณ์ | หลักฐาน |
|---|---|---|
| 00:47–00:49 | รอบแรก `pnpm typecheck && test` — freeze ครั้งที่ 1 | `systemd[1176]: kitty-*.scope: 4G memory peak, 1.8G memory swap peak` (00:49:20) |
| 00:50:57 | thrash หลังรอบแรก | kernel: `do_swap_page / swapin_sync`, `35222 pages in swap cache`, Free swap 7.9G/15G |
| 01:03 | embedding test ผ่าน (27s) หลังแก้ runtime fallback | vitest: 1 passed — CPU/q8 sticky fallback ทำงาน |
| 01:04 | golden-qa (bg_2) เริ่ม embed fixture — freeze ครั้งที่ 2 | kernel: swap-in รอบใหม่ `18582 pages in swap cache` (01:04:52) |
| 01:06:30 | systemd-oomd เข้ามาสำรวจ | `Considered 70 cgroups for killing, top candidates were:` |
| ตอนนี้ | RAM ปกติ (11Gi free, ไม่มี process เหลือ) | `last reboot` ไม่มี reboot วันนี้ = freeze เป็นแบบ thrash-hang, กระบวนการตายแล้ว arena คืน |

## Root cause — ห่วงโซ่ 4 ข้อ

1. **Rev2 D7 เปลี่ยนตารางเป็น chunk เต็มตาราง** สูงสุด `chunkTableMaxTokens = 4096` tokens (เดิม row-chunks ~450 tokens ต่อชิ้น)
2. **โมเดลใหม่ไม่ truncate** — e5 เก่า (Xenova/multilingual-e5-large) ตัดที่ 512 tokens ตลอด; Qwen3 ctx 32k → ประมวลความยาวจริงทั้งก้อน
3. **Batch 16 + transformers.js pad ทั้ง batch เท่ากับข้อความยาวสุดใน batch** — batch ที่มีตารางยาว = 16 ข้อความ × 4096 tokens
4. **รันบน CPU EP** (ไม่มี `libcudnn.so` → CUDA แตกตอน run) — CPU attention materialize scores แบบ seq² ต่อ layer:
   16 × 4096 × 1024 × 4B × 28 layers ≈ **7.5 GB intermediates** (worst transient ~17 GB) บนเครื่อง 16 GB RAM + swap 15 GB → **swap thrash → UI ค้าง**

## ทำไม GPU ไม่ช่วย

- CUDA EP มีอยู่ (`libonnxruntime_providers_cuda.so` ใน `onnxruntime-node@1.30.0`), GPU ว่าง 15.8/16 GB
- แต่กราฟ Qwen3 ใช้ fused **MultiHeadAttention** ซึ่ง CUDA EP ต้องพึ่ง cuDNN — `dlopen failed for libcudnn.so`
- Error พุ่ง**ตอน run ไม่ใช่ตอน load** → try/catch ตอนสร้าง pipeline จับไม่ได้ (แก้แล้ว: sticky runtime fallback → CPU/q8)
- ติดตั้งได้ด้วย `sudo pacman -S --needed cudnn` (repo: cachyos-extra-znver4, v9.27.0.42) — **ต้องใช้รหัสผ่าน sudo ผมทำแทนไม่ได้**

## หลักฐานเพิ่มเติมที่ทดลองเอง

- `truncation: true, max_length: 512` **ผ่าน pipeline ไม่ได้** — ทดลองยิงข้อความยาว → `input_ids dims [1, 80000]` เข้าโมเดลเต็มๆ + `RotaryEmbedding: Updating cos_cache … not supported` (export นี้ bake rope cache ตายตัว)
- ระดับ **tokenizer** ตัดได้: `AutoTokenizer → {padding, truncation, max_length: 512}` → `dims [2, 512]` ✓
- สรุป: ต้องเขียน adapter ใช้ `AutoTokenizer` + `AutoModel` เอง (pool last-token จาก attention_mask) แทน `pipeline()`

## สิ่งที่แก้ไปแล้วใน repo

- `src/shared/adapters/embedding/transformers-embedding.ts`:
  - Qwen3 pooling (`last_token`) + instruction prefix เฉพาะ query, ลบ e5 prefix หมด (R6)
  - runtime CUDA failure → sticky CPU/q8 fallback
- `tests/integration/rag.test.ts`: เลิก pin `Xenova/multilingual-e5-large` อ่านจาก `config()` แทน
- `config.toml`: model = `onnx-community/Qwen3-Embedding-0.6B-ONNX` (repo Qdrant ไม่มี fp16 — FastEmbed-only)

## สิ่งที่ค้าง — ต้องทำต่อ

1. **เขียน adapter ใหม่ด้วย AutoTokenizer/AutoModel + cap ความยาว (1024 tokens) + batch ≤ 8** — บังคับ worst case ≈ 1 GB intermediates ปลอดภัยบน 16 GB (ค้างอยู่กลาง rewrite)
2. rerun: embedding.test → rag.test → golden-qa (วัด hit@5 ≥ 0.8 เทียบ 0.977 เดิม) → e2e + docs (R7)
3. ผู้ใช้รัน `sudo pacman -S --needed cudnn` ถ้าต้องการ GPU (เร็วขึ้นมาก, ไม่จำเป็นเพื่อความถูกต้อง)
