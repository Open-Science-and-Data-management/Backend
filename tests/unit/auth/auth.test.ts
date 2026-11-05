// auth unit — jwt sign/verify, refresh mint/hash (ไม่แตะ DB)
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@/shared/config/index.js";
import { signAccessToken, verifyAccessToken } from "@/features/auth/jwt.js";
import { hashToken, mintRefreshToken } from "@/features/auth/refresh.js";

beforeAll(async () => {
  process.env.JWT_SECRET ??= "unit-test-secret";
  await loadConfig();
});

describe("access token", () => {
  it("round-trips claims", async () => {
    const { token, expiresAt } = await signAccessToken({ sub: "u1", username: "mali", role: "researcher" });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const claims = await verifyAccessToken(token);
    expect(claims).toStrictEqual({ sub: "u1", username: "mali", role: "researcher" });
  });

  it("rejects a tampered token", async () => {
    const { token } = await signAccessToken({ sub: "u1", username: "mali", role: "researcher" });
    expect(await verifyAccessToken(token.slice(0, -3) + "xxx")).toBeNull();
  });
});

describe("refresh token", () => {
  it("mints opaque tokens whose hash identifies them", () => {
    const a = mintRefreshToken();
    const b = mintRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.token.startsWith("rt_")).toBe(true);
    expect(hashToken(a.token)).toEqual(a.tokenHash);
    expect(hashToken(b.token)).not.toEqual(a.tokenHash);
  });
});
