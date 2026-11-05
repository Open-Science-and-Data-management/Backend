// dmps repository — Drizzle เดียวต่อ flow; snake_case response ตาม FE contract
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { carryEdits, rebaseWorkingCopy } from "@/shared/domain-engine/carry.js";
import { generateTasks } from "@/shared/domain-engine/task-generator.js";
import { diffDraft, type FieldChange } from "@/shared/domain-engine/diff-draft.js";
import { classify } from "@/shared/domain-engine/classify.js";
import { foldMinor } from "@/shared/domain-engine/fold-minor.js";
import type { DmpDraftInput } from "@/shared/contracts/dmp.js";
import { dmpVersions, dmps, notifications, projects, tasks, users } from "@/database/schema/index.js";
import type * as schema from "@/database/schema/index.js";

export type Db = NodePgDatabase<typeof schema>;
export type DmpRow = typeof dmps.$inferSelect;
export type VersionRow = typeof dmpVersions.$inferSelect;
export type AuthorRow = typeof users.$inferSelect;

export type DmpWithAuthor = { dmp: DmpRow; author: AuthorRow };

export function findById(db: Db, dmpId: string): Promise<DmpWithAuthor[]> {
  return db
    .select({ dmp: dmps, author: users })
    .from(dmps)
    .innerJoin(users, eq(users.userId, dmps.createdBy))
    .where(eq(dmps.dmpId, dmpId))
    .limit(1);
}

export function create(
  db: Db,
  input: { projectId: string | null; createdBy: string; planMode: "institutional" | "independent" | null },
): Promise<DmpRow[]> {
  // แผนใหม่ = draft ว่าง — plan_mode ตามโครงการจนกว่า submit แรก (freeze ตอนนั้น)
  return db
    .insert(dmps)
    .values({ projectId: input.projectId, createdBy: input.createdBy, planMode: input.planMode, draft: {}, title: "" })
    .returning();
}

export function findAuthor(db: Db, userId: string): Promise<AuthorRow[]> {
  return db.select().from(users).where(eq(users.userId, userId)).limit(1);
}

export function listVersions(db: Db, dmpId: string): Promise<VersionRow[]> {
  return db.select().from(dmpVersions).where(eq(dmpVersions.dmpId, dmpId)).orderBy(desc(dmpVersions.number));
}

export function countVersions(db: Db, dmpId: string) {
  return db.select({ n: sql<number>`count(*)::int` }).from(dmpVersions).where(eq(dmpVersions.dmpId, dmpId));
}

// ── list filters ───────────────────────────────────────────────────────────

export interface ListOptions {
  authorId?: string;
  projectId?: string;
  archived: boolean;
  statuses?: ("draft" | "pending" | "approved")[];
  q?: string;
  sort: "updated" | "title" | "status";
  limit: number;
}

export function buildListWhere(options: ListOptions): SQL | undefined {
  const parts: (SQL | undefined)[] = [
    options.authorId !== undefined ? eq(dmps.createdBy, options.authorId) : undefined,
    options.projectId !== undefined ? eq(dmps.projectId, options.projectId) : undefined,
    options.archived ? sql`${dmps.archivedAt} is not null` : isNull(dmps.archivedAt),
    options.statuses !== undefined && options.statuses.length > 0 ? inArray(dmps.status, options.statuses) : undefined,
    options.q !== undefined
      ? or(ilike(dmps.title, `%${options.q}%`), ilike(sql`${dmps.draft}->>'description'`, `%${options.q}%`))
      : undefined,
  ];
  return and(...parts.filter((p) => p !== undefined));
}

export function list(db: Db, options: ListOptions): Promise<DmpWithAuthor[]> {
  const order =
    options.sort === "title"
      ? asc(dmps.title)
      : options.sort === "status"
        ? asc(dmps.status)
        : desc(dmps.updatedAt);
  // limit+1 เพื่อรู้ has_more แบบ Stripe (ADR-0015)
  return db
    .select({ dmp: dmps, author: users })
    .from(dmps)
    .innerJoin(users, eq(users.userId, dmps.createdBy))
    .where(buildListWhere(options))
    .orderBy(order)
    .limit(options.limit + 1);
}

