// notifications service — read model + ADR-0013 poll; เขียนเกิดฝั่ง dmps flows แล้ว
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { DB } from "@/database/database.module.js";
import type { Db } from "@/features/dmps/dmps.repository.js";
import type { NotificationRow } from "./notifications.repository.js";
import * as repo from "./notifications.repository.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  unread: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  starting_after: z.string().optional(),
});

export interface NotificationResponse {
  object: "notification";
  notification_id: string;
  user_id: string;
  type: NotificationRow["type"];
  title: string;
  message: string | null;
  link: string | null;
  dmp_id: string | null;
  project_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

export type NotificationList = ListEnvelope<NotificationResponse> & { unread_count: number };

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private ensureAllowed(claims: AccessClaims): void {
    if (claims.role === "admin") {
      throw new ApiError(403, "permission_denied", "Admin has no notification access");
    }
  }

  private toResponse(row: NotificationRow): NotificationResponse {
    return {
      object: "notification",
      notification_id: row.notificationId,
      user_id: row.userId,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      dmp_id: row.dmpId,
      project_id: row.projectId,
      read_at: row.readAt,
      created_at: row.createdAt,
    };
  }

  async list(claims: AccessClaims, query: Record<string, string | string[] | undefined>): Promise<NotificationList> {
    this.ensureAllowed(claims);
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const limit = parsed.data.limit ?? DEFAULT_LIMIT;
    const rows = await repo.list(this.db, claims.sub, {
      unreadOnly: parsed.data.unread === true,
      limit,
      cursor: parsed.data.starting_after,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const [total, unread] = await Promise.all([
      repo.count(this.db, claims.sub, parsed.data.unread === true),
      repo.countUnread(this.db, claims.sub),
    ]);
    return { ...listOf(page.map((row) => this.toResponse(row)), hasMore, total), unread_count: unread };
  }

  async markRead(claims: AccessClaims, notificationId: string): Promise<NotificationResponse> {
    this.ensureAllowed(claims);
    const updated = await repo.markRead(this.db, claims.sub, notificationId);
    const row = updated.at(0) ?? (await repo.findById(this.db, claims.sub, notificationId)).at(0);
    if (row === undefined) {
      throw new ApiError(404, "notification_not_found", "No notification with that id for this user");
    }
    return this.toResponse(row);
  }

  async readAll(claims: AccessClaims): Promise<{ object: "notification_batch"; updated: number }> {
    this.ensureAllowed(claims);
    const updated = await repo.markAllRead(this.db, claims.sub);
    return { object: "notification_batch", updated: updated.length };
  }

  async deleteOne(claims: AccessClaims, notificationId: string): Promise<{ object: "notification"; notification_id: string; deleted: true }> {
    this.ensureAllowed(claims);
    const deleted = await repo.deleteOne(this.db, claims.sub, notificationId);
    if (deleted.length === 0) {
      throw new ApiError(404, "notification_not_found", "No notification with that id for this user");
    }
    return { object: "notification", notification_id: notificationId, deleted: true };
  }

  async deleteAll(claims: AccessClaims): Promise<{ object: "notification_batch"; deleted: number }> {
    this.ensureAllowed(claims);
    const deleted = await repo.deleteAll(this.db, claims.sub);
    return { object: "notification_batch", deleted: deleted.length };
  }
}
