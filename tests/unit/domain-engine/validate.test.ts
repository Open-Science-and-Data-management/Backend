import { describe, expect, it } from "vitest";
import { domainProfiles } from "@shared/domain-profiles/domain-profiles.js";
import { validateDraft } from "@shared/domain-engine/validate-draft.js";
import type { z } from "zod";
import type { contributorSchema } from "@shared/contracts/index.js";

type ContributorInput = z.input<typeof contributorSchema>;

// Scenario กฎหมาย 3.3 ครบ (arc42 §8.4) — error เป็น JSON pointer

const person = (over: Partial<ContributorInput> = {}): ContributorInput => ({
  name: "A",
  role: "Researcher",
  ...over,
});

export const validDraft = () => ({
  title: "Rice Genomics DMP",
  description: "Sequencing of local cultivars.",
  language: "en",
  begin_date: "2026-01-01",
  end_date: "2026-12-31",
  ethical_issues_exist: false,
  contributor: [person({ is_contact: true, email: "a@x.edu" })],
  cost: [],
  dataset: [
    {
      type: "raw",
      title: "Sequence reads",
      access: "shared",
      personal_data: "no",
      sensitive_data: "no",
      protection_level: "not protected",
      security_classification_level: "unclassified",
      domain: "generic",
      domain_metadata: {},
      distribution: [],
    },
  ],
});

const codes = (errors: { code: string }[]) => errors.map((e) => e.code).sort();

describe("validDraft", () => {
  it("แผนที่ถูกต้องทุกกฎ → ไม่มี error", () => {
    const result = validateDraft(validDraft(), domainProfiles);
    expect(result.ok).toBe(true);
    if (!result.ok) expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([]);
  });

  it("รูปแบบผิด (type/format) → pointer ชี้ฟิลด์", () => {
    const draft = validDraft() as Record<string, unknown>;
    delete draft.title;
    const result = validateDraft(draft, domainProfiles);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "/title")).toBe(true);
    }
  });

  it("วันย้อน (end ก่อน begin) → /end_date", () => {
    const draft = { ...validDraft(), begin_date: "2026-12-31", end_date: "2026-01-01" };
    const result = validateDraft(draft, domainProfiles);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([
        { path: "/end_date", code: "date_order" },
      ]);
    }
  });

  it("ethical_issues_exist แต่ไม่มีคำอธิบาย → /ethical_issues_description", () => {
    const draft = { ...validDraft(), ethical_issues_exist: true };
    const result = validateDraft(draft, domainProfiles);
    if (!result.ok) {
      expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([
        {
          path: "/ethical_issues_description",
          code: "ethical_description_required",
          
        },
      ]);
    }
  });

  it("contact ไม่ครบหรือเกินหนึ่ง → /contributor", () => {
    const none = validateDraft(
      { ...validDraft(), contributor: [person({ is_contact: false, email: "a@x.edu" })] },
      domainProfiles,
    );
    const two = validateDraft(
      {
        ...validDraft(),
        contributor: [
          person({ is_contact: true, email: "a@x.edu" }),
          person({ is_contact: true, email: "b@x.edu" }),
        ],
      },
      domainProfiles,
    );
    expect(codes(!none.ok ? none.errors : [])).toContain("contact_count");
    expect(codes(!two.ok ? two.errors : [])).toContain("contact_count");
    if (!none.ok) expect(none.errors.find((e) => e.code === "contact_count")?.path).toBe("/contributor");
  });

  it("contact ต้องมี email (mbox) → /contributor/<i>/email", () => {
    const result = validateDraft(
      { ...validDraft(), contributor: [person({ is_contact: true })] },
      domainProfiles,
    );
    if (!result.ok) {
      expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([
        {
          path: "/contributor/0/email",
          code: "contact_email_required",
          
        },
      ]);
    }
  });

  it("contributor สองคนลิงก์บัญชีเดียวกัน → /contributor/<i ที่สอง>/user_id", () => {
    const draft = {
      ...validDraft(),
      contributor: [
        person({ is_contact: true, email: "a@x.edu", user_id: "u-1" }),
        person({ user_id: "u-1" }),
        person({ user_id: "u-2" }),
      ],
    };
    const result = validateDraft(draft, domainProfiles);
    if (!result.ok) {
      expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([
        {
          path: "/contributor/1/user_id",
          code: "duplicate_account_link",
          
        },
      ]);
    }
  });

  it("open distribution ไม่มี license → /dataset/<i>/distribution/<j>/license", () => {
    const draft = {
      ...validDraft(),
      dataset: [
        {
          ...validDraft().dataset[0],
          distribution: [
            { title: "Zenodo", data_access: "open" },
            { title: "Closed", data_access: "closed", license: "" },
          ],
        },
      ],
    };
    const result = validateDraft(draft, domainProfiles);
    if (!result.ok) {
      expect(result.errors.map(({ path, code }) => ({ path, code }))).toEqual([
        {
          path: "/dataset/0/distribution/0/license",
          code: "license_required",
          
        },
      ]);
    }
  });

  it("domain_metadata ไม่ผ่าน profile → /dataset/<i>/domain_metadata/<key>", () => {
    const draft = {
      ...validDraft(),
      dataset: [
        {
          ...validDraft().dataset[0],
          domain: "life_sciences",
          domain_metadata: {},
        },
        {
          ...validDraft().dataset[0],
          domain: "geospatial",
          domain_metadata: { coordinate_system: "EPSG:4326", organism: "Oryza sativa" },
        },
      ],
    };
    const result = validateDraft(draft, domainProfiles);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain("/dataset/0/domain_metadata/organism");
      // strict — คีย์ที่โดเมนอื่น declare ถือว่าผิด
      expect(paths.some((p) => p.startsWith("/dataset/1/domain_metadata"))).toBe(true);
    }
  });

  it("รวมหลายกฎในครั้งเดียว — รายงานครบ ไม่ short-circuit", () => {
    const draft = {
      ...validDraft(),
      end_date: "2025-01-01",
      ethical_issues_exist: true,
      contributor: [person({ is_contact: true })],
    };
    const result = validateDraft(draft, domainProfiles);
    if (!result.ok) {
      expect(codes(result.errors)).toEqual([
        "contact_email_required",
        "date_order",
        "ethical_description_required",
      ]);
    }
  });
});