export function count(db: Db, options: ListOptions) {
  return db.select({ n: sql<number>`count(*)::int` }).from(dmps).where(buildListWhere(options));
}

/** PUT draft — CAS บน draft_revision (ADR-0020); 0 rows = มีใครแก้ก่อน → conflict */
export function updateDraft(
  db: Db,
  dmpId: string,
  input: { draft: unknown; expectedRevision: number },
): Promise<DmpRow[]> {
  return db
    .update(dmps)
    .set({
      draft: input.draft,
      draftRevision: input.expectedRevision + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(dmps.dmpId, dmpId), eq(dmps.draftRevision, input.expectedRevision)))
    .returning();
}

/** discard/restore — กลับไป snapshot; revision ก้าวต่อเพื่อกัน race;
 * restoredFrom จดเมื่อ restore เวอร์ชันอื่น (ไม่ใช่ in force) — edit ถัดไปจดลง minor_edits แล้วเคลียร์ */
export async function resetDraftToSnapshot(
  db: Db,
  dmpId: string,
  snapshot: unknown,
  restoredFrom?: number | null,
): Promise<DmpRow[]> {
  return db
    .update(dmps)
    .set({
      draft: snapshot,
      draftRevision: sql`${dmps.draftRevision} + 1`,
      restoredFrom: restoredFrom ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dmps.dmpId, dmpId))
    .returning();
}

/** archive/unarchive — ไม่มีทางลบแผน (preservation); archived_at เท่านั้น */
export function setArchived(db: Db, dmpId: string, archived: boolean): Promise<DmpRow[]> {
  return db
    .update(dmps)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(dmps.dmpId, dmpId))
    .returning();
}

/** ส่งอนุมัติ (institutional) — freeze mode + version pending ใน tx เดียว;
 *  partial unique (dmp_versions_one_pending_uq / dmp_versions_dmp_number_uq) บังคับขนานเอง (QS-1) */
export async function submitTx(
  db: Db,
  input: { dmpId: string; snapshot: unknown; title: string; planMode: "institutional"; submittedBy: string },
): Promise<{ dmp: DmpRow; version: VersionRow }> {
  return db.transaction(async (tx) => {
    const maxNumber =
      (
        await tx
          .select({ n: sql<number>`coalesce(max(${dmpVersions.number}), 0)::int` })
          .from(dmpVersions)
          .where(eq(dmpVersions.dmpId, input.dmpId))
      ).at(0)?.n ?? 0;
    const inserted = await tx
      .insert(dmpVersions)
      .values({
        dmpId: input.dmpId,
        number: maxNumber + 1,
        status: "pending",
        snapshot: input.snapshot,
        changes: [],
        editType: "major",
        submittedBy: input.submittedBy,
        submittedAt: new Date(),
      })
      .returning();
    const version = inserted.at(0);
    if (version === undefined) throw new Error("version disappeared after insert");
    const dmp = (
      await tx
        .update(dmps)
        .set({ status: "pending", planMode: input.planMode, title: input.title, updatedAt: new Date() })
        .where(eq(dmps.dmpId, input.dmpId))
        .returning()
    ).at(0);
    if (dmp === undefined) throw new Error("dmp disappeared during submit");
    return { dmp, version };
  });
}

export interface TaskInsert {
  dmpId: string;
  datasetId: string | null;
  title: string;
  details: string;
  lifecycleStage: "collect" | "process" | "analyse" | "preserve" | "share";
  priority: "low" | "medium" | "high";
  sourceVersionId: string;
}

