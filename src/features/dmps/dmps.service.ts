// dmps service — use-case layer; กฎ who-sees-what ตาม docs/frontend-api/dmps.md
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { validateDraft } from "@/shared/domain-engine/validate-draft.js";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ProjectsService } from "@/features/projects/projects.service.js";
import { DB } from "@/database/database.module.js";
import type { Db, DmpRow, VersionRow, AuthorRow } from "./dmps.repository.js";
import * as repo from "./dmps.repository.js";

const createDmpSchema = z.object({ project_id: z.string().uuid().optional() });

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SORTS = ["updated", "title", "status"] as const;

export interface DmpVersionResponse {
  object: "dmp_version";
  number: number;
  status: string;
  edit_type: string | null;
  changes: unknown[];
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  approver: null;
  note: string | null;
  minor_edits: unknown[];
}

export interface DmpResponse {
  object: "dmp";
  dmp_id: string;
  project_id: string | null;
  title: string;
  description: string;
  language: string;
  status: string;
  plan_mode: "institutional" | "independent" | null;
  active_version: number | null;
  created_at: Date;
  updated_at: Date;
  researcher: { user_id: string; name: string };
  review_snapshot?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  draft_revision?: number;
  versions?: DmpVersionResponse[];
  readiness?: { complete: boolean; unmet_items: { label: string; section: string }[] };
}

