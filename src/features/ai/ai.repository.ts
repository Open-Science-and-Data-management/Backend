// ai.repository — plain Drizzle functions taking Db (CON-1): thread + idempotency + quota (ADR-0023)
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { aiThreadEntries, idempotencyKeys, users } from "@/database/schema/index.js";
import type { Db } from "@/features/projects/projects.repository.js";
import type { AiThreadEntry } from "@/shared/contracts/ai.js";

// ── thread ─────────────────────────────────────────────────────────────────

export type EntryRow = typeof aiThreadEntries.$inferSelect;

function toEntry(row: EntryRow): AiThreadEntry {
  return {
    object: "ai_thread_entry",
    entry_id: row.entryId,
    dmp_id: row.dmpId,
    kind: row.kind,
    content: row.content,
    token_count: row.tokenCount,
    decision: row.decision,
    hidden: row.hiddenAt !== null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function insertEntry(
  db: Db,
  input: { dmpId: string | null; ownerId: string; kind: "user" | "event" | "assistant"; content: unknown; tokenCount?: number },
): Promise<EntryRow> {
  const rows = await db.insert(aiThreadEntries).values({ ...input, tokenCount: input.tokenCount ?? 0 }).returning();
  const row = rows.at(0);
  if (row === undefined) throw new Error("insert ai_thread_entries returned no row");
  return row;
}

/** หน้าใหม่สุดเป็นค่าเริ่มต้น (เรียงเก่า→ใหม่), หน้าก่อนหน้าใช้ before; ซ่อนแถวที่ hidden เสมอ */
export async function listEntries(
  db: Db,
  ownerId: string,
  dmpId: string | null,
  options: { before?: string; limit?: number },
): Promise<{ data: AiThreadEntry[]; has_more: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  let beforeCreated: Date | undefined;
  if (options.before !== undefined) {
    const anchor = (await db.select().from(aiThreadEntries).where(eq(aiThreadEntries.entryId, options.before)).limit(1)).at(0);
    if (anchor !== undefined) beforeCreated = anchor.createdAt;
  }
  const rows = await db
    .select()
    .from(aiThreadEntries)
    .where(
      and(
        eq(aiThreadEntries.ownerId, ownerId),
        dmpId === null ? isNull(aiThreadEntries.dmpId) : eq(aiThreadEntries.dmpId, dmpId),
        isNull(aiThreadEntries.hiddenAt),
        beforeCreated === undefined ? undefined : lt(aiThreadEntries.createdAt, beforeCreated),
      ),
    )
    .orderBy(desc(aiThreadEntries.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { data: rows.slice(0, limit).reverse().map(toEntry), has_more: hasMore };
}

/** จด decision บน proposal — เฉพาะ entry assistant ของเจ้าของเอง; ตัดสินไปแล้ว → null (caller ยิง 409) */
export async function setDecision(
  db: Db,
  ownerId: string,
  entryId: string,
  decision: "accepted" | "rejected" | "stale",
  staleReason?: string,
): Promise<EntryRow | null> {
  const content =
    staleReason === undefined
      ? undefined
      : sql`jsonb_set(${aiThreadEntries.content}, '{stale_reason}', to_jsonb(${staleReason}::text), true)`;
  const rows = await db
    .update(aiThreadEntries)
    .set({ decision, ...(content === undefined ? {} : { content }) })
    .where(and(eq(aiThreadEntries.entryId, entryId), eq(aiThreadEntries.ownerId, ownerId), eq(aiThreadEntries.kind, "assistant")))
    .returning();
  const row = rows.at(0);
  return row ?? null;
}

/** clear — ซ่อน user + assistant ที่ไม่ได้ accepted; เก็บ event และ accepted ตลอด (FE ai.md preservation) */
export async function clearThread(db: Db, ownerId: string, dmpId: string | null): Promise<{ hidden: number; kept: number }> {
  const scope = and(
    eq(aiThreadEntries.ownerId, ownerId),
    dmpId === null ? isNull(aiThreadEntries.dmpId) : eq(aiThreadEntries.dmpId, dmpId),
    isNull(aiThreadEntries.hiddenAt),
  );
  const total = await db.select({ id: aiThreadEntries.entryId }).from(aiThreadEntries).where(scope); // นับก่อนซ่อน
  const hiddenRows = await db
    .update(aiThreadEntries)
    .set({ hiddenAt: new Date() })
    .where(and(scope, sql`${aiThreadEntries.kind} <> 'event'`, sql`(${aiThreadEntries.decision} is null or ${aiThreadEntries.decision} <> 'accepted')`))
    .returning({ id: aiThreadEntries.entryId });
  return { hidden: hiddenRows.length, kept: total.length - hiddenRows.length };
}

/** adopt — ย้าย thread unscoped (dmp_id null) ทั้งหมดของเจ้าของเข้าแผน */
export async function adoptThread(db: Db, ownerId: string, toDmpId: string): Promise<number> {
  const rows = await db
    .update(aiThreadEntries)
    .set({ dmpId: toDmpId })
    .where(and(eq(aiThreadEntries.ownerId, ownerId), isNull(aiThreadEntries.dmpId)))
    .returning({ id: aiThreadEntries.entryId });
  return rows.length;
}

export async function findEntry(db: Db, ownerId: string, entryId: string): Promise<EntryRow | null> {
  return (await db.select().from(aiThreadEntries).where(and(eq(aiThreadEntries.entryId, entryId), eq(aiThreadEntries.ownerId, ownerId))).limit(1)).at(0) ?? null;
}

// ── idempotency (ADR-0023 — replay 24 ชม. ไม่หักโควตาซ้ำ) ─────────────────

export type IdempotencyRow = typeof idempotencyKeys.$inferSelect;

export async function findIdempotencyKey(db: Db, userId: string, key: string, action: string): Promise<IdempotencyRow | null> {
  return (
    (
      await db
        .select()
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), eq(idempotencyKeys.action, action)))
        .limit(1)
    ).at(0) ?? null
  );
}

export async function insertIdempotencyKey(db: Db, input: { key: string; userId: string; action: string }): Promise<IdempotencyRow> {
  const rows = await db
    .insert(idempotencyKeys)
    .values({ ...input, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    .returning();
  const row = rows.at(0);
  if (row === undefined) throw new Error("insert idempotency_keys returned no row");
  return row;
}

export async function setIdempotencySnapshot(db: Db, keyId: string, snapshot: unknown): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ responseSnapshot: snapshot, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    .where(eq(idempotencyKeys.keyId, keyId));
}

// ── quota (users.ai_token_* — reset รายเดือน, ต้นเดือนถัดไป UTC) ───────────

export interface QuotaRow {
  userId: string;
  limit: number;
  used: number;
  resetsAt: Date; // ต้นเดือนถัดไป UTC — getQuota ตั้งค่าให้เสมอ
}

/** reset ถ้าเลยกำหนดแล้ว (lazy) — คืนค่าหลัง reset; resetsAt = ต้นเดือนถัดไป UTC */
export async function getQuota(db: Db, userId: string): Promise<QuotaRow> {
  const row = (await db.select().from(users).where(eq(users.userId, userId)).limit(1)).at(0);
  if (row === undefined) throw new Error("quota user missing");
  const nextReset = nextMonthStartUtc(row.quotaResetsAt !== null ? row.quotaResetsAt : new Date());
  if (row.quotaResetsAt !== null && row.quotaResetsAt.getTime() <= Date.now()) {
    await db.update(users).set({ aiTokenUsed: 0, quotaResetsAt: nextReset }).where(eq(users.userId, userId));
    return { userId, limit: row.aiTokenLimit, used: 0, resetsAt: nextReset };
  }
  const resetsAt = row.quotaResetsAt ?? nextReset;
  if (row.quotaResetsAt === null) {
    await db.update(users).set({ quotaResetsAt: nextReset }).where(eq(users.userId, userId));
  }
  return { userId, limit: row.aiTokenLimit, used: row.aiTokenUsed, resetsAt };
}

/** reconcile ตอนจบ — output + uncached input + cached×10% (เพดานปัด); นับทุก call รวม fail/abort */
export async function chargeQuota(db: Db, userId: string, report: { input_tokens: number; output_tokens: number; cached_input_tokens: number } | null): Promise<number> {
  if (report === null) return 0;
  const uncached = Math.max(report.input_tokens - report.cached_input_tokens, 0);
  const charged = Math.ceil(report.output_tokens + uncached + report.cached_input_tokens * 0.1);
  await db
    .update(users)
    .set({ aiTokenUsed: sql`${users.aiTokenUsed} + ${charged}` })
    .where(eq(users.userId, userId));
  return charged;
}

function nextMonthStartUtc(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

