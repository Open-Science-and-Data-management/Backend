// notifications repository — read model ของตาราง notifications (ADR-0013 poll);
// เขียนเกิดใน tx ของ dmps flows แล้ว (addNotifications ใน dmps.repository)
import { and, desc, eq, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/features/dmps/dmps.repository.js";
import { notifications } from "@/database/schema/index.js";

export type NotificationRow = typeof notifications.$inferSelect;

export interface ListFilters {
  unreadOnly: boolean;
  limit: number;
  /** starting_after — notification_id ของหน้าก่อน */
  cursor?: string;
}

/** ใหม่สุดก่อน (created_at desc, id desc tiebreak); limit+1 เพื่อ has_more */
export async function list(db: Db, userId: string, f: ListFilters): Promise<NotificationRow[]> {
  const conditions: SQL[] = [eq(notifications.userId, userId)];
  if (f.unreadOnly) conditions.push(isNull(notifications.readAt));
  if (f.cursor !== undefined) {
    conditions.push(
      lt(
        sql`(${notifications.createdAt}, ${notifications.notificationId})`,
        sql`(select created_at, notification_id from notifications where notification_id = ${f.cursor})`,
      ),
    );
  }
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.notificationId))
    .limit(f.limit + 1);
}

export async function count(db: Db, userId: string, unreadOnly: boolean): Promise<number> {
  const conditions: SQL[] = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(isNull(notifications.readAt));
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(...conditions));
  return rows.at(0)?.n ?? 0;
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.at(0)?.n ?? 0;
}

/** เฉพาะของผู้ใช้เอง — ของคนอื่นตอบ not found ฝั่ง service */
export function findById(db: Db, userId: string, notificationId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.notificationId, notificationId), eq(notifications.userId, userId)))
    .limit(1);
}

/** idempotent — อ่านแล้วคง read_at เดิม (updated_at ไม่มีใน schema) */
export function markRead(db: Db, userId: string, notificationId: string) {
  return db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.notificationId, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning();
}

export async function markAllRead(db: Db, userId: string): Promise<NotificationRow[]> {
  return db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning();
}

export async function deleteOne(db: Db, userId: string, notificationId: string): Promise<NotificationRow[]> {
  return db
    .delete(notifications)
    .where(and(eq(notifications.notificationId, notificationId), eq(notifications.userId, userId)))
    .returning();
}

export async function deleteAll(db: Db, userId: string): Promise<NotificationRow[]> {
  return db.delete(notifications).where(eq(notifications.userId, userId)).returning();
}
