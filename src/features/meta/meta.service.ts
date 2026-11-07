// meta service — GET /domain-profiles + /field-policy
// เสิร์ฟ registry เดียวกับที่ engine ใช้ (domain-profiles.ts / field-policy.ts)
import { Injectable } from "@nestjs/common";
import { listOf } from "@/shared/contracts/envelope.js";
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

