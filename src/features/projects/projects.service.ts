// projects service — use-case layer; role rules + delete protection (flow #13)
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { createProjectSchema } from "@/shared/contracts/project.js";
import { projectMembers } from "@/database/schema/index.js";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { DB } from "@/database/database.module.js";
import type { Db } from "./projects.repository.js";
import * as repo from "./projects.repository.js";

type ProjectResponse = ReturnType<typeof repo.toProjectResponse>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(claims: AccessClaims, body: unknown) {
    if (claims.role !== "researcher") {
      throw new ApiError(403, "not_a_researcher", "Only researchers can create projects");
    }
    const parsed = createProjectSchema.omit({ plan_mode: true, status: true }).safeParse(body);
    if (!parsed.success) {
      if (firstPath(parsed.error) === "project_name") {
        throw new ApiError(400, "project_name_required", "project_name is blank", "/project_name");
      }
      throw fieldInvalid(parsed.error);
    }
    if (parsed.data.project_name.trim().length === 0) {
      throw new ApiError(400, "project_name_required", "project_name is blank", "/project_name");
    }
    const me = (await repo.findUser(this.db, claims.sub)).at(0);
    if (me === undefined) throw new ApiError(401, "not_signed_in", "Sign in to continue");
    // plan_mode มาจาก account_type ของผู้สร้าง — server derive เสมอ ไม่รับจาก client
    const planMode = me.accountType === "citizen" ? "independent" : "institutional";
    const row = await repo.create(this.db, {
      projectName: parsed.data.project_name,
      description: parsed.data.description,
      planMode,
      createdBy: claims.sub,
    });
    return repo.toProjectResponse(row, { fileCount: 0, memberCount: 1, awaitingReview: false });
  }

  async list(
    claims: AccessClaims,
    query: { plan_mode?: string; limit?: string; starting_after?: string },
  ): Promise<ListEnvelope<ProjectResponse>> {
    const limit = parseLimit(query.limit);
    const startingAfter = query.starting_after;

    if (claims.role === "committee" || claims.role === "chief") {
      // committee เห็นเฉพาะ institutional; plan_mode อื่น → ไม่มีผลลัพธ์
      if (query.plan_mode !== undefined && query.plan_mode !== "institutional") return listOf([], false, 0);
      const rows = await repo.listForCommittee(this.db, limit, startingAfter);
      return this.page(rows, limit, (await repo.countForCommittee(this.db)).at(0)?.n ?? 0);
    }
    if (claims.role === "researcher") {
      const rows = await repo.listForMember(this.db, claims.sub, limit, startingAfter);
      return this.page(rows, limit, (await repo.countForMember(this.db, claims.sub)).at(0)?.n ?? 0);
    }
    throw new ApiError(403, "permission_denied", "Admin has no project access yet");
  }

  async get(claims: AccessClaims, projectId: string): Promise<ProjectResponse> {
    const row = await this.findVisible(claims, projectId);
    return repo.toProjectResponse(row.project, {
      fileCount: row.fileCount,
      memberCount: row.memberCount,
      awaitingReview: row.awaitingReview,
    });
  }

  async listMembers(claims: AccessClaims, projectId: string) {
    await this.findVisible(claims, projectId);
    const rows = await repo.listMembers(this.db, projectId);
    return listOf(
      rows.map((r) => ({
        object: "project_member" as const,
        project_id: r.member.projectId,
        user_id: r.member.userId,
        project_role: r.member.projectRole,
        user: { name: r.name, email: r.email },
      })),
      false,
      rows.length,
    );
  }

  async remove(claims: AccessClaims, projectId: string) {
    await this.findVisible(claims, projectId);
    const plans = await repo.hasPlans(this.db, projectId);
    if ((plans.at(0)?.n ?? 0) > 0) {
      // preservation — ต้องไม่มีแผนเหลือเลย (นับรวม archived) จึงลบได้ (หมวด 4.2)
      throw new ApiError(409, "project_has_plans", "Delete the project's plans first");
    }
    await repo.remove(this.db, projectId);
    return { deleted: true };
  }

  /** 404 เมื่อไม่มีโครงการ หรือ researcher ไม่ได้เป็นสมาชิก (ซ่อนการมีอยู่) */
  private async findVisible(claims: AccessClaims, projectId: string) {
    const row = (await repo.findById(this.db, projectId)).at(0);
    if (row === undefined) throw new ApiError(404, "project_not_found", "No project with that id");
    if (claims.role === "researcher") {
      const member = await this.db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, claims.sub)))
        .limit(1);
      if (member.length === 0) throw new ApiError(404, "project_not_found", "No project with that id");
    } else if (claims.role === "admin") {
      throw new ApiError(403, "permission_denied", "Admin has no project access yet");
    }
    return row;
  }

  private page(rows: repo.ProjectWithCounts[], limit: number, total: number): ListEnvelope<ProjectResponse> {
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) =>
      repo.toProjectResponse(r.project, {
        fileCount: r.fileCount,
        memberCount: r.memberCount,
        awaitingReview: r.awaitingReview,
      }),
    );
    return listOf(data, hasMore, total);
  }
}

function firstPath(error: ZodError): string | undefined {
  const issue = error.issues.at(0);
  const head = issue?.path.at(0);
  return typeof head === "string" ? head : undefined;
}

function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
