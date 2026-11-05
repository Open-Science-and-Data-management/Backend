// auth integration — sign-in, rotation, reuse detection ต่อ Postgres จริง (flow #1/#15 core)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { registrationSchema } from "@/shared/contracts/registration.js";
import * as usersRepo from "@/features/users/users.repository.js";
import { hashPassword } from "@/features/users/argon2.js";
import * as refresh from "@/features/auth/refresh.js";
import { hashToken } from "@/features/auth/refresh.js";

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
    account_type: "citizen",
    name: "Aran",
    surname: "Saelim",
    email: "auth-aran@example.edu",
    username: "auth-aran",
    password: "passw0rd8",
    confirm_password: "passw0rd8",
    ...overrides,
  });
}

describe.skipIf(!dbReady)("refresh rotation + reuse detection (integration)", () => {
  beforeAll(async () => {
    await loadConfig();
    await db.execute(sql`delete from refresh_tokens`);
    await db.execute(sql`delete from credentials where username = 'auth-aran'`);
    await db.execute(sql`delete from users where username = 'auth-aran'`);
    await usersRepo.register(db, form(), await hashPassword("passw0rd8"));
  });

  afterAll(async () => {
    await db.execute(sql`delete from refresh_tokens`);
    await db.execute(sql`delete from credentials where username = 'auth-aran'`);
    await db.execute(sql`delete from users where username = 'auth-aran'`);
    await pool.end();
  });

  it("issues a family; rotation keeps the family and revokes the old token", async () => {
    const user = (await usersRepo.findByUsername(db, "auth-aran")).at(0);
    if (user === undefined) throw new Error("seed user missing");
    const first = await refresh.issueRefreshToken(db, user.userId);

    const consumed = await refresh.consumeRefreshToken(db, first.token);
    if (consumed.kind !== "active") throw new Error(`expected active, got ${consumed.kind}`);

    const rotated = await refresh.rotateRefreshToken(db, consumed.row);
    expect(rotated.row.familyId).toBe(first.row.familyId);

    const oldAgain = await refresh.consumeRefreshToken(db, first.token);
    expect(oldAgain.kind).toBe("reuse");
  });

  it("reuse revokes the whole family", async () => {
    await db.execute(sql`delete from refresh_tokens`); // เริ่ม family สะอาด — เทสก่อนหน้าเหลือ token active ของ user เดียวกัน
    const user = (await usersRepo.findByUsername(db, "auth-aran")).at(0);
    if (user === undefined) throw new Error("seed user missing");
    const first = await refresh.issueRefreshToken(db, user.userId);
    const consumed = await refresh.consumeRefreshToken(db, first.token);
    if (consumed.kind !== "active") throw new Error(`expected active, got ${consumed.kind}`);
    const rotated = await refresh.rotateRefreshToken(db, consumed.row);

    await refresh.revokeFamily(db, first.row.familyId);

    const presented = await refresh.consumeRefreshToken(db, rotated.token);
    expect(presented.kind).toBe("reuse"); // revoked → reuse semantics: sign in again
    expect((await refresh.activeSessionCount(db, user.userId))).toBe(0);
  });

  it("unknown and expired tokens are invalid", async () => {
    expect((await refresh.consumeRefreshToken(db, "rt_nope")).kind).toBe("invalid");
    const expired = { ...refresh.mintRefreshToken() };
    await db.execute(sql`insert into refresh_tokens (user_id, token_hash, family_id, expires_at)
      values ((select user_id from users where username = 'auth-aran'), ${hashToken(expired.token)}, gen_random_uuid(), now() - interval '1 day')`);
    expect((await refresh.consumeRefreshToken(db, expired.token)).kind).toBe("invalid");
  });
});
