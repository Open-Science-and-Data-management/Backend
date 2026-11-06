// tasks service — use-case layer; preservation rules ตาม docs/frontend-api/tasks.md
import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import {
  TaskEvidenceType,
  taskEvidenceSchema,
  createTaskSchema,
  updateTaskSchema,
  type TaskChecklistItem,
} from "@/shared/contracts/task.js";
import { LifecycleStage, Priority, TaskStatus } from "@/shared/contracts/enums.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ProjectsService } from "@/features/projects/projects.service.js";
import { DB } from "@/database/database.module.js";
import { dmps, reopenOffers, tasks } from "@/database/schema/index.js";
import type { DmpRow, TaskRow, VersionRow, Db, OfferGroup } from "./tasks.repository.js";
import * as repo from "./tasks.repository.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const DOI_RE = /^(10\.\d{4,9}\/\S+|https?:\/\/(dx\.)?doi\.org\/10\.\d{4,9}\/\S+)$/i;

const generatedBodySchema = z.object({
  mode: z.enum(["add", "replace"]),
  tasks: z.array(
    z.object({
      dataset_id: z.string().optional(),
      title: z.string().min(1),
      details: z.string().nullish(),
      lifecycle_stage: LifecycleStage,
      priority: Priority.default("medium"),
      start_date: z.coerce.date().optional(),
      end_date: z.coerce.date().optional(),
    }),
  ),
});

const checklistAddSchema = z.object({ label: z.string() });
const checklistPatchSchema = z.object({ label: z.string().optional(), done: z.boolean().optional() });
const checklistReplaceSchema = z.object({ labels: z.array(z.string()) });
const acceptSchema = z.object({ task_ids: z.array(z.string()).min(1) });

type EvidenceRequirement = repo.EvidenceRequirement;

/** Task object ตาม docs/frontend-api/tasks.md — ค่าว่างเป็น null ตาม contract */
export interface TaskResponse {
  object: "task";
  task_id: string;
  dmp_id: string;
  dataset_id: string | null;
  dataset_title: string | null;
  source_version_id: string | null;
  title: string;
  details: string | null;
  lifecycle_stage: repo.LifecycleStageT;
  status: repo.TaskStatusT;
  priority: repo.PriorityT;
  progress_percent: number;
  start_date: string | null;
  end_date: string | null;
  checklist: TaskChecklistItem[];
  evidence: {
    type: repo.EvidenceTypeT;
    ref: string | null;
    label: string | null;
    attached_at: Date | null;
  };
  generated_by: "ai" | "user";
  completed_at: Date | null;
  completed_by: string | null;
  cancelled_from: repo.TaskStatusT | null;
  cancel_reason: "manual" | "output_removed" | null;
  cancelled_dataset_title: string | null;
  cancelled_at: Date | null;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  // ── visibility ───────────────────────────────────────────────────────────

  /** admin 403; committee/chief ผ่านสมาชิกโครงการ; researcher = ผู้เขียนแผนเท่านั้น (ไม่ใช่ → 404 ซ่อน) */
  private async assertCanRead(claims: AccessClaims, dmp: DmpRow): Promise<void> {
    if (claims.role === "admin") throw new ApiError(403, "permission_denied", "Admin has no task access");
    if (claims.role === "researcher") {
      if (dmp.createdBy !== claims.sub) throw new ApiError(404, "dmp_not_found", "No plan with that id");
      return;
    }
    if (dmp.projectId === null) throw new ApiError(404, "dmp_not_found", "No plan with that id");
    await this.projects.assertVisible(claims, dmp.projectId);
  }

