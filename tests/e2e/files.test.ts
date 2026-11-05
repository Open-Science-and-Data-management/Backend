// e2e flow #18 — file lifecycle: upload limits, download, supersede, archive, 409 file_in_use
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "@/app.module.js";
import { createDb } from "@/database/client.js";
import { credentials, dmps, fileRecords, projects, users } from "@/database/schema/index.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

const USER = {
  account_type: "institutional",
  name: "Fah",
  surname: "Saelim",
  email: "e2e-file-r@example.edu",
  organization: "Uni",
  username: "e2e-file-r",
  password: "passw0rd8",
  confirm_password: "passw0rd8",
};
const OTHER = { ...USER, email: "e2e-file-o@example.edu", username: "e2e-file-o" };
const usernames = [USER.username, OTHER.username];

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe.skipIf(!dbReady)("files e2e — flow #18", () => {
  let app: INestApplication;
  let token: string;
  let otherToken: string;
  let projectId: string;
  let proposalId: string;

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
    token = await signUp(USER);
    otherToken = await signUp(OTHER);

    const created = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ project_name: "File Test Project" });
    projectId = created.body.project_id;
    expect(projectId).toBeTruthy();
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await pool.end();
  });

  async function cleanup() {
    const ids = (await db.select({ userId: users.userId }).from(users).where(inArray(users.username, usernames))).map((r) => r.userId);
    if (ids.length === 0) return;
    const projectIds = (await db.select({ id: projects.projectId }).from(projects).where(inArray(projects.createdBy, ids))).map((r) => r.id);
    if (projectIds.length > 0) {
      await db.delete(dmps).where(inArray(dmps.projectId, projectIds));
      await db.delete(fileRecords).where(inArray(fileRecords.projectId, projectIds));
      await db.delete(projects).where(inArray(projects.projectId, projectIds));
    }
    await db.delete(credentials).where(inArray(credentials.username, usernames));
    await db.delete(users).where(inArray(users.userId, ids));
  }

  it("upload — proposal ต้อง .docx ตาม MIME, รับได้และกลายเป็น active proposal", async () => {
    const anon = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .field("purpose", "proposal")
      .attach("file", Buffer.from("x"), { filename: "p.docx", contentType: DOCX_MIME });
    expect(anon.status).toBe(401);

    // non-member → 404 (ซ่อนโครงการ)
    const stranger = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${otherToken}`)
      .field("purpose", "proposal")
      .attach("file", Buffer.from("x"), { filename: "p.docx", contentType: DOCX_MIME });
    expect(stranger.status).toBe(404);

    // MIME ไม่ใช่ .docx → 400
    const notDocx = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`)
      .field("purpose", "proposal")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "p.pdf", contentType: "application/pdf" });
    expect(notDocx.status).toBe(400);
    expect(notDocx.body.error.code).toBe("file_type_not_allowed");

    // purpose แปลก → 400
    const badPurpose = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`)
      .field("purpose", "poster")
      .attach("file", Buffer.from("x"), { filename: "p.docx", contentType: DOCX_MIME });
    expect(badPurpose.status).toBe(400);
    expect(badPurpose.body.error.code).toBe("invalid_purpose");

    const ok = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`)
      .field("purpose", "proposal")
      .attach("file", Buffer.from("PK docx bytes"), { filename: "proposal.docx", contentType: DOCX_MIME });
    expect(ok.status).toBe(201);
    expect(ok.body.object).toBe("file");
    expect(ok.body.file_type).toBe("docx");
    expect(ok.body.purpose).toBe("proposal");
    expect(ok.body.metadata.byte_size).toBe(13);
    proposalId = ok.body.file_id;

    // proposal กลายเป็น active ของโครงการ
    const project = await request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(project.body.proposal_file_id).toBe(proposalId);
    expect(project.body.file_count).toBe(1);
  });

  it("download + list + supersede", async () => {
    const download = await request(app.getHttpServer())
      .get(`/files/${proposalId}/content`)
      .set("Authorization", `Bearer ${token}`)
      .responseType("blob");
    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toContain("proposal.docx");
    expect(download.body.toString()).toBe("PK docx bytes");

    // non-member โหลดไม่ได้
    const stranger = await request(app.getHttpServer())
      .get(`/files/${proposalId}/content`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(stranger.status).toBe(404);

    // อัปโหลด proposal ใหม่ — ตัวเกิน superseded
    const v2 = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`)
      .field("purpose", "proposal")
      .attach("file", Buffer.from("PK v2"), { filename: "proposal-v2.docx", contentType: DOCX_MIME });
    expect(v2.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get("/files")
      .query({ project_id: projectId })
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.object).toBe("list");
    expect(list.body.total_count).toBe(2);
    const old = list.body.data.find((f: { file_id: string }) => f.file_id === proposalId);
    expect(old.superseded_at).toBeTruthy();
    expect(list.body.data[0].file_id).not.toBe(proposalId); // current มาก่อน superseded

    // project_id ไม่ส่ง → 400; purpose แปลก → 400
    const noProject = await request(app.getHttpServer()).get("/files").set("Authorization", `Bearer ${token}`);
    expect(noProject.status).toBe(400);
    expect(noProject.body.error.code).toBe("project_id_required");
    const badPurpose = await request(app.getHttpServer())
      .get("/files")
      .query({ project_id: projectId, purpose: "poster" })
      .set("Authorization", `Bearer ${token}`);
    expect(badPurpose.status).toBe(400);
    expect(badPurpose.body.error.code).toBe("invalid_purpose");

    return v2.body.file_id as string;
  });

  it("archive + delete + 409 file_in_use", async () => {
    const v2FileId = ((await request(app.getHttpServer())
      .get("/files")
      .query({ project_id: projectId })
      .set("Authorization", `Bearer ${token}`)).body.data[0].file_id) as string;

    // ลบธรรมดาได้ (ยังไม่เป็น evidence)
    const del = await request(app.getHttpServer())
      .delete(`/files/${v2FileId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    // 404 หลังลบ
    const gone = await request(app.getHttpServer())
      .get(`/files/${v2FileId}/content`)
      .set("Authorization", `Bearer ${token}`);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe("file_not_found");

    // ทำ active proposal เป็น evidence — ลบไม่ได้ 409 file_in_use, archive ได้
    await db.execute(sql`
      insert into dmps (project_id, title, draft)
      values (${projectId}, 'DMP', '{}'::jsonb)`);
    const dmpId = (await db.execute(sql`select dmp_id from dmps where project_id = ${projectId}`)).rows[0].dmp_id as string;
    await db.execute(sql`
      insert into tasks (dmp_id, title, lifecycle_stage, evidence_type, evidence_ref)
      values (${dmpId}, 'T', 'collect', 'file', ${proposalId})`);

    const inUse = await request(app.getHttpServer())
      .delete(`/files/${proposalId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe("file_in_use");

    const archived = await request(app.getHttpServer())
      .post(`/files/${proposalId}/archive`)
      .set("Authorization", `Bearer ${token}`);
    expect(archived.status).toBe(201);
    expect(archived.body.archived_at).toBeTruthy();

    // archived ยังโหลดได้ (evidence ยังอ้างถึง)
    const stillThere = await request(app.getHttpServer())
      .get(`/files/${proposalId}/content`)
      .set("Authorization", `Bearer ${token}`);
    expect(stillThere.status).toBe(200);
  });
});