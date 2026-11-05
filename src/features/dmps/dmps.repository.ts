// dmps repository — Drizzle เดียวต่อ flow; snake_case response ตาม FE contract
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
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

/** discard — กลับไป snapshot ที่มีอยู่ (pending → in force → ล่าสุด); revision ก้าวต่อเพื่อกัน race */
export async function resetDraftToSnapshot(db: Db, dmpId: string, snapshot: unknown): Promise<DmpRow[]> {
  return db
    .update(dmps)
    .set({ draft: snapshot, draftRevision: sql`${dmps.draftRevision} + 1`, updatedAt: new Date() })
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

/** plan_mode ยังไม่ freeze → ตามโครงการ (ใช้ตรวจ committee visibility ของแผน draft) */
export function projectPlanMode(db: Db, projectId: string | null) {
  if (projectId === null) return Promise.resolve([]);
  return db
    .select({ mode: projects.planMode })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);
}
