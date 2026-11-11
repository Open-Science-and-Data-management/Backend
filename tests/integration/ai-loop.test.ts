// integration — SPEC-ai S4.2: ReAct loop ต่อ mock OpenRouter client (scripted)
// ตรวจ: เรียก tools ถูกลำดับจนได้คำตอบ, terminal event เสมอ, tools ทั้งสี่ read-only (ไม่มี write path, ข้อมูลไม่เปลี่ยน)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { dmps, fileChunks, fileRecords, projects } from "@/database/schema/index.js";
import { AppModule } from "@/app.module.js";
import { AI_CLIENT, type AiClient, type AiCompleteParams, type AiMessage, type AiStreamChunk } from "@/shared/ports/ai-client.js";
import { ReactLoop } from "@/features/ai/react-loop.js";
import { AiTools } from "@/features/ai/ai.tools.js";
import { registrationSchema } from "@/shared/contracts/registration.js";
import * as usersRepo from "@/features/users/users.repository.js";
import * as dmpsRepo from "@/features/dmps/dmps.repository.js";
import { hashPassword } from "@/features/users/argon2.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/uni";
const { pool, db } = createDb(DATABASE_URL);

const dbReady = await db
  .execute(sql`select 1`)
  .then(
    () => true,
    () => false,
  );

const USERNAME = "ai-loop";

// mock OpenRouter — scripted ต่อจำนวน call; ตรวจว่า loop ยัด assistant/tool messages กลับถูกลำดับ
class ScriptedClient implements AiClient {
  calls: AiCompleteParams[] = [];
  constructor(private script: ((i: number, calls: AiCompleteParams[]) => AiStreamChunk[])[]) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- scripted generator: chunks พร้อมใช้ทันที ไม่มี await จริง
  async *complete(params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    const i = this.calls.length;
    this.calls.push(params);
    for (const chunk of this.script[i]?.(i, this.calls) ?? []) yield chunk;
  }
}

function textAnswer(text: string): AiStreamChunk[] {
  return [
    { type: "delta", text },
    { type: "assistant_message", content: text, toolCalls: [] },
    { type: "finish", finishReason: "stop", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedTokens: 0 } },
  ];
}

