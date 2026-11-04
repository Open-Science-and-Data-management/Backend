import { z } from "zod";
import { DataAccess, DatasetStatus, DomainKeyEnum, YesNoUnknown } from "./enums.js";
import { distributionSchema } from "./distribution.js";
import { validateDomainMetadata } from "@shared/domain-profiles/domain-profiles.js";

// Port จาก FE dataset.schema.ts — issues ของ profile ถูก re-raise ใต้
// `domain_metadata.<field>` ให้ error ชี้ฟิลด์ที่ผิดจริง (ตรง FE)

export const schemaFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
});

export const preservationSchema = z.object({
  repository: z.string().optional(),
  duration: z.string().optional(),
  format: z.string().optional(),
  doi_requested: z.boolean().default(false),
  statement: z.string().optional(),
});

const datasetBase = z.object({
  dataset_id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: DatasetStatus.default("planned"),
  located_at: z.string().optional(),
  access: DataAccess,
  personal_data: YesNoUnknown,
  sensitive_data: YesNoUnknown,
  personal_data_plan: z.string().optional(),
  protection_level: z.string().min(1),
  /** When "other": the scheme's name, and the level within it (v3.0 asks for both). */
  protection_level_other_nomenclature: z.string().optional(),
  protection_level_other: z.string().optional(),
  security_classification_level: z.string().min(1),
  security_classification_level_other_nomenclature: z.string().optional(),
  security_classification_level_other: z.string().optional(),
  data_quality_assurance: z.string().optional(),
  keyword: z.array(z.string()).default([]),
  /**
   * The research domain, a separate axis from `type`. It selects which profile
   * validates `domain_metadata` — see shared/domain-profiles (Task 5).
   */
  domain: DomainKeyEnum.default("generic"),
  domain_metadata: z.record(z.unknown()).default({}),
  language: z.string().optional(),
  preservation: preservationSchema.default({ doi_requested: false }),
  distribution: z.array(distributionSchema).default([]),
});

// Discriminated union for different dataset types
export const datasetSchema = z.discriminatedUnion("type", [
  datasetBase.extend({
    type: z.literal("raw"),
    schema_fields: z.array(schemaFieldSchema).default([]),
  }),
  datasetBase.extend({
    type: z.literal("software"),
    repository_url: z.string().url().or(z.literal("")).optional(),
    software_version: z.string().optional(),
  }),
  datasetBase.extend({ type: z.literal("publication") }),
  datasetBase.extend({ type: z.literal("other") }),
]).superRefine((dataset, ctx) => {
  const result = validateDomainMetadata(dataset.domain, dataset.domain_metadata);
  if (result.success) return;

  result.error.issues.forEach((issue) => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["domain_metadata", ...issue.path],
      message: issue.message,
    });
  });
});

export type Dataset = z.infer<typeof datasetSchema>;
