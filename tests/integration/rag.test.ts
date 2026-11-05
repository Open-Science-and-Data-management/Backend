// integration — upload pipeline + retrieval: chunk+embedding ครบ, cosine top-5 ตำแหน่งถูก,
// แทน proposal → chunks เก่าหาย, embedding_model mismatch → re-embed ทั้งไฟล์ + จับเวลา
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { fileChunks, fileRecords, projects } from "@/database/schema/index.js";
import { AppModule } from "@/app.module.js";
import { FilesService } from "@/features/files/files.service.js";
import { registrationSchema } from "@/shared/contracts/registration.js";
import * as usersRepo from "@/features/users/users.repository.js";
import { hashPassword } from "@/features/users/argon2.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

const USERNAME = "rag-aran";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const fixture = (name: string) => readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

describe.skipIf(!dbReady)("rag pipeline (integration)", () => {
  let app: INestApplication;
  let files: FilesService;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    files = moduleRef.get(FilesService);

    await db.execute(sql`delete from file_chunks where file_id in (select file_id from file_records where uploaded_by in (select user_id from users where username = ${USERNAME}))`);
    await db.execute(sql`delete from file_records where uploaded_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from projects where created_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);

    const input = registrationSchema.parse({
      account_type: "institutional",
      name: "Aran",
      surname: "Rag",
      email: `${USERNAME}@example.edu`,
      organization: "Uni",
      username: USERNAME,
      password: "passw0rd8",
      confirm_password: "passw0rd8",
    });
    const user = await usersRepo.register(db, input, await hashPassword(input.password));
    userId = user.userId;
    const [project] = await db
      .insert(projects)
      .values({ projectName: "RAG Test", planMode: "institutional", createdBy: userId })
      .returning();
    projectId = project.projectId;
    await db.execute(sql`insert into project_members (project_id, user_id, project_role) values (${projectId}, ${userId}, 'researcher')`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from file_chunks where file_id in (select file_id from file_records where uploaded_by = ${userId})`);
    await db.execute(sql`delete from file_records where uploaded_by = ${userId}`);
    await db.execute(sql`delete from project_members where project_id in (select project_id from projects where created_by = ${userId})`);
    await db.execute(sql`delete from projects where created_by = ${userId}`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);
    await app.close();
    await pool.end();
  });

  const upload = (data: Buffer, filename: string) =>
    files.upload(
      { sub: userId, username: USERNAME, role: "researcher" },
      projectId,
      { buffer: data, size: data.byteLength, mimetype: DOCX_MIME, originalname: filename },
      "proposal",
    );

  it("upload fixture จริง → chunks+embeddings ครบ + retrieval คืน chunk ตำแหน่งถูก + จับเวลา", async () => {
    const data = await fixture("proposal-sample.docx");
    const t0 = performance.now();
    const file = await upload(data, "proposal.docx");
    const elapsedMs = performance.now() - t0;
    console.log(`upload pipeline (parse+chunk+embed): ${String(Math.round(elapsedMs))} ms`);

    const chunks = await db.select().from(fileChunks).where(sql`file_id = ${file.file_id}`).orderBy(fileChunks.chunkIndex);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].embeddingModel).toBe("Xenova/multilingual-e5-large");
    for (const c of chunks) {
      expect(c.embedding).not.toBeNull();
      expect(c.embedding?.length).toBe(1024);
    }

    const results = await files.retrieve(
      { sub: userId, username: USERNAME, role: "researcher" },
      file.file_id,
      "sampling protocol timeline",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content.toLowerCase()).toContain("sampling");
    expect(results[0].score).toBeGreaterThan(0);
  }, 300_000);

  it("แทน proposal → superseded_at + chunks เก่าระเบิด", async () => {
    const v1 = await upload(await fixture("proposal-sample.docx"), "v1.docx");
    const v2 = await upload(await fixture("proposal-sample.docx"), "v2.docx");
    const [old] = await db.select().from(fileRecords).where(sql`file_id = ${v1.file_id}`);
    expect(old.supersededAt).not.toBeNull();
    const oldChunks = await db.select().from(fileChunks).where(sql`file_id = ${v1.file_id}`);
    expect(oldChunks).toHaveLength(0); // CASCADE ตามไฟล์เดิม
    const newChunks = await db.select().from(fileChunks).where(sql`file_id = ${v2.file_id}`);
    expect(newChunks.length).toBeGreaterThan(0);
    const [project] = await db.select().from(projects).where(sql`project_id = ${projectId}`);
    expect(project.proposalFileId).toBe(v2.file_id);
  }, 300_000);

  it("embedding_model ไม่ตรง → re-embed ทั้งไฟล์ แล้ว retrieval ปกติ", async () => {
    const file = await upload(await fixture("proposal-sample.docx"), "v3.docx");
    // จำลองไฟล์เก่าโมเดลไม่ตรง + embedding ว่าง (backfill lazy)
    await db.execute(sql`update file_chunks set embedding = null, embedding_model = 'old-model' where file_id = ${file.file_id}`);
    const results = await files.retrieve(
      { sub: userId, username: USERNAME, role: "researcher" },
      file.file_id,
      "genomic diversity survey",
    );
    expect(results[0].content.toLowerCase()).toContain("genomic");
    const chunks = await db.select().from(fileChunks).where(sql`file_id = ${file.file_id}`);
    for (const c of chunks) {
      expect(c.embeddingModel).toBe("Xenova/multilingual-e5-large");
      expect(c.embedding).not.toBeNull();
    }
  }, 300_000);
});
