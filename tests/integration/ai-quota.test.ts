// integration — SPEC-ai S4.4 (ADR-0023): quota + idempotency ต่อ scripted AiClient + Postgres จริง
// ตรวจ: reconcile = output + uncached input (cached 10%), นับรวม fail, reset รายเดือน,
//       quota_exceeded 429 + resets_at, replay ด้วย key เดิมไม่หักโควตาซ้ำ (โมเดลถูกเรียกครั้งเดียว)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { loadConfig } from "@/shared/config/index.js";
import { createDb } from "@/database/client.js";
import { users } from "@/database/schema/index.js";
import { AppModule } from "@/app.module.js";
import { AI_CLIENT, AiError, type AiClient, type AiCompleteParams, type AiStreamChunk } from "@/shared/ports/ai-client.js";
import { AiService } from "@/features/ai/ai.service.js";
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

const USERNAME = "ai-quota";

class ScriptedClient implements AiClient {
  calls = 0;
  constructor(private script: AiStreamChunk[][]) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- scripted generator พร้อมใช้ทันที
  async *complete(_params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    this.calls += 1;
    for (const chunk of this.script[this.calls - 1] ?? []) yield chunk;
  }
}

function answer(text: string, usage: AiStreamChunk extends never ? never : { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number }): AiStreamChunk[] {
  return [
    { type: "delta", text },
    { type: "assistant_message", content: text, toolCalls: [] },
    { type: "finish", finishReason: "stop", usage },
  ];
}

async function usedOf(userId: string): Promise<number> {
  const row = await db.select({ used: users.aiTokenUsed, limit: users.aiTokenLimit, resetsAt: users.quotaResetsAt }).from(users).where(eq(users.userId, userId)).limit(1);
  return row.at(0)?.used ?? -1;
}

