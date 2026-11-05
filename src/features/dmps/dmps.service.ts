// dmps service — use-case layer; กฎ who-sees-what ตาม docs/frontend-api/dmps.md
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { validateDraft } from "@/shared/domain-engine/validate-draft.js";
import { generateTasks } from "@/shared/domain-engine/task-generator.js";
import { dmpDraftSchema, type DmpDraftInput } from "@/shared/contracts/dmp.js";
import { MADMP_SCHEMA_VERSION } from "@/shared/contracts/madmp-vocabularies.js";
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

/** ค่า default ของ draft field — ใช้เทียบ locked เมื่อ draft เก็บยังไม่มีค่านั้น */
const MADMP_DEFAULTS: Record<string, unknown> = { schema_version: MADMP_SCHEMA_VERSION };

export interface DmpVersionResponse {
  object: "dmp_version";
  number: number;
  status: string;
  edit_type: string | null;
  changes: unknown[];
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  approver: { user_id: string; name: string; position: string; mbox: string | null } | null;
  note: string | null;
  minor_edits: unknown[];
  carried_minor_edits?: unknown;
  dropped_minor_edits?: unknown;
  plan_status?: string;
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

  /** PUT draft ทั้งก้อน (ADR-0020) — ตรวจ type/format เท่านั้น, locked ปฏิเสธ, CAS บน revision */
  async saveDraft(claims: AccessClaims, dmpId: string, body: unknown) {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "Only researchers edit drafts");
    const row = (await repo.findById(this.db, dmpId)).at(0);
    if (row === undefined || row.dmp.createdBy !== claims.sub) {
      throw new ApiError(404, "dmp_not_found", "No plan with that id");
    }

    const parsedBody = z
      .object({ draft_revision: z.number().int().nonnegative(), draft: dmpDraftSchema })
      .safeParse(body);
    if (!parsedBody.success) throw fieldInvalid(parsedBody.error);
    const { draft_revision: revision, draft: draftInput } = parsedBody.data;

    // locked fields — เทียบกับค่าเดิมใน draft; begin/end แก้ได้จนกว่าแผนมีผล (doc §Update a draft)
    // เช็ค key จาก input ดิบ — zod เติม default (เช่น schema_version) ให้ output เสมอ
    let rawDraft: Record<string, unknown> = {};
    if (body !== null && typeof body === "object" && "draft" in body) {
      const d = body.draft;
      if (d !== null && typeof d === "object") rawDraft = d as Record<string, unknown>;
    }
    const current = (row.dmp.draft ?? {}) as Record<string, unknown>;
    const parsedDraft: Record<string, unknown> = { ...draftInput };
    const locked = row.dmp.status === "approved" ? ["schema_version", "begin_date", "end_date"] : ["schema_version"];
    for (const field of locked) {
      if (field in rawDraft && !valuesEqual(parsedDraft[field], current[field] ?? MADMP_DEFAULTS[field])) {
        throw new ApiError(400, "field_locked", `The ${field} field is locked`, `/draft/${field}`);
      }
    }