@Injectable()
export class DmpsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  async create(claims: AccessClaims, body: unknown): Promise<DmpResponse> {
    if (claims.role !== "researcher") {
      throw new ApiError(403, "not_a_researcher", "Only researchers can create plans");
    }
    const parsed = createDmpSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const projectId = parsed.data.project_id;
    let planMode: "institutional" | "independent" | null = null;
    if (projectId !== undefined) {
      // ต้องเป็นโครงการของผู้เรียก — ไม่ใช่สมาชิก → 404 (ซ่อนการมีอยู่)
      await this.projects.assertVisible(claims, projectId);
      planMode = (await repo.projectPlanMode(this.db, projectId)).at(0)?.mode ?? null;
    }
    const rows = await repo.create(this.db, { projectId: projectId ?? null, createdBy: claims.sub, planMode });
    const row = rows.at(0);
    const author = (await repo.findAuthor(this.db, claims.sub)).at(0);
    if (row === undefined || author === undefined) {
      throw new ApiError(500, "internal_error", "Plan row disappeared after insert");
    }
    return this.toResponse(row, author, { include: [], includeDraft: true, snapshot: true });
  }

  async list(
    claims: AccessClaims,
    query: {
      project_id?: string;
      archived?: string;
      status?: string | string[];
      q?: string;
      sort?: string;
      limit?: string;
      include?: string | string[];
    },
  ): Promise<ListEnvelope<DmpResponse>> {
    if (claims.role === "admin") throw new ApiError(403, "permission_denied", "Admin has no plan access yet");
    const committee = claims.role === "committee" || claims.role === "chief";
    if (committee && query.project_id === undefined) {
      throw new ApiError(400, "project_id_required", "project_id is required for committee members");
    }
    const statuses = asArray(query.status);
    const dmpStatuses = statuses.filter((s): s is "draft" | "pending" | "approved" =>
      (["draft", "pending", "approved"] as const).includes(s as never),
    );
    if (dmpStatuses.length !== statuses.length) {
      throw new ApiError(400, "field_invalid", "status must be draft, pending or approved", "/status");
    }
    const sort = SORTS.includes((query.sort ?? "") as never) ? (query.sort as "updated" | "title" | "status") : "updated";
    const limit = parseLimit(query.limit);
    const options: repo.ListOptions = {
      // committee เห็น institutional เท่านั้น — project_id ระบุกรอบ (โครงการ citizen มาทีหลัง)
      authorId: claims.role === "researcher" ? claims.sub : undefined,
      projectId: query.project_id,
      archived: query.archived === "true" && claims.role === "researcher",
      statuses: dmpStatuses,
      q: query.q,
      sort,
      limit,
    };
    if (committee) {
      const projectRow = (await repo.projectPlanMode(this.db, options.projectId ?? null)).at(0);
      if (projectRow === undefined) throw new ApiError(404, "project_not_found", "No project with that id");
      if (projectRow.mode !== "institutional") return listOf([], false, 0);
    }
    const rows = await repo.list(this.db, options);
    const total = (await repo.count(this.db, options)).at(0)?.n ?? 0;
    const include = asArray(query.include);
    const data: DmpResponse[] = [];
    for (const row of rows.slice(0, limit)) {
      data.push(await this.toResponse(row.dmp, row.author, { include }));
    }
    return listOf(data, rows.length > limit, total);
  }

  async get(
    claims: AccessClaims,
    dmpId: string,
    include: string[],
  ): Promise<DmpResponse> {
    const row = await this.findVisible(claims, dmpId);
    // include=draft เฉพาะ author — committee ขอก็ไม่ได้ (doc §Retrieve a plan)
    const isAuthor = claims.role === "researcher" && row.dmp.createdBy === claims.sub;
    return this.toResponse(row.dmp, row.author, { include, includeDraft: isAuthor, snapshot: true });
  }

  /** 404 เมื่อไม่มีแผน หรือ researcher ไม่ใช่ผู้เขียน (ซ่อนการมีอยู่) — ตาม doc §Who works on a plan */
  private async findVisible(claims: AccessClaims, dmpId: string): Promise<repo.DmpWithAuthor> {
    const row = (await repo.findById(this.db, dmpId)).at(0);
    if (row === undefined) throw new ApiError(404, "dmp_not_found", "No plan with that id");
    if (claims.role === "admin") throw new ApiError(403, "permission_denied", "Admin has no plan access yet");
    if (claims.role === "researcher") {
      if (row.dmp.createdBy !== claims.sub) throw new ApiError(404, "dmp_not_found", "No plan with that id");
      return row;
    }
    // committee/chief — เฉพาะ institutional
    const mode = row.dmp.planMode ?? (await repo.projectPlanMode(this.db, row.dmp.projectId)).at(0)?.mode;
    if (mode !== "institutional") throw new ApiError(403, "plan_not_reviewable", "The plan is independent; the committee has no part in it");
    return row;
  }

  /** ร่าง plan response — content top-level อ่านจาก draft, review_snapshot = pending → in force → draft */
  private async toResponse(
    dmp: DmpRow,
    author: Pick<AuthorRow, "userId" | "name" | "surname">,
    opts: { include: string[]; includeDraft?: boolean; snapshot?: boolean },
  ): Promise<DmpResponse> {
    const draft = (dmp.draft ?? {}) as Record<string, unknown>;
    const versions = await repo.listVersions(this.db, dmp.dmpId);
    const pending = versions.find((v) => v.status === "pending");
    const inForce = dmp.activeVersion !== null ? versions.find((v) => v.number === dmp.activeVersion) : undefined;
    const snapshot = (pending?.snapshot ?? inForce?.snapshot ?? dmp.draft) as Record<string, unknown>;

    const response: DmpResponse = {
      object: "dmp",
      dmp_id: dmp.dmpId,
      project_id: dmp.projectId,
      title: typeof draft.title === "string" && draft.title.length > 0 ? draft.title : dmp.title,
      description: typeof draft.description === "string" ? draft.description : dmp.title,
      language: typeof draft.language === "string" ? draft.language : "eng",
      status: dmp.status,
      plan_mode: dmp.planMode,
      active_version: dmp.activeVersion,
      created_at: dmp.createdAt,
      updated_at: dmp.updatedAt,
      researcher: { user_id: author.userId, name: `${author.name} ${author.surname}`.trim() },
    };
    if (opts.snapshot === true) {
      response.review_snapshot = snapshot;
    }
    if (opts.includeDraft === true) {
      response.draft = draft;
      response.draft_revision = dmp.draftRevision;
    }
    if (opts.include.includes("versions")) {
      response.versions = versions.map(toVersionResponse);
    }
    if (opts.include.includes("readiness")) {
      const result = validateDraft(snapshot);
      response.readiness =
        result.ok
          ? { complete: true, unmet_items: [] }
          : {
              complete: false,
              unmet_items: result.errors.map((e) => ({ label: e.message, section: e.path })),
            };
    }
    return response;
  }
}

export function toVersionResponse(v: VersionRow): DmpVersionResponse {
  return {
    object: "dmp_version",
    number: v.number,
    status: v.status,
    edit_type: v.editType ?? null,
    changes: (v.changes ?? []) as unknown[],
    created_at: v.createdAt,
    decided_at: v.decidedAt,
    decided_by: v.decidedBy,
    approver: null,
    note: v.decisionNote,
    minor_edits: (v.minorEdits ?? []) as unknown[],
  };
}

function asArray(raw?: string | string[]): string[] {
  if (raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v.length > 0);
}

function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
