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
      chunkOverlapPercent: z.number().int().nonnegative(),
      topK: z.number().int().positive(),
      embeddingModel: z.string(),
    }),
  }),
  ai: z.object({ models: z.record(z.string()) }),
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
