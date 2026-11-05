// e2e flow #2 — projects: สร้างโครงการ/สมาชิก/ลบไม่ได้เมื่อมีแผน (supertest ต่อ Postgres จริง)
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

const RESEARCHER = {
  account_type: "institutional",
  name: "Aran",
  surname: "Saelim",
  email: "e2e-proj-r@example.edu",
  organization: "Uni",
  username: "e2e-proj-r",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const CITIZEN = { ...RESEARCHER, account_type: "citizen", email: "e2e-proj-c@example.edu", username: "e2e-proj-c" };
const COMMITTEE = { ...RESEARCHER, email: "e2e-proj-m@example.edu", username: "e2e-proj-m" };

const usernames = ["e2e-proj-r", "e2e-proj-c", "e2e-proj-m"];

async function cleanup() {
  const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
  if (ids.length === 0) return;
  const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
  if (projectIds.length > 0) await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
  await db.delete(projects).where(inArray(projects.createdBy, ids));
  await db.delete(credentials).where(inArray(credentials.username, usernames));
  await db.delete(users).where(inArray(users.userId, ids));
}

describe.skipIf(!dbReady)("projects e2e — flow #2", () => {
  let app: INestApplication;
  let researcherToken: string;
  let committeeToken: string;
  let citizenToken: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    const { loadConfig } = await import("@/shared/config/index.js");
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    // ล้างเศษก่อน — cascade members ตาม projects; dmps fixture ต้องลบก่อน projects
    await cleanup();

    const signUp = async (body: { username: string }) => {
      const res = await request(app.getHttpServer()).post("/users").send(body);
      expect(res.status).toBe(201);
      const signIn = await request(app.getHttpServer())
        .post("/auth/sessions")
        .send({ username: body.username, password: "passw0rd8" });
      return signIn.body.access_token as string;
    };
    researcherToken = await signUp(RESEARCHER);
    citizenToken = await signUp(CITIZEN);
    committeeToken = await signUp(COMMITTEE);
    // ยกระดับผู้ใช้คนที่สามเป็น committee (สถาบันสร้างบัญชี — OC-1)
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-proj-m"));
    // ออก token ใหม่ให้ role ใหม่
    const reSign = await request(app.getHttpServer())
      .post("/auth/sessions")
      .send({ username: "e2e-proj-m", password: "passw0rd8" });
    committeeToken = reSign.body.access_token;
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await pool.end();
  });

  it("สร้างโครงการ — researcher เท่านั้น, plan_mode มาจาก account_type, ผู้สร้างเป็นสมาชิก", async () => {
    const anon = await request(app.getHttpServer()).post("/projects").send({ project_name: "X" });
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("not_signed_in");

    const denied = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ project_name: "X" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("not_a_researcher");

    const blank = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${researcherToken}`)
      .send({ project_name: "  " });
    expect(blank.status).toBe(400);
    expect(blank.body.error.code).toBe("project_name_required");

    // พยายามส่ง plan_mode เอง — server ไม่รับ
    const created = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${researcherToken}`)
      .send({ project_name: "Urban Pollinator Genomics", description: "Genomic survey.", plan_mode: "independent" });
    expect(created.status).toBe(201);
    expect(created.body.object).toBe("project");
    expect(created.body.plan_mode).toBe("institutional");
    expect(created.body.status).toBe("draft");
    expect(created.body.member_count).toBe(1);
    expect(created.body.file_count).toBe(0);
    expect(created.body.awaiting_review).toBe(false);
    projectId = created.body.project_id;

    // citizen → independent
    const indep = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({ project_name: "Citizen Science Bird Count" });
    expect(indep.status).toBe(201);
    expect(indep.body.plan_mode).toBe("independent");

    // ผู้สร้างเป็นสมาชิก researcher
    const members = await request(app.getHttpServer())
      .get(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(members.status).toBe(200);
    expect(members.body.object).toBe("list");
    expect(members.body.data).toHaveLength(1);
    expect(members.body.data[0].project_role).toBe("researcher");
    expect(members.body.data[0].user.email).toBe(RESEARCHER.email);
  });

  it("ดูโครงการ — researcher เห็นเฉพาะของตัวเอง (ไม่ใช่สมาชิก → 404), committee เห็น institutional ทั้งหมด", async () => {
    const ok = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.project_name).toBe("Urban Pollinator Genomics");

    const stranger = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(stranger.status).toBe(404);
    expect(stranger.body.error.code).toBe("project_not_found");

    const unknown = await request(app.getHttpServer())
      .get("/projects/00000000-0000-7000-8000-000000000000")
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(unknown.status).toBe(404);

    const committee = await request(app.getHttpServer())
      .get("/projects")
      .set("Authorization", `Bearer ${committeeToken}`);
    expect(committee.status).toBe(200);
    expect(committee.body.total_count).toBeGreaterThanOrEqual(1); // โครงการ citizen ไม่อยู่ใน institutional
    const ids = committee.body.data.map((p: { project_id: string }) => p.project_id);
    expect(ids).toContain(projectId);

    const researcherList = await request(app.getHttpServer())
      .get("/projects")
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(researcherList.body.total_count).toBe(1); // เห็นเฉพาะของตัวเอง
  });

  it("ลบโครงการ — ปฏิเสธเมื่อมีแผน (flow #13), ลบได้เมื่อไม่มีแผน", async () => {
    // fixture row ตรง dmps (แผนจริงมาตอน M3)
    await db.execute(sql`
      insert into dmps (project_id, title, draft, created_by)
      values (${projectId}, 'Pollinator DMP', '{}'::jsonb,
        (select user_id from users where username = 'e2e-proj-r'))`);
    // archived ก็นับ — แต่ตอนนี้ draft อยู่แล้วก็พอ

    const refused = await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("project_has_plans");

    await db.execute(sql`delete from dmps where project_id = ${projectId}`);

    const deleted = await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(deleted.status).toBe(200);

    const gone = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${researcherToken}`);
    expect(gone.status).toBe(404);

    // members cascade ไปกับโครงการ
    const memberRows = await db.execute(
      sql`select 1 from project_members where project_id = ${projectId}`,
    );
    expect(memberRows.rows).toHaveLength(0);
  });
});
