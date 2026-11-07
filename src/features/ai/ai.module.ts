import { Module } from "@nestjs/common";
import { FilesModule } from "@/features/files/files.module.js";
import { AI_CLIENT } from "@/shared/ports/ai-client.js";
import { OpenRouterClient } from "@/shared/adapters/open-router/open-router-client.js";
import { AiTools } from "./ai.tools.js";
import { ReactLoop } from "./react-loop.js";

@Module({
  imports: [FilesModule], // FilesService — search_proposal (RAG)
  providers: [AiTools, ReactLoop, { provide: AI_CLIENT, useClass: OpenRouterClient }],
  exports: [ReactLoop],
})
export class AiModule {}