  private async assertAuthor(claims: AccessClaims, dmp: DmpRow): Promise<void> {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "Only the plan's author can do that");
    if (dmp.createdBy !== claims.sub) throw new ApiError(404, "task_not_found", "No task with that id");
  }

  private async inForce(dmp: DmpRow): Promise<VersionRow> {
    const version = await repo.activeVersion(this.db, dmp);
    if (version === undefined) throw new ApiError(409, "plan_not_in_force", "The plan has no version in force");
    return version;
  }

  // ── mapping ──────────────────────────────────────────────────────────────

  private async titleMap(dmp: DmpRow): Promise<Map<string, string>> {
    const version = await repo.activeVersion(this.db, dmp);
    const map = new Map<string, string>();
    if (version !== undefined) {
      for (const o of repo.outputsOf(version.snapshot)) map.set(o.dataset_id, o.title);
    }
    return map;
  }

  private toResponse(task: TaskRow, titles?: Map<string, string>): TaskResponse {
    const checklist = (task.checklist as TaskChecklistItem[]) ?? [];
    const date = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
    return {
      object: "task",
      task_id: task.taskId,
      dmp_id: task.dmpId,
      dataset_id: task.datasetId,
      dataset_title: task.datasetId === null ? null : (titles?.get(task.datasetId) ?? null),
      source_version_id: task.sourceVersionId,
      title: task.title,
      details: task.details,
      lifecycle_stage: task.lifecycleStage,
      status: task.status,
      priority: task.priority,
      progress_percent: repo.progressOf(checklist),
      start_date: date(task.startDate),
      end_date: date(task.endDate),
      checklist,
      evidence: {
        type: task.evidenceType,
        ref: task.evidenceRef,
        label: task.evidenceLabel,
        attached_at: task.evidenceAttachedAt,
      },
      generated_by: task.generatedBy,
      completed_at: task.completedAt,
      completed_by: task.completedBy,
      cancelled_from: task.cancelledFrom,
      cancel_reason: task.cancelReason,
      cancelled_dataset_title: task.cancelledDatasetTitle,
      cancelled_at: task.cancelledAt,
    };
  }

  private async toResponses(rows: TaskRow[], dmps_: DmpRow[]): Promise<TaskResponse[]> {
    const titleCache = new Map<string, Map<string, string>>();
    return Promise.all(
      rows.map(async (r) => {
        let titles = titleCache.get(r.dmpId);
        if (titles === undefined) {
          const dmp = dmps_.find((d) => d.dmpId === r.dmpId);
          titles = dmp === undefined ? undefined : await this.titleMap(dmp);
          if (titles !== undefined) titleCache.set(r.dmpId, titles);
        }
        return this.toResponse(r, titles);
      }),
    );
  }

  // ── list ─────────────────────────────────────────────────────────────────

  async list(
    claims: AccessClaims,
    query: { project_id?: string; dmp_id?: string; status?: string; limit?: string; starting_after?: string },
  ): Promise<ListEnvelope<TaskResponse>> {
    if (claims.role === "admin") throw new ApiError(403, "permission_denied", "Admin has no task access");
    if (query.project_id === undefined && query.dmp_id === undefined) {
      throw new ApiError(400, "filter_required", "Send project_id or dmp_id");
    }
    let statusFilter: TaskRow["status"] | undefined;
    if (query.status !== undefined) {
      const parsedStatus = TaskStatus.safeParse(query.status);
      if (!parsedStatus.success) {
        throw new ApiError(400, "invalid_status", "status must be todo, in_progress, done or cancelled", "/status");
      }
      statusFilter = parsedStatus.data;
    }
    let dmpFilter: string | undefined = query.dmp_id;
    let projectId: string | undefined = query.project_id;
    const loadedDmps: DmpRow[] = [];
    if (dmpFilter !== undefined) {
      const dmp = await this.loadDmp(dmpFilter);
      await this.assertCanRead(claims, dmp);
      loadedDmps.push(dmp);
    } else if (projectId !== undefined) {
      if (claims.role === "committee" || claims.role === "chief") {
        await this.projects.assertVisible(claims, projectId);
      }
    }
    const limit = parseLimit(query.limit);
    const options: repo.ListOptions = {
      dmpId: dmpFilter,
      projectId,
      authorId: claims.role === "researcher" ? claims.sub : undefined,
      status: statusFilter,
    };
    const rows = await repo.listTasks(this.db, options);
    if (dmpFilter === undefined) {
      // project path — โหลดแผนที่หน้านี้ชี้มา เพื่อ map dataset_title
      const dmpIds = [...new Set(rows.map((r) => r.dmpId))];
      const projDmps = dmpIds.length > 0 ? await this.db.select().from(dmps).where(inArray(dmps.dmpId, dmpIds)) : [];
      loadedDmps.push(...projDmps);
    }
    const start = query.starting_after === undefined ? 0 : rows.findIndex((r) => r.taskId === query.starting_after) + 1;
    if (query.starting_after !== undefined && start === 0) {
      throw new ApiError(400, "field_invalid", "starting_after is not a task in this list", "/starting_after");
    }
    const page = rows.slice(start, start + limit);
    const data = await this.toResponses(page, loadedDmps);
    return listOf(data, start + limit < rows.length, rows.length);
  }

  // ── create ───────────────────────────────────────────────────────────────

  async create(claims: AccessClaims, body: unknown): Promise<TaskResponse> {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "Only researchers can create tasks");
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const input = parsed.data;
    const dmp = await this.loadDmp(input.dmp_id);
    await this.assertAuthor(claims, dmp);
    const version = await this.inForce(dmp);
    this.assertOutputInForce(version, input.dataset_id);
    const rows = await repo.insertTasks(this.db, [
      {
        dmpId: input.dmp_id,
        datasetId: input.dataset_id ?? null,
        title: input.title,
        details: input.details ?? null,
        startDate: input.start_date ?? null,
        endDate: input.end_date ?? null,
        lifecycleStage: input.lifecycle_stage,
        priority: input.priority,
        generatedBy: "user", // บังคับ user เสมอ — ไม่ว่า body จะส่งอะไรมา
        sourceVersionId: version.versionId,
      },
    ]);
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared after insert");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  /** POST /dmps/:dmp_id/tasks/generated — mode add|replace */
  async createGenerated(claims: AccessClaims, dmpId: string, body: unknown): Promise<Record<string, unknown>> {
    const parsed = generatedBodySchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const dmp = await this.loadDmp(dmpId);
    await this.assertAuthor(claims, dmp);
    const version = await this.inForce(dmp);
    const outputs = new Set(repo.outputsOf(version.snapshot).map((o) => o.dataset_id));
    for (const t of parsed.data.tasks) {
      if (t.dataset_id !== undefined && !outputs.has(t.dataset_id)) {
        throw new ApiError(400, "dataset_not_in_force", "That output isn't in the version in force", "/tasks");
      }
    }
    let removed = 0;
    if (parsed.data.mode === "replace") {
      // เฉพาะ AI task ที่ยังไม่ถูกแตะ (ai, todo, 0%, ไม่มี evidence) — อย่างอื่นเก็บ
      removed = await repo.deleteUntouchedAiTasks(this.db, dmpId);
    }
    const kept = await repo.listTasks(this.db, { dmpId });
    const created = await repo.insertTasks(
      this.db,
      parsed.data.tasks.map((t) => ({
        dmpId,
        datasetId: t.dataset_id ?? null,
        title: t.title,
        details: t.details ?? null,
        startDate: t.start_date ?? null,
        endDate: t.end_date ?? null,
        lifecycleStage: t.lifecycle_stage,
        priority: t.priority,
        generatedBy: "ai" as const,
        sourceVersionId: version.versionId,
      })),
    );
    await this.db
      .update(dmps)
      .set({ tasksGenerated: true, updatedAt: new Date() })
      .where(eq(dmps.dmpId, dmpId));
    const titles = await this.titleMap(dmp);
    return {
      object: "generated_tasks",
      added: created.length,
      removed,
      kept: kept.length,
      data: created.map((r) => this.toResponse(r, titles)),
    };
  }

  // ── update ───────────────────────────────────────────────────────────────

  async update(claims: AccessClaims, taskId: string, body: unknown): Promise<TaskResponse> {
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const input = parsed.data;
    const found = await this.ownedTask(claims, taskId);
    const { task, dmp } = found;
    if (input.status === "done") {
      throw new ApiError(409, "use_complete", "Finishing a task goes through Complete a task");
    }
    if (input.dataset_id !== undefined && input.dataset_id !== task.datasetId && task.completedAt !== null) {
      throw new ApiError(409, "output_locked", "Reopen the task before changing its output");
    }
    const set: Partial<typeof tasks.$inferInsert> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.details !== undefined) set.details = input.details ?? null;
    if (input.dataset_id !== undefined) set.datasetId = input.dataset_id ?? null;
    if (input.start_date !== undefined) set.startDate = input.start_date ?? null;
    if (input.end_date !== undefined) set.endDate = input.end_date ?? null;
    if (input.lifecycle_stage !== undefined) set.lifecycleStage = input.lifecycle_stage;
    if (input.status !== undefined) set.status = input.status;
    if (input.priority !== undefined) set.priority = input.priority;
    const rows = await repo.updateTask(this.db, taskId, set);
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during update");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  // ── complete ─────────────────────────────────────────────────────────────

  async complete(claims: AccessClaims, taskId: string): Promise<TaskResponse> {
    const found = await this.ownedTask(claims, taskId);
    const { dmp, task } = found;
    if (task.status === "done") throw new ApiError(409, "task_done", "The task is already finished");
    if (task.status === "cancelled") throw new ApiError(409, "task_cancelled", "A cancelled task can't be completed");
    const requirement = this.evidenceRequirement(task, dmp);
    if (!repo.evidenceSatisfies(task.evidenceType, requirement)) {
      throw new ApiError(409, "evidence_required", "The task's evidence doesn't meet what its work requires", undefined, {
        requirement,
      });
    }
    const version = await this.inForce(dmp);
    const checklist = ((task.checklist as TaskChecklistItem[]) ?? []).map((i) => ({ ...i, done: true }));
    const rows = await repo.updateTask(this.db, taskId, {
      status: "done",
      checklist,
      progressPercent: 100,
      completedAt: new Date(),
      completedBy: claims.sub,
    });
    // ผลัก output ไปหน้าตาม stage — planned → collected → … (never backwards)
    if (task.datasetId !== null) {
      await repo.advanceDatasetStatus(this.db, dmp, version, task.datasetId, repo.STAGE_TARGET[task.lifecycleStage] ?? "collected");
    }
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during complete");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  /** ความต้องการ evidence ตาม stage/output — ADR-0026 */
  private evidenceRequirement(task: TaskRow, dmp: DmpRow): EvidenceRequirement {
    if (task.datasetId === null) return "declared";
    if (task.lifecycleStage === "collect" || task.lifecycleStage === "process" || task.lifecycleStage === "analyse") {
      return "evidence_linked";
    }
    // preserve/share: ต้องเป็นของ repository — ยกเว้นแผน independent (รับ file|url ชั่วคราว)
    if (dmp.planMode === "independent") return "evidence_linked";
    return "system_verified";
  }

  // ── reopen / cancel / delete ─────────────────────────────────────────────

  async reopen(claims: AccessClaims, taskId: string): Promise<TaskResponse> {
    const found = await this.ownedTask(claims, taskId);
    const { task, dmp } = found;
    if (task.status !== "done") throw new ApiError(409, "task_not_done", "Only a finished task can be reopened");
    const checklist = (task.checklist as TaskChecklistItem[]) ?? []; // evidence + ticks คงอยู่
    const rows = await repo.updateTask(this.db, taskId, {
      status: checklist.some((i) => i.done) ? "in_progress" : "todo",
      completedAt: null,
      completedBy: null,
    });
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during reopen");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  async cancel(claims: AccessClaims, taskId: string): Promise<TaskResponse> {
    const found = await this.ownedTask(claims, taskId);
    const { task, dmp } = found;
    if (task.status === "done") {
      throw new ApiError(409, "task_done", "A finished task can't be cancelled; reopen it instead");
    }
    if (task.status === "cancelled") {
      return this.toResponse(task, await this.titleMap(dmp));
    }
    const rows = await repo.updateTask(this.db, taskId, {
      status: "cancelled",
      cancelledFrom: task.status,
      cancelReason: "manual",
      cancelledAt: new Date(),
    });
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during cancel");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  async remove(claims: AccessClaims, taskId: string): Promise<Record<string, unknown>> {
    const found = await this.ownedTask(claims, taskId);
    const { task } = found;
    const checklist = (task.checklist as TaskChecklistItem[]) ?? [];
    const hasWork = task.evidenceType !== "none" || checklist.some((i) => i.done) || task.completedAt !== null;
    if (hasWork) {
      throw new ApiError(409, "task_has_recorded_work", "The task has recorded work; cancel it instead");
    }
    await repo.deleteTask(this.db, taskId);
    return { object: "task", task_id: taskId, deleted: true };
  }

  // ── checklist ────────────────────────────────────────────────────────────

  async addChecklistItem(claims: AccessClaims, taskId: string, body: unknown): Promise<TaskResponse> {
    const parsed = checklistAddSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    if (parsed.data.label.trim() === "") {
      throw new ApiError(400, "label_required", "The step needs a label", "/label");
    }
    const found = await this.ownedTask(claims, taskId);
    const checklist = (found.task.checklist as TaskChecklistItem[]) ?? [];
    return this.saveChecklist(found, [...checklist, ...repo.newChecklistItems([parsed.data.label])]);
  }

  async patchChecklistItem(claims: AccessClaims, taskId: string, itemId: string, body: unknown): Promise<TaskResponse> {
    const parsed = checklistPatchSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const found = await this.ownedTask(claims, taskId);
    const checklist = (found.task.checklist as TaskChecklistItem[]) ?? [];
    const index = checklist.findIndex((i) => i.item_id === itemId);
    if (index === -1) throw new ApiError(404, "item_not_found", "The task has no step with that id");
    const updated = checklist.map((i, k) =>
      k === index ? { ...i, label: parsed.data.label ?? i.label, done: parsed.data.done ?? i.done } : i,
    );
    return this.saveChecklist(found, updated);
  }

  async deleteChecklistItem(claims: AccessClaims, taskId: string, itemId: string): Promise<TaskResponse> {
    const found = await this.ownedTask(claims, taskId);
    const checklist = (found.task.checklist as TaskChecklistItem[]) ?? [];
    if (!checklist.some((i) => i.item_id === itemId)) {
      throw new ApiError(404, "item_not_found", "The task has no step with that id");
    }
    return this.saveChecklist(found, checklist.filter((i) => i.item_id !== itemId));
  }

  /** แทนที่เฉพาะ step ที่ยังไม่ถูก tick — step ที่ tick แล้วรอด (preservation) */
  async replaceChecklist(claims: AccessClaims, taskId: string, body: unknown): Promise<TaskResponse> {
    const parsed = checklistReplaceSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const found = await this.ownedTask(claims, taskId);
    const ticked = ((found.task.checklist as TaskChecklistItem[]) ?? []).filter((i) => i.done);
    return this.saveChecklist(found, [...ticked, ...repo.newChecklistItems(parsed.data.labels)]);
  }

  private async saveChecklist(found: { task: TaskRow; dmp: DmpRow }, checklist: TaskChecklistItem[]): Promise<TaskResponse> {
    const rows = await repo.updateTask(this.db, found.task.taskId, {
      checklist,
      progressPercent: repo.progressOf(checklist),
    });
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during checklist save");
    return this.toResponse(row, await this.titleMap(found.dmp));
  }

  // ── evidence ─────────────────────────────────────────────────────────────

  async setEvidence(claims: AccessClaims, taskId: string, body: unknown): Promise<TaskResponse> {
    const parsed = taskEvidenceSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const found = await this.ownedTask(claims, taskId);
    const { task, dmp } = found;
    if (task.completedAt !== null) {
      throw new ApiError(409, "task_done", "A finished task's evidence can't change; reopen it first");
    }
    let { type, ref, label } = parsed.data;
    // DOI ที่วางมาเอง → rdm_deposit เสมอ (classifyPastedEvidence)
    if (typeof ref === "string" && DOI_RE.test(ref.trim())) type = "rdm_deposit";
    if (type === "file" && !(await repo.fileOnProject(this.db, ref ?? "", dmp.projectId))) {
      throw new ApiError(404, "file_not_found", "No file with that id on the plan's project", "/ref");
    }
    if (type !== "none" && (ref === undefined || ref.trim() === "")) {
      throw new ApiError(400, "ref_required", "This evidence type needs a ref", "/ref");
    }
    const rows = await repo.updateTask(this.db, taskId, {
      evidenceType: type,
      evidenceRef: ref ?? null,
      evidenceLabel: label ?? null,
      evidenceAttachedAt: new Date(),
    });
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during evidence save");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  async clearEvidence(claims: AccessClaims, taskId: string): Promise<TaskResponse> {
    const found = await this.ownedTask(claims, taskId);
    const { task, dmp } = found;
    if (task.completedAt !== null) {
      throw new ApiError(409, "task_done", "A finished task's evidence can't be removed; reopen it first");
    }
    const rows = await repo.updateTask(this.db, taskId, {
      evidenceType: "none",
      evidenceRef: null,
      evidenceLabel: null,
      evidenceAttachedAt: null,
    });
    const row = rows.at(0);
    if (row === undefined) throw new ApiError(500, "internal_error", "Task row disappeared during evidence clear");
    return this.toResponse(row, await this.titleMap(dmp));
  }

  // ── reopen offers ────────────────────────────────────────────────────────

  async listReopenOffers(claims: AccessClaims, dmpId: string): Promise<ListEnvelope<Record<string, unknown>>> {
    const dmp = await this.loadDmp(dmpId);
    await this.assertAuthor(claims, dmp);
    const groups = await repo.listOpenOfferGroups(this.db, dmpId);
    const taskIds = groups.flatMap((g) => g.rows.map((r) => r.taskId));
    const taskRows =
      taskIds.length > 0 ? await this.db.select().from(tasks).where(inArray(tasks.taskId, taskIds)) : [];
    const byId = new Map(taskRows.map((t) => [t.taskId, t]));
    const data = groups.map((g) => this.offerResponse(g, byId));
    return listOf(data, false, data.length);
  }

  private offerResponse(group: OfferGroup, byId: Map<string, TaskRow>): Record<string, unknown> {
    return {
      object: "reopen_offer",
      offer_id: group.offer_id,
      dmp_id: group.dmp_id,
      dataset_id: group.dataset_id,
      dataset_title: group.dataset_title,
      created_at: group.created_at,
      tasks: group.rows
        .map((r) => byId.get(r.taskId))
        .filter((t): t is TaskRow => t !== undefined)
        .map((t) => ({ task_id: t.taskId, title: t.title, status: t.status, cancelled_from: t.cancelledFrom })),
    };
  }

  async acceptReopenOffer(claims: AccessClaims, offerId: string, body: unknown): Promise<Record<string, unknown>> {
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const group = await this.openOfferGuard(claims, offerId);
    const offered = new Set(group.rows.map((r) => r.taskId));
    for (const id of parsed.data.task_ids) {
      if (!offered.has(id)) throw new ApiError(400, "task_not_offered", "That task isn't part of the offer");
    }
    const dmp = await this.loadDmp(group.dmp_id);
    const version = await this.inForce(dmp);
    const outputs = repo.outputsOf(version.snapshot);
    // เชื่อมกลับ output ที่กลับมา — ด้วย id ก่อน แล้วค่อยชื่อเดิม (กลับมาใหม่คนละ id)
    const match =
      (group.dataset_id !== null ? outputs.find((o) => o.dataset_id === group.dataset_id) : undefined) ??
      outputs.find((o) => o.title === group.dataset_title);
    let reopened = 0;
    for (const id of parsed.data.task_ids) {
      const task = (await repo.findTaskWithDmp(this.db, id))?.task;
      if (task === undefined) continue;
      await repo.updateTask(this.db, id, {
        datasetId: match?.dataset_id ?? task.datasetId,
        status: task.cancelledFrom ?? "todo", // กลับไปสถานะเดิมก่อนถูก cancel
        cancelledFrom: null,
        cancelReason: null,
        cancelledAt: null,
        cancelledDatasetTitle: null,
      });
      reopened += 1;
    }
    await repo.closeOfferRows(this.db, group.rows.map((r) => r.offerId), "accept");
    return { object: "reopen_offer", offer_id: group.offer_id, reopened };
  }

  async dismissReopenOffer(claims: AccessClaims, offerId: string): Promise<Record<string, unknown>> {
    const group = await this.openOfferGuard(claims, offerId);
    await repo.closeOfferRows(this.db, group.rows.map((r) => r.offerId), "dismiss");
    return { object: "reopen_offer", offer_id: group.offer_id, reopened: 0 };
  }

  private async openOfferGuard(claims: AccessClaims, offerId: string): Promise<OfferGroup> {
    const head = (await this.db.select().from(reopenOffers).where(eq(reopenOffers.offerId, offerId)).limit(1)).at(0);
    if (head === undefined) throw new ApiError(404, "offer_not_found", "No offer with that id");
    const dmp = await this.loadDmp(head.dmpId);
    await this.assertAuthor(claims, dmp);
    const group = await repo.offerGroup(this.db, offerId);
    if (group === undefined) throw new ApiError(404, "offer_not_found", "No offer with that id");
    if (group.rows.length === 0 || group.rows.some((r) => r.acceptedAt !== null || r.dismissedAt !== null)) {
      throw new ApiError(409, "offer_closed", "The offer was already answered");
    }
    return group;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async loadDmp(dmpId: string): Promise<DmpRow> {
    const row = (await this.db.select().from(dmps).where(eq(dmps.dmpId, dmpId)).limit(1)).at(0);
    if (row === undefined) throw new ApiError(404, "dmp_not_found", "No plan with that id");
    return row;
  }

  private async ownedTask(claims: AccessClaims, taskId: string): Promise<{ task: TaskRow; dmp: DmpRow }> {
    const found = await repo.findTaskWithDmp(this.db, taskId);
    if (found === undefined) throw new ApiError(404, "task_not_found", "No task with that id");
    await this.assertAuthor(claims, found.dmp);
    return found;
  }

  private assertOutputInForce(version: VersionRow, datasetId: string | undefined): void {
    if (datasetId === undefined) return;
    if (!repo.outputsOf(version.snapshot).some((o) => o.dataset_id === datasetId)) {
      throw new ApiError(400, "dataset_not_in_force", "That output isn't in the version in force", "/dataset_id");
    }
  }
}

function parseLimit(raw?: string): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
