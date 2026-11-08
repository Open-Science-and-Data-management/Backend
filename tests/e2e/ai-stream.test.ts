// e2e flow #3 — AI action SSE: POST /dmps/{scope}/ai/{action} — event ไล่ status/tool → delta → proposal → done;
// abort/error จบด้วย terminal event เสมอ; author-only; quota_exceeded ก่อนสตรีม (SPEC-ai, ADR-0018)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
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
  email: "e2e-ai-a@example.edu",
  organization: "Uni",
  username: "e2e-ai-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const OTHER = { ...AUTHOR, email: "e2e-ai-o@example.edu", username: "e2e-ai-o" };
const COMMITTEE = { ...AUTHOR, email: "e2e-ai-m@example.edu", username: "e2e-ai-m" };

const usernames = ["e2e-ai-a", "e2e-ai-o", "e2e-ai-m"];

class ScriptedClient implements AiClient {
  calls = 0;
  constructor(private script: AiStreamChunk[][]) {}

  async *complete(_params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    const i = this.calls;
    this.calls += 1;
    for (const chunk of this.script[i] ?? []) yield chunk;
  }
}

/** 1 call = 1 round ของ loop — รอบ tool (finish_reason tool_calls, ไม่มี prose ก่อน tool) */
function toolRound(): AiStreamChunk[] {
  return [
    { type: "assistant_message", content: null, toolCalls: [{ id: "c1", name: "read_draft", argumentsJson: "{}" }] },
    { type: "finish", finishReason: "tool_calls", usage: null },
  ];
}

/** 1 call = รอบสุดท้าย — คำตอบ JSON proposal */
function proposalRound(): AiStreamChunk[] {
  return [
    { type: "delta", text: '{"path":"description","text":"ใหม่"}' },
    { type: "assistant_message", content: '{"path":"description","text":"ใหม่"}', toolCalls: [] },
    { type: "finish", finishReason: "stop", usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18, cachedTokens: 0 } },
  ];
}

/** 1 call = คำตอบข้อความธรรมดา (ไม่มี proposal) */
function textRound(text = "ตอบตรง ๆ"): AiStreamChunk[] {
  return [
    { type: "delta", text },
    { type: "assistant_message", content: text, toolCalls: [] },
    { type: "finish", finishReason: "stop", usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7, cachedTokens: 0 } },
  ];
}

function errorRound(): AiStreamChunk[] {
  return [{ type: "finish", finishReason: "error", usage: null }];
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

describe.skipIf(!dbReady)("ai stream e2e — flow #3", () => {
  let app: INestApplication;
  let authorToken: string;
  let otherToken: string;
  let committeeToken: string;
  let projectId: string;
  let dmpId: string;

  const post = (token: string, path: string, body: object, key = "k-1") =>
    request(app.getHttpServer())
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(body);

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(new ScriptedClient([toolRound(), proposalRound(), textRound(), errorRound()]))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await cleanup();

    await request(app.getHttpServer()).post("/users").send(AUTHOR);
    await request(app.getHttpServer()).post("/users").send(OTHER);
    await request(app.getHttpServer()).post("/users").send(COMMITTEE);
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-ai-m"));
    const signin = async (username: string) =>
      (await request(app.getHttpServer()).post("/auth/sessions").send({ username, password: "passw0rd8" })).body.access_token as string;
    authorToken = await signin("e2e-ai-a");
    otherToken = await signin("e2e-ai-o");
    committeeToken = await signin("e2e-ai-m");

    projectId = (
      await request(app.getHttpServer()).post("/projects").set("Authorization", `Bearer ${authorToken}`).send({ project_name: "AI e2e", plan_mode: "institutional" })
    ).body.project_id;
    dmpId = (
      await request(app.getHttpServer()).post("/dmps").set("Authorization", `Bearer ${authorToken}`).send({ project_id: projectId, title: "AI e2e plan" })
    ).body.dmp_id;
    // โควตาใช้ได้ (limit default 0 = ไม่จำกัด)
    const uid = (await db.select({ id: users.userId }).from(users).where(eq(users.username, "e2e-ai-a")).limit(1)).at(0)?.id;
    if (uid === undefined) throw new Error("author user missing");
    await db.update(users).set({ aiTokenLimit: 0, aiTokenUsed: 0 }).where(eq(users.userId, uid));
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await pool.end();
  });

  it("status → tool → delta → proposal → done ครบลำดับ + done มี entry_id/dmp_id/usage", async () => {
    const res = await post(authorToken, `/dmps/${dmpId}/ai/chat`, { message: "ช่วยแก้ description" }, "flow-key-1");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(res.text);
    expect(events.map((e) => e.event)).toEqual(["status", "tool", "delta", "proposal", "done"]);
    expect(events.some((e) => e.event === "tool" && e.name === "read_draft")).toBe(true);
    const done = events.at(-1);
    if (done !== undefined && done.event === "done") {
      expect(done.entry_id).toBeDefined();
      expect(done.dmp_id).toBe(dmpId);
      expect(done.usage).toEqual({ input_tokens: 10, output_tokens: 8, cached_input_tokens: 0, total_tokens: 18 });
    }
    // run จบ terminal เสมอ + thread persist: user + assistant + event
    const thread = await request(app.getHttpServer()).get(`/dmps/${dmpId}/ai-thread`).set("Authorization", `Bearer ${authorToken}`);
    expect(thread.status).toBe(200);
    expect(thread.body.data.map((e: { kind: string }) => e.kind)).toEqual(["user", "assistant", "event"]);
  });

  it("chat unscoped ทำงานได้", async () => {
    const res = await post(authorToken, `/dmps/unscoped/ai/chat`, { message: "แนะนำการเริ่มแผน" }, "flow-key-2");
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.at(-1)?.event).toBe("done");
  });

  it("ไม่มี Idempotency-Key → 400 field_invalid ก่อนสตรีม", async () => {
    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/ai/chat`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ message: "hi" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("field_invalid");
    expect(res.body.error.param).toBe("/idempotency-key");
  });

  it("provider error กลาง run → stream จบด้วย error terminal เสมอ", async () => {
    const res = await post(authorToken, `/dmps/${dmpId}/ai/chat`, { message: "ทดสอบ error" }, "flow-key-3");
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.at(-1)?.event).toBe("error");
  });

  it("ไม่ใช่เจ้าของ/ไม่ใช่ researcher → 404/403 (ไม่เปิดเผยการมีอยู่)", async () => {
    const other = await post(otherToken, `/dmps/${dmpId}/ai/chat`, { message: "x" }, "flow-key-4");
    expect(other.status).toBe(404);
    const committee = await post(committeeToken, `/dmps/${dmpId}/ai/chat`, { message: "x" }, "flow-key-5");
    expect(committee.status).toBe(403);
  });

  it("โควตาใช้หมด → 429 quota_exceeded + resets_at (envelope ก่อนสตรีม)", async () => {
    const uid = (await db.select({ id: users.userId }).from(users).where(eq(users.username, "e2e-ai-a")).limit(1)).at(0)?.id;
    if (uid === undefined) throw new Error("author user missing");
    await db.update(users).set({ aiTokenLimit: 10, aiTokenUsed: 10 }).where(eq(users.userId, uid));
    const res = await post(authorToken, `/dmps/${dmpId}/ai/chat`, { message: "x" }, "flow-key-6");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("quota_exceeded");
    expect(typeof res.body.error.resets_at).toBe("string");
    await db.update(users).set({ aiTokenLimit: 0, aiTokenUsed: 0 }).where(eq(users.userId, uid));
  });
});
