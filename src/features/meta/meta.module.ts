// meta module — endpoints ที่ frontend อ่าน registry จาก backend แทน hardcode
import { Module } from "@nestjs/common";
import { MetaController } from "./meta.controller.js";
import { generateOpenApiDocument, MetaService, OPENAPI_DOCUMENT } from "./meta.service.js";

@Module({
  controllers: [MetaController],
  providers: [
    MetaService,
    { provide: OPENAPI_DOCUMENT, useFactory: generateOpenApiDocument },
  ],
})
export class MetaModule {}
