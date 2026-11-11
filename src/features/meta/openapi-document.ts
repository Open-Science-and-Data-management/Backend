// OpenAPI document builder — paths จาก Nest router scan (SwaggerModule) + paths/components
// จาก zod registry (ADR-0010) merge ทับแบบ per-method; ใช้ร่วมกันจาก main.ts (Swagger UI)
// และ OpenApiService เสิร์ฟ JSON ที่ /openapi-json (ให้ e2e/supertest เข้าถึงได้ผ่าน AppModule เดียวกัน)
import type { INestApplication } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "@shared/contracts/openapi.js";

export type OpenApiDocument = OpenAPIObject;

export function buildOpenApiDocument(app: INestApplication): OpenApiDocument {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle("uni-backend").setVersion("0.1.0").addBearerAuth().build(),
  );
  // registry gen ด้วย V31 และประกาศ spec เป็น 3.1.0 (เดิม meta.service ก็เสิร์ฟ 3.1.0 — e2e meta pin ค่านี้)
  // cast: SchemaObject ของ dialect 3.1 ไม่ตรง typing 3.0 ของ OpenAPIObject — JSON ใช้ร่วมได้จริง
  const registryDoc = new OpenApiGeneratorV31(registry.definitions).generateDocument({
    info: { title: "uni-backend", version: "0.1.0" },
    openapi: "3.1.0",
  }) as unknown as OpenApiDocument;
  for (const [path, item] of Object.entries(registryDoc.paths)) {
    document.paths[path] = { ...(document.paths[path] ?? {}), ...item };
  }
  document.components = { ...document.components, ...registryDoc.components };
  document.openapi = "3.1.0";

  // global AuthGuard (session.ts) ครอบทุก endpoint — เส้นทาง @Public ประกาศ security: [] ผ่าน registry
  // op ไหนไม่ได้ระบุ security เอง = ต้อง sign-in (Bearer JWT จาก /auth/sessions)
  for (const item of Object.values(document.paths)) {
    for (const op of Object.values(item)) {
      if (typeof op === "object" && op !== null && !Array.isArray(op) && !("security" in op)) {
        Object.assign(op, { security: [{ bearer: [] }] }); // default: ต้อง sign-in
      }
    }
  }

  // SwaggerModule ไม่ infer path parameters เอง — เติมจาก template ({taskId}) ให้ทุก operation
  type OperationSpec = { parameters?: { name: string; in: string; required?: boolean; schema?: { type: string } }[] };

  for (const [path, item] of Object.entries(document.paths)) {
    const names = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (names.length === 0) continue;
    for (const op of Object.values(item)) {
      if (typeof op !== "object" || op === null || Array.isArray(op)) continue;
      const spec = op as OperationSpec; // operation object ใน path-item — guard ด้านบนแล้ว
      for (const name of names) {
        spec.parameters ??= [];
        if (!spec.parameters.some((p) => p.in === "path" && p.name === name)) {
          spec.parameters.push({ name, in: "path", required: true, schema: { type: "string" } });
        }
      }
    }
  }
  return document;
}
