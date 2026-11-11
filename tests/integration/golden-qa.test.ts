// integration — golden QA (SPEC ff2569 Task 9, research §Q7): retrieval วัด hit@5/MRR บน fixture FF2569 จริง
// ผ่าน FilesService.retrieve เดิม (flat top-k, ADR-0025); ground truth = section ของคำถาม — ตัดสินจาก
// heading_path ที่ขึ้นต้นด้วยชื่อ section จาก template (AC3); AI_CLIENT เป็น mock เพราะ caption ต้อง deterministic
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { fileRecords, projects } from "@/database/schema/index.js";
import { AppModule } from "@/app.module.js";
import { FilesService } from "@/features/files/files.service.js";
import { AI_CLIENT } from "@/shared/ports/ai-client.js";
import { MockAiClient } from "@/shared/adapters/mock-ai/mock-ai-client.js";
import { ff2569Template } from "@/features/files/templates/ff2569.js";
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

const USERNAME = "golden-aran";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const fixture = (name: string) => readFile(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

// ชื่อ section ตาม template — ground truth อิง canonical id ไม่ใช่ข้อความในเอกสาร (Q1/Q11)
const sectionTitle = new Map(ff2569Template.sections.map((s) => [s.id, s.title]));

// คำถามครอบทุก section (จำนวนจริง = GOLDEN.length) — เขียนจากเนื้อหาจริงใน fixture (มีคำตอบรองรับทุกข้อ; ช่องว่างในฟอร์มไม่ถูกถาม)
const GOLDEN: { q: string; section: string }[] = [
  // หัวฟอร์ม
  { q: "โครงการนี้ขอรับทุนประเภทใด Fundamental Fund คืออะไร", section: "s0_header" },
  { q: "โครงการใช้ปีงบประมาณปีใด", section: "s0_header" },
  { q: "ทุนนี้จัดสรรงบประมาณจากกองทุนหรือหน่วยงานส่งเสริมวิจัยและนวัตกรรมใด", section: "s0_header" },
  // ส่วนที่ 1 ข้อมูลทั่วไป
  { q: "ชื่อโครงการวิจัยภาษาไทยเขียนว่าอะไร", section: "s1_general" },
  { q: "ชื่อโครงการภาษาอังกฤษคืออะไร", section: "s1_general" },
  { q: "โครงการนี้อยู่ภายใต้แผนงานใด การพัฒนาวิทยาศาสตร์เทคโนโลยีใช่หรือไม่", section: "s1_general" },
  { q: "โครงการนี้เป็นการวิจัยประยุกต์หรือการวิจัยพื้นฐาน", section: "s1_general" },
  { q: "ได้ยื่นขอรับการพิจารณาเป็นโครงการสำคัญตามยุทธศาสตร์ชาติหรือไม่", section: "s1_general" },
  { q: "โครงการนี้เป็นโครงการใหม่หรือโครงการต่อเนื่องจากปีก่อน", section: "s1_general" },
  { q: "คำสำคัญภาษาไทยของโครงการมีอะไรบ้าง", section: "s1_general" },
  { q: "คำสำคัญภาษาอังกฤษ keywords ของโครงการมีอะไรบ้าง", section: "s1_general" },
  { q: "โครงการจัดอยู่สาขา OECD หมวดใด วิศวกรรมและเทคโนโลยีใช่หรือไม่", section: "s1_general" },
  { q: "หัวหน้าโครงการคือใคร อยู่ภาควิชาอะไร", section: "s1_general" },
  { q: "ผู้ร่วมวิจัยที่เป็นหัวหน้ากิจกรรมย่อยที่ 2 มีใคร", section: "s1_general" },
  { q: "ผลการดำเนินงานที่ผ่านมาของโครงการต่อเนื่องเทียบแผนได้ร้อยละเท่าไร", section: "s1_general" },
  // ส่วนที่ 2 ข้อมูลโครงการ
  { q: "บทสรุปข้อเสนอโครงการพูดถึงอะไร", section: "s2_project" },
  { q: "หลักการและเหตุผลคืออะไร ปัญหาเศรษฐกิจภาคการเกษตรของไทยเป็นอย่างไร", section: "s2_project" },
  { q: "วัตถุประสงค์ของโครงการมีอะไรบ้าง", section: "s2_project" },
  { q: "คำอธิบายกรอบการวิจัย Input Process Output คืออะไร", section: "s2_project" },
  { q: "กิจกรรมย่อยที่ 1 มีแนวคิดการตรวจสอบคุณภาพผลิตผลเกษตรอย่างไร", section: "s2_project" },
  { q: "สมมติฐานของกิจกรรมย่อยที่ 1 ว่าอย่างไร", section: "s2_project" },
  { q: "กิจกรรมย่อยที่ 1 ใช้การเรียนรู้ของเครื่อง machine learning ทฤษฎีใดบ้าง", section: "s2_project" },
  { q: "เอกสารอ้างอิงเรื่อง computer vision ใน precision agriculture มีงานไหน", section: "s2_project" },
  { q: "กิจกรรมย่อยที่ 2 สร้างแพลตฟอร์มจัดการองค์ความรู้แบบใด", section: "s2_project" },
  { q: "ทบทวนวรรณกรรมของกิจกรรมย่อยที่ 2 ครอบคลุม knowledge graph และ chatbot หรือไม่", section: "s2_project" },
  { q: "กิจกรรมย่อยที่ 3 เกี่ยวกับระบบกระจายข้อมูลแบบไร้ศูนย์กลางอย่างไร", section: "s2_project" },
  { q: "เอกสารอ้างอิงเรื่อง distributed systems topologies เป็นของใคร", section: "s2_project" },
  { q: "ระเบียบวิธีวิจัยมีขั้นตอนการดำเนินงานอย่างไร", section: "s2_project" },
  { q: "ผลผลิตสุดท้ายเมื่อสิ้นสุดโครงการคืออะไร มีบทความวิจัยกี่บทความ", section: "s2_project" },
  { q: "โครงการดำเนินการกี่ปีงบประมาณ เป้าหมายรายปีเป็นอย่างไร", section: "s2_project" },
  // ส่วนที่ 3 แผนงาน
  { q: "แผนการดำเนินงาน Gantt แบ่งกิจกรรมย่อยอย่างไร ร้อยละของกิจกรรมเท่าไร", section: "s3_plan" },
  { q: "กิจกรรม 1.3 การสร้างแบบจำลองด้วยเทคนิคการเรียนรู้ของเครื่องดำเนินการเดือนใด", section: "s3_plan" },
  { q: "พื้นที่ทำวิจัยอยู่จังหวัดใด สถานที่ใด", section: "s3_plan" },
  { q: "พื้นที่ได้รับประโยชน์จากโครงการคือที่ใด", section: "s3_plan" },
  { q: "มีการจัดซื้อครุภัณฑ์หรือไม่ เหตุผลและความจำเป็นคืออะไร", section: "s3_plan" },
  { q: "มีหน่วยงานร่วมดำเนินการหรือภาคเอกชนร่วมลงทุนหรือไม่", section: "s3_plan" },
  { q: "ระดับความพร้อมเทคโนโลยี TRL ณ ปัจจุบันอยู่ระดับใด", section: "s3_plan" },
  { q: "แนวทางการขับเคลื่อนผลงานวิจัยสู่ผลกระทบเชื่อมโยงผู้เชี่ยวชาญอย่างไร", section: "s3_plan" },
  // ส่วนที่ 4 ผลผลิต/ผลลัพธ์/ผลกระทบ
  { q: "ผลผลิตที่คาดว่าจะได้รับ output มีอะไรบ้าง", section: "s4_outputs" },
  { q: "ต้นแบบกระบวนการตรวจสอบคุณภาพผลิตผลเกษตรอัจฉริยะคือผลผลิตแบบใด", section: "s4_outputs" },
  { q: "ต้นแบบระบบจัดการองค์ความรู้ด้านคุณภาพผลิตผลเกษตรคืออะไร", section: "s4_outputs" },
  { q: "กระบวนการนำผลผลิตไปสู่ผลลัพธ์ outcome มีแผนอย่างไร", section: "s4_outputs" },
  { q: "ผลกระทบด้านเศรษฐกิจที่คาดว่าจะเกิดขึ้นคืออะไร", section: "s4_outputs" },
  { q: "ผลกระทบด้านสังคมและสิ่งแวดล้อมที่คาดว่าจะเกิดขึ้นคืออะไร", section: "s4_outputs" },
];

describe.skipIf(!dbReady)("golden QA ff2569 (integration)", () => {
  let app: INestApplication;
  let files: FilesService;
  let projectId: string;
  let userId: string;
  let fileId: string;
  let formParsed: boolean;

  beforeAll(async () => {
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(new MockAiClient())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    files = moduleRef.get(FilesService);

    await db.execute(sql`delete from file_records where uploaded_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from projects where created_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);

    const input = registrationSchema.parse({
      account_type: "institutional",
      name: "Aran",
      surname: "Golden",
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
      .values({ projectName: "Golden QA", planMode: "institutional", createdBy: userId })
      .returning();
    projectId = project.projectId;
    await db.execute(sql`insert into project_members (project_id, user_id, project_role) values (${projectId}, ${userId}, 'researcher')`);

    const data = await fixture("ff2569-proposal.docx");
    const uploaded = await files.upload(
      { sub: userId, username: USERNAME, role: "researcher" },
      projectId,
      { buffer: data, size: data.byteLength, mimetype: DOCX_MIME, originalname: "ff2569-proposal.docx" },
      "proposal",
    );
    fileId = uploaded.file_id;
    formParsed = uploaded.form_parsed;
  }, 300_000);

  afterAll(async () => {
    await db.execute(sql`delete from file_records where uploaded_by = ${userId}`);
    await db.execute(sql`delete from project_members where project_id = ${projectId}`);
    await db.execute(sql`delete from projects where created_by = ${userId}`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);
    await app.close();
    await pool.end();
  });

  it("fixture FF2569 ingest ผ่าน fast path — form_parsed: true (งาน Task 9 วัดบน chunks ของ fast path)", async () => {
    expect(formParsed).toBe(true);
    const row = (await db.select().from(fileRecords).where(sql`file_id = ${fileId}`)).at(0);
    expect(row?.docxExtractedText).not.toBeNull();
    // chunks ที่วัดต่อคือของไฟล์ล่าสุด (proposal เดียวต่อโครงการ — supersede ในตัว)
  });

  it("golden QA — hit@5 ≥ 0.8 และ MRR ผ่านเกณฑ์ (ทุก section)", async () => {
    const claims = { sub: userId, username: USERNAME, role: "researcher" };
    let hits5 = 0;
    let mrrSum = 0;
    const misses: string[] = [];
    for (const { q, section } of GOLDEN) {
      const top = await files.retrieve(claims, fileId, q);
      const prefix = sectionTitle.get(section) ?? "\u0000";
      const rank = top.findIndex((h) => (h.heading_path ?? "").startsWith(prefix)) + 1;
      if (rank > 0 && rank <= 5) hits5 += 1;
      if (rank > 0) mrrSum += 1 / rank;
      else misses.push(`  ✗ [${section}] ${q} → ${top.slice(0, 2).map((h) => h.heading_path ?? "-").join(" | ")}`);
    }
    const hitAt5 = hits5 / GOLDEN.length;
    const mrr = mrrSum / GOLDEN.length;
    console.log(`golden QA: n=${String(GOLDEN.length)} hit@5=${hitAt5.toFixed(3)} MRR=${mrr.toFixed(3)}`);
    if (misses.length > 0) console.log(`misses (${String(misses.length)}):\n${misses.join("\n")}`);
    expect(hitAt5).toBeGreaterThanOrEqual(0.8);
    expect(mrr).toBeGreaterThanOrEqual(0.6);
  }, 300_000);
});
