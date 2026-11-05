// projects repository — Drizzle เดียวต่อ flow; snake_case response ตาม FE contract
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { dmps, projectMembers, projects, users } from "@/database/schema/index.js";
import type * as schema from "@/database/schema/index.js";

export type Db = NodePgDatabase<typeof schema>;
export type ProjectRow = typeof projects.$inferSelect;
export type MemberRow = typeof projectMembers.$inferSelect;
export type ProjectWithCounts = {
  project: ProjectRow;
  fileCount: number;
  memberCount: number;
  awaitingReview: boolean;
};

export function toProjectResponse(
  row: ProjectRow,
  counts: { fileCount: number; memberCount: number; awaitingReview: boolean },
) {
  return {
    object: "project" as const,
    project_id: row.projectId,
    project_name: row.projectName,
    description: row.description ?? null,
    status: row.status,
    plan_mode: row.planMode,
    proposal_file_id: row.proposalFileId ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    file_count: counts.fileCount,
    member_count: counts.memberCount,
    awaiting_review: counts.awaitingReview,
  };
}

/** counts ต่อ card (ADR-0024) — scalar subqueries ใน query เดียว */
const countSelect = {
  fileCount: sql<number>`(select count(*)::int from file_records f where f.project_id = ${projects.projectId})`,
  memberCount: sql<number>`(select count(*)::int from project_members m where m.project_id = ${projects.projectId})`,
  awaitingReview: sql<boolean>`exists (
    select 1 from dmp_versions v join dmps d on d.dmp_id = v.dmp_id
    where d.project_id = ${projects.projectId} and v.status = 'pending')`,
};

function baseQuery(db: Db) {
  return db.select({ project: projects, ...countSelect }).from(projects);
}

export async function findById(db: Db, projectId: string): Promise<ProjectWithCounts[]> {
  return baseQuery(db).where(eq(projects.projectId, projectId)).limit(1);
}

export async function listForCommittee(
  db: Db,
  limit: number,
  startingAfter?: string,
): Promise<ProjectWithCounts[]> {
  return baseQuery(db)
    .where(
      and(
        eq(projects.planMode, "institutional"),
        startingAfter ? sql`${projects.projectId} > ${startingAfter}` : undefined,
      ),
    )
    .orderBy(asc(projects.projectId))
    .limit(limit + 1);
}

export async function listForMember(
  db: Db,
  userId: string,
  limit: number,
  startingAfter?: string,
): Promise<ProjectWithCounts[]> {
  return baseQuery(db)
    .where(
      and(
        sql`exists (select 1 from project_members m where m.project_id = ${projects.projectId} and m.user_id = ${userId})`,
        startingAfter ? sql`${projects.projectId} > ${startingAfter}` : undefined,
      ),
    )
    .orderBy(asc(projects.projectId))
    .limit(limit + 1);
}

export function countAll(db: Db, where: SQL | undefined) {
  return db.select({ n: sql<number>`count(*)::int` }).from(projects).where(where);
}

export function countForCommittee(db: Db) {
  return countAll(db, eq(projects.planMode, "institutional"));
}

export function countForMember(db: Db, userId: string) {
  return countAll(
    db,
    sql`exists (select 1 from project_members m where m.project_id = ${projects.projectId} and m.user_id = ${userId})`,
  );
}

export function findUser(db: Db, userId: string) {
  return db.select().from(users).where(eq(users.userId, userId)).limit(1);
}

export async function create(
  db: Db,
  input: { projectName: string; description?: string; planMode: "institutional" | "independent"; createdBy: string },
): Promise<ProjectRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        projectName: input.projectName,
        description: input.description ?? null,
        planMode: input.planMode,
        createdBy: input.createdBy,
      })
      .returning();
    // ผู้สร้างเป็นสมาชิก researcher เสมอ (FE contract — Create a project)
    await tx.insert(projectMembers).values({ projectId: row.projectId, userId: input.createdBy, projectRole: "researcher" });
    return row;
  });
}

export function listMembers(db: Db, projectId: string) {
  return db
    .select({ member: projectMembers, name: users.name, surname: users.surname, email: users.email })
    .from(projectMembers)
    .innerJoin(users, eq(users.userId, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

export function hasPlans(db: Db, projectId: string) {
  // นับรวมแผนที่ archive แล้ว — ลบได้เมื่อไม่มีแผนเหลือเลย (หมวด 4.2)
  return db.select({ n: sql<number>`count(*)::int` }).from(dmps).where(eq(dmps.projectId, projectId));
}

export async function remove(db: Db, projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.projectId, projectId)); // members cascade ตาม FK
}
