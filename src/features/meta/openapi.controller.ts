// OpenAPI JSON controller — GET /openapi-json คืน spec เต็ม (Nest scan + zod registry merge, ADR-0010)
import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "@/features/auth/session.js";
import { OpenApiService } from "./openapi.service.js";

@Controller()
export class OpenApiController {
  constructor(@Inject(OpenApiService) private readonly openapi: OpenApiService) {}

  @Public()
  @Get("openapi-json")
  openapiJson() {
    return this.openapi.document();
  }
}
