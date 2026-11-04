// Migration runner — dev CLI: `pnpm db:migrate` (up) / `pnpm db:seed`
// Migrations เป็น SQL files จาก drizzle-kit generate (src/database/migrations/)
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

const command = process.argv[2] ?? "up";

if (command !== "up" && command !== "seed") {
  console.error("usage: migrate.ts [up|seed]");
  process.exit(1);
}

const { pool, db } = createDb();
try {
  await migrate(db, { migrationsFolder: new URL("./migrations/", import.meta.url).pathname });
  console.log(`migrate ${command}: ok`);
} finally {
  await pool.end();
}
