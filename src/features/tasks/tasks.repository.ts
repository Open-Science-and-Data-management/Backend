// tasks repository — Drizzle เดียวต่อ flow; checklist เป็น jsonb array เต็มบน task (ADR-0022)
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { dmpVersions, dmps, fileRecords, reopenOffers, tasks } from "@/database/schema/index.js";
import type * as schema from "@/database/schema/index.js";
import type { TaskChecklistItem } from "@/shared/contracts/task.js";

export type Db = NodePgDatabase<typeof schema>;
export type TaskRow = typeof tasks.$inferSelect;
export type DmpRow = typeof dmps.$inferSelect;
export type VersionRow = typeof dmpVersions.$inferSelect;
export type OfferRow = typeof reopenOffers.$inferSelect;

export const STAGE_ORDER = ["collect", "process", "analyse", "preserve", "share"] as const;

/** evidence ตอบความต้องการของ stage หรือไม่ — declared ผ่านเสมอ */
export function evidenceSatisfies(type: TaskRow["evidenceType"], requirement: EvidenceRequirement): boolean {
  if (requirement === "declared") return true;
  if (requirement === "evidence_linked") return type === "file" || type === "url" || type === "rdm_deposit";
  return type === "rdm_deposit"; // system_verified — ต้องเป็นของ repository เท่านั้น
}

/** ลำดับสถานะ output — complete เดินหน้าได้อย่างเดียว (planned → collected → …) */
export const DATASET_STATUS_RANK: Record<string, number> = {
  planned: 0,
  collected: 1,
  processed: 2,
  preserved: 3,
  shared: 4,
};

export type LifecycleStageT = TaskRow["lifecycleStage"];
export type TaskStatusT = TaskRow["status"];
export type PriorityT = TaskRow["priority"];
export type EvidenceTypeT = TaskRow["evidenceType"];
export type EvidenceRequirement = "declared" | "evidence_linked" | "system_verified";

/** stage ของ task ผลัก output ไปถึงสถานะใด */
export const STAGE_TARGET: Record<string, string> = {
  collect: "collected",
  process: "processed",
  analyse: "processed",
  preserve: "preserved",
  share: "shared",
};

export async function findTaskWithDmp(db: Db, taskId: string): Promise<{ task: TaskRow; dmp: DmpRow } | undefined> {
  const rows = await db
    .select({ task: tasks, dmp: dmps })
    .from(tasks)
    .innerJoin(dmps, eq(dmps.dmpId, tasks.dmpId))
    .where(eq(tasks.taskId, taskId))
    .limit(1);
  return rows.at(0);
}

export async function activeVersion(db: Db, dmp: DmpRow): Promise<VersionRow | undefined> {
  if (dmp.activeVersion === null) return undefined;
  const rows = await db
    .select()
    .from(dmpVersions)
    .where(and(eq(dmpVersions.dmpId, dmp.dmpId), eq(dmpVersions.number, dmp.activeVersion)))
    .limit(1);
  return rows.at(0);
}

/** outputs ของ version in force — {dataset_id, title, status} */
export function outputsOf(snapshot: unknown): { dataset_id: string; title: string; status: string }[] {
  const list = Array.isArray((snapshot as Record<string, unknown> | undefined)?.dataset)
    ? ((snapshot as Record<string, unknown>).dataset as unknown[])
    : [];
  return list
    .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
    .map((o) => ({
      dataset_id: typeof o.dataset_id === "string" ? o.dataset_id : "",
      title: typeof o.title === "string" ? o.title : "",
      status: typeof o.status === "string" ? o.status : "planned",
    }));
}

export interface ListOptions {
  dmpId?: string;
  projectId?: string;
  authorId?: string; // researcher เห็นเฉพาะแผนตัวเอง
  status?: TaskRow["status"];
}

export function buildListWhere(options: ListOptions): SQL | undefined {
  const parts: SQL[] = [];
  if (options.dmpId !== undefined) parts.push(eq(tasks.dmpId, options.dmpId));
  if (options.projectId !== undefined) parts.push(eq(dmps.projectId, options.projectId));
  if (options.authorId !== undefined) parts.push(eq(dmps.createdBy, options.authorId));
  if (options.status !== undefined) parts.push(eq(tasks.status, options.status));
  return parts.length > 0 ? and(...parts) : undefined;
}

/** เรียงตาม stage แล้ว title — ตาม contract */
export async function listTasks(db: Db, options: ListOptions): Promise<TaskRow[]> {
  const rows: { task: TaskRow }[] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(dmps, eq(dmps.dmpId, tasks.dmpId))
    .where(buildListWhere(options))
    .orderBy(
      sql`array_position(${sql.raw(`array[${STAGE_ORDER.map((s) => `'${s}'`).join(",")}]::text[]`)}, ${tasks.lifecycleStage}::text)`,
      asc(tasks.title),
      asc(tasks.taskId),
    );
  return rows.map((r) => r.task);
}

export async function insertTasks(db: Db, rows: (typeof tasks.$inferInsert)[]): Promise<TaskRow[]> {
  if (rows.length === 0) return [];
  return db.insert(tasks).values(rows).returning();
}

export function updateTask(db: Db, taskId: string, set: Partial<typeof tasks.$inferInsert>): Promise<TaskRow[]> {
  return db.update(tasks).set(set).where(eq(tasks.taskId, taskId)).returning();
}

export async function deleteTask(db: Db, taskId: string): Promise<void> {
  await db.delete(tasks).where(eq(tasks.taskId, taskId));
}

