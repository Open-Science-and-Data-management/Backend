// users integration — registration ต่อ Postgres จริง; uniqueness ถูกบังคับทั้ง service และ DB
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { registrationSchema } from "@/shared/contracts/registration.js";
import * as repo from "@/features/users/users.repository.js";
import { hashPassword } from "@/features/users/argon2.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

function form(overrides: Record<string, unknown> = {}) {
  return registrationSchema.parse({
    account_type: "institutional",
    name: "Aran",
    surname: "Saelim",
    email: "aran@example.edu",
    organization: "Uni",
    username: "aran",
    password: "passw0rd8",
    confirm_password: "passw0rd8",
    ...overrides,
  });
}

describe.skipIf(!dbReady)("users registration (integration)", () => {
  beforeAll(async () => {
    await loadConfig();
    await db.execute(sql`delete from credentials where username in ('aran','aran2')`);
    await db.execute(sql`delete from users where username in ('aran','aran2')`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from credentials where username in ('aran','aran2')`);
    await db.execute(sql`delete from users where username in ('aran','aran2')`);
    await pool.end();
  });

  it("writes users + credentials rows in one transaction", async () => {
    const row = await repo.register(db, form(), await hashPassword("passw0rd8"));
    expect(row.role).toBe("researcher");
    expect(row.accountType).toBe("institutional");
    expect(row.email).toBe("aran@example.edu");
    const cred = await repo.findCredential(db, "aran");
    expect(cred).toHaveLength(1);
    expect(cred[0].passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(JSON.stringify(cred[0])).not.toContain("passw0rd8");
  });

  it("rejects duplicate username/email at the DB level too", async () => {
    await expect(repo.register(db, form({ email: "other@example.edu", username: "aran" }), "h")).rejects.toBeDefined();
    await expect(repo.register(db, form({ email: "ARAN@example.edu ", username: "aran2" }), "h")).rejects.toBeDefined();
  });

  it("maps institutional affiliation, drops it for citizen", async () => {
    const inst = await repo.register(db, form({ username: "aran2", email: "aran2@example.edu", department: "CS" }), "h");
    expect(inst.affiliation).toStrictEqual({ organization: "Uni", department: "CS" });
  });
});
