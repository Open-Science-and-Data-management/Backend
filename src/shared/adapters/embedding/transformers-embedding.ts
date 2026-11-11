// TransformersEmbedding — transformers.js v3 บน onnxruntime-node; lazy-load ครั้งเดียว
// เลือกพฤติกรรมจาก `embeddingModel` ใน config:
//   e5 (ตระกูล *e5*)            → mean pooling + prefix "query: " / "passage: " (ADR-0028)
//   Qwen3-Embedding (ADR-0031)  → last-token pooling (causal LM) + instruction prefix เฉพาะ query,
//                                 passage ไม่มี prefix — dims 1024 (MRL 32–1024)
// tokenizer truncate ที่ `embeddingMaxTokens` (config) เสมอ — กัน activation seq² บนเครื่อง RAM น้อย
// (pipeline() ไม่ส่ง truncation ผ่าน — ทดลองยิง 80k tokens ผ่านไปหมด, จึงใช้ AutoTokenizer/AutoModel เอง)
// CUDA/fp16 ก่อน แล้ว sticky fallback CPU/q8; กราฟ Qwen3 ใช้ fused MultiHeadAttention ซึ่ง CUDA EP
// ต้องมี cuDNN (pacman -S cudnn) — ขาด = run-time error ไม่ใช่ load-time (ADR-0031)
import { Injectable } from "@nestjs/common";
import { config } from "@/shared/config/index.js";
import type { Embedding } from "@/shared/ports/embedding.js";
import type { PretrainedModelOptions } from "@huggingface/transformers";

// local minimal types — คง dynamic import ไว้เพราะ onnxruntime-node โหลด native เมื่อใช้ครั้งแรกเท่านั้น
type Tensor = { tolist: () => unknown; dims: number[] };
type Tokenizer = (
  texts: string[],
  options: { padding: true; truncation: true; max_length: number },
) => Promise<{ input_ids: Tensor; attention_mask: Tensor }>;
type Model = (inputs: {
  input_ids: Tensor;
  attention_mask: Tensor;
}) => Promise<{ last_hidden_state: Tensor }>;
type Session = { tokenizer: Tokenizer; model: Model };

const QUERY_INSTRUCTION =
  "Given a user question, retrieve relevant passages from a university research proposal document that answer the question";
// ขีดจำกัดจริงของตระกูล e5 — cap ใน config ไม่ควรเกินนี้เมื่อใช้ e5
const E5_MAX_TOKENS = 512;
const BATCH_SIZE = 8;

function isE5(model: string): boolean {
  return model.toLowerCase().includes("e5");
}

/** prefix ตามโมดล: e5 แยก query/passage, Qwen3 ติด instruction เฉพาะ query */
function prefixText(text: string, isQuery: boolean): string {
  return isE5(config().files.rag.embeddingModel)
    ? `${isQuery ? "query: " : "passage: "}${text}`
    : isQuery
      ? `Instruct: ${QUERY_INSTRUCTION}\nQuery:${text}`
      : text;
}

function effectiveMaxTokens(): number {
  const cap = config().files.rag.embeddingMaxTokens;
  return isE5(config().files.rag.embeddingModel) ? Math.min(cap, E5_MAX_TOKENS) : cap;
}

// เรียกผ่าน lazy import — onnxruntime-node โหลด native เมื่อใช้ครั้งแรกเท่านั้น
async function loadSession(device: "cuda" | "cpu"): Promise<Session> {
  const model = config().files.rag.embeddingModel;
  const { AutoTokenizer, AutoModel } = await import("@huggingface/transformers");
  const opts: PretrainedModelOptions =
    device === "cuda" ? { dtype: "fp16", device } : { dtype: "q8", device: "cpu" };
  const [tokenizer, net] = await Promise.all([
    AutoTokenizer.from_pretrained(model),
    AutoModel.from_pretrained(model, opts),
  ]);
  return { tokenizer: tokenizer as unknown as Tokenizer, model: net as unknown as Model };
}

/** mean-pool (e5) หรือ last-token pool (Qwen3) + L2 normalize จาก hidden state [B, L, H]
 *  mask มาจาก Tensor int64 → tolist คืน BigInt (1n) — ต้องแปลงก่อนเทียบ ไม่งั้นหา last token ไม่เจอ */
function poolToVectors(hidden: number[][][], mask: number[][] | bigint[][], lastToken: boolean): number[][] {
  return hidden.map((rows, b) => {
    const m = mask[b].map(Number);
    let vec: number[];
    if (lastToken) {
      vec = rows[m.lastIndexOf(1)] ?? rows[0];
    } else {
      const len = mask[b].length;
      vec = new Array<number>(rows[0].length).fill(0);
      let count = 0;
      for (let i = 0; i < len; i += 1) {
        if (m[i] !== 1) continue;
        count += 1;
        const row = rows[i];
        for (let j = 0; j < row.length; j += 1) vec[j] += row[j];
      }
      if (count > 0) for (let j = 0; j < vec.length; j += 1) vec[j] /= count;
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vec.map((v) => v / norm);
  });
}

@Injectable()
export class TransformersEmbedding implements Embedding {
  private session: Promise<Session> | undefined;
  private cudaActive = true;

  get model(): string {
    return config().files.rag.embeddingModel;
  }

  get dims(): number {
    return 1024;
  }

  private async embedBatch(session: Session, texts: string[]): Promise<number[][]> {
    const maxTokens = effectiveMaxTokens();
    const lastToken = !isE5(this.model);
    const inputs = await session.tokenizer(texts, { padding: true, truncation: true, max_length: maxTokens });
    const output = await session.model(inputs);
    return poolToVectors(
      output.last_hidden_state.tolist() as number[][][],
      inputs.attention_mask.tolist() as number[][],
      lastToken,
    );
  }

  private async run(texts: string[]): Promise<number[][]> {
    this.session ??= loadSession(this.cudaActive ? "cuda" : "cpu");
    const session = await this.session;
    try {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        out.push(...(await this.embedBatch(session, texts.slice(i, i + BATCH_SIZE))));
      }
      return out;
    } catch (error) {
      // cuDNN ขาดเป็นต้น → session สร้างผ่านแต่ run แตก — fallback ครั้งเดียว sticky ฝั่ง CPU
      if (!this.cudaActive) throw error;
      this.cudaActive = false;
      console.warn(`CUDA embedding failed at runtime — falling back to CPU/q8: ${String(error)}`);
      this.session = loadSession("cpu");
      return this.run(texts);
    }
  }

  embedPassages(texts: string[]): Promise<number[][]> {
    return this.run(texts.map((t) => prefixText(t, false)));
  }

  embedQuery(text: string): Promise<number[]> {
    return this.run([prefixText(text, true)]).then((r) => r[0]);
  }
}