/** finalize (independent) — version ออกผลทันที + task generator + notification ใน tx เดียว (หมวด 4.4) */
export async function finalizeTx(
  db: Db,
  input: {
    dmpId: string;
    snapshot: unknown;
    title: string;
    finalizedBy: string;
    tasks: (versionId: string) => TaskInsert[];
    notification: { userId: string; title: string; message: string | null; link: string | null };
  },
): Promise<{ dmp: DmpRow; version: VersionRow }> {
  return db.transaction(async (tx) => {
    const maxNumber =
      (
        await tx
          .select({ n: sql<number>`coalesce(max(${dmpVersions.number}), 0)::int` })
          .from(dmpVersions)
          .where(eq(dmpVersions.dmpId, input.dmpId))
      ).at(0)?.n ?? 0;
    const number = maxNumber + 1;
    const inserted = await tx
      .insert(dmpVersions)
      .values({
        dmpId: input.dmpId,
        number,
        status: "approved",
        snapshot: input.snapshot,
        changes: [],
        editType: "major",
        submittedBy: input.finalizedBy,
        submittedAt: new Date(),
        decidedBy: input.finalizedBy, // author เป็น approver ของตัวเอง (independent)
        decidedAt: new Date(),
      })
      .returning();
    const version = inserted.at(0);
    if (version === undefined) throw new Error("version disappeared after insert");
    const taskRows = input.tasks(version.versionId);
    if (taskRows.length > 0) {
      await tx.insert(tasks).values(
        taskRows.map((t) => ({
          dmpId: t.dmpId,
          datasetId: t.datasetId,
          title: t.title,
          details: t.details,
          lifecycleStage: t.lifecycleStage,
          priority: t.priority,
          sourceVersionId: t.sourceVersionId,
        })),
      );
    }
    const dmp = (
      await tx
        .update(dmps)
        .set({
          status: "approved",
          planMode: "independent",
          title: input.title,
          activeVersion: number,
          tasksGenerated: true,
          updatedAt: new Date(),
        })
        .where(eq(dmps.dmpId, input.dmpId))
        .returning()
    ).at(0);
    if (dmp === undefined) throw new Error("dmp disappeared during finalize");
    await tx.insert(notifications).values({
      userId: input.notification.userId,
      type: "dmp_finalized",
      title: input.notification.title,
      message: input.notification.message,
      link: input.notification.link,
      dmpId: input.dmpId,
    });
    return { dmp, version };
  });
}

/** committee/chief ทุกคน — ผู้รับ review_requested */
export function reviewers(db: Db) {
  return db
    .select({ userId: users.userId })
    .from(users)
    .where(inArray(users.role, ["committee", "chief"]));
}