describe.skipIf(!dbReady)("ai quota + idempotency (integration)", () => {
  let app: INestApplication;
  let userId: string;
  let svc: AiService;
  const claims = () => ({ sub: userId, username: USERNAME, role: "researcher" });

  const run = (svc2: AiService, key: string) =>
    svc2.stream({
      claims: claims(),
      scope: "unscoped",
      action: "chat",
      body: { message: "สรุปสิ่งที่ต้องทำ" },
      idempotencyKey: key,
      sink: () => {},
    });

  beforeAll(async () => {
    await loadConfig();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(new ScriptedClient([]))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    svc = app.get(AiService);

    await db.execute(sql`delete from idempotency_keys where user_id in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from ai_thread_entries where owner_id in (select user_id from users where username = ${USERNAME})`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);

    const input = registrationSchema.parse({
      account_type: "institutional",
      name: "Ai",
      surname: "Quota",
      email: `${USERNAME}@example.edu`,
      organization: "Uni",
      username: USERNAME,
      password: "passw0rd8",
      confirm_password: "passw0rd8",
    });
    userId = (await usersRepo.register(db, input, await hashPassword(input.password))).userId;
  });

  afterAll(async () => {
    await db.execute(sql`delete from idempotency_keys where user_id = ${userId}`);
    await db.execute(sql`delete from ai_thread_entries where owner_id = ${userId}`);
    await db.execute(sql`delete from credentials where username = ${USERNAME}`);
    await db.execute(sql`delete from users where username = ${USERNAME}`);
    await app.close();
    await pool.end();
  });

  it("reconcile = output + uncached input + cached×10% (cached 10%)", async () => {
    await db.update(users).set({ aiTokenLimit: 10000, aiTokenUsed: 0 }).where(eq(users.userId, userId));
    const client = new ScriptedClient([
      answer("ทำได้", { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 40 }),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(client)
      .compile();
    const scoped = moduleRef.createNestApplication();
    await scoped.init();
    const svc2 = scoped.get(AiService);

    const result = await run(svc2, "reconcile-1");
    expect(result.events.at(-1)?.event).toBe("done");
    expect(client.calls).toBe(1);
    // ceil(50 + (100-40) + 40×0.1) = ceil(114) = 114
    expect(await usedOf(userId)).toBe(114);
    await scoped.close();
  });

  it("fail กลางทางยังถูกหักโควตาตาม usage ที่ประมวลผลแล้ว", async () => {
    await db.update(users).set({ aiTokenLimit: 10000, aiTokenUsed: 0 }).where(eq(users.userId, userId));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue({
        // eslint-disable-next-line @typescript-eslint/require-await -- test stub
        async *complete(): AsyncIterable<AiStreamChunk> {
          yield { type: "delta", text: "บางส่วน" };
          yield { type: "finish", finishReason: "stop", usage: { promptTokens: 30, completionTokens: 12, totalTokens: 42, cachedTokens: 0 } };
          throw new AiError({ code: "ai_provider_error", message: "บั๊คกลางทาง", retryable: true });
        },
      })
      .compile();
    const scoped = moduleRef.createNestApplication();
    await scoped.init();
    const svc2 = scoped.get(AiService);

    const result = await run(svc2, "fail-1");
    expect(result.events.at(-1)?.event).toBe("error");
    const last = result.events.at(-1);
    if (last !== undefined && last.event === "error" && "usage" in last) expect(last.usage).toBeDefined();
    expect(await usedOf(userId)).toBe(42);
    await scoped.close();
  });

  it("replay ด้วย key เดิม — โมเดลถูกเรียกครั้งเดียว โควตาไม่ถูกหักซ้ำ", async () => {
    await db.update(users).set({ aiTokenLimit: 10000, aiTokenUsed: 0 }).where(eq(users.userId, userId));
    const client = new ScriptedClient([answer("ครั้งเดียว", { promptTokens: 20, completionTokens: 10, totalTokens: 30, cachedTokens: 0 })]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(client)
      .compile();
    const scoped = moduleRef.createNestApplication();
    await scoped.init();
    const svc2 = scoped.get(AiService);

    const first = await run(svc2, "replay-1");
    const second = await run(svc2, "replay-1");
    expect(client.calls).toBe(1);
    expect(second.events).toEqual(first.events);
    expect(await usedOf(userId)).toBe(30);
    await scoped.close();
  });

  it("โควตาเกิน → ApiError 429 quota_exceeded พร้อม resets_at ก่อนสตรีมเริ่ม", async () => {
    await db.update(users).set({ aiTokenLimit: 100, aiTokenUsed: 100 }).where(eq(users.userId, userId));
    await expect(run(svc, "over-1")).rejects.toMatchObject({ status: 429, code: "quota_exceeded" });
  });

  it("reset รายเดือน — quota_resets_at ผ่านไปแล้ว → used เริ่ม 0", async () => {
    await db.update(users).set({ aiTokenLimit: 100, aiTokenUsed: 100, quotaResetsAt: new Date(Date.now() - 1000) }).where(eq(users.userId, userId));
    const q = await svc.quota(claims());
    expect(q.used).toBe(0);
    expect(q.remaining).toBe(100);
    expect(new Date(q.resets_at ?? 0).getTime()).toBeGreaterThan(Date.now());
  });

  it("usage รายงานแยกส่วนใน done event", async () => {
    await db.update(users).set({ aiTokenLimit: 10000, aiTokenUsed: 0 }).where(eq(users.userId, userId));
    const client = new ScriptedClient([answer("รายงาน", { promptTokens: 10, completionTokens: 4, totalTokens: 14, cachedTokens: 6 })]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(client)
      .compile();
    const scoped = moduleRef.createNestApplication();
    await scoped.init();
    const svc2 = scoped.get(AiService);
    const result = await run(svc2, "usage-1");
    const done = result.events.at(-1);
    expect(done?.event).toBe("done");
    if (done?.event === "done") {
      expect(done.usage).toEqual({ input_tokens: 10, output_tokens: 4, cached_input_tokens: 6, total_tokens: 14 });
      expect(typeof done.entry_id).toBe("string");
    }
    await scoped.close();
  });
});
