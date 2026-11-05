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
  const extractor = await pipeline("feature-extraction", model, { dtype: "q8" });
  return extractor;
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
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  }

  embedPassages(texts: string[]): Promise<number[][]> {
    return this.run(texts.map((t) => `passage: ${t}`));
  }

  embedQuery(text: string): Promise<number[]> {
    return this.run([`query: ${text}`]).then((r) => r[0]);
  }
}
