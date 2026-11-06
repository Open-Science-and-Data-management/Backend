// meta controller — ระบบประกาศ schema ฝั่ง frontend: domain profiles, field policy, OpenAPI spec
import { Controller, Get, Inject } from "@nestjs/common";
import { MetaService, OPENAPI_DOCUMENT } from "./meta.service.js";

@Controller()
export class MetaController {
  constructor(
    @Inject(MetaService) private readonly meta: MetaService,
    @Inject(OPENAPI_DOCUMENT) private readonly openApiDocument: unknown,
  ) {}

  @Get("domain-profiles")
  domainProfiles() {
    return this.meta.domainProfiles();
  }

  @Get("field-policy")
  fieldPolicy() {
    return this.meta.fieldPolicy();
  }

  @Get("openapi-json")
  openapiJson() {
    return this.openApiDocument;
  }
}
