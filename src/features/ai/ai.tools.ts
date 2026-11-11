// AI tools — 4 ตัว read-only เท่านั้น (SPEC-ai: ไม่มี web search, ไม่มี tool เขียน draft)
// ทุก tool คืน string สำหรับ tool message — ไม่ throw ทั้ง run เว้นแต่ abort;
// กรณีข้อมูลไม่พร้อม → บอก agent ทางเลือก (เช่น RAG ไม่พร้อม → ใช้ read_proposal) ไม่ใช่ error
import { Inject, Injectable } from "@nestjs/common";
import type { AiToolCall, AiToolDef } from "@/shared/ports/ai-client.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { FilesService } from "@/features/files/files.service.js";
import { expandToSections } from "@/features/files/retrieval.js";
import { ApiError } from "@/shared/http/error-envelope.js";
import { domainProfiles } from "@/shared/domain-profiles/domain-profiles.js";
import * as filesRepo from "@/features/files/files.repository.js";
import * as dmpsRepo from "@/features/dmps/dmps.repository.js";
import * as projectsRepo from "@/features/projects/projects.repository.js";
import { DB } from "@/database/database.module.js";
import type { Db } from "@/features/projects/projects.repository.js";

/** บริบทต่อ run — controller/service ผูกจาก path ก่อนเริ่ม loop */
export interface AiToolContext {
  claims: AccessClaims;
  projectId: string | null;
  dmpId: string | null;
}

export interface AiTool {
  def: AiToolDef;
  run(ctx: AiToolContext, args: unknown): Promise<string>;
}

const NO_PROPOSAL = "ยังไม่มี proposal แนบกับโครงการนี้ — ไม่มีข้อมูลให้อ่าน";

@Injectable()
export class AiTools {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  readonly all: AiTool[] = [
    {
      def: {
        name: "read_proposal",
        description: "อ่านข้อความทั้งหมดจาก proposal ที่แนบกับโครงการ (extracted text) — ไม่มี arguments",
        parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      run: async (ctx) => {
        if (ctx.projectId === null) return "action นี้ไม่ผูกกับโครงการ — ไม่มี proposal ให้อ่าน";
        const project = (await projectsRepo.findById(this.db, ctx.projectId)).at(0);
        const proposalFileId = project?.project.proposalFileId;
        if (proposalFileId === undefined || proposalFileId === null || proposalFileId === "") return NO_PROPOSAL;
        const chunks = await filesRepo.chunksOfFile(this.db, proposalFileId);
        if (chunks.length === 0) return NO_PROPOSAL;
        // pack ต่อ heading_path (SPEC ff2569 Task 8, research §Q14) ให้โมเดลเห็น section เต็ม
        // — expandToSections จัดกลุ่มจาก heading_path ล้วน (meta ไม่มีกลไก parent แล้ว)
        return expandToSections(
          chunks.map((c) => ({ chunk_index: c.chunkIndex, content: c.content, heading_path: c.headingPath, meta: c.meta })),
        )
          .map((s) => (s.heading !== null ? `## ${s.heading}\n${s.content}` : s.content))
          .join("\n\n");
      },
    },
    {
      def: {
        name: "search_proposal",
        description: "ค้นหาใน proposal ด้วย semantic search (RAG) — arguments: { query }",
        parametersJsonSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
      },
      run: async (ctx, args) => {
        const query = typeof (args as { query?: unknown }).query === "string" ? (args as { query: string }).query.trim() : "";
        if (query === "") return "ต้องระบุ query";
        if (ctx.projectId === null) return "action นี้ไม่ผูกกับโครงการ — ไม่มี proposal ให้ค้น";
        const project = (await projectsRepo.findById(this.db, ctx.projectId)).at(0);
        const proposalFileId = project?.project.proposalFileId;
        if (proposalFileId === undefined || proposalFileId === null || proposalFileId === "") return NO_PROPOSAL;
        try {
          const hits = await this.files.retrieve(ctx.claims, proposalFileId, query);
          if (hits.length === 0) return "ไม่พบผลลัพธ์ที่เกี่ยวข้อง — ลอง read_proposal อ่านทั้งเอกสารแทน";
          return hits
            .map((h) => `${h.heading_path !== null ? `[${h.heading_path}] ` : ""}${h.content} (score=${h.score.toFixed(3)})`)
            .join("\n\n");
        } catch (e) {
          // RAG ยังไม่พร้อม (กำลัง embed/re-embed/ไฟล์หาย) — บอก agent ทางเลือก ไม่ error ทั้ง run
          if (e instanceof ApiError) return `search_proposal ใช้ไม่ได้ตอนนี้ (${e.message}) — ให้ใช้ read_proposal อ่านทั้งเอกสารแทน`;
          throw e;
        }
      },
    },
    {
      def: {
        name: "read_draft",
        description: "อ่าน draft ปัจจุบันของ DMP (maDMP JSON) — ไม่มี arguments",
        parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      run: async (ctx) => {
        if (ctx.dmpId === null) return "action นี้ไม่ผูกกับ DMP — ไม่มี draft ให้อ่าน";
        const row = (await dmpsRepo.findById(this.db, ctx.dmpId)).at(0);
        if (row === undefined) return "ไม่พบ DMP นี้";
        return JSON.stringify(row.dmp.draft);
      },
    },
    {
      def: {
        name: "read_domain_profiles",
        description:
          "อ่าน domain profiles ทั้งหมด (ชุดฟิลด์ metadata เฉพาะสาขา) เพื่อเลือก domain/ฟิลด์ให้เหมาะกับโครงการ — ไม่มี arguments",
        parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      run: () => {
        const profiles = Object.values(domainProfiles).map((p) => ({
          key: p.key,
          label: p.label,
          description: p.description,
          fields: p.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required === true })),
        }));
        return Promise.resolve(JSON.stringify(profiles));
      },
    },
  ];

  /** รัน tool call เดียวตามชื่อ — ชื่อไม่รู้จัก → คืนข้อความ error ให้โมเดลแก้เอง (ไม่ทิ้ง run) */
  async dispatch(ctx: AiToolContext, call: AiToolCall): Promise<string> {
    const tool = this.all.find((t) => t.def.name === call.name);
    if (tool === undefined) return `tool "${call.name}" ไม่มีในระบบ — ใช้ได้เฉพาะ: ${this.all.map((t) => t.def.name).join(", ")}`;
    let args: unknown = {};
    try {
      args = call.argumentsJson === "" ? {} : JSON.parse(call.argumentsJson);
    } catch {
      return `arguments ไม่ใช่ JSON ที่ parse ได้: ${call.argumentsJson}`;
    }
    return tool.run(ctx, args);
  }
}
