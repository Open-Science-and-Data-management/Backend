// meta module — endpoints ที่ frontend อ่าน registry จาก backend แทน hardcode
import { Module } from "@nestjs/common";
import { MetaController } from "./meta.controller.js";
import { MetaService } from "./meta.service.js";

import { OpenApiController } from "./openapi.controller.js";
import { OpenApiService } from "./openapi.service.js";

@Module({
  controllers: [MetaController, OpenApiController],
  providers: [MetaService, OpenApiService],
})
export class MetaModule {}
