// e2e Task 6 — tasks module: flow #12 lifecycle, evidence mode-conditional, checklist,
// generated add/replace, reopen offers (offers seed ตรง ๆ เพราะ dmps module ยังไม่สร้างเอง)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { credentials, dmpVersions, dmps, fileRecords, projects, reopenOffers, tasks, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "@/database/database.module.js";
import { ErrorEnvelopeFilter } from "@/shared/http/error-envelope.js";
import { UsersModule } from "@/features/users/users.module.js";
import { AuthModule } from "@/features/auth/auth.module.js";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { FilesModule } from "@/features/files/files.module.js";
import { DmpsModule } from "@/features/dmps/dmps.module.js";
import { TasksModule } from "@/features/tasks/tasks.module.js";
import { AuthGuard } from "@/features/auth/session.js";

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
  email: "e2e-task-a@example.edu",
  organization: "Uni",
  username: "e2e-task-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const COMMITTEE = { ...AUTHOR, email: "e2e-task-m@example.edu", username: "e2e-task-m" };
const OTHER = { ...AUTHOR, email: "e2e-task-o@example.edu", username: "e2e-task-o" };
const usernames = ["e2e-task-a", "e2e-task-m", "e2e-task-o"];

async function cleanup() {
  const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
  if (ids.length === 0) return;
  const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
  if (projectIds.length > 0) {
    await db.delete(fileRecords).where(inArray(fileRecords.projectId, projectIds));
    await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
  }
  await db.delete(fileRecords).where(inArray(fileRecords.uploadedBy, ids));
  await db.delete(dmps).where(inArray(dmps.createdBy, ids));
  await db.delete(projects).where(inArray(projects.createdBy, ids));
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

const VALID_DRAFT = {
  title: "Tasks e2e DMP",
  description: "pollinator reads",
  language: "eng",
  begin_date: "2027-01-01",
  end_date: "2027-12-31",
  ethical_issues_exist: false,
  contributor: [{ name: "Aran", surname: "Saelim", role: "Principal investigator", is_contact: true, email: "aran@example.edu" }],
  cost: [],
  dataset: [
    {
      dataset_id: "ds-reads",
      type: "raw",
      title: "Pollinator genomic sequence reads",
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
    {
      dataset_id: "ds-chem",
      type: "raw",
      title: "Soil chemistry",
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

describe.skipIf(!dbReady)("tasks e2e — flow #12 + reopen offers", () => {
  let app: INestApplication;
  let authorToken: string;
  let committeeToken: string;
  let otherToken: string;
  let projectId: string;
  let dmpId: string;
  let draftPlanId: string; // แผนที่ยังไม่มี version in force
  let evidenceFileId: string;

  const get = (url: string, token: string) =>
    request(app.getHttpServer()).get(url).set("Authorization", `Bearer ${token}`);

  const post = (url: string, token: string, body?: object) =>
    request(app.getHttpServer()).post(url).set("Authorization", `Bearer ${token}`).send(body ?? {});

  const patch = (url: string, token: string, body: object) =>
    request(app.getHttpServer()).patch(url).set("Authorization", `Bearer ${token}`).send(body);

  const put = (url: string, token: string, body: object) =>
    request(app.getHttpServer()).put(url).set("Authorization", `Bearer ${token}`).send(body);

  const del = (url: string, token: string) =>
    request(app.getHttpServer()).delete(url).set("Authorization", `Bearer ${token}`);

  const findTask = async (title: string): Promise<string> => {
    const row = await db.select({ id: tasks.taskId }).from(tasks).where(and(eq(tasks.dmpId, dmpId), eq(tasks.title, title)));
    expect(row.length).toBeGreaterThan(0);
    const first = row[0]?.id;
    expect(first).toBeDefined();
    return first as string;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    await loadConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, UsersModule, AuthModule, ProjectsModule, FilesModule, DmpsModule, TasksModule],
      providers: [
        { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await cleanup();

    const signUp = async (body: { username: string }) => {
      await request(app.getHttpServer()).post("/users").send(body);
      const signIn = await request(app.getHttpServer())
        .post("/auth/sessions")
        .send({ username: body.username, password: "passw0rd8" });
      return signIn.body.access_token as string;
    };
    authorToken = await signUp(AUTHOR);
    otherToken = await signUp(OTHER);
    await signUp(COMMITTEE);
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-task-m"));
    committeeToken = (
      await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-task-m", password: "passw0rd8" })
    ).body.access_token;

    const project = await post("/projects", authorToken, { project_name: "Tasks e2e project" });
    projectId = project.body.project_id;

    // แผนหลัก — submit → approve → version 1 มีผล + generated tasks
    const plan = await post("/dmps", authorToken, { project_id: projectId });
    dmpId = plan.body.dmp_id;
    await put(`/dmps/${dmpId}/draft`, authorToken, { draft_revision: 0, draft: VALID_DRAFT }).expect(200);
    await post(`/dmps/${dmpId}/submit`, authorToken, { draft_revision: 1 }).expect(201);
    await post(`/dmps/${dmpId}/versions/1/approve`, committeeToken, { position: "Chair", note: "ok" }).expect(201);

    // แผนร่าง — ยังไม่มี version in force
    const draftPlan = await post("/dmps", authorToken, { project_id: projectId });
    draftPlanId = draftPlan.body.dmp_id;
    await put(`/dmps/${draftPlanId}/draft`, authorToken, { draft_revision: 0, draft: VALID_DRAFT }).expect(200);

    // file evidence บนโครงการ
    const upload = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${authorToken}`)
      .field("purpose", "evidence")
      .attach("file", Buffer.from("qc report"), { filename: "qc.txt", contentType: "text/plain" });
    expect(upload.status).toBe(201);
    evidenceFileId = upload.body.file_id;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await pool.end();
  });

  it("list — envelope, filter_required, invalid_status, สิทธิ์ (committee เห็น, researcher คนอื่น 404, admin 403)", async () => {
    const noFilter = await get("/tasks", authorToken);
    expect(noFilter.status).toBe(400);
    expect(noFilter.body.error.code).toBe("filter_required");

    const badStatus = await get("/tasks?dmp_id=" + dmpId + "&status=finished", authorToken);
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error.code).toBe("invalid_status");

    const list = await get(`/tasks?dmp_id=${dmpId}`, authorToken);
    expect(list.status).toBe(200);
    expect(list.body.object).toBe("list");
    expect(list.body.has_more).toBe(false);
    const data = list.body.data as Record<string, unknown>[];
    expect(data.length).toBeGreaterThan(0);
    for (const t of data) {
      expect(t.object).toBe("task");
      expect(typeof t.progress_percent).toBe("number");
      expect(t.evidence).toMatchObject({ type: "none", ref: null, label: null, attached_at: null });
    }
    // เรียงตาม stage แล้ว title
    const stages = data.map((t) => t.lifecycle_stage);
    const order = ["collect", "process", "analyse", "preserve", "share"];
    const ranks = stages.map((s) => order.indexOf(s as string));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    // ทาง project_id ก็ได้
    const byProject = await get(`/tasks?project_id=${projectId}`, authorToken);
    expect(byProject.status).toBe(200);
    expect((byProject.body.data as unknown[]).length).toBeGreaterThan(0);

    // committee เป็นสมาชิกโครงการ → อ่านได้; admin 403
    expect((await get(`/tasks?dmp_id=${dmpId}`, committeeToken)).status).toBe(200);
    const adminId = await signUpAdmin();
    expect((await get(`/tasks?dmp_id=${dmpId}`, adminId)).status).toBe(403);

    // researcher คนอื่น → 404 ซ่อน
    expect((await get(`/tasks?dmp_id=${dmpId}`, otherToken)).status).toBe(404);
  });

  async function signUpAdmin(): Promise<string> {
    await request(app.getHttpServer()).post("/users").send({ ...AUTHOR, email: "e2e-task-ad@example.edu", username: "e2e-task-ad" });
    await db.update(users).set({ role: "admin" }).where(eq(users.username, "e2e-task-ad"));
    return (
      await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-task-ad", password: "passw0rd8" })
    ).body.access_token;
  }

  it("create — generated_by บังคับ user, dataset ต้องอยู่ใน version in force, plan ไม่มีผล 409", async () => {
    const badDataset = await post("/tasks", authorToken, {
      dmp_id: dmpId,
      title: "Back up raw reads",
      lifecycle_stage: "collect",
      dataset_id: "ds-nope",
    });
    expect(badDataset.status).toBe(400);
    expect(badDataset.body.error.code).toBe("dataset_not_in_force");

    const notInForce = await post("/tasks", authorToken, { dmp_id: draftPlanId, title: "x", lifecycle_stage: "collect" });
    expect(notInForce.status).toBe(409);
    expect(notInForce.body.error.code).toBe("plan_not_in_force");

    const spoof = await post("/tasks", authorToken, {
      dmp_id: dmpId,
      title: "Back up raw reads",
      details: "zip the batch",
      lifecycle_stage: "collect",
      dataset_id: "ds-reads",
      generated_by: "ai",
    });
    expect(spoof.status).toBe(201);
    expect(spoof.body.generated_by).toBe("user");
    expect(spoof.body.status).toBe("todo");
    expect(spoof.body.dataset_title).toBe("Pollinator genomic sequence reads");

    // committee แก้ไม่ได้ (read-only)
    const manual = await findTask("Back up raw reads");
    const forbidden = await patch(`/tasks/${manual}`, committeeToken, { title: "hijack" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("not_a_researcher");
  });

  it("generated — mode add เพิ่มเคียงข้าง; dataset นอก in force 400", async () => {
    const before = (await get(`/tasks?dmp_id=${dmpId}`, authorToken)).body.total_count;

    const bad = await post(`/dmps/${dmpId}/tasks/generated`, authorToken, {
      mode: "add",
      tasks: [{ title: "Ghost", lifecycle_stage: "collect", dataset_id: "ds-nope" }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("dataset_not_in_force");

    const res = await post(`/dmps/${dmpId}/tasks/generated`, authorToken, {
      mode: "add",
      tasks: [
        { title: "Gen add one", lifecycle_stage: "collect", dataset_id: "ds-chem", priority: "low" },
        { title: "Gen add two", lifecycle_stage: "analyse", dataset_id: "ds-chem" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.object).toBe("generated_tasks");
    expect(res.body.added).toBe(2);
    expect(res.body.removed).toBe(0);
    expect((await get(`/tasks?dmp_id=${dmpId}`, authorToken)).body.total_count).toBe(before + 2);
  });

  it("lifecycle flow #12 — progress → complete (evidence) → reopen → cancel → delete refusal", async () => {
    const taskId = await findTask("Back up raw reads");

    // PATCH เข้าสู่ in_progress
    const started = await patch(`/tasks/${taskId}`, authorToken, { status: "in_progress" });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("in_progress");

    // checklist + progress จาก share ที่ tick
    const add = await post(`/tasks/${taskId}/checklist`, authorToken, { label: "Zip the batch" });
    expect(add.status).toBe(201);
    const added2 = await post(`/tasks/${taskId}/checklist`, authorToken, { label: "Checksum" });
    const blank = await post(`/tasks/${taskId}/checklist`, authorToken, { label: "  " });
    expect(blank.status).toBe(400);
    expect(blank.body.error.code).toBe("label_required");
    const items = added2.body.checklist as { item_id: string; label: string; done: boolean }[];
    expect(items).toHaveLength(2);
    const tick = await patch(`/tasks/${taskId}/checklist/${(items[0] as { item_id: string }).item_id}`, authorToken, { done: true });
    expect(tick.body.progress_percent).toBe(50);
    expect(tick.body.checklist[0]).toMatchObject({ done: true });
    const missing = await patch(`/tasks/${taskId}/checklist/nope`, authorToken, { done: true });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("item_not_found");

    // complete โดยไม่มี evidence → evidence_required พร้อมชื่อ requirement
    const noEvidence = await post(`/tasks/${taskId}/complete`, authorToken);
    expect(noEvidence.status).toBe(409);
    expect(noEvidence.body.error.code).toBe("evidence_required");
    expect(noEvidence.body.error.requirement).toBe("evidence_linked"); // collect on output

    // 409 use_complete ผ่าน PATCH
    const viaPatch = await patch(`/tasks/${taskId}`, authorToken, { status: "done" });
    expect(viaPatch.status).toBe(409);
    expect(viaPatch.body.error.code).toBe("use_complete");

    // evidence file บนโครงการ → complete ได้
    const ev = await put(`/tasks/${taskId}/evidence`, authorToken, { type: "file", ref: evidenceFileId, label: "QC report" });
    expect(ev.status).toBe(200);
    expect(ev.body.evidence).toMatchObject({ type: "file", ref: evidenceFileId, label: "QC report" });

    const done = await post(`/tasks/${taskId}/complete`, authorToken);
    expect(done.status).toBe(201);
    expect(done.body.status).toBe("done");
    expect(done.body.progress_percent).toBe(100);
    expect(done.body.completed_at).not.toBeNull();
    expect(typeof done.body.completed_by).toBe("string");
    for (const item of done.body.checklist as { done: boolean }[]) expect(item.done).toBe(true);

    // dataset ถูกผลักไป collected (collect stage)
    const snap = (
      await db.select().from(dmpVersions).where(and(eq(dmpVersions.dmpId, dmpId), eq(dmpVersions.number, 1)))
    ).at(0) as unknown as Record<string, unknown>;
    const datasets = (snap.snapshot as Record<string, unknown>).dataset as { dataset_id: string; status: string }[];
    expect(datasets.find((d) => d.dataset_id === "ds-reads")?.status).toBe("collected");

    // finished task: PATCH dataset_id → output_locked; cancel → task_done; evidence แก้/ลบไม่ได้
    expect((await patch(`/tasks/${taskId}`, authorToken, { dataset_id: "ds-chem" })).body.error.code).toBe("output_locked");
    expect((await post(`/tasks/${taskId}/cancel`, authorToken)).body.error.code).toBe("task_done");
    expect((await put(`/tasks/${taskId}/evidence`, authorToken, { type: "url", ref: "https://x.y" })).status).toBe(409);
    expect((await del(`/tasks/${taskId}/evidence`, authorToken)).status).toBe(409);
    // delete ถูกปฏิเสธ — มี evidence + ticked + completion
    const delRefused = await del(`/tasks/${taskId}`, authorToken);
    expect(delRefused.status).toBe(409);
    expect(delRefused.body.error.code).toBe("task_has_recorded_work");

    // reopen — evidence + ticks คงอยู่, completed เคลียร์, in_progress
    const reopened = await post(`/tasks/${taskId}/reopen`, authorToken);
    expect(reopened.status).toBe(201);
    expect(reopened.body.status).toBe("in_progress");
    expect(reopened.body.completed_at).toBeNull();
    expect(reopened.body.completed_by).toBeNull();
    expect(reopened.body.progress_percent).toBe(100);
    expect(reopened.body.evidence.type).toBe("file");

    // reopen เฉพาะ task ที่ done
    const notDone = await post(`/tasks/${taskId}/reopen`, authorToken);
    expect(notDone.status).toBe(409);
    expect(notDone.body.error.code).toBe("task_not_done");

    // cancel — จด cancelled_from / reason / time, คง evidence
    const cancelled = await post(`/tasks/${taskId}/cancel`, authorToken);
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.cancelled_from).toBe("in_progress");
    expect(cancelled.body.cancel_reason).toBe("manual");
    expect(cancelled.body.cancelled_at).not.toBeNull();
    expect(cancelled.body.evidence.type).toBe("file");

    // checklist replace — ticked รอด, อันใหม่ใส่แทน unticked
    const fresh = await post("/tasks", authorToken, { dmp_id: dmpId, title: "Draft the README", lifecycle_stage: "share" });
    const freshId = fresh.body.task_id as string;
    await post(`/tasks/${freshId}/checklist`, authorToken, { label: "Keep me" });
    const before = (await db.select().from(tasks).where(eq(tasks.taskId, freshId))).at(0) as unknown as Record<string, unknown>;
    const beforeItems = before.checklist as { item_id: string; done: boolean }[];
    await patch(`/tasks/${freshId}/checklist/${(beforeItems[0] as { item_id: string }).item_id}`, authorToken, { done: true });
    const replaced = await put(`/tasks/${freshId}/checklist`, authorToken, { labels: ["Write intro", "Review"] });
    expect(replaced.status).toBe(200);
    const afterItems = replaced.body.checklist as { label: string; done: boolean }[];
    expect(afterItems.filter((i) => i.done).map((i) => i.label)).toEqual(["Keep me"]);
    expect(afterItems.filter((i) => !i.done).map((i) => i.label)).toEqual(["Write intro", "Review"]);
    expect(replaced.body.progress_percent).toBe(Math.round((1 / 3) * 100));
    const itemGone = await del(`/tasks/${freshId}/checklist/${(beforeItems[0] as { item_id: string }).item_id}`, authorToken);
    expect(itemGone.status).toBe(200);
    const gone = (await db.select().from(tasks).where(eq(tasks.taskId, freshId))).at(0) as unknown as Record<string, unknown>;
    expect(((gone.checklist as { done: boolean }[]).filter((i) => !i.done)).length).toBe(2);
  });

  it("evidence — DOI วางมา → rdm_deposit; file นอกโครงการ 404; preserve/share ต้อง system_verified", async () => {
    // DOI ผ่าน type url → จำแนกเป็น rdm_deposit
    const preserveId = await (async () => {
      const res = await post("/tasks", authorToken, {
        dmp_id: dmpId,
        title: "Deposit soil chemistry",
        lifecycle_stage: "preserve",
        dataset_id: "ds-chem",
      });
      return res.body.task_id as string;
    })();
    // institutional preserve/share → ไม่มี/url ไม่พอ, ต้อง system_verified
    const weak = await post(`/tasks/${preserveId}/complete`, authorToken);
    expect(weak.status).toBe(409);
    expect(weak.body.error.requirement).toBe("system_verified");

    // DOI ผ่าน type url → จำแนกเป็น rdm_deposit
    const doi = await put(`/tasks/${preserveId}/evidence`, authorToken, { type: "url", ref: "10.5281/zenodo.1234567" });
    expect(doi.status).toBe(200);
    expect(doi.body.evidence.type).toBe("rdm_deposit");

    const finished = await post(`/tasks/${preserveId}/complete`, authorToken); // rdm_deposit ผ่าน
    expect(finished.status).toBe(201);

    // file ที่ไม่มีบนโครงการ → 404 file_not_found
    const t2 = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Collect links", lifecycle_stage: "collect", dataset_id: "ds-chem" })
    ).body.task_id as string;
    const badFile = await put(`/tasks/${t2}/evidence`, authorToken, { type: "file", ref: "00000000-0000-4000-8000-000000000000" });
    expect(badFile.status).toBe(404);
    expect(badFile.body.error.code).toBe("file_not_found");

    // clear evidence — task ยังไม่ done ลบได้
    await put(`/tasks/${t2}/evidence`, authorToken, { type: "url", ref: "https://example.org/data" }).expect(200);
    await del(`/tasks/${t2}/evidence`, authorToken).expect(200);
    const cleared = (await db.select().from(tasks).where(eq(tasks.taskId, t2))).at(0) as unknown as Record<string, unknown>;
    expect(cleared.evidenceType).toBe("none");
  });

  it("generated replace — เอาเฉพาะ AI task ที่ยังไม่ถูกแตะ; คนสร้าง/task ที่ทำแล้วรอด", async () => {
    // "Back up raw reads" (user) ถูก cancel ไปแล้ว; "Deposit soil chemistry" (user, done) — ต้องรอด
    const untouched = await db
      .select({ id: tasks.taskId })
      .from(tasks)
      .where(and(eq(tasks.dmpId, dmpId), eq(tasks.generatedBy, "ai"), eq(tasks.status, "todo")));
    const untouchedIds = new Set(untouched.map((r) => r.id));

    const res = await post(`/dmps/${dmpId}/tasks/generated`, authorToken, {
      mode: "replace",
      tasks: [{ title: "Gen replace one", lifecycle_stage: "process", dataset_id: "ds-reads" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(1);
    expect(res.body.removed).toBe(untouchedIds.size);
    const after = await db.select().from(tasks).where(eq(tasks.dmpId, dmpId));
    for (const id of untouchedIds) expect(after.find((t) => t.taskId === id)).toBeUndefined();
    expect(after.some((t) => t.title === "Deposit soil chemistry")).toBe(true);
    expect(after.some((t) => t.title === "Gen replace one")).toBe(true);
  });

  it("reopen offers — list (author only), accept คืนสถานะ + เชื่อม output ด้วยชื่อ, dismiss, offer_closed", async () => {
    // task ที่จะถูกเสนอให้ reopen — cancel ก่อน (จด cancelled_from)
    const c1 = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Cancelled keep", lifecycle_stage: "analyse", dataset_id: "ds-chem" })
    ).body.task_id as string;
    await patch(`/tasks/${c1}`, authorToken, { status: "in_progress" });
    await post(`/tasks/${c1}/cancel`, authorToken).expect(201);
    const c2 = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Cancelled drop", lifecycle_stage: "collect", dataset_id: "ds-chem" })
    ).body.task_id as string;
    await post(`/tasks/${c2}/cancel`, authorToken).expect(201);

    // seed offers ตรง ๆ (output_removed) — dmps module ยังไม่สร้างเอง
    const authorId = (await db.select({ id: users.userId }).from(users).where(eq(users.username, "e2e-task-a"))).at(0)?.id as string;
    await db.insert(reopenOffers).values([
      { taskId: c1, dmpId, datasetId: null, datasetTitle: "Soil chemistry", offeredTo: authorId },
      { taskId: c2, dmpId, datasetId: null, datasetTitle: "Soil chemistry", offeredTo: authorId },
    ]);

    // author only
    const forbidden = await get(`/dmps/${dmpId}/reopen-offers`, committeeToken);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("not_a_researcher");

    const list = await get(`/dmps/${dmpId}/reopen-offers`, authorToken);
    expect(list.status).toBe(200);
    expect(list.body.object).toBe("list");
    const offer = (list.body.data as Record<string, unknown>[]).find(
      (o) => (o.tasks as { task_id: string }[]).some((t) => t.task_id === c1),
    );
    expect(offer).toBeDefined();
    expect(offer?.object).toBe("reopen_offer");
    expect(offer?.dataset_title).toBe("Soil chemistry");
    const offerId = offer?.offer_id as string;

    // task ที่ไม่อยู่ใน offer → 400 task_not_offered
    const stranger = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Not offered", lifecycle_stage: "collect" })
    ).body.task_id as string;
    const notOffered = await post(`/reopen-offers/${offerId}/accept`, authorToken, { task_ids: [stranger] });
    expect(notOffered.status).toBe(400);
    expect(notOffered.body.error.code).toBe("task_not_offered");

    // accept เฉพาะ c1 — คืนสถานะ in_progress + เชื่อม ds-chem (จับคู่ด้วย title), offer ปิดทั้งกลุ่ม
    const accepted = await post(`/reopen-offers/${offerId}/accept`, authorToken, { task_ids: [c1] });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ object: "reopen_offer", offer_id: offerId, reopened: 1 });
    const restored = (await db.select().from(tasks).where(eq(tasks.taskId, c1))).at(0) as unknown as Record<string, unknown>;
    expect(restored.status).toBe("in_progress");
    expect(restored.datasetId).toBe("ds-chem");
    expect(restored.cancelledFrom).toBeNull();
    const dropped = (await db.select().from(tasks).where(eq(tasks.taskId, c2))).at(0) as unknown as Record<string, unknown>;
    expect(dropped.status).toBe("cancelled"); // ที่เหลือคง cancelled

    // offer ปิดแล้ว → 409 offer_closed ทั้ง accept/dismiss ซ้ำ; รายการไม่มี open offer
    expect((await post(`/reopen-offers/${offerId}/accept`, authorToken, { task_ids: [c2] })).status).toBe(409);
    const again = await post(`/reopen-offers/${offerId}/dismiss`, authorToken);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("offer_closed");
    expect((await get(`/dmps/${dmpId}/reopen-offers`, authorToken)).body.data).toHaveLength(0);

    // dismiss path — offer กลุ่มอื่น (output อีกตัว)
    const c3 = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Cancelled other", lifecycle_stage: "collect", dataset_id: "ds-reads" })
    ).body.task_id as string;
    await post(`/tasks/${c3}/cancel`, authorToken).expect(201);
    await db.insert(reopenOffers).values({ taskId: c3, dmpId, datasetId: null, datasetTitle: "Pollinator genomic sequence reads", offeredTo: authorId });
    const list2 = await get(`/dmps/${dmpId}/reopen-offers`, authorToken);
    const offer2 = (list2.body.data as Record<string, unknown>[]).at(0);
    expect(offer2?.dataset_title).toBe("Pollinator genomic sequence reads");
    const dismissed = await post(`/reopen-offers/${offer2?.offer_id as string}/dismiss`, authorToken);
    expect(dismissed.status).toBe(201);
    expect(dismissed.body).toMatchObject({ object: "reopen_offer", reopened: 0 });
    expect((await post(`/reopen-offers/${offer2?.offer_id as string}/dismiss`, authorToken)).status).toBe(409);
    const empty = await get(`/dmps/${dmpId}/reopen-offers`, authorToken);
    expect(empty.body.data).toHaveLength(0);
  });

  it("delete — task ที่ยังไม่เริ่มลบได้", async () => {
    const fresh = (
      await post("/tasks", authorToken, { dmp_id: dmpId, title: "Disposable", lifecycle_stage: "collect" })
    ).body.task_id as string;
    const ok = await del(`/tasks/${fresh}`, authorToken);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ object: "task", task_id: fresh, deleted: true });
    expect(((await get(`/tasks?dmp_id=${dmpId}`, authorToken)).body.data as { task_id: string }[]).some((t) => t.task_id === fresh)).toBe(false);
  });
});
