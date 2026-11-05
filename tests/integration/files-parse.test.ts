// integration — docx parse บน fixture จริง: ได้ extracted text ตรงเนื้อหา; ไฟล์เสีย → 422 ไม่ทิ้ง row
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { fileRecords, projects } from "@/database/schema/index.js";
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

const USERNAME = "parse-aran";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const fixture = (name: string) => readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

describe.skipIf(!dbReady)("files parse integration", () => {
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

    // ล้างเศษ + สร้าง user/project ตรง ๆ (ไม่ผ่าน HTTP — ชั้นนี้ทดสอบ parse seam)
    await db.execute(sql`delete from file_records where uploaded_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from projects where created_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);

    const input = registrationSchema.parse({
      account_type: "institutional",
      name: "Aran",
      surname: "Parse",
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
      .values({ projectName: "Parse Test", planMode: "institutional", createdBy: userId })
      .returning();
    projectId = project.projectId;
    // uploader ต้องเป็นสมาชิก — visibility check ของ projects feature
    await db.execute(sql`insert into project_members (project_id, user_id, project_role) values (${projectId}, ${userId}, 'researcher')`);
  });

  afterAll(async () => {
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

  it("upload fixture .docx — extracted text ตรงเนื้อหา, ไฟล์เสีย → 422 ไม่ทิ้ง row", async () => {
    const good = await upload(await fixture("proposal-sample.docx"), "proposal.docx");
    const row = (await db.select().from(fileRecords).where(sql`file_id = ${good.file_id}`)).at(0);
    if (row === undefined) throw new Error("uploaded row missing");
    expect(row.docxExtractedText).toContain("Urban Pollinator Genomics Proposal");
    expect(row.docxExtractedText).toContain("Sampling protocol and timeline follow.");

    await expect(upload(await fixture("broken.docx"), "broken.docx")).rejects.toMatchObject({
      code: "file_unparseable",
    });

    // ไม่ทิ้ง row/blob ครึ่ง ๆ — มีแค่ไฟล์ที่ parse ผ่าน
    const rows = await db.select().from(fileRecords).where(sql`project_id = ${projectId}`);
    expect(rows).toHaveLength(1);
  });
});
