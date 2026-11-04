import { describe, expect, it } from "vitest";
import {
  aiSseEventSchema,
  contributorSchema,
  dmpSchema,
  errorEnvelopeSchema,
  listOf,
  registrationSchema,
  taskSchema,
  userProfileSchema,
} from "@shared/contracts/index.js";
import type { z } from "zod";

type ContributorInput = z.input<typeof contributorSchema>;

const valid = { title: "Dr.", name: "Aran", surname: "S", email: "a@b.edu" };

describe("userProfileSchema (port จาก FE user.schema.test)", () => {
  it("accepts a complete profile and trims whitespace", () => {
    const out = userProfileSchema.parse({ ...valid, name: "  Aran  " });
    expect(out.name).toBe("Aran");
  });

  it("treats the title as optional", () => {
    expect(userProfileSchema.safeParse({ ...valid, title: "" }).success).toBe(true);
  });

  it("rejects a blank name and a malformed email", () => {
    const result = userProfileSchema.safeParse({ ...valid, name: " ", email: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual(["email", "name"]);
    }
  });

  it("does not let role or quota be edited through the profile", () => {
    const out = userProfileSchema.parse({ ...valid, role: "admin", ai_token_limit: 1 });
    expect(out).not.toHaveProperty("role");
    expect(out).not.toHaveProperty("ai_token_limit");
  });
});

const person = (id: string, user_id?: string, is_contact = false) => ({
  contributor_id: id,
  name: id,
  role: "Researcher",
  email: `${id}@example.edu`,
  is_contact,
  user_id,
});

export const dmpFixture = (contributor: ContributorInput[]) => ({
  title: "Rice Genomics DMP",
  description: "Sequencing of local cultivars.",
  language: "en",
  begin_date: new Date("2026-01-01T00:00:00.000Z"),
  end_date: new Date("2026-12-31T00:00:00.000Z"),
  ethical_issues_exist: false,
  contributor,
  cost: [],
  dataset: [
    {
      dataset_id: "ds-1",
      type: "raw",
      title: "Sequence reads",
      status: "planned",
      access: "shared",
      personal_data: "no",
      sensitive_data: "no",
      protection_level: "not protected",
      security_classification_level: "unclassified",
      keyword: [],
      domain: "generic",
      domain_metadata: {},
      preservation: { doi_requested: false },
      distribution: [],
      schema_fields: [],
    },
  ],
});

describe("dmpSchema (port จาก FE contributor.schema.test)", () => {
  it("accepts contributors with and without accounts", () => {
    const result = dmpSchema.safeParse(
      dmpFixture([person("a", "u-aran", true), person("b"), person("c", "u-mali")]),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a plan without any contributor", () => {
    expect(dmpSchema.safeParse(dmpFixture([])).success).toBe(false);
  });

  it("requires at least one dataset", () => {
    const form = { ...dmpFixture([person("a", "u-aran", true)]), dataset: [] };
    expect(dmpSchema.safeParse(form).success).toBe(false);
  });
});

describe("contributorSchema", () => {
  it("rejects a malformed ORCID", () => {
    expect(
      contributorSchema.safeParse({ name: "x", role: "r", orcid: "1234" }).success,
    ).toBe(false);
  });
});

describe("taskSchema", () => {
  const base = {
    dmp_id: "dmp-1",
    title: "Collect samples",
    lifecycle_stage: "collect",
  };

  it("applies defaults (status/priority/progress/evidence)", () => {
    const t = taskSchema.parse(base);
    expect(t.status).toBe("todo");
    expect(t.priority).toBe("medium");
    expect(t.progress_percent).toBe(0);
    expect(t.evidence.type).toBe("none");
  });

  it("rejects end_date before start_date", () => {
    const t = {
      ...base,
      start_date: new Date("2026-05-02"),
      end_date: new Date("2026-05-01"),
    };
    expect(taskSchema.safeParse(t).success).toBe(false);
  });

  it("accepts an evidence type from the enum", () => {
    expect(
      taskSchema.safeParse({ ...base, evidence: { type: "rdm_deposit", ref: "doi:10.1/abc" } })
        .success,
    ).toBe(true);
    expect(
      taskSchema.safeParse({ ...base, evidence: { type: "carrier_pigeon" } }).success,
    ).toBe(false);
  });
});

describe("registrationSchema", () => {
  const base = {
    account_type: "institutional",
    name: "Mali",
    surname: "S",
    email: "mali@example.edu",
    username: "mali.s",
    password: "passw0rd",
    confirm_password: "passw0rd",
  };

  it("requires organization for institutional researchers", () => {
    const result = registrationSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path)).toEqual([["organization"]]);
    }
  });

  it("accepts an institutional researcher with organization", () => {
    expect(
      registrationSchema.safeParse({ ...base, organization: "Uni" }).success,
    ).toBe(true);
  });

  it("rejects mismatched passwords and weak passwords", () => {
    expect(
      registrationSchema.safeParse({ ...base, organization: "Uni", confirm_password: "other" })
        .success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...base, organization: "Uni", password: "12345678" })
        .success,
    ).toBe(false);
  });
});

describe("errorEnvelopeSchema (ADR-0014)", () => {
  it("accepts a Stripe-style error with a JSON pointer param", () => {
    const parsed = errorEnvelopeSchema.parse({
      error: {
        type: "invalid_request_error",
        code: "draft_validation_failed",
        message: "Open data needs a licence",
        param: "/dataset/0/distribution/1/license",
      },
    });
    expect(parsed.error.param).toBe("/dataset/0/distribution/1/license");
  });

  it("rejects an envelope without code", () => {
    expect(errorEnvelopeSchema.safeParse({ error: { type: "x", message: "m" } }).success).toBe(
      false,
    );
  });
});

describe("listOf (ADR-0015 — Stripe v1 shape)", () => {
  it("builds the list envelope", () => {
    const page = listOf([{ id: "a" }], true, 42);
    expect(page).toEqual({
      object: "list",
      data: [{ id: "a" }],
      has_more: true,
      total_count: 42,
    });
  });
});

describe("aiSseEventSchema (ADR-0018)", () => {
  it.each([
    [{ event: "status", message: "reading draft" }],
    [{ event: "tool", name: "read_draft" }],
    [{ event: "delta", text: "hello" }],
    [{ event: "proposal", proposal: { title: "x" } }],
    [{ event: "done" }],
    [{ event: "error", code: "ai_upstream", message: "boom" }],
  ])("accepts %o", (e) => {
    expect(aiSseEventSchema.safeParse(e).success).toBe(true);
  });

  it("rejects unknown events", () => {
    expect(aiSseEventSchema.safeParse({ event: "token", text: "x" }).success).toBe(false);
    expect(aiSseEventSchema.safeParse({ event: "result" }).success).toBe(false);
  });
});
