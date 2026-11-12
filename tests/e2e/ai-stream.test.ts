// e2e flow #3 — AI action SSE: POST /dmps/{scope}/ai/{action} — event ไล่ status/tool → delta → proposal → done;
// abort/error จบด้วย terminal event เสมอ; author-only; quota_exceeded ก่อนสตรีม (SPEC-ai, ADR-0018)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { credentials, dmps, fileRecords, projects, users } from "@/database/schema/index.js";
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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const fixture = (name: string) => readFile(fileURLToPath(new URL("../fixtures/" + name, import.meta.url)));

/** draft ครบตาม validateDraft (ตรง fixture ใน lifecycle.test.ts) — ใช้ยื่น/approve เพื่อทดสอบเงื่อนไข generate-tasks/checklist */
const VALID_DRAFT = {
  title: "AI e2e approved DMP",
  description: "16S amplicon reads",
  language: "eng",
  begin_date: "2026-11-01",
  end_date: "2028-10-31",
  ethical_issues_exist: false,
  contributor: [{ name: "Aran", surname: "Saelim", role: "Principal investigator", is_contact: true, email: "aran@example.edu" }],
  cost: [],
  dataset: [
    {
      dataset_id: "ds-ai-e2e",
      type: "raw",
      title: "16S amplicon sequence reads",
      access: "open",
      personal_data: "no",
      sensitive_data: "no",
      protection_level: "other",
      security_classification_level: "public",
      keyword: [],
      domain: "generic",
      domain_metadata: {},
      preservation: { doi_requested: false },
      distribution: [],
    },
  ],
  schema_version: "v3.0",
};

class ScriptedClient implements AiClient {
  calls = 0;
  seen: AiCompleteParams[] = [];
  constructor(private script: AiStreamChunk[][]) {}