function toolCall(id: string, name: string, args: object, content = ""): AiStreamChunk[] {
  return [
    { type: "delta", text: content },
    { type: "assistant_message", content: content === "" ? null : content, toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
    { type: "finish", finishReason: "tool_calls", usage: null },
  ];
}

const TOOL_NAMES = ["read_proposal", "search_proposal", "read_draft", "read_domain_profiles"] as const;

describe.skipIf(!dbReady)("react loop + tools (integration)", () => {
  let app: INestApplication;
  let userId: string;
  let projectId: string;
  let dmpId: string;
  let events: AiSseEvent[];
  const apps: INestApplication[] = [];

  const track = (e: AiSseEvent): void => {
    events.push(e);
  };

  /** loop instance ต่อ test — override AI_CLIENT ด้วย scripted client แล้วต่อ moduleRef เดิม */
  async function makeLoop(client: AiClient): Promise<ReactLoop> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(client)
      .compile();
    const l = moduleRef.get(ReactLoop);
    const a = moduleRef.createNestApplication();
    apps.push(a);
    await a.init();
    return l;
  }

  beforeAll(async () => {
    await loadConfig();
    // โมดูลจริงสร้างครั้งเดียวเพื่อ seed DI/DB — loop instance ต่อ test จะ override AI_CLIENT เอง
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await db.execute(sql`delete from dmps where created_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from projects where created_by in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);

    const input = registrationSchema.parse({
      account_type: "institutional",
      name: "Ai",
      surname: "Loop",
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
      .values({ projectName: "AI Loop Test", planMode: "institutional", createdBy: userId })
      .returning();
    projectId = project.projectId;
    await db.execute(sql`insert into project_members (project_id, user_id, project_role) values (${projectId}, ${userId}, 'researcher')`);
    const [dmp] = await dmpsRepo.create(db, { projectId, createdBy: userId, planMode: "institutional" });
    dmpId = dmp.dmpId;
    await db.execute(sql`update dmps set draft = '{"title":"ต้นแบบ"}'::jsonb where dmp_id = ${dmpId}`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from dmps where created_by = ${userId}`);
    await db.execute(sql`delete from project_members where project_id = ${projectId}`);
    await db.execute(sql`delete from projects where created_by = ${userId}`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);
    await app.close();
    for (const a of apps) await a.close();
    await pool.end();
  });

  it("loop เรียก 4 tools ถูกลำดับ → proposal JSON → done; messages ยัด tool result กลับครบ", async () => {
    const client = new ScriptedClient([
      // รอบ 1: ขออ่าน domain profiles ก่อน
      () => toolCall("c1", "read_domain_profiles", {}),
      // รอบ 2: อ่าน draft
      () => toolCall("c2", "read_draft", {}),
      // รอบ 3: ค้น proposal (ยังไม่มีไฟล์ → tool บอกทางเลือก ไม่ error)
      () => toolCall("c3", "search_proposal", { query: "data sharing" }),
      // รอบ 4: อ่าน proposal ตรงๆ
      () => toolCall("c4", "read_proposal", {}),
      // รอบ 5: คำตอบสุดท้ายเป็น JSON proposal
      () => textAnswer('{"suggested_domain":"life_sciences","fields":{}}'),
    ]);
    events = [];
    await (await makeLoop(client)).run({
      action: "analyze_proposal",
      system: "คุณคือผู้ช่วยร่าง DMP",
      userMessage: "วิเคราะห์แผนนี้",
      ctx: { claims: { sub: userId, username: USERNAME, role: "researcher" }, projectId, dmpId },
      onEvent: track,
    });

    // ลำดับ event: status → tool×3 (search คืน hint ไม่ตาย) → delta → proposal → done
    const toolsCalled = events.filter((e) => e.event === "tool").map((e) => (e as { name: string }).name);
    expect(events[0]).toMatchObject({ event: "status" });
    expect(toolsCalled).toEqual(["read_domain_profiles", "read_draft", "search_proposal", "read_proposal"]);
    expect(events.at(-1)).toMatchObject({ event: "done" });
    const proposal = events.find((e) => e.event === "proposal");
    expect(proposal).toMatchObject({ proposal: { suggested_domain: "life_sciences" } });

    // loop ยัด assistant(tool_calls) + tool(result) กลับให้โมเดลครบทุก call
    const lastCall = client.calls.at(-1);
    expect(lastCall).toBeDefined();
    if (lastCall === undefined) throw new Error("mock client ไม่ได้รับ call ใดเลย");
    const toolMsgs = lastCall.messages.filter((m): m is Extract<AiMessage, { role: "tool" }> => m.role === "tool");
    expect(toolMsgs).toHaveLength(4);
    // โครงการไม่มี proposal แนบ → search คืนข้อความบอกทางเลือก ไม่ throw ทั้ง run
    expect(toolMsgs[2]?.content).toContain("ยังไม่มี proposal");

    // tools ทั้งสี่ต้องเป็นชุด read-only เท่านั้น
    const firstCall = client.calls.at(0);
    expect(firstCall).toBeDefined();
    expect(TOOL_NAMES).toEqual(expect.arrayContaining((firstCall?.tools ?? []).map((t) => t.name)));
  });

  it("read_proposal parent-expansion — row-chunk ตารางไม่ซ้ำกับ parent, pack ต่อ heading_path (SPEC ff2569 Task 8)", async () => {
    const H = "ส่วนที่ 3 แผนงาน: แผนการดำเนินงานโครงการ > แผนการดำเนินงาน (Gantt รายเดือน พร้อมร้อยละของกิจกรรม)";
    const [file] = await db
      .insert(fileRecords)
      .values({
        projectId,
        uploadedBy: userId,
        filename: "ff-loop.docx",
        fileType: "docx",
        purpose: "proposal",
        storagePath: "unused",
      })
      .returning();
    const baseMeta = { template_version: "FF2569", field_id: "work_plan", section_id: "s3_plan" };
    await db.insert(fileChunks).values([
      { fileId: file.fileId, chunkIndex: 0, content: "แผนการดำเนินงาน\n| ปีที่ | กิจกรรม |", headingPath: H, meta: baseMeta },
      { fileId: file.fileId, chunkIndex: 1, content: "แผนการดำเนินงาน\nปีที่ 1: ศึกษาข้อมูล", headingPath: H, meta: { ...baseMeta, table_row: 0, parent_chunk_index: 0 } },
      { fileId: file.fileId, chunkIndex: 2, content: "ท้ายเอกสาร", headingPath: null, meta: null },
    ]);
    await db.update(projects).set({ proposalFileId: file.fileId }).where(eq(projects.projectId, projectId));

    try {
      const tools = app.get(AiTools);
      const out = await tools.dispatch(
        { claims: { sub: userId, username: USERNAME, role: "researcher" }, projectId, dmpId },
        { id: "t1", name: "read_proposal", argumentsJson: "{}" },
      );
      // parent ครอบตารางเต็มอยู่แล้ว → row-chunk ถูกตัด ไม่ซ้ำสองทาง; chunk heading null ผ่านตรง
      expect(out).toContain(`## ${H}\nแผนการดำเนินงาน\n| ปีที่ | กิจกรรม |`);
      expect(out).not.toContain("ปีที่ 1: ศึกษาข้อมูล");
      expect(out).toContain("ท้ายเอกสาร");
    } finally {
      await db.delete(fileChunks).where(eq(fileChunks.fileId, file.fileId));
      await db.delete(fileRecords).where(eq(fileRecords.fileId, file.fileId));
      await db.update(projects).set({ proposalFileId: null }).where(eq(projects.projectId, projectId));
    }
  });

  it("tools ทั้งสี่ read-only — ข้อมูลใน DB ไม่เปลี่ยนหลัง run", async () => {
    const before = await db.select().from(dmps).where(sql`dmp_id = ${dmpId}`);
    const client = new ScriptedClient([
      () => toolCall("d1", "read_draft", {}),
      () => textAnswer("ตอบธรรมดา ไม่ใช่ JSON"),
    ]);
    events = [];
    await (await makeLoop(client)).run({
      action: "analyze_proposal",
      system: "s",
      userMessage: "u",
      ctx: { claims: { sub: userId, username: USERNAME, role: "researcher" }, projectId, dmpId },
      onEvent: track,
    });
    const after = await db.select().from(dmps).where(sql`dmp_id = ${dmpId}`);
    expect(after).toEqual(before);
    // คำตอบไม่ใช่ JSON → ไม่มี proposal event — delta เฉยๆ แล้ว done
    expect(events.some((e) => e.event === "proposal")).toBe(false);
    expect(events.at(-1)).toMatchObject({ event: "done" });
    expect(client.calls).toHaveLength(2);
  });

  it("error กลาง loop → terminal error event เสมอ (ไม่ค้าง)", async () => {
    const client = new ScriptedClient([
      () => [
        { type: "assistant_message", content: null, toolCalls: [{ id: "e1", name: "read_draft", argumentsJson: "{}" }] },
        { type: "finish", finishReason: "tool_calls", usage: null },
      ],
      () => [
        // โมเดลวนขอ tool เกิน limit แล้ว error ฝั่ง provider — loop ต้องจบ terminal
        { type: "assistant_message", content: null, toolCalls: [] },
        { type: "finish", finishReason: "error", usage: null },
      ],
    ]);
    events = [];
    await (await makeLoop(client)).run({
      action: "analyze_proposal",
      system: "s",
      userMessage: "u",
      ctx: { claims: { sub: userId, username: USERNAME, role: "researcher" }, projectId, dmpId },
      onEvent: track,
    });
    expect(events.at(-1)).toMatchObject({ event: "error" });
    const terminals = events.filter((e) => e.event === "done" || e.event === "error");
    expect(terminals).toHaveLength(1);
    expect(client.calls.length).toBeGreaterThanOrEqual(2);
  });
});
