// e2e flows #10 + #13 — restore เวอร์ชัน (pending restore ไม่ได้, in force = ทิ้ง edit,
// เวอร์ชันอื่นจด restored_from) + archive/unarchive + ลบโครงการที่มีแผนปฏิเสธ
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { credentials, dmps, projects, users } from "@/database/schema/index.js";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
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
  email: "e2e-life-a@example.edu",
  organization: "Uni",
  username: "e2e-life-a",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const COMMITTEE = { ...AUTHOR, email: "e2e-life-m@example.edu", username: "e2e-life-m" };
const usernames = ["e2e-life-a", "e2e-life-m"];

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

describe.skipIf(!dbReady)("dmps lifecycle e2e — flow #10, #13", () => {
  let app: INestApplication;
  let authorToken: string;
  let committeeToken: string;
  let projectId: string;
  let dmpId: string;
  const revision = (n: number) => ({ draft_revision: n });

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
    await db.update(users).set({ role: "committee" }).where(eq(users.username, "e2e-life-m"));
    const reSign = await request(app.getHttpServer())
      .post("/auth/sessions")
      .send({ username: "e2e-life-m", password: "passw0rd8" });
    committeeToken = reSign.body.access_token;

    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_name: "Lifecycle e2e project" });
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

  it("เตรียมสถานะ — submit v1 → approve; แก้ major → submit v2 → approve (in force = 2)", async () => {
    const save = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ ...revision(0), draft: VALID_DRAFT });
    expect(save.status).toBe(200);

    const submit = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/submit`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send(revision(1));
    expect(submit.status).toBe(201);

    const approve1 = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/1/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee chair" });
    expect(approve1.status).toBe(201);

    const v2 = { ...VALID_DRAFT, title: "Soil Microbiome DMP v2" };
    const save2 = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 1, draft: v2 });
    expect(save2.status).toBe(200);
    const rev2 = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send(revision(2));
    expect(rev2.status).toBe(201);
    expect(rev2.body.number).toBe(2);
    const approve2 = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/versions/2/approve`)
      .set("Authorization", `Bearer ${committeeToken}`)
      .send({ position: "Committee chair" });
    expect(approve2.status).toBe(201);

    const plan = await request(app.getHttpServer())
      .get(`/dmps/${dmpId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(plan.body.active_version).toBe(2);
    expect(plan.body.draft_revision).toBe(2);
  });

  it("restore — pending restore ไม่ได้ (409 version_pending); เลขไม่มีจริง 404 version_not_found", async () => {
    // ส่ง revision 3 ให้ pending ค้างไว้ (major: ลบ dataset ออก)
    const v3 = { ...VALID_DRAFT, title: "Soil Microbiome DMP v3" };
    const save = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 2, draft: v3 });
    expect(save.status).toBe(200);
    const rev = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/revisions`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send(revision(3));
    expect(rev.status).toBe(201);
    expect(rev.body.status).toBe("pending");

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/restore`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ number: 3, draft_revision: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("version_pending");

    const missing = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/restore`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ number: 99, draft_revision: 3 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("version_not_found");
  });

  it("restore in force — draft_revision เก่า 409 draft_conflict; ตรง → draft = snapshot in force (ทิ้ง edit ไม่จด)", async () => {
    const conflict = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/restore`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ number: 2, draft_revision: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("draft_conflict");
    expect(conflict.body.error.draft_revision).toBe(3);

    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/restore`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ number: 2, draft_revision: 3 });
    expect(res.status).toBe(201);
    expect(res.body.draft.title).toBe("Soil Microbiome DMP v2");
    expect(res.body.draft_revision).toBe(4);
  });

  it("restore เวอร์ชันอื่น — draft = snapshot v1; minor edit ถัดไปจด restored_from แล้วเคลียร์", async () => {
    const res = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/draft/restore`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ number: 1, draft_revision: 4 });
    expect(res.status).toBe(201);
    expect(res.body.draft.title).toBe("Soil Microbiome DMP");
    expect(res.body.draft_revision).toBe(5);

    const save = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send(revision(5));
    expect(save.status).toBe(201);
    const edits = save.body.minor_edits as { restored_from?: number }[];
    const restored = edits.find((e) => e.restored_from !== undefined);
    expect(restored?.restored_from).toBe(1);

    // marker เคลียร์แล้ว — minor edit ถัดไปไม่จด restored_from เพิ่ม
    const again = await request(app.getHttpServer())
      .put(`/dmps/${dmpId}/draft`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ draft_revision: 5, draft: { ...VALID_DRAFT, description: "16S amplicon reads, soil chemistry, and metabolomics" } });
    expect(again.status).toBe(200);
    const fold = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/minor-edits`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send(revision(6));
    expect(fold.status).toBe(201);
    const newEdits = (fold.body.minor_edits as { restored_from?: number }[]).slice(edits.length);
    expect(newEdits.length).toBeGreaterThan(0);
    expect(newEdits.every((e) => e.restored_from === undefined)).toBe(true);
  });

  it("archive — แผนมีผลปฏิเสธ 409 plan_in_force; แผนร่าง archive ได้", async () => {
    const inForce = await request(app.getHttpServer())
      .post(`/dmps/${dmpId}/archive`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(inForce.status).toBe(409);
    expect(inForce.body.error.code).toBe("plan_in_force");

    // สร้างแผนร่างใหม่ในโครงการเดียวกัน → archive → ซ่อนจากลิสต์ default, เห็นใน archived=true
    const draft = await request(app.getHttpServer())
      .post("/dmps")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ project_id: projectId });
    const draftId = draft.body.dmp_id;
    const arch = await request(app.getHttpServer())
      .post(`/dmps/${draftId}/archive`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(arch.status).toBe(201);
    expect(arch.body.archived_at).not.toBeNull();

    const listed = await request(app.getHttpServer())
      .get(`/dmps?project_id=${projectId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(listed.body.data.map((d: { dmp_id: string }) => d.dmp_id)).not.toContain(draftId);
    const archived = await request(app.getHttpServer())
      .get(`/dmps?project_id=${projectId}&archived=true`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(archived.body.data.map((d: { dmp_id: string }) => d.dmp_id)).toContain(draftId);

    // unarchive — กลับมาไม่เปลี่ยนแปลง
    const back = await request(app.getHttpServer())
      .post(`/dmps/${draftId}/unarchive`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(back.status).toBe(201);
    expect(back.body.archived_at).toBeNull();
    const relisted = await request(app.getHttpServer())
      .get(`/dmps?project_id=${projectId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(relisted.body.data.map((d: { dmp_id: string }) => d.dmp_id)).toContain(draftId);
  });

  it("ลบโครงการที่มีแผน — ปฏิเสธ 409 project_has_plans (flow #13)", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("project_has_plans");

    const still = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(still.status).toBe(200);
  });
});
