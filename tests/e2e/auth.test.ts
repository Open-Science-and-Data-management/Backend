// e2e flow #1 (sign-up/sign-in) + #15 (401 token_expired → refresh → retry) — supertest ต่อ Postgres จริง
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { createDb } from "@/database/client.js";
import { refreshTokens } from "@/database/schema/index.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

describe.skipIf(!dbReady)("auth e2e — flows #1 & #15", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    const { loadConfig } = await import("@/shared/config/index.js");
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await db.execute(sql`delete from refresh_tokens`);
    await db.execute(sql`delete from credentials where username in ('e2e-aran')`);
    await db.execute(sql`delete from users where username in ('e2e-aran')`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from refresh_tokens`);
    await db.execute(sql`delete from credentials where username in ('e2e-aran')`);
    await db.execute(sql`delete from users where username in ('e2e-aran')`);
    await app?.close();
    await pool.end();
  });

  const registration = {
    account_type: "institutional",
    name: "Aran",
    surname: "Saelim",
    email: "e2e-aran@example.edu",
    organization: "Uni",
    username: "e2e-aran",
    password: "passw0rd8",
    confirm_password: "passw0rd8",
  };

  it("flow #1 — sign-up creates researcher and signs in (session + refresh cookie)", async () => {
    // role ใน body ถูกปฏิเสธ
    const refused = await request(app.getHttpServer()).post("/users").send({ ...registration, role: "admin" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("role_not_allowed");

    const signUp = await request(app.getHttpServer()).post("/users").send(registration);
    expect(signUp.status).toBe(201);
    expect(signUp.body.user.role).toBe("researcher");

    const setCookie = signUp.headers["set-cookie"] as unknown as string[];
    expect(setCookie.join()).toContain("HttpOnly");
    expect(setCookie.join()).toContain("SameSite=Strict");

    // 409 ซ้ำ
    const dup = await request(app.getHttpServer()).post("/users").send(registration);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("username_taken");

    // sign-in แบบ case-insensitive
    const signIn = await request(app.getHttpServer()).post("/auth/sessions").send({ username: "E2E-ARAN", password: "passw0rd8" });
    expect(signIn.status).toBe(201);
    expect(signIn.body.object).toBe("session");
    expect(signIn.body.user.username).toBe("e2e-aran");

    const badCred = await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-aran", password: "wrong-pass1" });
    expect(badCred.status).toBe(401);
    expect(badCred.body.error.code).toBe("invalid_credentials");
  });

  it("flow #15 — me without token 401 not_signed_in; expired token → refresh → retry", async () => {
    const anon = await request(app.getHttpServer()).get("/users/me");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("not_signed_in");

    const signIn = await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-aran", password: "passw0rd8" });
    const token = signIn.body.access_token;

    // access token ยังใช้ได้
    const ok = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${token}`);
    expect(ok.status).toBe(200);

    // token ที่แก้ไข → token_expired (FE retry ด้วย refresh)
    const expired = await request(app.getHttpServer()).get("/users/me").set("Authorization", `Bearer ${token.slice(0, -4)}aaaa`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("token_expired");

    // refresh ด้วย cookie จาก sign-in → ได้ session ใหม่
    const refreshRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", signIn.headers["set-cookie"]);
    expect(refreshRes.status).toBe(201);
    expect(refreshRes.body.access_token).toBeTruthy();

    // retry ด้วย access token ใหม่
    const retry = await request(app.getHttpServer())
      .get("/users/me")
      .set("Authorization", `Bearer ${refreshRes.body.access_token}`);
    expect(retry.status).toBe(200);
    expect(retry.body.username).toBe("e2e-aran");

    // reuse ของ refresh token เดิม → revoke ทั้ง family
    const reuse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", signIn.headers["set-cookie"]);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("refresh_token_reused");

    const familyDead = await db.select().from(refreshTokens).where(sql`revoked_at is not null`);
    expect(familyDead.length).toBeGreaterThan(0);

    const afterReuse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", refreshRes.headers["set-cookie"]);
    expect(afterReuse.status).toBe(401);
  });
});
