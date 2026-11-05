// argon2id (ADR-0029) — params จาก config.toml
import argon2 from "argon2";
import { config } from "@/shared/config/index.js";

export async function hashPassword(password: string): Promise<string> {
  const p = config().auth.argon2;
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: p.memoryCostKiB,
    timeCost: p.timeCost,
    parallelism: p.parallelism,
  });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
