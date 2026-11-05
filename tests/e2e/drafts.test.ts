// e2e flow #4 — dmps draft: สร้าง/ดู/ลิสต์ + PUT draft (revision conflict, locked, pointer)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { credentials, dmps, projects, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { createDb } from "@/database/client.js";

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
  email: "e2e-dmp-a@example.edu",
  organization: "Uni",
  username: "e2e-dmp-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const OTHER = { ...AUTHOR, email: "e2e-dmp-o@example.edu", username: "e2e-dmp-o" };
const COMMITTEE = { ...AUTHOR, email: "e2e-dmp-m@example.edu", username: "e2e-dmp-m" };
const CITIZEN = { ...AUTHOR, account_type: "citizen", email: "e2e-dmp-c@example.edu", username: "e2e-dmp-c" };

const usernames = ["e2e-dmp-a", "e2e-dmp-o", "e2e-dmp-m", "e2e-dmp-c"];

async function cleanup() {
  const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
  if (ids.length === 0) return;
  const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
  if (projectIds.length > 0) await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
  await db.delete(projects).where(inArray(projects.createdBy, ids));
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

const VALID_DRAFT = {
  title: "Soil Microbiome DMP",
  description: "16S amplicon reads and soil chemistry",
  language: "eng",
  begin_date: "2026-11-01",
  end_date: "2028-10-31",
  ethical_issues_exist: false,
  contributor: [{ name: "Aran", surname: "Saelim", role: "Principal investigator", is_contact: true, email: "aran@example.edu" }],
  cost: [],
  dataset: [
    {
      dataset_id: "ds-soil-reads",
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
      preservation: { repository: undefined, duration: undefined, doi_requested: false },
      distribution: [],
    },
  ],
  schema_version: "v3.0",
};

describe.skipIf(!dbReady)("dmps draft e2e — flow #4", () => {
  let app: INestApplication;
  let authorToken: string;
  let otherToken: string;
  let committeeToken: string;
  let citizenToken: string;
  let projectId: string;
  let dmpId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    const { loadConfig } = await import("@/shared/config/index.js");
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-dmp-m"));
    const reSign = await request(app.getHttpServer())
      .post("/auth/sessions")
      .send({ username: "e2e-dmp-m", password: "passw0rd8" });
    committeeToken = reSign.body.access_token;
    citizenToken = await signUp(CITIZEN);

    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_name: "DMP e2e project" });
    projectId = project.body.project_id;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await pool.end();
  });

  it("สร้างแผน — draft ว่าง, revision 0, researcher เป็น author; admin/committee ห้าม", async () => {
    const asCommittee = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ project_id: projectId });
    expect(asCommittee.status).toBe(403);

    const bad = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: "not-a-uuid" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("field_invalid");

    const res = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: projectId });
    expect(res.status).toBe(201);
    expect(res.body.object).toBe("dmp");
    expect(res.body.status).toBe("draft");
    expect(res.body.draft_revision).toBe(0);
    expect(res.body.draft).toEqual({});
    expect(res.body.researcher.user_id).toBeTruthy();
    expect(res.body.plan_mode).toBe("institutional");
    dmpId = res.body.dmp_id;
  });

  it("ดูแผน — author เห็น draft; researcher คนอื่น 404 ซ่อนการมีอยู่; committee เห็นได้แต่ไม่มี draft", async () => {
    const hidden = await request(app.getHttpServer()).get(`/dmps/${dmpId}`).set("Authorization", `Bearer ${otherToken}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("dmp_not_found");

    const asAuthor = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}?include=draft,versions,readiness`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(asAuthor.status).toBe(200);
    expect(asAuthor.body.versions).toEqual([]);
    expect(asAuthor.body.readiness.complete).toBe(false); // draft ว่างยังไม่ผ่านกฎ

    const asCommittee = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}?include=draft`)
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(asCommittee.status).toBe(200);
    expect(asCommittee.body.draft).toBeUndefined(); // include=draft เฉพาะ author
  });

  it("ลิสต์ — researcher เห็นของตัวเอง; committee ต้องระบุ project_id (400 ถ้าไม่ส่ง)", async () => {
    const mine = await request(app.getHttpServer()).get("/dmps").set("Authorization", `Bearer ${authorToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.object).toBe("list");
    expect(mine.body.data.some((d: { dmp_id: string }) => d.dmp_id === dmpId)).toBe(true);

    const other = await request(app.getHttpServer()).get("/dmps").set("Authorization", `Bearer ${otherToken}`);
    expect(other.body.data.some((d: { dmp_id: string }) => d.dmp_id === dmpId)).toBe(false);

    const committeeNoProject = await request(app.getHttpServer()).get("/dmps").set("Authorization", `Bearer ${committeeToken}`);
    expect(committeeNoProject.status).toBe(400);
    expect(committeeNoProject.body.error.code).toBe("project_id_required");

    const committee = await request(app.getHttpServer())
      .get(`/dmps?project_id=${projectId}`)
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(committee.status).toBe(200);
    expect(committee.body.data.some((d: { dmp_id: string }) => d.dmp_id === dmpId)).toBe(true);
  });

  it("PUT draft — save ทั้งก้อน, revision เพิ่ม; ผู้เขียนเท่านั้น (คนอื่น 404)", async () => {
    const denied = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    expect(denied.status).toBe(404);

    const res = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("dmp_draft");
    expect(res.body.draft_revision).toBe(1);
    expect(res.body.draft.title).toBe("Soil Microbiome DMP");
  });

  it("PUT draft — 409 draft_conflict ฝัง draft ปัจจุบัน + revision ให้ rebase", async () => {
    const stale = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 0, draft: { ...VALID_DRAFT, title: "Stale edit" } });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("draft_conflict");
    expect(stale.body.error.draft_revision).toBe(1);
    expect(stale.body.error.draft.title).toBe("Soil Microbiome DMP");
  });

  it("PUT draft — 400 field_invalid พร้อม JSON pointer; locked field ปฏิเสธ", async () => {
    const badType = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1, draft: { ...VALID_DRAFT, ethical_issues_exist: "yes" } });
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe("field_invalid");
    expect(badType.body.error.param).toBe("/draft/ethical_issues_exist");

    const locked = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1, draft: { ...VALID_DRAFT, schema_version: "v2.0" } });
    expect(locked.status).toBe(400);
    expect(locked.body.error.code).toBe("field_locked");
    expect(locked.body.error.param).toBe("/draft/schema_version");

    // ส่ง schema_version ตามค่า default เดิมได้ — ไม่โดน locked
    const sameDefault = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1, draft: { ...VALID_DRAFT, description: "updated description" } });
    expect(sameDefault.status).toBe(200);
  });

  it("discard — แผนที่ไม่เคยส่ง 409 never_submitted", async () => {
    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/discard`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("never_submitted");
  });

  it("submit — 422 plan_incomplete เมื่อ checklist ยังไม่ผ่าน (พร้อม items)", async () => {
    // contact ไม่มี email → กฎ contact_email_required
    const noEmail = { ...VALID_DRAFT, contributor: [{ name: "Aran", surname: "Saelim", role: "Principal investigator", is_contact: true }] };
    const saved = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 2, draft: noEmail });
    expect(saved.status).toBe(200);
    const revision = saved.body.draft_revision;

    const bad = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: revision });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("plan_incomplete");
    expect(Array.isArray(bad.body.error.items)).toBe(true);
    expect(bad.body.error.items.length).toBeGreaterThan(0);
  });

  it("submit — draft_revision เก่า → 409 draft_conflict; institutional ผ่าน → pending + version 1 + notification", async () => {
    // กลับไป draft ที่ผ่าน checklist
    const saved = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 3, draft: VALID_DRAFT });
    expect(saved.status).toBe(200);
    const revision = saved.body.draft_revision;

    const stale = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 99 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("draft_conflict");

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: revision });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.plan_mode).toBe("institutional");
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].status).toBe("pending");
    expect(res.body.versions[0].number).toBe(1);

    const notes = await db
      .select({ type: sql<string>`type` })
      .from(sql`notifications`)
      .where(sql`dmp_id = ${dmpId}`);
    const types = notes.map((n) => n.type).sort();
    expect(types).toContain("dmp_submitted");
    expect(types).toContain("review_requested");
  });

  it("QS-1 — submit ขนาน 2 request: ตัวที่สองถูก Postgres ปฏิเสธ (partial unique)", async () => {
    // แผนใหม่ในโครงการเดียวกัน + draft ครบ + revision ตรง → ยิง submit พร้อมกันสองทาง
    const made = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: projectId });
    const dmp2 = made.body.dmp_id;
    const saved = await request(app.getHttpServer())
      .put(`/dmps/${dmp2}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    expect(saved.status).toBe(200);
    const revision = saved.body.draft_revision;

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/dmps/${dmp2}/submit`).set("Authorization", `Bearer ${authorToken}`).send({ draft_revision: revision }),
      request(app.getHttpServer()).post(`/dmps/${dmp2}/submit`).set("Authorization", `Bearer ${authorToken}`).send({ draft_revision: revision }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect([a.body.error?.code, b.body.error?.code]).toContain("already_submitted");
    const check = await request(app.getHttpServer())
      .get(`/dmps/${dmp2}?include=versions`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(check.body.versions).toHaveLength(1);
  });

  it("finalize — independent: ออกผลทันที + tasks ชุดแรกครบตาม STAGE_PLAN (flow #7)", async () => {
    // citizen → independent plan ในโครงการของตัวเอง
    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ project_name: "Independent project" });
    const citizenProjectId = project.body.project_id;
    const made = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ project_id: citizenProjectId });
    const dmpC = made.body.dmp_id;
    const saved = await request(app.getHttpServer())
      .put(`/dmps/${dmpC}/draft`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    const revision = saved.body.draft_revision;

    const wrongMode = await request(app.getHttpServer())
      .post(`/dmps/${dmpC}/submit`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ draft_revision: revision });
    expect(wrongMode.status).toBe(409);
    expect(wrongMode.body.error.code).toBe("plan_is_independent");

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpC}/finalize`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ draft_revision: revision });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("approved");
    expect(res.body.plan_mode).toBe("independent");
    expect(res.body.active_version).toBe(1);
    expect(res.body.versions[0].status).toBe("approved");

    // 5 tasks ต่อ output (open access ไม่ตัด share)
    const taskRows = await db.select({ stage: sql<string>`lifecycle_stage`, dmp: sql<string>`dmp_id` }).from(sql`tasks`).where(sql`dmp_id = ${dmpC}`);
    expect(taskRows.map((t) => t.stage).sort()).toEqual(["analyse", "collect", "preserve", "process", "share"]);

    // institutional ตัวอื่น finalize ไม่ได้
    const wrongWay = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/finalize`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 4 });
    expect(wrongWay.status).toBe(409);
    expect(wrongWay.body.error.code).toBe("plan_is_institutional");
  });

  it("approve — flow #6: activate + tasks ชุดแรก + notification; decide ซ้ำ 409 version_not_pending", async () => {
    // dmpId ถูก submit เป็น pending แล้วจาก test ก่อนหน้า
    const rejected = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/reject`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee member" }); // reject ไม่มี note → 400
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("note_required");

    const researcherDenied = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ position: "X" });
    expect(researcherDenied.status).toBe(404); // researcher ไม่มีสิทธิ์ตัดสิน

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee chair", note: "Clear plan." });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("approved");
    expect(res.body.approver.position).toBe("Committee chair");
    expect(res.body.note).toBe("Clear plan.");

    const plan = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}?include=versions`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(plan.body.status).toBe("approved");
    expect(plan.body.active_version).toBe(1);

    const taskRows = await db.select({ n: sql<number>`count(*)::int` }).from(sql`tasks`).where(sql`dmp_id = ${dmpId}`);
    expect(taskRows[0]?.n).toBe(5);

    const notes = await db.select({ type: sql<string>`type` }).from(sql`notifications`).where(sql`dmp_id = ${dmpId}`);
    expect(notes.map((n) => n.type)).toContain("dmp_approved");

    const again = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee chair" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("version_not_pending");
  });

  it("reject — revision ถูกส่งกลับแต่แผนยัง approved (ADR-0021), first submission กลับ draft", async () => {
    // revision ของ dmpId (มี version in force = 1): แก้ minor ก่อนแล้วส่ง revision ด้วย major change
    const saved = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        draft_revision: 4,
        draft: { ...VALID_DRAFT, dataset: [{ ...VALID_DRAFT.dataset[0], access: "closed" }] }, // major — access
      });
    expect(saved.status).toBe(200);
    const revision = saved.body.draft_revision;

    const sub = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: revision });
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe("pending");
    expect(sub.body.number).toBe(2);

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/2/reject`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee member", note: "closed access ต้องมีเหตุผล" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("rejected");
    expect(res.body.plan_status).toBe("approved"); // version in force ยังคงเดิม

    const plan = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(plan.body.status).toBe("approved");
    expect(plan.body.active_version).toBe(1);
  });

  it("minor-edits — flow #8: fold ลง version in force; major ปน → 409 edits_include_major", async () => {
    const put = async (draft: Record<string, unknown>) => {
      const cur = await request(app.getHttpServer())
        .get(`/dmps/${dmpId}?include=draft`)
        .set("Authorization", `Bearer ${authorToken}`);
      const saved = await request(app.getHttpServer())
        .put(`/dmps/${dmpId}/draft`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ draft_revision: cur.body.draft_revision, draft });
      expect(saved.status).toBe(200);
      return saved.body.draft_revision as number;
    };

    // แก้ minor (description) — fold ได้
    const rev = await put({ ...VALID_DRAFT, description: "updated wording" });
    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: rev });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe(1);
    expect((res.body.minor_edits as unknown[]).length).toBeGreaterThan(0);

    // minor-edits ซ้ำ — ไม่มีอะไรเหลือ → no_new_edits
    const again = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: rev });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("no_new_edits");

    // major ปน (access) → ปฏิเสธ
    await put({ ...VALID_DRAFT, dataset: [{ ...VALID_DRAFT.dataset[0], access: "closed" }] });
    const major = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: rev + 1 });
    expect(major.status).toBe(409);
    expect(major.body.error.code).toBe("edits_include_major");
  });

  it("QS-2 flow #9 — approve revision: minor fix ระหว่างรอถูก carried ไม่หายเงียบ", async () => {
    const put = async (draft: Record<string, unknown>) => {
      const cur = await request(app.getHttpServer())
        .get(`/dmps/${dmpId}?include=draft`)
        .set("Authorization", `Bearer ${authorToken}`);
      const saved = await request(app.getHttpServer())
        .put(`/dmps/${dmpId}/draft`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ draft_revision: cur.body.draft_revision, draft });
      expect(saved.status).toBe(200);
      return saved.body.draft_revision as number;
    };

    // revision (major: access closed) ยังอยู่ใน draft จาก test ก่อนหน้า
    const cur = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}?include=draft`)
      .set("Authorization", `Bearer ${authorToken}`);
    const sub = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: cur.body.draft_revision });
    expect(sub.status).toBe(201);
    const revNumber = sub.body.number as number; // reject test สร้าง v2 ไปแล้ว — revision นี้คือ v3
    expect(revNumber).toBeGreaterThan(2);

    // แก้ minor ระหว่าง revision รอ — fold บน version in force (v1) ไม่แตะ pending
    const fixRev = await put({ ...VALID_DRAFT, description: "fix during wait", dataset: [{ ...VALID_DRAFT.dataset[0], access: "closed" }] });
    const folded = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: fixRev });
    expect(folded.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/${revNumber}/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee member" });
    expect(res.status).toBe(201);
    const carried = res.body.carried_minor_edits as { path: string }[] | null;
    expect(Array.isArray(carried)).toBe(true);
    expect((carried ?? []).length).toBeGreaterThan(0); // QS-2 — fix ไม่หายเงียบ

    const plan = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}?include=versions`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(plan.body.active_version).toBe(revNumber);
  });
});