  async *complete(params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    this.seen.push(params);
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

/** analyze-proposal — โมเดลตอบ patch list {proposals:[…]} ทั้งก้อน (ไม่ใช่ maDMP draft — รูปที่เคยทำ 23514) */
function proposalsListRound(): AiStreamChunk[] {
  const body = JSON.stringify({ proposals: [{ path: "/title", text: "ชื่อจาก proposal", reason: "อ้างหลักฐาน" }] });
  return [
    { type: "delta", text: body },
    { type: "assistant_message", content: body, toolCalls: [] },
    { type: "finish", finishReason: "stop", usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10, cachedTokens: 0 } },
  ];
}

/** analyze-proposal — โมเดลตอบ maDMP draft ทั้งก้อน (contract ที่ถูกต้อง) */
function draftRound(): AiStreamChunk[] {
  const body = JSON.stringify({ ...VALID_DRAFT, title: "ร่างจาก proposal" });
  return [
    { type: "delta", text: body },
    { type: "assistant_message", content: body, toolCalls: [] },
    { type: "finish", finishReason: "stop", usage: { promptTokens: 5, completionTokens: 6, totalTokens: 11, cachedTokens: 0 } },
  ];
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
  if (projectIds.length > 0) {
    await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
    await db.delete(fileRecords).where(inArray(fileRecords.projectId, projectIds)); // analyze-proposal test อัปโหลด proposal
    await db.delete(projects).where(inArray(projects.createdBy, ids));
  }
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

describe.skipIf(!dbReady)("ai stream e2e — flow #3", () => {
  let app: INestApplication;
  let scripted: ScriptedClient;
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
    scripted = new ScriptedClient([
      toolRound(),
      proposalRound(),
      textRound(),
      errorRound(),
      textRound(),
      textRound(),
      textRound(),
      proposalsListRound(),
      draftRound(),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(scripted)
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

  it("generate-tasks/checklist บนแผน draft → 409 plan_not_approved ก่อนสตรีม; suggest ทำงานได้", async () => {
    const tasks = await post(authorToken, `/dmps/${dmpId}/ai/generate-tasks`, { direction: "x" }, "flow-key-7");
    expect(tasks.status).toBe(409);
    expect(tasks.body.error.code).toBe("plan_not_approved");
    const check = await post(authorToken, `/dmps/${dmpId}/ai/checklist`, { task_title: "x" }, "flow-key-8");
    expect(check.status).toBe(409);
    expect(check.body.error.code).toBe("plan_not_approved");
    // suggest ไม่ต้องการ approved — แผน draft ใช้ได้
    const suggest = await post(authorToken, `/dmps/${dmpId}/ai/suggest`, { direction: "ปรับ description" }, "flow-key-9");
    expect(suggest.status).toBe(200);
    expect(parseSse(suggest.text).at(-1)?.event).toBe("done");
  });

  it("committee approve แล้ว generate-tasks/checklist ทำงานได้", async () => {
    const put = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    expect(put.status).toBe(200);
    await request(app.getHttpServer()).post(`/dmps/${dmpId}/submit`).set("Authorization", `Bearer ${authorToken}`).send({ draft_revision: 1 }).expect(201);
    await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Chair", note: "ok" })
      .expect(201);
    const tasks = await post(authorToken, `/dmps/${dmpId}/ai/generate-tasks`, { direction: "ร่าง task ชุดแรก" }, "flow-key-10");
    expect(tasks.status).toBe(200);
    expect(parseSse(tasks.text).at(-1)?.event).toBe("done");
    const check = await post(authorToken, `/dmps/${dmpId}/ai/checklist`, { task_title: "เก็บข้อมูล", lifecycle_stage: "collect" }, "flow-key-11");
    expect(check.status).toBe(200);
    expect(parseSse(check.text).at(-1)?.event).toBe("done");
  });

  // regression — เคยพัง: analyze ใช้ system ของ suggest → โมเดลคืน {"proposals":[…]} → persist เขียนทั้งก้อนลง
  // dmps.draft โดน constraint dmps_draft_object_keys ปฏิเศษ (23514) หลัง done หลุดไปแล้ว → filter พยายามส่ง
  // envelope ทับ SSE ได้ ERR_HTTP_HEADERS_SENT + โควตาไม่โดนตัด
  it("analyze-proposal: โมเดลคืน {proposals} → จบ error ไม่เขียน draft โควตาโดนตัด replay ได้ครบ", async () => {
    const up = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${authorToken}`)
      .field("purpose", "proposal")
      .attach("file", await fixture("proposal-sample.docx"), { filename: "proposal-bad.docx", contentType: DOCX_MIME });
    expect(up.status).toBe(201);
    const fileId = up.body.file_id as string;
    const uid = (await db.select({ id: users.userId }).from(users).where(eq(users.username, "e2e-ai-a")).limit(1)).at(0)?.id;
    if (uid === undefined) throw new Error("author user missing");
    await db.update(users).set({ aiTokenUsed: 0 }).where(eq(users.userId, uid));

    const res = await post(authorToken, "/ai/analyze-proposal", { project_id: projectId, file_id: fileId }, "analyze-bad-1");
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.at(-1)?.event).toBe("error");
    const callsAfterRun = scripted.calls;
    // แผนที่ analyze สร้างเองถูกลบ — เหลือแผนเดิมจาก beforeAll (draft ยังครบ ไม่โดนแตะ)
    const plans = await db
      .select({ id: dmps.dmpId, rev: dmps.draftRevision })
      .from(dmps)
      .where(eq(dmps.projectId, projectId));
    expect(plans).toHaveLength(1);
    expect(plans.at(0)?.rev).toBe(1); // แผนเดิมผ่าน autosave/submit ใน test ก่อนหน้า — ไม่ใช่แผนที่ analyze แตะ
    // โควตาโดนตัดก่อน terminal (usage 10 จาก round สุดท้าย) — แม้ run ล้ม
    const used = (await db.select({ used: users.aiTokenUsed }).from(users).where(eq(users.userId, uid))).at(0)?.used;
    expect(used).toBe(10);
    // replay ด้วย key เดิม — snapshot รวม terminal event ไม่ยิง provider ซ้ำ
    const replay = await post(authorToken, "/ai/analyze-proposal", { project_id: projectId, file_id: fileId }, "analyze-bad-1");
    expect(replay.status).toBe(200);
    expect(parseSse(replay.text).map((e) => e.event)).toEqual(events.map((e) => e.event));
    expect(scripted.calls).toBe(callsAfterRun); // replay จาก snapshot — ไม่ยิง provider ซ้ำ
  });

  it("analyze-proposal: โมเดลคืน maDMP draft → เขียน draft/title/revision 1 + ใช้ system analyze_proposal", async () => {
    const up = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${authorToken}`)
      .field("purpose", "proposal")
      .attach("file", await fixture("proposal-sample.docx"), { filename: "proposal-good.docx", contentType: DOCX_MIME });
    expect(up.status).toBe(201);
    const fileId = up.body.file_id as string;
    const res = await post(authorToken, "/ai/analyze-proposal", { project_id: projectId, file_id: fileId }, "analyze-good-1");
    expect(res.status).toBe(200);
    const done = parseSse(res.text).at(-1);
    expect(done?.event).toBe("done");
    const newId = done?.event === "done" ? done.dmp_id : undefined;
    if (newId === undefined) throw new Error("done event ต้องมี dmp_id ของแผนใหม่");
    expect(newId).not.toBe(dmpId); // สร้างแผนใหม่ ไม่ใช่แผนที่ submit ไปแล้ว
    const row = (await db.select({ title: dmps.title, rev: dmps.draftRevision, draft: dmps.draft }).from(dmps).where(eq(dmps.dmpId, newId))).at(0);
    expect(row?.title).toBe("ร่างจาก proposal"); // fix: title จาก draft ไม่ใช่ fallback ""
    expect(row?.rev).toBe(1);
    const draft = row?.draft;
    const draftTitle =
      draft !== null && typeof draft === "object" && "title" in draft && typeof draft.title === "string"
        ? draft.title
        : undefined;
    expect(draftTitle).toBe("ร่างจาก proposal");
    // fix 1 — analyze ต้องส่ง system เฉพาะ analyze_proposal (maDMP draft contract) ไม่ใช่ suggest (patch list)
    const systemPrompt = scripted.seen.at(-1)?.messages.find((m) => m.role === "system")?.content ?? "";
    expect(systemPrompt).toContain("pure maDMP JSON");
  });
});
