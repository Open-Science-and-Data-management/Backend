import { describe, expect, it } from "vitest";
import { datasetSchema } from "@shared/contracts/index.js";
import {
  DomainKeyEnum,
  domainProfiles,
  foreignDomainKeys,
  getDomainProfile,
  validateDomainMetadata,
} from "@shared/domain-profiles/domain-profiles.js";

// Port จาก FE domain-profiles.test.ts (ตัด suggestDomain — ฝั่ง AI/UI ไม่อยู่ scope)

const dataset = (patch: Record<string, unknown> = {}) => ({
  dataset_id: "d1",
  type: "raw" as const,
  title: "Reads",
  status: "planned" as const,
  access: "shared" as const,
  personal_data: "no" as const,
  sensitive_data: "no" as const,
  protection_level: "Standard",
  security_classification_level: "Internal",
  keyword: [],
  domain: "generic",
  domain_metadata: {},
  preservation: { doi_requested: false },
  distribution: [],
  schema_fields: [],
  ...patch,
});

describe("the registry is the single source", () => {
  it("has a profile for every key, and generic takes no fields", () => {
    DomainKeyEnum.options.forEach((key) => {
      expect(domainProfiles[key].key).toBe(key);
    });
    expect(domainProfiles.generic.fields).toEqual([]);
    expect(validateDomainMetadata("generic", {}).success).toBe(true);
  });

  it("derives validation from the declared fields, so the two can't drift", () => {
    DomainKeyEnum.options.forEach((key) => {
      const everyField = Object.fromEntries(
        domainProfiles[key].fields.map((f) => [f.key, null]),
      );
      expect(foreignDomainKeys(key, everyField)).toEqual([]);
    });
  });

  it("falls back to generic for an unknown domain", () => {
    expect(getDomainProfile("astrology").key).toBe("generic");
    expect(getDomainProfile(undefined).key).toBe("generic");
  });

  it("rejects a value from another domain's profile", () => {
    const result = validateDomainMetadata("geospatial", {
      coordinate_system: "EPSG:4326",
      organism: "Oryza sativa",
    });
    expect(result.success).toBe(false);
  });

  it("names exactly the keys a domain switch has to drop", () => {
    const metadata = { organism: "Oryza sativa", sample_count: 12 };
    expect(foreignDomainKeys("geospatial", metadata).sort()).toEqual([
      "organism",
      "sample_count",
    ]);
    expect(foreignDomainKeys("life_sciences", metadata)).toEqual([]);
  });
});

describe("every profile in the registry holds together", () => {
  const profiles = DomainKeyEnum.options.map((key) => domainProfiles[key]);

  it("declares each field once, with a label", () => {
    profiles.forEach((p) => {
      const keys = p.fields.map((f) => f.key);
      expect(new Set(keys).size, `${p.key} repeats a field key`).toBe(keys.length);
      p.fields.forEach((f) => {
        expect(f.label.trim()).not.toBe("");
      });
    });
  });

  it("gives every select something to choose from", () => {
    profiles.forEach((p) => {
      p.fields
        .filter((f) => f.type === "select")
        .forEach((f) => {
          expect((f.options ?? []).length, `${p.key}.${f.key} has no options`).toBeGreaterThan(1);
        });
    });
  });

  it("accepts a full set of its own values", () => {
    const sample = (field: { type: string; options?: string[] }): unknown => {
      switch (field.type) {
        case "number":
          return 3;
        case "toggle":
          return true;
        case "date":
          return new Date("2026-01-15T00:00:00.000Z");
        case "select":
          return field.options?.[0];
        default:
          return "filled in";
      }
    };

    profiles.forEach((p) => {
      const everything = Object.fromEntries(p.fields.map((f) => [f.key, sample(f)]));
      const result = validateDomainMetadata(p.key, everything);
      const firstIssue = result.error?.issues[0]?.message ?? "unknown";
      expect(result.success, `${p.key}: ${firstIssue}`).toBe(true);
    });
  });

  it("asks for something identifying wherever it asks for anything", () => {
    profiles
      .filter((p) => p.key !== "generic" && p.fields.length > 0)
      .forEach((p) => {
        expect(p.fields.some((f) => f.required), `${p.key} has no required field`).toBe(true);
      });
  });
});

describe("a dataset is judged by its own domain", () => {
  it("accepts core fields with no domain chosen", () => {
    expect(datasetSchema.safeParse(dataset()).success).toBe(true);
  });

  it("requires the profile's required fields once a domain is picked", () => {
    const result = datasetSchema.safeParse(
      dataset({ domain: "life_sciences", domain_metadata: {} }),
    );
    expect(result.success).toBe(false);
  });

  it("passes once the required field is answered", () => {
    expect(
      datasetSchema.safeParse(
        dataset({
          domain: "life_sciences",
          domain_metadata: { organism: "Oryza sativa", sample_count: 12 },
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a select value the profile doesn't offer", () => {
    const result = datasetSchema.safeParse(
      dataset({
        domain: "life_sciences",
        domain_metadata: { organism: "Rice", sequencing_platform: "Guesswork" },
      }),
    );
    expect(result.success).toBe(false);
  });
});
