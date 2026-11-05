// dmps repository — Drizzle เดียวต่อ flow; snake_case response ตาม FE contract
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { dmpVersions, dmps, projects, users } from "@/database/schema/index.js";
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

/** plan_mode ยังไม่ freeze → ตามโครงการ (ใช้ตรวจ committee visibility ของแผน draft) */
export function projectPlanMode(db: Db, projectId: string | null) {
  if (projectId === null) return Promise.resolve([]);
  return db
    .select({ mode: projects.planMode })
    .from(projects)
    .where(eq(projects.projectId, projectId))
    .limit(1);
}
