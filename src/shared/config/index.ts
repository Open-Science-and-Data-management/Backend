// Config loader — จุดเดียวที่อ่าน config.toml (arc42 §8.7) + env
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parse } from "smol-toml";

const configSchema = z.object({
  app: z.object({ name: z.string(), debug: z.boolean() }),
  auth: z.object({
    accessTokenTtlMinutes: z.number().int().positive(),
    refreshTokenTtlDays: z.number().int().positive(),
    argon2: z.object({
      memoryCostKiB: z.number().int().positive(),
      timeCost: z.number().int().positive(),
      parallelism: z.number().int().positive(),
    }),
  }),
  files: z.object({
    maxFileSizeMb: z.number().positive(),
    storagePath: z.string(),
    rag: z.object({
      chunkTargetTokens: z.number().int().positive(),
      // cap ขนาด chunk ตาราง (tokens) — ตารางเกิน → แตก part i/n ตัดที่ขอบแถว (Rev 2, D7)
      chunkTableMaxTokens: z.number().int().positive(),
      chunkOverlapPercent: z.number().int().nonnegative(),
      topK: z.number().int().positive(),
      embeddingModel: z.string(),
      // cap ความยาว input ของ embedding (tokenizer-level) — กัน activation seq² บนเครื่อง RAM น้อย;
      // e5 ตัดที่ 512 เสมอ (ขีดจำกัดโมเดล), Qwen3 ใช้ค่านี้ตรง (ADR-0031)
      embeddingMaxTokens: z.number().int().positive().default(1024),
      formFastPath: z.boolean().default(true),
      // slug ของ VLM บน OpenRouter สำหรับ caption รูป (SPEC ff2569 Task 7) — ว่าง = ปิด caption
      vlmModel: z.string().default(""),
    }),
  }),
  ai: z.object({ mock: z.boolean().default(false), models: z.record(z.string()) }),
  notifications: z.object({}),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

export async function loadConfig(path = "config.toml"): Promise<Config> {
  if (cached) return cached;
  const raw = parse(await readFile(path, "utf8"));
  cached = configSchema.parse(raw);
  return cached;
}

/** Sync accessor for code after bootstrap; throws if loadConfig never ran. */
export function config(): Config {
  if (!cached) throw new Error("config not loaded — call loadConfig() at bootstrap");
  return cached;
}