    const updated = (await repo.updateDraft(this.db, dmpId, { draft: draftInput, expectedRevision: revision })).at(0);
    if (updated === undefined) {
      // CAS ไม่ผ่าน — คืน draft ปัจจุบันให้ rebase (ADR-0020)
      const latest = (await repo.findById(this.db, dmpId)).at(0);
      if (latest === undefined) throw new ApiError(404, "dmp_not_found", "No plan with that id");
      throw new ApiError(409, "draft_conflict", "The draft changed since your last read", undefined, {
        draft: latest.dmp.draft,
        draft_revision: latest.dmp.draftRevision,
      });
    }
    return {
      object: "dmp_draft" as const,
      dmp_id: dmpId,
      draft_revision: updated.draftRevision,
      draft: updated.draft,
    };
  }

  /** discard — กลับไปยังสิ่งที่ส่ง/มีผลแล้ว; แผนที่ไม่เคยส่ง → 409 never_submitted (archive แทน) */
  async discardDraft(claims: AccessClaims, dmpId: string): Promise<DmpResponse> {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "Only researchers edit drafts");
    const row = (await repo.findById(this.db, dmpId)).at(0);
    if (row === undefined || row.dmp.createdBy !== claims.sub) {
      throw new ApiError(404, "dmp_not_found", "No plan with that id");
    }
    const versions = await repo.listVersions(this.db, dmpId);
    if (versions.length === 0) {
      throw new ApiError(409, "never_submitted", "The plan has no submission to go back to; archive it instead");
    }
    const pending = versions.find((v) => v.status === "pending");
    const inForce =
      row.dmp.activeVersion !== null ? versions.find((v) => v.number === row.dmp.activeVersion) : undefined;
    const snapshot = pending?.snapshot ?? inForce?.snapshot ?? versions.at(0)?.snapshot ?? {};
    const updated = (await repo.resetDraftToSnapshot(this.db, dmpId, snapshot)).at(0);
    if (updated === undefined) throw new ApiError(500, "internal_error", "Discard failed");
    return this.toResponse(updated, row.author, { include: [], includeDraft: true, snapshot: true });
  }

  /** submit (institutional) — ผ่าน dmpSchema ครบ + draft_revision ตรง → version 1 pending (flow #5) */
  async submit(claims: AccessClaims, dmpId: string, body: unknown): Promise<DmpResponse> {
    const row = await this.findOwnedDraft(claims, dmpId);
    const revision = parseRevision(body);
    const draft = (row.dmp.draft ?? {}) as Record<string, unknown>;
    if (revision !== row.dmp.draftRevision) {
      throw new ApiError(409, "draft_conflict", "The draft changed after it was reviewed", undefined, {
        draft,
        draft_revision: row.dmp.draftRevision,
      });
    }
    const versions = await repo.listVersions(this.db, dmpId);
    if (versions.length > 0) {
      throw new ApiError(409, "already_submitted", "The plan already has a version; changes go through revisions");
    }
    const mode = row.dmp.planMode ?? (await repo.projectPlanMode(this.db, row.dmp.projectId)).at(0)?.mode;
    if (mode !== "institutional") {
      throw new ApiError(409, "plan_is_independent", "Independent plans are finalized by their author");
    }
    const check = validateDraft(draft);
    if (!check.ok) {
      const first = check.errors.at(0);
      if (first === undefined) throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items");
      throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items", first.path, {
        items: check.errors.map((e) => ({ label: e.message, section: e.path })),
      });
    }
    const title = typeof draft.title === "string" ? draft.title : "";
    try {
      const { dmp } = await repo.submitTx(this.db, {
        dmpId,
        snapshot: draft,
        title,
        planMode: "institutional",
        submittedBy: claims.sub,
      });
      await repo.addNotifications(this.db, [
        {
          userId: claims.sub,
          type: "dmp_submitted",
          title: `ส่งแผน "${dmp.title}" เข้าสู่การพิจารณา`,
          message: null,
          link: `/dmps/${dmpId}`,
          dmpId,
        },
      ]);
      const reviewerIds = await repo.reviewers(this.db);
      await repo.addNotifications(
        this.db,
        reviewerIds.map((r) => ({
          userId: r.userId,
          type: "review_requested" as const,
          title: `มีแผนรอพิจารณา: "${dmp.title}"`,
          message: null,
          link: `/dmps/${dmpId}`,
          dmpId,
        })),
      );
      return await this.toResponse(dmp, row.author, { include: ["versions"], includeDraft: true, snapshot: true });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // QS-1 — submit ขนาน: Postgres ปฏิเสธตัวที่สองเอง
        throw new ApiError(409, "already_submitted", "The plan already has a submission");
      }
      throw error;
    }
  }

  /** finalize (independent) — version ออกผล + tasks ชุดแรกใน tx เดียว (flow #7) */
  async finalize(claims: AccessClaims, dmpId: string, body: unknown): Promise<DmpResponse> {
    const row = await this.findOwnedDraft(claims, dmpId);
    const revision = parseRevision(body);
    const draft = (row.dmp.draft ?? {}) as Record<string, unknown>;
    if (revision !== row.dmp.draftRevision) {
      throw new ApiError(409, "draft_conflict", "The draft changed after it was reviewed", undefined, {
        draft,
        draft_revision: row.dmp.draftRevision,
      });
    }
    const mode = row.dmp.planMode ?? (await repo.projectPlanMode(this.db, row.dmp.projectId)).at(0)?.mode;
    if (mode !== "independent") {
      throw new ApiError(409, "plan_is_institutional", "Institutional plans are decided by the committee");
    }
    const check = validateDraft(draft);
    if (!check.ok) {
      const first = check.errors.at(0);
      if (first === undefined) throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items");
      throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items", first.path, {
        items: check.errors.map((e) => ({ label: e.message, section: e.path })),
      });
    }
    const outputs = Array.isArray(draft.dataset) ? draft.dataset : [];
    const outputsInForce = outputs
      .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
      .map((o) => ({
        dataset_id: typeof o.dataset_id === "string" ? o.dataset_id : "",
        title: typeof o.title === "string" ? o.title : "",
        type: typeof o.type === "string" ? o.type : "other",
        access: typeof o.access === "string" ? o.access : "closed",
      }));
    const generated = generateTasks(outputsInForce);
    const title = typeof draft.title === "string" ? draft.title : "";
    try {
      const { dmp } = await repo.finalizeTx(this.db, {
        dmpId,
        snapshot: draft,
        title,
        finalizedBy: claims.sub,
        tasks: (versionId) =>
          generated.map((t) => ({
            dmpId,
            datasetId: t.dataset_id,
            title: t.title,
            details: t.details,
            lifecycleStage: t.lifecycle_stage,
            priority: t.priority,
            sourceVersionId: versionId,
          })),
        notification: {
          userId: claims.sub,
          title: `แผน "${title}" มีผลแล้ว (finalize)`,
          message: null,
          link: `/dmps/${dmpId}`,
        },
      });
      return await this.toResponse(dmp, row.author, { include: ["versions"], includeDraft: true, snapshot: true });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "already_submitted", "The plan already has a submission");
      }
      throw error;
    }
  }

  /** minor edits — ทุก change ต้อง minor; fold ลง version in force ทันที (flow #8) */
  async saveMinorEdits(claims: AccessClaims, dmpId: string, body: unknown): Promise<DmpVersionResponse> {
    const row = await this.findOwnedDraft(claims, dmpId);
    const revision = parseRevision(body);
    const draft = row.dmp.draft as DmpDraftInput;
    if (revision !== row.dmp.draftRevision) {
      throw new ApiError(409, "draft_conflict", "The draft changed since your last read", undefined, {
        draft: row.dmp.draft,
        draft_revision: row.dmp.draftRevision,
      });
    }
    if (row.dmp.activeVersion === null) {
      throw new ApiError(409, "plan_not_in_force", "The plan has no version in force yet");
    }
    const hasPending = (await repo.listVersions(this.db, dmpId)).some((v) => v.status === "pending");
    try {
      const version = await repo.minorEditsTx(this.db, { dmpId, draft, activeVersion: row.dmp.activeVersion, hasPending });
      return toVersionResponse(version);
    } catch (error) {
      if (error instanceof repo.NoNewEditsError) {
        throw new ApiError(409, "no_new_edits", "Nothing to save");
      }
      if (error instanceof repo.EditsIncludeMajorError) {
        throw new ApiError(409, "edits_include_major", "At least one edit is major; submit a revision instead");
      }
      throw error;
    }
  }

  /** submit revision — major/minor ก็ได้ แต่ต้องมีการแก้จริง; หนึ่ง pending ต่อแผน (flow #8) */
  async submitRevision(claims: AccessClaims, dmpId: string, body: unknown): Promise<DmpVersionResponse> {
    const row = await this.findOwnedDraft(claims, dmpId);
    const revision = parseRevision(body);
    const draft = row.dmp.draft as DmpDraftInput;
    if (revision !== row.dmp.draftRevision) {
      throw new ApiError(409, "draft_conflict", "The draft changed after it was reviewed", undefined, {
        draft: row.dmp.draft,
        draft_revision: row.dmp.draftRevision,
      });
    }
    const versions = await repo.listVersions(this.db, dmpId);
    const pending = versions.find((v) => v.status === "pending");
    if (pending !== undefined) {
      throw new ApiError(409, "revision_pending", "Another version is waiting on a decision");
    }
    const inForce =
      row.dmp.activeVersion !== null ? versions.find((v) => v.number === row.dmp.activeVersion) : undefined;
    if (inForce === undefined) {
      throw new ApiError(409, "plan_not_in_force", "Submit the plan first");
    }
    const mode = row.dmp.planMode ?? (await repo.projectPlanMode(this.db, row.dmp.projectId)).at(0)?.mode;
    if (mode !== "institutional") {
      throw new ApiError(409, "plan_is_independent", "Use Finalize a plan");
    }
    const check = validateDraft(draft);
    if (!check.ok) {
      const first = check.errors.at(0);
      if (first === undefined) throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items");
      throw new ApiError(422, "plan_incomplete", "The submission checklist has unmet items", first.path, {
        items: check.errors.map((e) => ({ label: e.message, section: e.path })),
      });
    }
    const reviewerIds = (await repo.reviewers(this.db)).map((r) => r.userId);
    try {
      const { version } = await repo.revisionTx(this.db, {
        dmpId,
        draft,
        draftRevision: revision,
        title: row.dmp.title,
        submittedBy: claims.sub,
        notificationAuthor: { title: `ส่ง revision ของแผน "${row.dmp.title}" แล้ว` },
        notificationReviewers: { title: `มี revision รอพิจารณา: "${row.dmp.title}"` },
        reviewerIds,
      });
      return toVersionResponse(version);
    } catch (error) {
      if (error instanceof repo.NoNewEditsError) {
        throw new ApiError(409, "no_new_edits", "Nothing has changed since the version in force");
      }
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "revision_pending", "Another version is waiting on a decision");
      }
      throw error;
    }
  }

  /** approve/reject — committee/chief เท่านั้น; approve → carry/drop + tasks + notifications (flow #6, #8–#9) */
  async decide(
    claims: AccessClaims,
    dmpId: string,
    number: number,
    action: "approve" | "reject",
    body: unknown,
  ): Promise<DmpVersionResponse> {
    if (claims.role === "admin") throw new ApiError(403, "permission_denied", "Admin has no plan access yet");
    if (claims.role === "researcher") throw new ApiError(404, "dmp_not_found", "No plan with that id");
    const row = (await repo.findById(this.db, dmpId)).at(0);
    if (row === undefined) throw new ApiError(404, "dmp_not_found", "No plan with that id");
    const mode = row.dmp.planMode ?? (await repo.projectPlanMode(this.db, row.dmp.projectId)).at(0)?.mode;
    if (mode !== "institutional") {
      throw new ApiError(403, "plan_not_reviewable", "The plan is independent; the committee has no part in it");
    }
    const parsed = z
      .object({ position: z.string().trim().min(1), note: z.string().trim().optional() })
      .safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const position = parsed.data.position;
    const note = parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null;
    if (action === "reject" && note === null) {
      throw new ApiError(400, "note_required", "A version can't be sent back without a reason", "/note");
    }
    const author = (await repo.findAuthor(this.db, row.dmp.createdBy)).at(0);
    if (author === undefined) throw new ApiError(404, "dmp_not_found", "No plan with that id");
    const approver = {
      user_id: claims.sub,
      name: claims.username,
      position,
      mbox: author.email,
    };
    try {
      if (action === "approve") {
        const { version } = await repo.approveTx(this.db, { dmpId, number, decidedBy: claims.sub, note });
        return {
          ...toVersionResponse(version),
          approver,
          carried_minor_edits: version.carriedEdits ?? null,
          dropped_minor_edits: version.droppedEdits ?? null,
        };
      }
      // note ไม่เป็น null แล้ว — guard ด้านบนคืน 400 ก่อนถึงบรรทัดนี้ (reject เท่านั้น)
      if (note === null) throw new ApiError(400, "note_required", "A note is required");
      const { dmp, version } = await repo.rejectTx(this.db, { dmpId, number, decidedBy: claims.sub, note });
      return { ...toVersionResponse(version), approver, plan_status: dmp.status };
    } catch (error) {
      if (error instanceof repo.NotPendingError) {
        throw new ApiError(409, "version_not_pending", "That version was already decided");
      }
      throw error;
    }
  }

  /** author-only gate ของ use-case submit/finalize — แผนต้องเป็นของผู้เรียก */
  private async findOwnedDraft(claims: AccessClaims, dmpId: string) {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "Only researchers submit plans");
    const row = (await repo.findById(this.db, dmpId)).at(0);
    if (row === undefined || row.dmp.createdBy !== claims.sub) {
      throw new ApiError(404, "dmp_not_found", "No plan with that id");
    }
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

/** เทียบค่า locked field — วันที่ parse แล้วเป็น Date ส่วน JSONB เก็บเป็น ISO string (มี/ไม่มีเวลา) */
function valuesEqual(incoming: unknown, stored: unknown): boolean {
  if (incoming instanceof Date && typeof stored === "string" && stored.length >= 10) {
    return incoming.toISOString().slice(0, 10) === stored.slice(0, 10);
  }
  return JSON.stringify(incoming ?? null) === JSON.stringify(stored ?? null);
}

/** draft_revision จาก body — ขาด/ผิดรูป → 400 field_invalid */
function parseRevision(body: unknown): number {
  const result = z.object({ draft_revision: z.number().int().nonnegative() }).safeParse(body);
  if (!result.success) throw fieldInvalid(result.error);
  return result.data.draft_revision;
}

/** Postgres unique violation (QS-1 — สถานะขัดกันให้ DB ตัดสิน) */
function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? (error as { cause?: { code?: string } }).cause : undefined;
  return cause?.code === "23505";
}

function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
