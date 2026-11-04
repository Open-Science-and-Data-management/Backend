// validateDraft — pure (CON-2): กฎหมาย 3.3 (arc42 §8.4) คืน error พร้อม
// JSON pointer ลงใน draft + code ตาม catalog; รูปร่าง/type ตรวจด้วย dmpSchema
import type { z } from "zod";
import { dmpSchema } from "@shared/contracts/dmp.js";
import { domainProfiles } from "@shared/domain-profiles/domain-profiles.js";
import type { DomainKey, DomainProfile } from "@shared/domain-profiles/domain-profiles.js";

export interface DraftError {
  /** JSON pointer ลงใน draft เช่น "/dataset/0/distribution/1/license" */
  path: string;
  code: string;
  message: string;
}

export type DomainProfileRegistry = Record<DomainKey, DomainProfile>;

type Parsed = z.infer<typeof dmpSchema>;

const pointer = (segments: (string | number)[]): string => {
  let out = "";
  for (const seg of segments) {
    out += "/" + String(seg).replaceAll("~", "~0").replaceAll("/", "~1");
  }
  return out;
};

const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

function schemaIssuesToErrors(input: unknown): { data?: Parsed; errors: DraftError[] } {
  const result = dmpSchema.safeParse(input);
  if (result.success) return { data: result.data, errors: [] };
  const errors = result.error.issues.map((issue) => ({
    path: pointer(issue.path),
    code:
      issue.code === "invalid_type"
        ? "required_field_missing"
        : issue.code === "invalid_enum_value"
          ? "invalid_value"
          : "invalid_format",
    message: issue.message,
  }));
  return { errors };
}

/** ตรวจ domain_metadata ตาม profile ที่ inject — คืน pointer ใต้ dataset นั้น */
function domainMetadataErrors(data: Parsed, profiles: DomainProfileRegistry): DraftError[] {
  const errors: DraftError[] = [];
  data.dataset.forEach((set, i) => {
    const resolved = profiles[set.domain];
    const result = resolved.schema.safeParse(set.domain_metadata);
    if (result.success) return;
    for (const issue of result.error.issues) {
      errors.push({
        path: pointer(["dataset", i, "domain_metadata", ...issue.path]),
        code: issue.code === "invalid_enum_value" ? "invalid_value" : "domain_metadata_invalid",
        message: issue.message,
      });
    }
  });
  return errors;
}

function ruleErrors(data: Parsed): DraftError[] {
  const errors: DraftError[] = [];

  if (data.end_date < data.begin_date) {
    errors.push({
      path: "/end_date",
      code: "date_order",
      message: "end_date ต้องไม่ก่อน begin_date",
    });
  }

  if (data.ethical_issues_exist && !nonEmpty(data.ethical_issues_description)) {
    errors.push({
      path: "/ethical_issues_description",
      code: "ethical_description_required",
      message: "ต้องอธิบายเมื่อมีประเด็นจริยธรรม",
    });
  }

  const contacts = data.contributor.filter((c) => c.is_contact);
  if (contacts.length !== 1) {
    errors.push({
      path: "/contributor",
      code: "contact_count",
      message: "ต้องมี contact เพียง 1 คน",
    });
  } else if (!nonEmpty(contacts[0]?.email)) {
    const contactIndex = data.contributor.findIndex((c) => c.is_contact);
    errors.push({
      path: pointer(["contributor", contactIndex, "email"]),
      code: "contact_email_required",
      message: "The contact needs an email address",
    });
  }

  const seen = new Set<string>();
  data.contributor.forEach((c, i) => {
    if (!c.user_id) return;
    if (seen.has(c.user_id)) {
      errors.push({
        path: pointer(["contributor", i, "user_id"]),
        code: "duplicate_account_link",
        message: "Linked to the same account as another contributor",
      });
    } else {
      seen.add(c.user_id);
    }
  });

  data.dataset.forEach((set, i) => {
    set.distribution.forEach((dist, j) => {
      if (dist.data_access === "open" && !nonEmpty(dist.license)) {
        errors.push({
          path: pointer(["dataset", i, "distribution", j, "license"]),
          code: "license_required",
          message: "Open data needs a licence",
        });
      }
    });
  });

  return errors;
}

export function validateDraft(
  draft: unknown,
  profiles: DomainProfileRegistry = domainProfiles,
): { ok: true } | { ok: false; errors: DraftError[] } {
  const { data, errors } = schemaIssuesToErrors(draft);
  if (!data) return { ok: false, errors };
  const all = [...errors, ...ruleErrors(data), ...domainMetadataErrors(data, profiles)];
  return all.length === 0 ? { ok: true } : { ok: false, errors: all };
}
