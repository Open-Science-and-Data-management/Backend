// JWT access token (HS256, jose) — TTL จาก config.toml; subject = user_id
import { SignJWT, jwtVerify } from "jose";
import { config } from "@/shared/config/index.js";

export interface AccessClaims {
  sub: string; // user_id
  username: string;
  role: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "");
}

export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const ttlMinutes = config().auth.accessTokenTtlMinutes;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const token = await new SignJWT({ username: claims.username, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      username: typeof payload.username === "string" ? payload.username : "",
      role: typeof payload.role === "string" ? payload.role : "",
    };
  } catch {
    return null;
  }
}
