import { z } from "zod";

/** An ORCID iD as written: four groups of four, the last may end in X. */
export const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/**
 * A person named in the plan. Contributors need not have an account here, so
 * the link to one (`user_id`) is optional — set it when the person does have
 * an account. One account links to at most one contributor per plan
 * (บังคับใน validateDraft — domain engine).
 */
export const contributorSchema = z.object({
  contributor_id: z.string().optional(),
  title: z.string().optional(),
  name: z.string().min(1),
  surname: z.string().optional(),
  role: z.string().min(1),
  email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง").or(z.literal("")).optional(),
  orcid: z
    .string()
    .regex(ORCID, "รูปแบบ ORCID ไม่ถูกต้อง")
    .or(z.literal(""))
    .optional(),
  is_contact: z.boolean().default(false),
  /** The person's account, when they have one. */
  user_id: z.string().optional(),
});
export type Contributor = z.infer<typeof contributorSchema>;
