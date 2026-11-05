// reviews service — read model /reviews (flow #6 มุมกรรมการ); รูปร่างตาม docs/frontend-api/reviews.md
import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ReviewsRepository, type ReviewRow, type VersionStatus } from "./reviews.repository.js";

const STATUSES = ["pending", "approved", "rejected"] as const;
const SORTS = ["submitted_at", "-submitted_at", "-decided_at"] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DAY_MS = 86_400_000;

export interface ReviewResponse {
  object: "review";
  id: string;
  dmp_id: string;
  title: string;
  version: number;
  status: VersionStatus;
  is_revision: boolean;
  active_version: number | null;
  submitted_at: Date;
  days_waiting: number;
  changes_summary: { major: number; minor: number };
  timeline: string;
  researcher: { user_id: string; name: string };
  project: { project_id: string | null; project_name: string | null };
  decided_at: Date | null;
  decided_by: string | null;
  approver: { user_id: string; name: string; position: string; mbox: string | null } | null;
  note: string | null;
}

/** UTC วันที่ 0 นาฬิกา — days_waiting นับปฏิทิน ไม่นับชั่วโมง */
function utcMidnight(d: Date): number {
  return Math.floor(d.getTime() / DAY_MS) * DAY_MS;
}

/** timeline — เทียบวันนี้กับ begin/end ของ version in force (ไม่มี → draft): "Week N of M" / "Starts …" / "Timeline ended" / "No timeline set" */
export function timelineOf(snapshot: unknown): string {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const begin = s.begin_date;
  const end = s.end_date;
  const iso = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v) ? v.slice(0, 10) : null;
  const b = iso(begin);
  const e = iso(end);
  if (b === null || e === null) return "No timeline set";
  const beginMs = Date.parse(`${b}T00:00:00Z`);
  const endMs = Date.parse(`${e}T00:00:00Z`);
  const today = utcMidnight(new Date());
  if (today < beginMs) {
    return `Starts ${new Date(beginMs).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (today > endMs) return "Timeline ended";
  const totalDays = Math.floor((endMs - beginMs) / DAY_MS) + 1;
  const weeks = Math.ceil(totalDays / 7);
  const week = Math.floor((today - beginMs) / DAY_MS / 7) + 1;
  return `Week ${String(week)} of ${String(weeks)}`;
}

/** นับ major/minor จาก FieldChange[] ที่จดไว้บนเวอร์ชัน */
function changesSummary(changes: unknown): { major: number; minor: number } {
  const list = Array.isArray(changes) ? changes : [];
  let major = 0;
  let minor = 0;
  for (const c of list) {
    if (c !== null && typeof c === "object" && (c as { edit_type?: unknown }).edit_type === "major") major += 1;
    else minor += 1;
  }
  return { major, minor };
}

function toResponse(row: ReviewRow): ReviewResponse {
  const timelineSource = row.in_force_snapshot ?? row.draft;
  return {
    object: "review",
    id: `${row.dmp_id}:${String(row.version)}`,
    dmp_id: row.dmp_id,
    title: row.title,
    version: row.version,
    status: row.status,
    is_revision: row.active_version !== null,
    active_version: row.active_version,
    submitted_at: row.submitted_at,
    days_waiting: Math.floor((utcMidnight(new Date()) - utcMidnight(new Date(row.submitted_at))) / DAY_MS),
    changes_summary: changesSummary(row.changes),
    timeline: timelineOf(timelineSource),
    researcher: { user_id: row.researcher_id, name: row.researcher_name },
    project: { project_id: row.project_id, project_name: row.project_name },
    decided_at: row.decided_at,
    decided_by: row.decided_by,
    approver: row.decision_approver ?? null,
    note: row.decision_note,
  };
}

@Injectable()
export class ReviewsService {
  constructor(@Inject(ReviewsRepository) private readonly repo: ReviewsRepository) {}

  async list(
    claims: AccessClaims,
    query: {
      status?: string | string[];
      decided_by?: string;
      project_id?: string;
      submitted_after?: string;
      sort?: string;
      limit?: string;
      starting_after?: string;
    },
  ): Promise<ListEnvelope<ReviewResponse>> {
    if (claims.role !== "committee" && claims.role !== "chief") {
      throw new ApiError(403, "permission_denied", "Only committee members read the review queue");
    }
    const rawStatuses = query.status === undefined ? [] : Array.isArray(query.status) ? query.status : [query.status];
    const flat = rawStatuses.flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => v.length > 0);
    const statuses = flat.filter((s): s is VersionStatus => (STATUSES as readonly string[]).includes(s));
    if (statuses.length !== flat.length) {
      throw new ApiError(400, "invalid_status", "status must be pending, approved or rejected", "/status");
    }
    const sort = SORTS.includes((query.sort ?? "") as never) ? (query.sort as (typeof SORTS)[number]) : "submitted_at";
    const limitRaw = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;

    let submittedAfter: Date | undefined;
    if (query.submitted_after !== undefined) {
      const t = Date.parse(query.submitted_after);
      if (Number.isNaN(t)) {
        throw new ApiError(400, "field_invalid", "submitted_after must be a date-time", "/submitted_after");
      }
      submittedAfter = new Date(t);
    }

    let cursor: { submittedAt: Date; decidedAt: Date | null; dmpId: string } | undefined;
    if (query.starting_after !== undefined) {
      const m = /^(.+):(\d+)$/.exec(query.starting_after);
      const number = m === null ? 0 : Number(m[2]);
      const found = m === null ? undefined : await this.repo.cursor(m[1], number);
      if (found === undefined) {
        throw new ApiError(400, "field_invalid", "starting_after is not a review id", "/starting_after");
      }
      cursor = { submittedAt: new Date(found.submitted_at), decidedAt: found.decided_at === null ? null : new Date(found.decided_at), dmpId: found.dmp_id };
    }

    const filters = {
      statuses,
      decidedBy: query.decided_by === "me" ? claims.sub : query.decided_by,
      projectId: query.project_id,
      submittedAfter,
    };
    const rows = await this.repo.list({ ...filters, sort, limit, cursor });
    const total = await this.repo.count(filters);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(toResponse);
    return listOf(data, hasMore, total);
  }
}
