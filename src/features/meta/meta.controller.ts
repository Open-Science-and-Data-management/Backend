// meta controller — ระบบประกาศ schema ฝั่ง frontend: domain profiles, field policy
// (OpenAPI spec เสิร์ฟโดย SwaggerModule ใน main.ts — ADR-0010)
import { Controller, Get, Inject } from "@nestjs/common";
import { MetaService } from "./meta.service.js";

@Controller()
export class MetaController {
  constructor(@Inject(MetaService) private readonly meta: MetaService) {}

  @Get("domain-profiles")
  domainProfiles() {
    return this.meta.domainProfiles();
  }

  @Get("field-policy")
  fieldPolicy() {
    return this.meta.fieldPolicy();
  }
}