export async function addNotifications(
  db: Db,
  rows: {
    userId: string;
    type: "review_requested" | "dmp_submitted";
    title: string;
    message: string | null;
    link: string | null;
    dmpId: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(notifications).values(rows);
}

/** ตัดสิน approve — activate + carry/drop (QS-2) + task generator + notifications ใน tx เดียว (หมวด 4.4) */
export async function approveTx(
  db: Db,
  input: {
    dmpId: string;
    number: number;
    decidedBy: string;
    note: string | null;
    approver: { user_id: string; name: string; position: string; mbox: string | null };
  },
): Promise<{ dmp: DmpRow; version: VersionRow }> {
  return db.transaction(async (tx) => {
    // CAS บน status pending — ตัดสินซ้ำ → 0 rows
    const decided = await tx
      .update(dmpVersions)
      .set({
        status: "approved",
        decidedBy: input.decidedBy,
        decidedAt: new Date(),
        decisionNote: input.note,
        decisionApprover: input.approver,
      })
      .where(and(eq(dmpVersions.dmpId, input.dmpId), eq(dmpVersions.number, input.number), eq(dmpVersions.status, "pending")))
      .returning();
    const version = decided.at(0);
    if (version === undefined) throw new NotPendingError();

    const current = (await tx.select().from(dmps).where(eq(dmps.dmpId, input.dmpId)).limit(1)).at(0);
    if (current === undefined) throw new Error("dmp disappeared during approve");
    const isFirst = current.activeVersion === null;
    const inForce =
      !isFirst && current.activeVersion !== null
        ? (await tx.select().from(dmpVersions).where(and(eq(dmpVersions.dmpId, input.dmpId), eq(dmpVersions.number, current.activeVersion))).limit(1)).at(0)
        : undefined;

    const newSnapshot = version.snapshot as Record<string, unknown>;
    let cancelledTitles: string[] = [];
    let carried: unknown = null;
    let dropped: unknown = null;
    if (!isFirst && inForce !== undefined) {
      // QS-2 — minor fixes ที่ fold บน version in force ระหว่างรอ: carry หรือจด dropped
      // jsonb ที่เก็บไว้คือ DmpDraftInput ที่ผ่าน validateDraft ตอน submit — คืน type ให้ engine
      const base = (version.basedOnSnapshot ?? inForce.snapshot) as DmpDraftInput;
      const inForceSnapshot = inForce.snapshot as DmpDraftInput;
      const carry = carryEdits(base, inForceSnapshot, newSnapshot);
      carried = carry.carried;
      dropped = carry.dropped;
      await tx
        .update(dmpVersions)
        .set({ carriedEdits: carry.carried, droppedEdits: carry.dropped })
        .where(eq(dmpVersions.versionId, version.versionId));
      // rebase working copy ของผู้เขียน (แต่งจาก base เดิม) ต่อท้าย snapshot ใหม่
      const rebased = rebaseWorkingCopy(current.draft as DmpDraftInput, newSnapshot, base);
      // tasks ของ output ที่ revision ลบออก → cancelled (จด reason — preservation)
      const oldIds = datasetIds(inForceSnapshot);
      const newIds = datasetIds(newSnapshot);
      const removed = [...oldIds].filter((id) => !newIds.has(id) && id !== "");
      if (removed.length > 0) {
        const cancelled = await tx
          .update(tasks)
          .set({
            status: "cancelled",
            cancelledFrom: sql`${tasks.status}`,
            cancelReason: "output_removed",
            cancelledDatasetTitle: sql`title`,
            cancelledAt: new Date(),
          })
          .where(and(eq(tasks.dmpId, input.dmpId), inArray(tasks.datasetId, removed), inArray(tasks.status, ["todo", "in_progress"])))
          .returning({ title: tasks.title });
        cancelledTitles = cancelled.map((t) => t.title);
      }
      await tx
        .update(dmps)
        .set({ draft: rebased, updatedAt: new Date() })
        .where(eq(dmps.dmpId, input.dmpId));
    }

    // task generator — deterministic จาก outputs ใน snapshot ใหม่ (ชุดแรกเมื่อไม่มี tasks_generated)
    let generated: { title: string; details: string; lifecycleStage: "collect" | "process" | "analyse" | "preserve" | "share"; priority: "low" | "medium" | "high"; datasetId: string }[] = [];
    if (!current.tasksGenerated) {
      const outputs = Array.isArray(newSnapshot.dataset) ? newSnapshot.dataset as Record<string, unknown>[] : [];
      generated = generateTasks(
        outputs.map((o) => ({
          dataset_id: typeof o.dataset_id === "string" ? o.dataset_id : "",
          title: typeof o.title === "string" ? o.title : "",
          type: typeof o.type === "string" ? o.type : "other",
          access: typeof o.access === "string" ? o.access : "closed",
        })),
      ).map((t) => ({ title: t.title, details: t.details, lifecycleStage: t.lifecycle_stage, priority: t.priority, datasetId: t.dataset_id }));
      if (generated.length > 0) {
        await tx.insert(tasks).values(
          generated.map((t) => ({
            dmpId: input.dmpId,
            datasetId: t.datasetId,
            title: t.title,
            details: t.details,
            lifecycleStage: t.lifecycleStage,
            priority: t.priority,
            sourceVersionId: version.versionId,
          })),
        );
      }
    }

    const updated = (
      await tx
        .update(dmps)
        .set({ status: "approved", activeVersion: input.number, tasksGenerated: true, updatedAt: new Date() })
        .where(eq(dmps.dmpId, input.dmpId))
        .returning()
    ).at(0);
    if (updated === undefined) throw new Error("dmp update failed during approve");

    const notes: (typeof notifications.$inferInsert)[] = [
      {
        userId: current.createdBy,
        type: "dmp_approved",
        title: `แผน "${current.title}" ได้รับอนุมัติ (version ${String(input.number)})`,
        message: input.note,
        link: `/dmps/${input.dmpId}`,
        dmpId: input.dmpId,
      },
    ];
    if (cancelledTitles.length > 0) {
      notes.push({
        userId: current.createdBy,
        type: "tasks_cancelled",
        title: `งานถูกยกเลิก ${String(cancelledTitles.length)} รายการ (output ถูกลบจาก revision)`,
        message: cancelledTitles.join(", "),
        link: `/dmps/${input.dmpId}`,
        dmpId: input.dmpId,
      });
    }
    await tx.insert(notifications).values(notes);
    const freshVersion = {
      ...version,
      status: "approved" as const,
      decidedBy: input.decidedBy,
      decidedAt: new Date(),
      decisionNote: input.note,
      carriedEdits: carried,
      droppedEdits: dropped,
    };
    return { dmp: updated, version: freshVersion };
  });
}

/** ตัดสิน reject — first submission กลับ draft; revision: version in force คงเดิม (ADR-0021) */
export async function rejectTx(
  db: Db,
  input: { dmpId: string; number: number; decidedBy: string; note: string; approver: { user_id: string; name: string; position: string; mbox: string | null } },
): Promise<{ dmp: DmpRow; version: VersionRow }> {
  return db.transaction(async (tx) => {
    const decided = await tx
      .update(dmpVersions)
      .set({
        status: "rejected",
        decidedBy: input.decidedBy,
        decidedAt: new Date(),
        decisionNote: input.note,
        decisionApprover: input.approver,
      })
      .where(and(eq(dmpVersions.dmpId, input.dmpId), eq(dmpVersions.number, input.number), eq(dmpVersions.status, "pending")))
      .returning();
    const version = decided.at(0);
    if (version === undefined) throw new NotPendingError();

    const current = (await tx.select().from(dmps).where(eq(dmps.dmpId, input.dmpId)).limit(1)).at(0);
    if (current === undefined) throw new Error("dmp disappeared during reject");
    // revision ถูกส่งกลับ → แผนยัง approved; first submission → กลับ draft
    const backToDraft = current.activeVersion === null;
    const updated = (
      await tx
        .update(dmps)
        .set({ status: backToDraft ? "draft" : "approved", updatedAt: new Date() })
        .where(eq(dmps.dmpId, input.dmpId))
        .returning()
    ).at(0);
    if (updated === undefined) throw new Error("dmp update failed during reject");
    await tx.insert(notifications).values({
      userId: current.createdBy,
      type: "dmp_returned",
      title: `แผน "${current.title}" ถูกส่งกลับ (version ${String(input.number)})`,
      message: input.note,
      link: `/dmps/${input.dmpId}`,
      dmpId: input.dmpId,
    });
    return { dmp: updated, version };
  });
}

/** submit revision — version ถัดไปแบบ pending; จด changes + based_on_snapshot (in force ตอน submit) */
export async function revisionTx(
  db: Db,
  input: {
    dmpId: string;
    draft: DmpDraftInput;
    draftRevision: number;
    title: string;
    submittedBy: string;
    notificationAuthor: { title: string };
    notificationReviewers: { title: string };
    reviewerIds: string[];
  },
): Promise<{ dmp: DmpRow; version: VersionRow }> {
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(dmps).where(eq(dmps.dmpId, input.dmpId)).limit(1)).at(0);
    if (current === undefined) throw new Error("dmp disappeared during revision");
    if (current.activeVersion === null) throw new Error("revision without version in force");
    const inForce = (
      await tx
        .select()
        .from(dmpVersions)
        .where(and(eq(dmpVersions.dmpId, input.dmpId), eq(dmpVersions.number, current.activeVersion)))
        .limit(1)
    ).at(0);
    if (inForce === undefined) throw new Error("version in force disappeared during revision");

    const changes = diffDraft(input.draft, inForce.snapshot as DmpDraftInput);
    if (changes.length === 0) throw new NoNewEditsError();
    const editType = classify(changes);

    const maxNumber =
      (
        await tx
          .select({ n: sql<number>`coalesce(max(${dmpVersions.number}), 0)::int` })
          .from(dmpVersions)
          .where(eq(dmpVersions.dmpId, input.dmpId))
      ).at(0)?.n ?? 0;
    const inserted = await tx
      .insert(dmpVersions)
      .values({
        dmpId: input.dmpId,
        number: maxNumber + 1,
        status: "pending",
        snapshot: input.draft,
        changes,
        editType,
        basedOnSnapshot: inForce.snapshot,
        submittedBy: input.submittedBy,
        submittedAt: new Date(),
      })
      .returning();
    const version = inserted.at(0);
    if (version === undefined) throw new Error("version disappeared after insert");

    const dmp = (
      await tx
        .update(dmps)
        .set({ status: "pending", updatedAt: new Date(), restoredFrom: null }) // revision จด changes เองครบ
        .where(eq(dmps.dmpId, input.dmpId)).returning()
    ).at(0);
    if (dmp === undefined) throw new Error("dmp update failed during revision");

    const notes: (typeof notifications.$inferInsert)[] = [
      {
        userId: input.submittedBy,
        type: "dmp_submitted",
        title: input.notificationAuthor.title,
        message: null,
        link: `/dmps/${input.dmpId}`,
        dmpId: input.dmpId,
      },
      ...input.reviewerIds.map((userId) => ({
        userId,
        type: "review_requested" as const,
        title: input.notificationReviewers.title,
        message: null,
        link: `/dmps/${input.dmpId}`,
        dmpId: input.dmpId,
      })),
    ];
    await tx.insert(notifications).values(notes);
    return { dmp, version };
  });
}

