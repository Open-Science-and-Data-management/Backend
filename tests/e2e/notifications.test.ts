// e2e Task 7 — notifications read model: flow #16
// (dmp_submitted/dmp_approved/dmp_returned หลังตัดสิน, unread_count, read/read_all/delete, มองเห็นเฉพาะของตัวเอง)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { credentials, dmps, projects, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module.js";
import { AuthModule } from "@/features/auth/auth.module.js";
import { UsersModule } from "@/features/users/users.module.js";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { DmpsModule } from "@/features/dmps/dmps.module.js";
import { NotificationsModule } from "@/features/notifications/notifications.module.js";
import { AuthGuard } from "@/features/auth/session.js";
import { ErrorEnvelopeFilter } from "@/shared/http/error-envelope.js";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
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
  name: "Nara",
  surname: "Thong",
  email: "e2e-ntf-a@example.edu",
  organization: "Uni",
  username: "e2e-ntf-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const OTHER = { ...AUTHOR, email: "e2e-ntf-b@example.edu", username: "e2e-ntf-b" };
const COMMITTEE = { ...AUTHOR, email: "e2e-ntf-m@example.edu", username: "e2e-ntf-m" };
const usernames = ["e2e-ntf-a", "e2e-ntf-b", "e2e-ntf-m"];

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
  title: "Notification DMP",
  description: "16S amplicon reads",
  language: "eng",
  begin_date: "2027-01-01",
  end_date: "2027-12-31",
  ethical_issues_exist: false,
  contributor: [{ name: "Nara", surname: "Thong", role: "Principal investigator", is_contact: true, email: "nara@example.edu" }],
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