/** ลบ AI task ที่ยังไม่ถูกแตะ — โหมด replace (generated_by ai, todo, 0%, ไม่มี evidence) */
export async function deleteUntouchedAiTasks(db: Db, dmpId: string): Promise<number> {
  const removed = await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.dmpId, dmpId),
        eq(tasks.generatedBy, "ai"),
        eq(tasks.status, "todo"),
        eq(tasks.progressPercent, 0),
        eq(tasks.evidenceType, "none"),
      ),
    )
    .returning({ taskId: tasks.taskId });
  return removed.length;
}

/** เขียน checklist ใหม่ทั้งก้อน (item_id ใหม่ให้ step ใหม่) */
export function withChecklist(rows: TaskChecklistItem[]): TaskChecklistItem[] {
  return rows;
}

export function newChecklistItems(labels: string[]): TaskChecklistItem[] {
  return labels.map((label) => ({ item_id: randomUUID(), label, done: false }));
}

export function progressOf(checklist: TaskChecklistItem[]): number {
  if (checklist.length === 0) return 0;
  const done = checklist.filter((i) => i.done).length;
  return Math.round((done / checklist.length) * 100);
}

/** file ต้องอยู่บนโครงการของแผน — ไม่งั้น 404 file_not_found */
export async function fileOnProject(db: Db, fileId: string, projectId: string | null): Promise<boolean> {
  if (projectId === null) return false;
  const rows = await db
    .select({ fileId: fileRecords.fileId })
    .from(fileRecords)
    .where(and(eq(fileRecords.fileId, fileId), eq(fileRecords.projectId, projectId)))
    .limit(1);
  return rows.length > 0;
}

/** ผลักสถานะ output ไปหน้า — ทั้ง working draft และ snapshot ของ version in force (never backwards) */
export async function advanceDatasetStatus(
  db: Db,
  dmp: DmpRow,
  version: VersionRow,
  datasetId: string,
  target: string,
): Promise<void> {
  const advance = (snapshot: unknown): unknown => {
    if (snapshot === null || typeof snapshot !== "object") return snapshot;
    const root = { ...(snapshot as Record<string, unknown>) };
    if (!Array.isArray(root.dataset)) return root;
    root.dataset = (root.dataset as Record<string, unknown>[]).map((o) => {
      if (o === null || typeof o !== "object" || o.dataset_id !== datasetId) return o;
      const current = typeof o.status === "string" ? o.status : "planned";
      if ((DATASET_STATUS_RANK[current] ?? 0) >= (DATASET_STATUS_RANK[target] ?? 0)) return o;
      return { ...o, status: target };
    });
    return root;
  };
  const now = new Date();
  await db
    .update(dmpVersions)
    .set({ snapshot: advance(version.snapshot) })
    .where(eq(dmpVersions.versionId, version.versionId));
  // working draft เดินตามด้วย เมื่อยังมี output ตัวเดิมอยู่
  await db
    .update(dmps)
    .set({ draft: advance(dmp.draft), updatedAt: now })
    .where(eq(dmps.dmpId, dmp.dmpId));
}

// ── reopen offers (ADR-0022) ───────────────────────────────────────────────

export interface OfferGroup {
  offer_id: string;
  dmp_id: string;
  dataset_id: string | null;
  dataset_title: string;
  created_at: Date;
  rows: OfferRow[];
}

/** กลุ่ม offer ที่ยังไม่ถูกตอบ ของแผนหนึ่ง — จับกลุ่มด้วย output (id/title) แล้วใช้ id แรกเป็นตัวแทน */
export async function listOpenOfferGroups(db: Db, dmpId: string): Promise<OfferGroup[]> {
  const rows = await db
    .select()
    .from(reopenOffers)
    .where(and(eq(reopenOffers.dmpId, dmpId), sql`${reopenOffers.acceptedAt} is null`, sql`${reopenOffers.dismissedAt} is null`))
    .orderBy(asc(reopenOffers.createdAt), asc(reopenOffers.offerId));
  const groups = new Map<string, OfferGroup>();
  for (const row of rows) {
    const key = `${row.datasetId ?? ""}|${row.datasetTitle}`;
    const group = groups.get(key);
    if (group !== undefined) {
      group.rows.push(row);
    } else {
      groups.set(key, { offer_id: row.offerId, dmp_id: row.dmpId, dataset_id: row.datasetId, dataset_title: row.datasetTitle, created_at: row.createdAt, rows: [row] });
    }
  }
  return [...groups.values()];
}

export async function offerGroup(db: Db, offerId: string): Promise<OfferGroup | undefined> {
  const rows = await db.select().from(reopenOffers).where(eq(reopenOffers.offerId, offerId)).limit(1);
  const head = rows.at(0);
  if (head === undefined) return undefined;
  const group = await listOpenOfferGroups(db, head.dmpId);
  const open = group.find((g) => g.rows.some((r) => r.offerId === offerId));
  if (open !== undefined) return open;
  // ตอบแล้ว — คืนกลุ่มเดิมเพื่อให้ 409 offer_closed พร้อมรู้ว่ามีอยู่จริง
  const all = await db.select().from(reopenOffers).where(eq(reopenOffers.dmpId, head.dmpId)).orderBy(asc(reopenOffers.createdAt), asc(reopenOffers.offerId));
  const same = all.filter((r) => `${r.datasetId ?? ""}|${r.datasetTitle}` === `${head.datasetId ?? ""}|${head.datasetTitle}`);
  return { offer_id: head.offerId, dmp_id: head.dmpId, dataset_id: head.datasetId, dataset_title: head.datasetTitle, created_at: head.createdAt, rows: same };
}

export async function closeOfferRows(db: Db, offerIds: string[], answer: "accept" | "dismiss"): Promise<void> {
  if (offerIds.length === 0) return;
  const set = answer === "accept" ? { acceptedAt: new Date() } : { dismissedAt: new Date() };
  await db.update(reopenOffers).set(set).where(inArray(reopenOffers.offerId, offerIds));
}
