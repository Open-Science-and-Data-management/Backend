// OpenAPI registry — zod schemas register ที่นี่ เพื่อ gen spec (ADR-0010)
// NOTE: @asteasolutions/zod-to-openapi v9 peer-require zod v4 — ใช้ `zod/v4`
// (มาในตัว zod@3.25) สำหรับ schema ที่ลงทะเบียน; contract จริง (v3 classic) คงอยู่ที่ไฟล์ข้างเคียง
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod/v4";
import { errorEnvelopeSchema } from "./envelope.js";

extendZodWithOpenApi(z as unknown as Parameters<typeof extendZodWithOpenApi>[0]);
export const registry = new OpenAPIRegistry();

export const notificationBatchSchema = z.union([
  z.object({ object: z.literal("notification_batch"), updated: z.number().int() }),
  z.object({ object: z.literal("notification_batch"), deleted: z.number().int() }),
]);

export { errorEnvelopeSchema };

// ── registrations สำหรับ /openapi-json (ADR-0010) ─────────────────────────
// errorEnvelopeSchema (v3) mirror เป็น v4 เพื่อ generator (peer zod v4)
const errorEnvelopeV4 = z.object({
  error: z.object({
    type: z.string(),
    code: z.string(),
    message: z.string(),
    param: z.string().optional(),
  }),
});
// รูปร่าง mirror ตาม notification.ts / task.ts (v3) — spec-facing เท่านั้น
const notificationResponseSchema = z.object({
  object: z.literal("notification"),
  notification_id: z.string(),
  user_id: z.string(),
  type: z.enum([
    "dmp_submitted",
    "dmp_approved",
    "dmp_finalized",
    "tasks_generated",
    "tasks_cancelled",
    "proposal_superseded",
    "review_requested",
    "dmp_returned",
  ]),
  title: z.string().min(1),
  message: z.string().min(1).nullable(),
  link: z.string().nullable(),
  dmp_id: z.string().nullable(),
  project_id: z.string().nullable(),
  read_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});

const taskResponseSchema = z.object({
  task_id: z.string(),
  dmp_id: z.string(),
  dataset_id: z.string().optional(),
  source_version_id: z.string().optional(),
  title: z.string().min(1),
  details: z.string().optional(),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
  progress_percent: z.number().min(0).max(100),
  checklist: z.array(z.object({ item_id: z.string(), label: z.string().min(1), done: z.boolean() })),
  evidence: z.union([
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("file"), file_id: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
    z.object({ type: z.literal("url"), url: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
    z.object({ type: z.literal("rdm_deposit"), doi: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
  ]),
  file_id: z.string().optional(),
  lifecycle_stage: z.string(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  generated_by: z.enum(["ai", "user"]),
  completed_at: z.iso.datetime().optional(),
  completed_by: z.string().optional(),
  cancelled_from: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  cancel_reason: z.enum(["manual", "output_removed"]).optional(),
  cancelled_dataset_title: z.string().optional(),
  cancelled_at: z.iso.datetime().optional(),
});

export const registeredSchemas = {
  ErrorEnvelope: registry.register("ErrorEnvelope", errorEnvelopeV4 as never),
  Notification: registry.register("Notification", notificationResponseSchema as never),
  NotificationBatch: registry.register("NotificationBatch", notificationBatchSchema as never),
  Task: registry.register("Task", taskResponseSchema as never),
};
