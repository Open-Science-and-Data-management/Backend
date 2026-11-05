import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // cap 3 workers — Postgres/compose บนเครื่องนี้แคชเมื่อรัน node พร้อมกันเยอะ
    maxWorkers: 3,
    minWorkers: 1,
  },
});
