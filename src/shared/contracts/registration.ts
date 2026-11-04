import { z } from "zod";
import { AccountType } from "./enums.js";
// The same ORCID format a plan contributor is held to.
import { ORCID } from "./contributor.js";

const USERNAME = /^[a-z0-9._-]+$/;
const PHONE = /^\+?[\d\s-]{9,15}$/;

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

/**
 * What a new researcher fills in to sign up. Institutional researchers must
 * name their organisation (สังกัด) — that's what makes their plans the
 * committee's to approve. Citizen researchers have no affiliation to give.
 */
export const registrationSchema = z
  .object({
    account_type: AccountType,
    title: optionalText,
    name: z.string().trim().min(1, "First name is required"),
    surname: z.string().trim().min(1, "Last name is required"),
    email: z.string().trim().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .refine((v) => !v || PHONE.test(v), "Enter a valid phone number")
      .transform((v) => v || undefined)
      .optional(),
    orcid: z
      .string()
      .trim()
      .refine(
        (v) => !v || ORCID.test(v),
        "ORCID looks like 0000-0002-1825-0097",
      )
      .transform((v) => v || undefined)
      .optional(),

    organization: optionalText,
    department: optionalText,
    position: optionalText,
    address: optionalText,

    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "At least 3 characters")
      .max(30, "At most 30 characters")
      .regex(
        USERNAME,
        "Use lowercase letters, numbers, dots, dashes or underscores",
      ),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirm_password: z.string(),
  })
  .superRefine((form, ctx) => {
    if (form.password !== form.confirm_password)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "Passwords don't match",
      });

    if (form.account_type === "institutional") {
      if (!form.organization)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["organization"],
          message: "Your organisation is required",
        });
    }
  });

export type RegistrationInput = z.input<typeof registrationSchema>;
export type Registration = z.output<typeof registrationSchema>;
