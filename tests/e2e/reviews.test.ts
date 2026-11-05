// e2e Task 5 — reviews read model: GET /reviews มุมกรรมการของ flow #6
// (queue pending, decided_by=me, revision changes_summary, pagination, independent ไม่ปรากฏ)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { credentials, dmps, projects, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { timelineOf } from "@/features/reviews/reviews.service.js";
import { loadConfig } from "@/shared/config/index.js";
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
  email: "e2e-rev-a@example.edu",
  organization: "Uni",
  username: "e2e-rev-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const COMMITTEE = { ...AUTHOR, email: "e2e-rev-m@example.edu", username: "e2e-rev-m" };
const CITIZEN = { ...AUTHOR, account_type: "citizen", email: "e2e-rev-c@example.edu", username: "e2e-rev-c" };
const usernames = ["e2e-rev-a", "e2e-rev-m", "e2e-rev-c"];

async function cleanup() {
  const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
  if (ids.length === 0) return;
  const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
  if (projectIds.length > 0) await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
  await db.delete(dmps).where(inArray(dmps.createdBy, ids));
  await db.delete(projects).where(inArray(projects.createdBy, ids));
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

const VALID_DRAFT = {
  title: "Review Queue DMP",
  description: "16S amplicon reads",
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

describe.skipIf(!dbReady)("reviews read model e2e — flow #6", () => {
  let app: INestApplication;
  let authorToken: string;
  let committeeToken: string;
  let citizenToken: string;
  let committeeId: string;
  let projectId: string;
  let dmpId: string;

  const saveDraft = async (draft: object, revision: number) =>
    (await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: revision, draft })).status;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
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
    await signUp(COMMITTEE);
    const committeeRow = await db.select({ userId: users.userId }).from(users).where(eq(users.username, "e2e-rev-m"));
    committeeId = committeeRow[0]?.userId ?? "";
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-rev-m"));
    const reSign = await request(app.getHttpServer())
      .post("/auth/sessions")
      .send({ username: "e2e-rev-m", password: "passw0rd8" });
    committeeToken = reSign.body.access_token;
    citizenToken = await signUp(CITIZEN);

    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_name: "Reviews e2e project" });
    projectId = project.body.project_id;

    const plan = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: projectId });
    dmpId = plan.body.dmp_id;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await pool.end();
  });

  it("สิทธิ์ — researcher/admin ห้าม (403); status ผิด 400 invalid_status", async () => {
    const forbidden = await request(app.getHttpServer())
      .get("/reviews")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(forbidden.status).toBe(403);

    const bad = await request(app.getHttpServer())
      .get("/reviews?status=waiting")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_status");
  });

  it("submit → คิว pending: รูปร่างตรง contract (id, days_waiting 0, changes_summary 0, timeline, project)", async () => {
    expect(await saveDraft(VALID_DRAFT, 0)).toBe(200);
    const submit = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1 });
    expect(submit.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get("/reviews?status=pending")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("list");
    const review = (res.body.data as Record<string, unknown>[]).find((r) => r.dmp_id === dmpId);
    expect(review).toBeDefined();
    expect(review?.id).toBe(`${dmpId}:1`);
    expect(review?.version).toBe(1);
    expect(review?.status).toBe("pending");
    expect(review?.is_revision).toBe(false);
    expect(review?.active_version).toBeNull();
    expect(review?.days_waiting).toBe(0);
    expect(review?.changes_summary).toEqual({ major: 0, minor: 0 });
    expect(review?.timeline).toBe("Starts Jan 1, 2027");
    expect(review?.researcher).toEqual({ user_id: expect.any(String), name: "Aran Saelim" });
    expect((review?.project as Record<string, unknown>).project_id).toBe(projectId);
    expect((review?.project as Record<string, unknown>).project_name).toBe("Reviews e2e project");
    expect(review?.decided_at).toBeNull();
    expect(review?.approver).toBeNull();
  });

  it("approve → decided_by=me เจอ; approver ครบ; independent finalize ไม่ปรากฏในคิว", async () => {
    const approve = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee chair", note: "Fine." });
    expect(approve.status).toBe(201);

    const mine = await request(app.getHttpServer())
      .get("/reviews?decided_by=me&status=approved&sort=-decided_at")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(mine.status).toBe(200);
    const review = (mine.body.data as Record<string, unknown>[]).find((r) => r.dmp_id === dmpId);
    expect(review).toBeDefined();
    expect(review?.decided_by).toBe(committeeId);
    expect(review?.decided_at).not.toBeNull();
    expect(review?.note).toBe("Fine.");
    expect(review?.approver).toMatchObject({ user_id: committeeId, name: "e2e-rev-m", position: "Committee chair" });

    // แผน independent (citizen finalize) ไม่มีวันอยู่ในคิวกรรมการ
    const indep = await request(app.getHttpServer()).post("/dmps").set("Authorization", `Bearer ${citizenToken}`).send({});
    const indepId = indep.body.dmp_id;
    // dmp นอกโครงการยังไม่ freeze mode — ตั้ง independent ตรงนี้เพื่อโฟกัส read model (สร้าง project ฝั่ง citizen มาทีหลัง)
    await db.update(dmps).set({ planMode: "independent" }).where(eq(dmps.dmpId, indepId));
    await request(app.getHttpServer())
      .put(`/dmps/${indepId}/draft`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    const fin = await request(app.getHttpServer())
      .post(`/dmps/${indepId}/finalize`)
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ draft_revision: 1 });
    expect(fin.status).toBe(201);

    const queue = await request(app.getHttpServer())
      .get("/reviews")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect((queue.body.data as Record<string, unknown>[]).some((r) => r.dmp_id === indepId)).toBe(false);
  });

  it("revision รอพิจารณา — is_revision true, active_version 1, changes_summary นับ major", async () => {
    const two = { ...VALID_DRAFT, title: "Review Queue DMP v2", dataset: [...VALID_DRAFT.dataset, { ...VALID_DRAFT.dataset[0], dataset_id: "ds-chem", title: "Soil chemistry" }] };
    expect(await saveDraft(two, 1)).toBe(200);
    const rev = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 2 });
    expect(rev.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get("/reviews?status=pending")
      .set("Authorization", `Bearer ${committeeToken}`);
    const review = (res.body.data as Record<string, unknown>[]).find((r) => r.dmp_id === dmpId);
    expect(review?.version).toBe(2);
    expect(review?.is_revision).toBe(true);
    expect(review?.active_version).toBe(1);
    expect((review?.changes_summary as Record<string, number>).major).toBeGreaterThan(0);
  });

  it("pagination — default sort เก่าสุดก่อน; limit=1 + starting_after เดินหน้าได้", async () => {
    // แผนที่สอง (เก่ากว่า/ใหม่กว่าตามเวลา submit) เพื่อให้คิวมี 2 รายการ pending
    const plan2 = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: projectId });
    const dmp2 = plan2.body.dmp_id;
    await request(app.getHttpServer())
      .put(`/dmps/${dmp2}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 0, draft: VALID_DRAFT });
    await request(app.getHttpServer())
      .post(`/dmps/${dmp2}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1 });

    const first = await request(app.getHttpServer())
      .get("/reviews?status=pending&limit=1")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.has_more).toBe(true);
    const head = (first.body.data as { id: string }[])[0];

    const second = await request(app.getHttpServer())
      .get(`/reviews?status=pending&limit=1&starting_after=${encodeURIComponent(head.id)}`)
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(second.body.data).toHaveLength(1);
    expect((second.body.data as { id: string }[])[0].id).not.toBe(head.id);

    const badCursor = await request(app.getHttpServer())
      .get("/reviews?starting_after=nope")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body.error.code).toBe("field_invalid");
  });

  it("timelineOf — unit seam: ไม่มีวันที่ → No timeline set; อดีตครบ → Timeline ended", () => {
    expect(timelineOf({})).toBe("No timeline set");
    expect(timelineOf({ begin_date: "2020-01-01", end_date: "2020-12-31" })).toBe("Timeline ended");
    expect(timelineOf({ begin_date: "2099-01-01", end_date: "2099-12-31" })).toBe("Starts Jan 1, 2099");
    expect(timelineOf(null)).toBe("No timeline set");
  });
});
