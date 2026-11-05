// users repository — Drizzle เดียวต่อ flow
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { credentials, users } from "@/database/schema/index.js";
import type * as schema from "@/database/schema/index.js";
import type { Registration } from "@/shared/contracts/registration.js";

export type Db = NodePgDatabase<typeof schema>;
export type UserRow = typeof users.$inferSelect;

/** FE user object — snake_case, ไม่มี password ออกทางนี้เด็ดขาด */
export function toUserResponse(row: UserRow) {
  return {
    object: "user" as const,
    user_id: row.userId,
    title: row.title ?? null,
    name: row.name,
    surname: row.surname,
    email: row.email,
    role: row.role,
    username: row.username,
    ai_token_limit: row.aiTokenLimit,
    ai_token_used: row.aiTokenUsed,
    account_type: row.accountType ?? null,
    phone: row.phone ?? null,
    orcid: row.orcid ?? null,
    affiliation: row.affiliation ?? null,
    address: row.address ?? null,
  };
}

/** lower + trim — unique บังคับที่ DB ด้วย (users_email_normalized_uq) */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function usernameTaken(db: Db, username: string) {
  return db.select({ username: users.username }).from(users).where(eq(users.username, username)).limit(1);
}

export function emailTaken(db: Db, email: string) {
  return db
    .select({ username: users.username })
    .from(users)
    .where(sql`lower(btrim(${users.email})) = ${normalizeEmail(email)}`)
    .limit(1);
}

export async function register(db: Db, input: Registration, passwordHash: string): Promise<UserRow> {
  const affiliation =
    input.account_type === "institutional"
      ? {
          organization: input.organization,
          ...(input.department ? { department: input.department } : {}),
          ...(input.position ? { position: input.position } : {}),
        }
      : null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        username: input.username,
        email: normalizeEmail(input.email),
        title: input.title ?? null,
        name: input.name,
        surname: input.surname,
        role: "researcher", // OC-1 — สมัครเองได้เฉพาะ researcher
        accountType: input.account_type,
        phone: input.phone ?? null,
        orcid: input.orcid ?? null,
        affiliation,
        address: input.address ?? null,
      })
      .returning();
    await tx.insert(credentials).values({ username: row.username, passwordHash });
    return row;
  });
}

export function findByUsername(db: Db, username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
}

export function findCredential(db: Db, username: string) {
  return db.select().from(credentials).where(eq(credentials.username, username)).limit(1);
}

export async function updateProfile(
  db: Db,
  username: string,
  patch: { title?: string | null; name: string; surname: string; email: string },
): Promise<UserRow> {
  const [row] = await db
    .update(users)
    .set({ ...patch, email: normalizeEmail(patch.email) })
    .where(eq(users.username, username))
    .returning();
  return row;
}
