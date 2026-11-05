// Embedding port — ให้ ai module ใช้ต่อ; สลับ model/fallback ผ่าน config (ADR-0028)
export interface Embedding {
  /** ชื่อ model — เก็บลง file_chunks.embedding_model เพื่อตรวจ mismatch */
  readonly model: string;
  /** dims — 1024 ตาม e5-large-instruct */
  readonly dims: number;
  /** embed ชุด passage (chunk เอกสาร) — prefix ตามตระกูล e5 จัดการใน adapter */
  embedPassages(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export const EMBEDDING = Symbol("EMBEDDING");
