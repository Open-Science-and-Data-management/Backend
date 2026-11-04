import { z } from "zod";
import { AccountType, UserRole } from "./enums.js";

export const userSchema = z.object({
  user_id: z.string().optional(),
  title: z.string().optional(),
  name: z.string().min(1),
  surname: z.string().min(1),
  email: z.string().email(),
  role: UserRole,
  // Set by the server per account; the UI reads it through the quota endpoint.
  ai_token_limit: z.number().int().nonnegative(),
  ai_token_used: z.number().int().default(0),
  // Set at sign-up. Optional so seeded and older accounts stay valid.
  username: z.string().optional(),
  account_type: AccountType.optional(),
  phone: z.string().optional(),
  orcid: z.string().optional(),
  /** Who the researcher works for (สังกัด); absent for citizen researchers. */
  affiliation: z
    .object({
      organization: z.string(),
      department: z.string().optional(),
      position: z.string().optional(),
    })
    .optional(),
  /** A citizen researcher's own address, if they gave one. */
  address: z.string().optional(),
});
export type User = z.infer<typeof userSchema>;

/** The fields a person may change about themselves; role and quota are not. */
export const userProfileSchema = userSchema
  .pick({ title: true, name: true, surname: true, email: true })
  .extend({
    title: z.string().trim().optional(),
    name: z.string().trim().min(1, "Name is required"),
    surname: z.string().trim().min(1, "Surname is required"),
    email: z.string().trim().email("Enter a valid email address"),
  });
export type UserProfile = z.infer<typeof userProfileSchema>;