describe.skipIf(!dbReady)("notifications read model e2e — flow #16", () => {
  let app: INestApplication;
  let authorToken: string;
  let committeeToken: string;
  let otherToken: string;
  let adminToken: string;
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
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, UsersModule, AuthModule, ProjectsModule, DmpsModule, NotificationsModule],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
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
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-ntf-m"));
    committeeToken = (
      await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-ntf-m", password: "passw0rd8" })
    ).body.access_token;
    await db.update(users).set({ role: "admin" }).where(eq(users.username, "e2e-ntf-b"));
    adminToken = (
      await request(app.getHttpServer()).post("/auth/sessions").send({ username: "e2e-ntf-b", password: "passw0rd8" })
    ).body.access_token;

    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_name: "Notifications e2e project" });
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

  it("สิทธิ์ — admin 403", async () => {
    const res = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("isolation — คนอื่นเห็น 0; ก่อน submit ยังไม่มีแจ้งเตือน", async () => {
    const mine = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.object).toBe("list");
    expect(mine.body.unread_count).toBe(0);

    const others = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${otherToken}`);
    expect(others.body.total_count).toBe(0);
  });

  it("submit → dmp_submitted ใหม่สุดก่อน; approve → dmp_approved + unread_count", async () => {
    expect(await saveDraft(VALID_DRAFT, 0)).toBe(200);
    const submit = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1 });
    expect(submit.status).toBe(201);

    let list = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(list.body.total_count).toBe(1);
    expect(list.body.unread_count).toBe(1);
    let first = (list.body.data as Record<string, unknown>[])[0];
    expect(first.object).toBe("notification");
    expect(first.type).toBe("dmp_submitted");
    expect(first.dmp_id).toBe(dmpId);
    expect(first.read_at).toBeNull();
    expect(first.notification_id).toEqual(expect.any(String));

    const approve = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Chair", note: "Fine." });
    expect(approve.status).toBe(201);

    list = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(list.body.total_count).toBe(2);
    expect(list.body.unread_count).toBe(2);
    const data = list.body.data as Record<string, unknown>[];
    expect(data[0].type).toBe("dmp_approved");
    expect(data[0].read_at).toBeNull();

    // committee เองก็มี review_requested ของตัวเอง — จำนวนรวมขึ้นกับ submit อื่น ๆ
    // ในระบบ (global queue ส่งให้กรรมการทุกคน) จึง assert แบบ relative
    const reviewers = await request(app.getHttpServer())
      .get("/notifications")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect((reviewers.body.data as Record<string, unknown>[]).some((n) => n.type === "review_requested")).toBe(true);
  });

  it("mark read — read_at ตั้ง, idempotent คงค่าเดิม, unread_count ลด", async () => {
    const list = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    const head = (list.body.data as { notification_id: string; read_at: unknown }[])[0];
    const res = await request(app.getHttpServer())
      .post(`/notifications/${head.notification_id}/read`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(201);
    expect(res.body.object).toBe("notification");
    expect(res.body.read_at).not.toBeNull();
    const readAt = res.body.read_at;

    const again = await request(app.getHttpServer())
      .post(`/notifications/${head.notification_id}/read`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(again.body.read_at).toEqual(readAt);

    const list2 = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(list2.body.unread_count).toBe(1);
    expect(list2.body.total_count).toBe(2);

    // ของคนอื่น — 404 notification_not_found
    const steal = await request(app.getHttpServer())
      .post(`/notifications/${head.notification_id}/read`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(steal.status).toBe(404);
    expect(steal.body.error.code).toBe("notification_not_found");

    const missing = await request(app.getHttpServer())
      .post("/notifications/00000000-0000-0000-0000-000000000000/read")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("notification_not_found");
  });

  it("unread=true กรองเฉพาะยังไม่อ่าน; pagination limit + starting_after", async () => {
    const unreadOnly = await request(app.getHttpServer())
      .get("/notifications?unread=true")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(unreadOnly.body.total_count).toBe(1);
    expect((unreadOnly.body.data as Record<string, unknown>[]).every((n) => n.read_at === null)).toBe(true);

    const page1 = await request(app.getHttpServer())
      .get("/notifications?limit=1")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.has_more).toBe(true);
    const cursor = (page1.body.data as { notification_id: string }[])[0].notification_id;

    const page2 = await request(app.getHttpServer())
      .get(`/notifications?limit=1&starting_after=${cursor}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(page2.body.data).toHaveLength(1);
    expect((page2.body.data as { notification_id: string }[])[0].notification_id).not.toBe(cursor);
    expect(page2.body.has_more).toBe(false);

    const bad = await request(app.getHttpServer())
      .get("/notifications?limit=0")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("field_invalid");
  });

  it("revision → reject → dmp_returned; read_all ตั้งที่เหลือทั้งหมด", async () => {
    const two = { ...VALID_DRAFT, title: "Notification DMP v2" };
    expect(await saveDraft(two, 1)).toBe(200);
    const rev = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 2 });
    expect(rev.status).toBe(201);
    const reject = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/2/reject`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Chair", note: "Needs work" });
    expect(reject.status).toBe(201);

    const list = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    const data = list.body.data as Record<string, unknown>[];
    expect(data[0].type).toBe("dmp_returned");
    expect(data[0].message).toBe("Needs work");
    expect(list.body.unread_count).toBe(3);

    const readAll = await request(app.getHttpServer())
      .post("/notifications/read_all")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(readAll.status).toBe(201);
    expect(readAll.body).toEqual({ object: "notification_batch", updated: 3 });

    const list2 = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(list2.body.unread_count).toBe(0);

    const again = await request(app.getHttpServer())
      .post("/notifications/read_all")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(again.body.updated).toBe(0);
  });

  it("delete — รายการเดียว + clear all; ของคนอื่นไม่ถูกแตะ; 404 เมื่อไม่พบ", async () => {
    const list = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    const head = (list.body.data as { notification_id: string }[])[0];
    const del = await request(app.getHttpServer())
      .delete(`/notifications/${head.notification_id}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ object: "notification", notification_id: head.notification_id, deleted: true });

    const delAgain = await request(app.getHttpServer())
      .delete(`/notifications/${head.notification_id}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(delAgain.status).toBe(404);
    expect(delAgain.body.error.code).toBe("notification_not_found");

    // committee ยังมีของตัวเองครบ — clear all ของ author ไม่กระทบ
    // (จำนวนเทียบก่อน/หลัง เพราะ review_requested จาก submit อื่นในระบบอาจเพิ่มระหว่างทาง)
    const committeeBefore = (
      await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${committeeToken}`)
    ).body.total_count as number;
    const clear = await request(app.getHttpServer()).delete("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(clear.body).toEqual({ object: "notification_batch", deleted: 3 });
    const after = await request(app.getHttpServer()).get("/notifications").set("Authorization", `Bearer ${authorToken}`);
    expect(after.body.total_count).toBe(0);
    const committee = await request(app.getHttpServer())
      .get("/notifications")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(committee.body.total_count).toBeGreaterThanOrEqual(committeeBefore);
  });
});
