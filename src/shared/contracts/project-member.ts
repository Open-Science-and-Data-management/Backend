import { z } from "zod";
import { ProjectRole } from "./enums.js";

export const projectMemberSchema = z.object({
  project_id: z.string(),
  user_id: z.string(),
  project_role: ProjectRole,
});

export type ProjectMember = z.infer<typeof projectMemberSchema>;
