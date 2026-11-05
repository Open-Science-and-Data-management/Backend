// reviews repository — read model (flow #6 มุมกรรมการ); query ล่าสุดต่อแผน institutional เท่านั้น
import { sql, type SQL } from "drizzle-orm";
import { DB } from "@/database/database.module.js";
import type { Db } from "@/features/dmps/dmps.repository.js";
import { Inject } from "@nestjs/common";

export type VersionStatus = "pending" | "approved" | "rejected";

export interface ReviewFilters {
  statuses: VersionStatus[];
  decidedBy?: string;
  projectId?: string;
  submittedAfter?: Date;
  sort: "submitted_at" | "-submitted_at" | "-decided_at";
  limit: number;
  cursor?: { submittedAt: Date; decidedAt: Date | null; dmpId: string };
}

export interface ReviewRow extends Record<string, unknown> {
  dmp_id: string;
  title: string;
  version: number;
  status: VersionStatus;
  active_version: number | null;
  changes: unknown;
  in_force_snapshot: unknown;
  draft: unknown;
  submitted_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  decision_note: string | null;
  decision_approver: { user_id: string; name: string; position: string; mbox: string | null } | null;
  researcher_id: string;
  researcher_name: string;
  project_id: string | null;
  project_name: string | null;
}

/** เวอร์ชันล่าสุดต่อแผน (review = newest version ของแผน institutional) — sort + cursor + limit+1 (has_more) */
export async function listReviews(db: Db, f: ReviewFilters): Promise<ReviewRow[]> {
  const conds: SQL[] = [
    sql`v.number = (select max(x.number) from dmp_versions x where x.dmp_id = v.dmp_id)`,
    sql`d.plan_mode = 'institutional'`,
  ];
  if (f.statuses.length > 0 && f.statuses.length < 3) {
    conds.push(sql`v.status in (${sql.join(f.statuses.map((s) => sql`${s}`), sql`, `)})`);
  }
  if (f.decidedBy !== undefined) conds.push(sql`v.decided_by = ${f.decidedBy}`);
  if (f.projectId !== undefined) conds.push(sql`d.project_id = ${f.projectId}`);
  if (f.submittedAfter !== undefined) conds.push(sql`v.submitted_at > ${f.submittedAfter}`);
  if (f.cursor !== undefined) {
    const c = f.cursor;
    conds.push(
      f.sort === "-decided_at"
        ? sql`(v.decided_at, v.dmp_id) < (${c.decidedAt}, ${c.dmpId})`
        : f.sort === "-submitted_at"
          ? sql`(v.submitted_at, v.dmp_id) < (${c.submittedAt}, ${c.dmpId})`
          : sql`(v.submitted_at, v.dmp_id) > (${c.submittedAt}, ${c.dmpId})`,
    );
  }
  const order =
    f.sort === "submitted_at"
      ? sql`v.submitted_at asc, v.dmp_id asc`
      : f.sort === "-submitted_at"
        ? sql`v.submitted_at desc, v.dmp_id desc`
        : sql`v.decided_at desc nulls last, v.dmp_id desc`;
  const rows = await db.execute<ReviewRow>(sql`
    select v.number as version, v.status, v.submitted_at, v.decided_at, v.decided_by,
           v.decision_note, v.decision_approver, v.changes,
           d.dmp_id, d.title, d.active_version, d.draft,
           f.snapshot as in_force_snapshot,
           u.user_id as researcher_id, u.name || ' ' || u.surname as researcher_name,
           p.project_id, p.project_name
    from dmp_versions v
    join dmps d on d.dmp_id = v.dmp_id
    join users u on u.user_id = d.created_by
    left join projects p on p.project_id = d.project_id
    left join lateral (
      select snapshot from dmp_versions ff
      where ff.dmp_id = d.dmp_id and ff.number = d.active_version limit 1
    ) f on d.active_version is not null
    where ${sql.join(conds, sql` and `)}
    order by ${order}
    limit ${f.limit + 1}
  `);
  return rows.rows;
}

/** total_count ของ filter เดียวกัน (ไม่คิด cursor/limit) — ตัวเลข stat card ของ dashboard */
export async function countReviews(db: Db, f: Omit<ReviewFilters, "limit" | "cursor" | "sort">): Promise<number> {
  const conds: SQL[] = [
    sql`v.number = (select max(x.number) from dmp_versions x where x.dmp_id = v.dmp_id)`,
    sql`d.plan_mode = 'institutional'`,
  ];
  if (f.statuses.length > 0 && f.statuses.length < 3) {
    conds.push(sql`v.status in (${sql.join(f.statuses.map((s) => sql`${s}`), sql`, `)})`);
  }
  if (f.decidedBy !== undefined) conds.push(sql`v.decided_by = ${f.decidedBy}`);
  if (f.projectId !== undefined) conds.push(sql`d.project_id = ${f.projectId}`);
  if (f.submittedAfter !== undefined) conds.push(sql`v.submitted_at > ${f.submittedAfter}`);
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from dmp_versions v
    join dmps d on d.dmp_id = v.dmp_id
    where ${sql.join(conds, sql` and `)}
  `);
  return rows.rows.at(0)?.n ?? 0;
}

/** cursor จาก review id `dmpId:number` — เอา submitted_at/decided_at ของเวอร์ชันนั้น */
export async function findCursor(db: Db, dmpId: string, number: number) {
  const rows = await db.execute<{ submitted_at: Date; decided_at: Date | null; dmp_id: string }>(sql`
    select submitted_at, decided_at, dmp_id from dmp_versions
    where dmp_id = ${dmpId} and number = ${number}
  `);
  return rows.rows.at(0);
}

export class ReviewsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}
  list = (f: ReviewFilters) => listReviews(this.db, f);
  count = (f: Omit<ReviewFilters, "limit" | "cursor" | "sort">) => countReviews(this.db, f);
  cursor = (dmpId: string, number: number) => findCursor(this.db, dmpId, number);
}
