// Bootstrap — NestJS app; config โหลดก่อน mount เพื่อ fail fast
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config/index.js";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";
import type { Response } from "express";
import { registry } from "./shared/contracts/openapi.js";

await loadConfig();
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required");
  process.exit(1);
}

const app = await NestFactory.create(AppModule);
app.useGlobalFilters(new ErrorEnvelopeFilter());

const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  info: { title: "uni-backend", version: "0.1.0" },
  openapi: "3.0.1",
});
app.getHttpAdapter().get("/openapi-json", (_req: unknown, res: Response): void => {
  res.json(document);
});

await app.listen(process.env.PORT ?? 3000);
