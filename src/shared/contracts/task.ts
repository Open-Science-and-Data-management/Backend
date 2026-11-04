import { z } from "zod";
import { GeneratedBy, LifecycleStage, Priority, TaskStatus } from "./enums.js";

/**
 * How "done" is proven. The requirement comes from the task's lifecycle stage,
 * not from the person ticking it.
 *  - none         nothing attached yet
 *  - file         an output file was uploaded
 *  - url          a link to the output
 *  - rdm_deposit  a DOI/URL issued by the repository — the only one a
 *                 researcher can't fabricate
 */
export const TaskEvidenceType = z.enum(["none", "file", "url", "rdm_deposit"]);

export const taskEvidenceSchema = z.object({
  type: TaskEvidenceType.default("none"),
  /** File id, URL, or DOI depending on `type`. */
  ref: z.string().optional(),
  label: z.string().optional(),
  attached_at: z.coerce.date().optional(),
});

/**
 * A checklist is how a task is broken down — no dates, no status of its own,
 * no separate entity. Just the steps, and whether each is done.
 */
export const taskChecklistItemSchema = z.object({
  item_id: z.string(),
  label: z.string().min(1),
  done: z.boolean().default(false),
});

export type TaskChecklistItem = z.infer<typeof taskChecklistItemSchema>;
export type TaskEvidence = z.infer<typeof taskEvidenceSchema>;
export type TaskEvidenceTypeValue = z.infer<typeof TaskEvidenceType>;

const taskObjectSchema = z.object({
  task_id: z.string().optional(),
  dmp_id: z.string(),
  /** Absent for general work; present when the task acts on one dataset. */
  dataset_id: z.string().optional(),
  source_version_id: z.string().optional(),
  title: z.string().min(1),
  details: z.string().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  /** Derived from `checklist`; never typed in. */
  progress_percent: z.coerce.number().min(0).max(100).default(0),
  checklist: z.array(taskChecklistItemSchema).default([]),
  evidence: taskEvidenceSchema.default({ type: "none" }),
  file_id: z.string().optional(),
  lifecycle_stage: LifecycleStage,
  status: TaskStatus.default("todo"),
  priority: Priority.default("medium"),
  generated_by: GeneratedBy.default("user"),
  // Audit: who closed it and when.
  completed_at: z.coerce.date().optional(),
  completed_by: z.string().optional(),
  // Audit: what a cancellation replaced, so a reopen can restore it exactly.
  cancelled_from: TaskStatus.optional(),
  cancel_reason: z.enum(["manual", "output_removed"]).optional(),
  /** The removed output's title, to find it again if it returns under a new id. */
  cancelled_dataset_title: z.string().optional(),
  cancelled_at: z.coerce.date().optional(),
});

const dateOrderRefinement = (t: {
  start_date?: Date | undefined;
  end_date?: Date | undefined;
}) => !t.start_date || !t.end_date || t.end_date >= t.start_date;
const dateOrderIssue = {
  message: "end_date should not be before start_date",
  path: ["end_date"] as (string | number)[],
};

export const taskSchema = taskObjectSchema.refine(
  dateOrderRefinement,
  dateOrderIssue,
);
export const createTaskSchema = taskObjectSchema
  .omit({ task_id: true })
  .refine(dateOrderRefinement, dateOrderIssue);
export const updateTaskSchema = taskObjectSchema
  .omit({ task_id: true })
  .partial();

export type Task = z.infer<typeof taskSchema>;
