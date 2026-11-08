// e2e flow #17 — AI thread + quota: chat unscoped + scoped persist, GET/PUT thread (decision + proposal_settled),
// clear (ซ่อนไม่ลบ — เก็บ event/accepted), adopt unscoped → dmp, GET /ai/quota (SPEC-ai, FE ai.md)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { credentials, dmps, projects, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { createDb } from "@/database/client.js";
import { loadConfig } from "@/shared/config/index.js";
import { AI_CLIENT, type AiClient, type AiCompleteParams, type AiStreamChunk } from "@/shared/ports/ai-client.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

const AUTHOR = {
  account_type: "institutional",
  name: "Aran",
  surname: "Saelim",
  email: "e2e-ait-a@example.edu",
  organization: "Uni",
  username: "e2e-ait-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const usernames = ["e2e-ait-a"];

class ScriptedClient implements AiClient {
  async *complete(_params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    yield { type: "delta", text: '{"proposal_id":"p-1","text":"ข้อเสนอ"}' };
    yield { type: "assistant_message", content: '{"proposal_id":"p-1","text":"ข้อเสนอ"}', toolCalls: [] };
    yield { type: "finish", finishReason: "stop", usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10, cachedTokens: 2 } };
  }
}

function parseSse(text: string): AiSseEvent[] {
  return text
    .split("\n\n")
    .filter((frame) => frame.startsWith("event: "))
    .map((frame) => JSON.parse(frame.slice(frame.indexOf("data: ") + 6)) as AiSseEvent);
}

async function cleanup() {
  const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
  if (ids.length === 0) return;
  const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
  if (projectIds.length > 0) await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
  await db.delete(projects).where(inArray(projects.createdBy, ids));
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

describe.skipIf(!dbReady)("ai thread + quota e2e — flow #17", () => {
  let app: INestApplication;
  let authorToken: string;
  let projectId: string;
  let dmpId: string;

  const chat = (scope: string, key: string) =>
    request(app.getHttpServer())
      .post(`/dmps/${scope}/ai/chat`)
      .set("Authorization", `Bearer ${authorToken}`)
      .set("Idempotency-Key", key)
      .send({ message: "ช่วยหน่อย" });

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(new ScriptedClient())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await cleanup();

    await request(app.getHttpServer()).post("/users").send(AUTHOR);
    authorToken = (
      await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-ait-a", password: "passw0rd8" })
    ).body.access_token;
    projectId = (
      await request(app.getHttpServer()).post("/projects").set("Authorization", `Bearer ${authorToken}`).send({ project_name: "AI thread e2e", plan_mode: "institutional" })
    ).body.project_id;
    dmpId = (
      await request(app.getHttpServer()).post("/dmps").set("Authorization", `Bearer ${authorToken}`).send({ project_id: projectId, title: "AI thread plan" })
    ).body.dmp_id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await pool.end();
  });

  it("chat unscoped → thread มี user/assistant/event; done มี entry_id", async () => {
    const res = await chat("unscoped", "t-key-1");
    expect(res.status).toBe(200);
    const done = parseSse(res.text).at(-1);
    expect(done?.event).toBe("done");
    if (done?.event === "done") expect(done.entry_id).toBeDefined();
    const thread = await request(app.getHttpServer()).get("/dmps/unscoped/ai-thread").set("Authorization", `Bearer ${authorToken}`);
    expect(thread.status).toBe(200);
    expect(thread.body.object).toBe("list");
    expect(thread.body.data.map((e: { kind: string }) => e.kind)).toEqual(["user", "assistant", "event"]);
  });

  it("chat scoped → แยกจาก unscoped ตาม scope", async () => {
    const res = await chat(dmpId, "t-key-2");
    expect(res.status).toBe(200);
    const scoped = await request(app.getHttpServer()).get(`/dmps/${dmpId}/ai-thread`).set("Authorization", `Bearer ${authorToken}`);
    expect(scoped.body.data.every((e: { dmp_id: string | null }) => e.dmp_id === dmpId)).toBe(true);
  });

  it("PUT ai-thread/:entry_id — จด decision; ตัดสินซ้ำ → 409 proposal_settled", async () => {
    const thread = await request(app.getHttpServer()).get(`/dmps/${dmpId}/ai-thread`).set("Authorization", `Bearer ${authorToken}`);
    const assistant = thread.body.data.find((e: { kind: string }) => e.kind === "assistant");
    const put = (status: string) =>
      request(app.getHttpServer())
        .put(`/dmps/${dmpId}/ai-thread/${assistant.entry_id}`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ proposal_id: "p-1", status });
    const ok = await put("accepted");
    expect(ok.status).toBe(200);
    expect(ok.body.decision).toBe("accepted");
    const again = await put("rejected");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("proposal_settled");
  });

  it("adopt — ย้าย thread unscoped เข้าแผน", async () => {
    const res = await request(app.getHttpServer())
      .post("/ai-thread/adopt")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ from: "unscoped", to: dmpId });
    expect(res.status).toBe(201);
    expect(res.body.moved).toBe(3);
    const unscoped = await request(app.getHttpServer()).get("/dmps/unscoped/ai-thread").set("Authorization", `Bearer ${authorToken}`);
    expect(unscoped.body.data).toHaveLength(0);
    const scoped = await request(app.getHttpServer()).get(`/dmps/${dmpId}/ai-thread`).set("Authorization", `Bearer ${authorToken}`);
    expect(scoped.body.data.length).toBe(6); // 3 จาก scoped + 3 ที่ย้ายมา
  });

  it("clear — ซ่อน user/assistant (ยกเว้น accepted) เก็บ event; hidden ไม่ถูกอ่านอีก", async () => {
    const res = await request(app.getHttpServer()).post(`/dmps/${dmpId}/ai-thread/clear`).set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(201);
    // 2 assistant: scoped (accepted) + adopted (pending) → hidden = user×2 + pending assistant = 3; kept = event×2 + accepted = 3
    expect(res.body.hidden).toBe(3);
    expect(res.body.kept).toBe(3);
    const scoped = await request(app.getHttpServer()).get(`/dmps/${dmpId}/ai-thread`).set("Authorization", `Bearer ${authorToken}`);
    expect(scoped.body.data.map((e: { kind: string }) => e.kind).sort()).toEqual(["assistant", "event", "event"]);
    expect(scoped.body.data.every((e: { kind: string }) => e.kind !== "user")).toBe(true);
  });

  it("GET /ai/quota — limit/used/remaining/resets_at", async () => {
    const res = await request(app.getHttpServer()).get("/ai/quota").set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("ai_quota");
    expect(res.body.limit).toBe(0);
    expect(res.body.used).toBeGreaterThan(0); // chat 2 runs ถูกหักแล้ว
    expect(new Date(res.body.resets_at).getTime()).toBeGreaterThan(Date.now());
  });
});
