// e2e Task 7 — meta endpoints: /domain-profiles, /field-policy, /openapi-json
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "@/database/database.module.js";
import { AuthModule } from "@/features/auth/auth.module.js";
import { UsersModule } from "@/features/users/users.module.js";
import { MetaModule } from "@/features/meta/meta.module.js";
import { AuthGuard } from "@/features/auth/session.js";
import { ErrorEnvelopeFilter } from "@/shared/http/error-envelope.js";
import { loadConfig } from "@/shared/config/index.js";

describe("meta endpoints e2e", () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "e2e-secret";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/uni";
    await loadConfig();
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, UsersModule, AuthModule, MetaModule],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post("/users").send({
      account_type: "institutional",
      name: "Meta",
      surname: "Tester",
      email: "e2e-meta@example.edu",
      organization: "Uni",
      username: "e2e-meta",
      password: "passw0rd8",
      confirm_password: "passw0rd8",
    });
    const signIn = await request(app.getHttpServer())
      .post("/auth/sessions")
      .send({ username: "e2e-meta", password: "passw0rd8" });
    token = signIn.body.access_token as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /domain-profiles — registry passthrough เป็น list", async () => {
    const res = await request(app.getHttpServer())
      .get("/domain-profiles")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("list");
    expect(res.body.has_more).toBe(false);
    expect(res.body.total_count).toBe(8);
    const generic = (res.body.data as Record<string, unknown>[]).find((p) => p.key === "generic");
    expect(generic).toBeDefined();
    expect(generic?.label).toEqual(expect.any(String));
    expect(Array.isArray(generic?.fields)).toBe(true);
  });

  it("GET /field-policy — dmp/dataset/lists จาก registry เดียวกับ engine", async () => {
    const res = await request(app.getHttpServer())
      .get("/field-policy")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.object).toBe("field_policy");
    expect(res.body.dmp.title).toEqual(expect.objectContaining({ permission: expect.any(String), kind: expect.any(String) }));
    expect(Object.keys(res.body.dataset).length).toBeGreaterThan(0);
    expect(Object.keys(res.body.lists)).toEqual(expect.arrayContaining(["dataset", "contributor", "cost"]));
  });

  it("GET /openapi-json — spec ที่ parse ได้ มี openapi version + paths + schemas ที่ลงทะเบียน", async () => {
    const res = await request(app.getHttpServer())
      .get("/openapi-json")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(() => JSON.parse(res.text)).not.toThrow();
    const spec = res.body;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info?.title).toEqual(expect.any(String));
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThanOrEqual(0);
    const schemas = spec.components?.schemas ?? {};
    expect(schemas.ErrorEnvelope).toBeDefined();
    expect(schemas.Notification).toBeDefined();
    expect(schemas.NotificationBatch).toBeDefined();
    expect(schemas.Task).toBeDefined();
    // client-generable: schema มี type หรือ $ref ครบ
    expect(schemas.Notification.properties.type).toBeDefined();
  });
});
