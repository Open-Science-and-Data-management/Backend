// Bootstrap — NestJS app; config โหลดก่อน mount เพื่อ fail fast
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config/index.js";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";
import { buildOpenApiDocument } from "./features/meta/openapi-document.js";

await loadConfig();
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required");
  process.exit(1);
}

const app = await NestFactory.create(AppModule);
app.useGlobalFilters(new ErrorEnvelopeFilter());

// spec: paths สแกนจาก Nest router + zod registry merge (ADR-0010) — logic อยู่ shared/http/openapi-document.ts
// JSON ที่ /openapi-json เสิร์ฟโดย OpenApiService (ใน AppModule — ใช้ได้ทั้ง dev และ e2e); ที่นี่เหลือแต่ Swagger UI
const document = buildOpenApiDocument(app);

SwaggerModule.setup("api-docs", app, document);

await app.listen(process.env.PORT ?? 3000);
