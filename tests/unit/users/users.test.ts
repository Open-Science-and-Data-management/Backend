// users unit — argon2 round-trip (ADR-0029), email normalize, FE response shape
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@/shared/config/index.js";
import { hashPassword, verifyPassword } from "@/features/users/argon2.js";
import { normalizeEmail, toUserResponse, type UserRow } from "@/features/users/users.repository.js";

beforeAll(async () => {
  await loadConfig();
});

describe("argon2id", () => {
  it("round-trips hash/verify", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("uses OWASP-minimum params from config (m=19456, t=2, p=1)", async () => {
    const hash = await hashPassword("x");
    expect(hash).toMatch(/\$m=19456,t=2,p=1\$/);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Mali@Example.EDU ")).toBe("mali@example.edu");
  });
});

describe("toUserResponse", () => {
  it("maps to the FE snake_case user object, never the password", () => {
    const row = {
      userId: "u1", username: "mali", email: "mali@example.edu", title: "Prof.",
      name: "Mali", surname: "Chaiyasit", role: "committee", accountType: null,
      phone: null, orcid: null, affiliation: null, address: null,
      aiTokenLimit: 4500, aiTokenUsed: 0, quotaResetsAt: null,
      disabledAt: null, mustChangePassword: false, createdAt: new Date(0),
    } as UserRow;
    expect(toUserResponse(row)).toStrictEqual({
      object: "user", user_id: "u1", title: "Prof.", name: "Mali", surname: "Chaiyasit",
      email: "mali@example.edu", role: "committee", username: "mali",
      ai_token_limit: 4500, ai_token_used: 0, account_type: null, phone: null,
      orcid: null, affiliation: null, address: null,
    });
  });
});
