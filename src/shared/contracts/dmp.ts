import { z } from "zod";
import { contributorSchema } from "./contributor.js";
import { costSchema } from "./cost.js";
import { datasetSchema } from "./dataset.js";
import { MADMP_SCHEMA_VERSION } from "./madmp-vocabularies.js";
import { identifierSchema } from "./identifier.js";

// Port จาก FE dmp.schema.ts — delta: กฎ cross-field (วันย้อน, contact เดี่ยว,
// license เปิด, บัญชี-ผู้ร่วมซ้ำ) ไม่อยู่ใน schema แต่บังคับใน domain engine
// validateDraft (Task 7) ให้ error ได้ code ตาม error catalog (ADR-0014)

export const dmpSchema = z.object({
  dmp_id: z.string().optional(),
  project_id: z.string().optional(),
  title: z.string().min(1, "ต้องมีชื่อ"),
  description: z.string().min(1, "ต้องมีคำอธิบาย"),
  language: z.string().min(2),
  alternate_identifier: identifierSchema.optional(),
  // timeline
  begin_date: z.coerce.date(),
  end_date: z.coerce.date(),
  // ethical & legal (DMP-level)
  ethical_issues_exist: z.boolean(),
  ethical_issues_description: z.string().optional(),
  ethical_issues_report: z.string().url().or(z.literal("")).optional(),
  indigenous_considerations: z.string().optional(),
  // people & cost
  contributor: z.array(contributorSchema).min(1, "ต้องมีผู้ร่วมอย่างน้อย 1"),
  cost: z.array(costSchema).default([]),
  // data
  dataset: z.array(datasetSchema).min(1, "ต้องมีอย่างน้อย 1 dataset"),
  // systeminfo
  schema_version: z.string().default(MADMP_SCHEMA_VERSION),
});

export type DmpForm = z.infer<typeof dmpSchema>;
/** Draft ที่ส่งมาแก้ได้บางส่วน (working copy — ADR-0020 ส่งทั้งก้อน) */
export const dmpDraftSchema = dmpSchema.partial();
export type DmpDraft = z.infer<typeof dmpDraftSchema>;
/** รูป input ของ draft — ใช้เป็นพารามิเตอร์ engine (รับ string dates ฯลฯ) */
export type DmpDraftInput = z.input<typeof dmpDraftSchema>;
