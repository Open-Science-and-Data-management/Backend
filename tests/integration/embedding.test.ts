// integration — embed บน model จริง (transformers.js): batch → vector dims ถูก, normalize แล้ว
// ใช้ model จาก config.toml (cache เครื่อง dev); opt-out ด้วย SKIP_EMBEDDING=1 เมื่อเครื่องไม่มี cache/net
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@/shared/config/index.js";
import { TransformersEmbedding } from "@/shared/adapters/embedding/transformers-embedding.js";

const skip = process.env.SKIP_EMBEDDING === "1";

describe.skipIf(skip)("embedding adapter (integration)", () => {
  beforeAll(async () => {
    await loadConfig();
  });

  afterAll(async () => {
    // onnxruntime ไม่ต้องปิดอะไร — process จบเอง
  });

  it("embed batch → 1024 dims, L2-normalized, ข้อความใกล้กัน similarity สูงกว่า", async () => {
    const embedding = new TransformersEmbedding();
    const passages = [
      "Sampling protocol for pollinator populations across three districts.",
      "Data storage plan uses encrypted university servers.",
    ];
    const vectors = await embedding.embedPassages(passages);
    expect(vectors).toHaveLength(2);
    for (const v of vectors) {
      expect(v).toHaveLength(embedding.dims);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 3);
    }

    const query = await embedding.embedQuery("how do we sample bees in the field?");
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    expect(dot(query, vectors[0])).toBeGreaterThan(dot(query, vectors[1]));
  }, 600_000); // โหลด model ครั้งแรกอาจช้า
});
