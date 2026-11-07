// TransformersEmbedding — transformers.js v3 บน onnxruntime-node; lazy-load pipeline ครั้งเดียว
// e5 ตระกูลต้องมี prefix "query: " / "passage: "; output mean-pool + L2 normalize (ADR-0028)
import { Injectable } from "@nestjs/common";
import { config } from "@/shared/config/index.js";
import type { Embedding } from "@/shared/ports/embedding.js";

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist: () => number[][] }>;

// เรียกผ่าน lazy import — onnxruntime-node โหลด native เมื่อใช้ครั้งแรกเท่านั้น
async function loadExtractor(model: string): Promise<Extractor> {
  const { pipeline } = await import("@huggingface/transformers");
  try {
    // CUDA/fp16 เร็วกว่า CPU/q8 ~20x (วัด 24 chunks: 605ms vs 12,372ms) — EP ต้องติดตั้งด้วย
    // ONNXRUNTIME_NODE_INSTALL=cuda12 (AGENTS.md); เครื่องไม่มี GPU/EP → ตกกลับ CPU
    return await pipeline("feature-extraction", model, { dtype: "fp16", device: "cuda" });
  } catch {
    console.warn("CUDA embedding unavailable — falling back to CPU/q8");
    return pipeline("feature-extraction", model, { dtype: "q8" });
  }
}

@Injectable()
export class TransformersEmbedding implements Embedding {
  private extractor: Promise<Extractor> | undefined;

  get model(): string {
    return config().files.rag.embeddingModel;
  }

  get dims(): number {
    return 1024;
  }

  private async run(texts: string[]): Promise<number[][]> {
    this.extractor ??= loadExtractor(this.model);
    const extractor = await this.extractor;
    // แบ่ง batch — one-shot ทั้งเอกสารจัดสรร activation ทั้งก้อนพร้อมกัน (48 chunks ≈ 2.5 GB RSS เด้ง)
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      const output = await extractor(batch, { pooling: "mean", normalize: true });
      out.push(...output.tolist());
    }
    return out;
  }

  embedPassages(texts: string[]): Promise<number[][]> {
    return this.run(texts.map((t) => `passage: ${t}`));
  }

  embedQuery(text: string): Promise<number[]> {
    return this.run([`query: ${text}`]).then((r) => r[0]);
  }
}
