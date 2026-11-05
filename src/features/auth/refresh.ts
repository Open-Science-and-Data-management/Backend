// Refresh token (ADR-0016) — opaque random, เก็บ hash; rotation + family reuse detection
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { refreshTokens } from "@/database/schema/index.js";
import type * as schema from "@/database/schema/index.js";
import { config } from "@/shared/config/index.js";

export type Db = NodePgDatabase<typeof schema>;
export type RefreshRow = typeof refreshTokens.$inferSelect;

export function mintRefreshToken(): { token: string; tokenHash: string } {
  const token = `rt_${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(db: NodePgDatabase<typeof schema>, userId: string, familyId?: string) {
  const { token, tokenHash } = mintRefreshToken();
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash,
      familyId: familyId ?? crypto.randomUUID(),
      expiresAt: new Date(Date.now() + config().auth.refreshTokenTtlDays * 24 * 60 * 60_000),
    })
    .returning();
  return { row, token };
}

/** Rotation: revoke old + issue new ใน family เดิม */
export async function rotateRefreshToken(db: Db, old: RefreshRow) {
  const { row, token } = await issueRefreshToken(db, old.userId, old.familyId);
  await db.update(refreshTokens).set({ revokedAt: new Date(), replacedBy: row.tokenId }).where(eq(refreshTokens.tokenId, old.tokenId));
  return { row, token };
}

/**
 * Consume จาก cookie → old row (active), rotated row, หรือ null
 * - ไม่เจอ / หมดอายุ / revoked → null (refresh_token_invalid)
 * - ยัง active แต่ไม่ใช่ leaf ของ family (เคยถูก rotate ไปแล้ว) → reuse!
 */
export async function consumeRefreshToken(db: Db, token: string): Promise<
  { kind: "invalid" } | { kind: "reuse"; row: RefreshRow } | { kind: "active"; row: RefreshRow }
> {
  const row = (await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(token))).limit(1)).at(0);
  if (row === undefined || row.expiresAt.getTime() < Date.now()) return { kind: "invalid" };
  if (row.revokedAt !== null) return { kind: "reuse", row };
  // leaf = ยังไม่ถูก replace; ถ้าถูก replace แล้วแต่ revokedAt ยัง null (หายาก) ก็ถือ reuse
  const replacementExists = (
    await db
      .select({ id: refreshTokens.tokenId })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, row.familyId), eq(refreshTokens.replacedBy, row.tokenId)))
      .limit(1)
  ).at(0);
  if (replacementExists !== undefined) return { kind: "reuse", row };
  return { kind: "active", row };
}

/** Reuse detected → revoke ทั้ง family (ทุก session ของ user ตาย) */
export async function revokeFamily(db: Db, familyId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function revokeToken(db: Db, tokenId: string) {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.tokenId, tokenId), isNull(refreshTokens.revokedAt)));
}

export async function activeSessionCount(db: Db, userId: string) {
  const row = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  ).at(0);
  return row === undefined ? 0 : row.n;
}

