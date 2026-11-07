import { z } from "zod";
import { PlanMode, ProjectStatus } from "./enums.js";

export const projectSchema = z.object({
  project_id: z.string().optional(),
  project_name: z.string().min(1),
  description: z.string().optional(),
  proposal_file_id: z.string().optional(),
  status: ProjectStatus.default("draft"),
  /** Decides how this project's plans become active. */
  plan_mode: PlanMode.default("institutional"),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
});

export const createProjectSchema = projectSchema.omit({
  project_id: true,
  created_at: true,
  updated_at: true,
  // proposal_file_id ผูกโดย upload purpose=proposal / analyze-proposal เท่านั้น (ADR-0024)
  proposal_file_id: true,
});

export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
