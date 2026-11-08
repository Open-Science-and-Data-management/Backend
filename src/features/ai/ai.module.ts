import { Module } from "@nestjs/common";
import { FilesModule } from "@/features/files/files.module.js";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { AI_CLIENT } from "@/shared/ports/ai-client.js";
import { OpenRouterClient } from "@/shared/adapters/open-router/open-router-client.js";
import { MockAiClient } from "@/shared/adapters/mock-ai/mock-ai-client.js";
import { config } from "@/shared/config/index.js";
import { AiTools } from "./ai.tools.js";
import { ReactLoop } from "./react-loop.js";
import { AiService } from "./ai.service.js";
import { AiController, AiDmpController, AiThreadController } from "./ai.controller.js";

@Module({
  imports: [FilesModule, ProjectsModule], // FilesService — RAG; ProjectsService — assertVisible
  controllers: [AiController, AiThreadController, AiDmpController],
  providers: [
    AiTools,
    ReactLoop,
    AiService,
    // ai.mock = true → MockAiClient (ไม่ยิง network / ไม่ใช้ OPENROUTER_KEY); false → OpenRouter จริง (TC-6)
    { provide: AI_CLIENT, useFactory: () => (config().ai.mock ? new MockAiClient() : new OpenRouterClient()) },
  ],
  exports: [ReactLoop, AiService],
})
export class AiModule {}