/** ไม่มีอะไรแก้ตั้งแต่ version in force */
/** minor edits — fold ลง snapshot ของ version in force + จด minor_edits; pending ไม่ถูกแตะ (flow #8) */
export async function minorEditsTx(
  db: Db,
  input: { dmpId: string; draft: DmpDraftInput; activeVersion: number; hasPending: boolean },
): Promise<VersionRow> {
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(dmps).where(eq(dmps.dmpId, input.dmpId)).limit(1)).at(0);
    if (current === undefined) throw new Error("dmp disappeared during minor edits");
    const inForce = (
      await tx
        .select()
        .from(dmpVersions)
        .where(and(eq(dmpVersions.dmpId, input.dmpId), eq(dmpVersions.number, input.activeVersion)))
        .limit(1)
    ).at(0);
    if (inForce === undefined) throw new Error("version in force disappeared during minor edits");
    const inForceSnapshot = inForce.snapshot as DmpDraftInput;
    const changes = diffDraft(input.draft, inForceSnapshot);
    if (changes.length === 0) throw new NoNewEditsError();
    // ระหว่าง revision รอ — major อยู่กับ pending แล้ว, fold เฉพาะ minor ได้;
    // ไม่มี pending → major ต้องยิง revision แทน
    if (!input.hasPending && classify(changes) === "major") throw new EditsIncludeMajorError();
    const folded = foldMinor(inForceSnapshot, input.draft, changes);
    // restore เวอร์ชันอื่นไว้ → จด restored_from ทุก entry ที่ fold ครั้งนี้ แล้วเคลียร์
    const restoredFrom = current.restoredFrom;
    const newEdits = restoredFrom === null ? folded.minorEdits : folded.minorEdits.map((e) => ({ ...e, restored_from: restoredFrom }));
    const minorEdits = [...((inForce.minorEdits ?? []) as FieldChange[]), ...newEdits];
    await tx.update(dmps).set({ restoredFrom: null }).where(eq(dmps.dmpId, input.dmpId));
    const updated = await tx
      .update(dmpVersions)
      .set({ snapshot: folded.snapshot, minorEdits })
      .where(eq(dmpVersions.versionId, inForce.versionId))
      .returning();
    const version = updated.at(0);
    if (version === undefined) throw new Error("minor edits update failed");
    return version;
  });
}

/** ไม่มีอะไรแก้ตั้งแต่ version in force */
export class NoNewEditsError extends Error {}

/** มี major ปน — ต้องยิง revision/finalize แทน */
export class EditsIncludeMajorError extends Error {}

export class NotPendingError extends Error {}

/** dataset ids ใน snapshot — ตัดสิน output ที่ถูกลบตอน approve revision */
function datasetIds(snapshot: DmpDraftInput): Set<string> {
  const list = Array.isArray((snapshot as Record<string, unknown>).dataset)
    ? ((snapshot as Record<string, unknown>).dataset as unknown[])
    : [];
  return new Set(list.map((d) => (d !== null && typeof d === "object" && typeof (d as Record<string, unknown>).dataset_id === "string" ? (d as Record<string, unknown>).dataset_id as string : "")));
}

/** plan_mode ยังไม่ freeze → ตามโครงการ (ใช้ตรวจ committee visibility ของแผน draft) */
export function projectPlanMode(db: Db, projectId: string | null) {
  if (projectId === null) return Promise.resolve([]);
  return db
    .select({ mode: projects.planMode })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);
}
