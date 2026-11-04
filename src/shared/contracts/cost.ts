import { z } from "zod";
import { CurrencyCode } from "./enums.js";

export const costSchema = z.object({
  cost_id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  value: z.coerce.number().nonnegative(),
  currency_code: CurrencyCode,
});
export type Cost = z.infer<typeof costSchema>;
