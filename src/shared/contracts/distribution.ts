import { z } from "zod";
import { DataAccess } from "./enums.js";

// DCAT Distribution schema
export const distributionSchema = z.object({
  distribution_id: z.string().optional(),
  file_id: z.string().optional(),
  title: z.string().min(1),
  access_url: z.string().url().or(z.literal("")).optional(),
  download_url: z.string().url().or(z.literal("")).optional(),
  format: z.string().optional(),
  byte_size: z.coerce.number().int().nonnegative().optional(),
  data_access: DataAccess,
  license: z.string().optional(),
});
export type Distribution = z.infer<typeof distributionSchema>;
