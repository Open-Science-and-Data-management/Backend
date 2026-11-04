import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export function createDb(databaseUrl?: string) {
  const pool = new Pool({ connectionString: databaseUrl ?? process.env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
}
