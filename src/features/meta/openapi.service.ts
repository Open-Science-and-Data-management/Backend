// OpenAPI JSON endpoint — เสิร์ฟ spec ที่ /openapi-json (ADR-0010)
// เดิม SwaggerModule.setup jsonDocumentUrl ใน main.ts — e2e ใช้ Test.createTestingModule (ไม่ผ่าน main.ts)
// จึงได้ 404; เสิร์ฟผ่าน controller ที่นี่จึงใช้ได้ทั้ง dev และ e2e (@Public อ่านอย่างเดียว)
import { Inject, Injectable } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { HttpAdapterHost, ModuleRef } from "@nestjs/core";
import { buildOpenApiDocument, type OpenApiDocument } from "./openapi-document.js";

@Injectable()
export class OpenApiService {
  private doc?: OpenApiDocument;

  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef, // design:type หลุดจาก @nestjs/core (วงจร import) — ต้อง token ชัดเจน
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  document(): OpenApiDocument {
    this.doc ??= this.build();
    return this.doc;
  }

  private build(): OpenApiDocument {
    // Nest 12 ไม่ expose app instance ผ่าน DI — createDocument ใช้จริงแค่ container (+applicationConfig)
    // และ getHttpAdapter (swagger-scanner.js:24-27) จึงประกอบ app-like object จาก ModuleRef/HttpAdapterHost
    // ที่จุดเดียวนี้; container เป็น protected บน ModuleRef — reflect พร้อม surface ที่ประกาศเอง
    interface NestContainerSurface {
      applicationConfig: unknown;
    }
    const container = Reflect.get(this.moduleRef, "container") as NestContainerSurface;
    const adapter = this.httpAdapterHost.httpAdapter;
    const appLike = { container, config: container.applicationConfig, getHttpAdapter: () => adapter };
    return buildOpenApiDocument(appLike as unknown as INestApplication);
  }
}
