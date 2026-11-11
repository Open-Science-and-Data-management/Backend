import { Module } from "@nestjs/common";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { FILE_STORAGE } from "@/shared/ports/file-storage.js";
import { DiskStorage } from "@/shared/adapters/disk-storage/disk-storage.js";
import { EMBEDDING } from "@/shared/ports/embedding.js";
import { TransformersEmbedding } from "@/shared/adapters/embedding/transformers-embedding.js";
import { AI_CLIENT } from "@/shared/ports/ai-client.js";
import { OpenRouterClient } from "@/shared/adapters/open-router/open-router-client.js";
import { MockAiClient } from "@/shared/adapters/mock-ai/mock-ai-client.js";
import { config } from "@/shared/config/index.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FILE_STORAGE, useClass: DiskStorage },
    { provide: EMBEDDING, useClass: TransformersEmbedding },
    // VLM caption (SPEC ff2569 Task 7) — factory เดียวกับ ai.module (import กลับไม่ได้: AiModule → FilesModule);
    // ai.mock = true → MockAiClient (ไม่ยิง network), false → OpenRouter จริง
    { provide: AI_CLIENT, useFactory: () => (config().ai.mock ? new MockAiClient() : new OpenRouterClient()) },
  ],
  exports: [FilesService],
})
export class FilesModule {}
