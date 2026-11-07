// Bootstrap — NestJS app; config โหลดก่อน mount เพื่อ fail fast
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config/index.js";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";
import { registry } from "./shared/contracts/openapi.js";

await loadConfig();
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required");
  process.exit(1);
}

const app = await NestFactory.create(AppModule);
app.useGlobalFilters(new ErrorEnvelopeFilter());

// spec: paths สแกนจาก Nest router อัตโนมัติ (SwaggerModule — เพิ่ม controller ใหม่แล้วขึ้นเอง)
// + paths/components จาก zod registry (ADR-0010) — endpoint ที่ประกาศ registerPath ไว้ใน contracts/openapi.ts
//   จะ override ตัวจาก Nest แบบ per-method (เพราะมี params/body/examples/responses ครบกว่า)
//   ; UI ที่ /api-docs, JSON คงเส้นทางเดิม /openapi-json
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle("uni-backend").setVersion("0.1.0").addBearerAuth().build(),
);
const registryDoc = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  info: { title: "uni-backend", version: "0.1.0" },
  openapi: "3.0.1",
});
for (const [path, item] of Object.entries(registryDoc.paths)) {
  document.paths[path] = { ...(document.paths[path] ?? {}), ...item };
}
document.components = { ...document.components, ...registryDoc.components };

// global AuthGuard (session.ts) ครอบทุก endpoint — เส้นทาง @Public ประกาศ security: [] ผ่าน registry
// op ไหนไม่ได้ระบุ security เอง = ต้อง sign-in (Bearer JWT จาก /auth/sessions)
for (const item of Object.values(document.paths)) {
  for (const op of Object.values(item)) {
    if (typeof op === "object" && op !== null && !Array.isArray(op) && op.security === undefined) {
      op.security = [{ bearer: [] }];
    }
  }
}

// SwaggerModule ไม่ infer path parameters เอง — เติมจาก template ({taskId}) ให้ทุก operation
type OperationSpec = { parameters?: { name: string; in: string; required?: boolean; schema?: { type: string } }[] };

for (const [path, item] of Object.entries(document.paths as Record<string, Record<string, OperationSpec>>)) {
  const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (names.length === 0) continue;
  for (const op of Object.values(item) as unknown[]) {
    if (typeof op !== "object" || op === null) continue;
    const spec = op as OperationSpec;
    for (const name of names) {
      spec.parameters ??= [];
      if (!spec.parameters.some((p) => p.in === "path" && p.name === name)) {
        spec.parameters.push({ name, in: "path", required: true, schema: { type: "string" } });
      }
    }
  }
}

SwaggerModule.setup("api-docs", app, document, { jsonDocumentUrl: "/openapi-json" });

await app.listen(process.env.PORT ?? 3000);
