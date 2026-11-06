// meta service — GET /domain-profiles + /field-policy + /openapi-json
// เสิร์ฟ registry เดียวกับที่ engine ใช้ (domain-profiles.ts / field-policy.ts / contracts/openapi.ts)
import { Injectable } from "@nestjs/common";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { listOf } from "@/shared/contracts/envelope.js";
import { registry } from "@/shared/contracts/openapi.js";
import { domainProfiles, type DomainProfile } from "@/shared/domain-profiles/domain-profiles.js";
import {
  dmpFieldPolicy,
  datasetFieldPolicy,
  planListPolicy,
  type FieldPolicy,
} from "@/shared/domain-profiles/field-policy.js";

export type SerializedProfile = Omit<DomainProfile, "schema">;

const serializeProfile = (profile: DomainProfile): SerializedProfile => ({
  key: profile.key,
  label: profile.label,
  description: profile.description,
  fields: profile.fields,
});

@Injectable()
export class MetaService {
  domainProfiles() {
    return listOf(Object.values(domainProfiles).map(serializeProfile), false, Object.keys(domainProfiles).length);
  }

  fieldPolicy() {
    const map = (policies: Record<string, FieldPolicy>) =>
      Object.fromEntries(Object.entries(policies).map(([k, v]) => [k, { ...v }]));
    return {
      object: "field_policy" as const,
      dmp: map(dmpFieldPolicy),
      dataset: map(datasetFieldPolicy),
      lists: map(planListPolicy),
    };
  }

}

/** token ของ spec ที่ generate ครั้งเดียวตอน boot */
export const OPENAPI_DOCUMENT = Symbol("OPENAPI_DOCUMENT");

export function generateOpenApiDocument(): Record<string, unknown> {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "DMP Researcher Backend API",
      version: "1.0.0",
      description: "Typed contract generated from the zod schemas in src/shared/contracts (ADR-0010).",
    },
  }) as unknown as Record<string, unknown>;
}
