// auth service — sign-in, refresh (rotation + reuse detection), sign-out
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiError } from "@/shared/http/error-envelope.js";
import { DB } from "@/database/database.module.js";
import { users } from "@/database/schema/index.js";
import type { Db, UserRow } from "@/features/users/users.repository.js";
import * as usersRepo from "@/features/users/users.repository.js";
import * as refresh from "./refresh.js";
import { signAccessToken } from "./jwt.js";
import { verifyPassword } from "@/features/users/argon2.js";

export const REFRESH_COOKIE = "refresh_token";

@Injectable()
export class AuthService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async signIn(body: unknown) {
    const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
    if (typeof username !== "string" || username.length === 0 || typeof password !== "string" || password.length === 0) {
      throw new ApiError(400, "parameter_missing", "username or password is empty");
    }
    // invalid_credentials เดียวทั้งสองกรณี — ไม่เปิดเผยว่า username มีอยู่จริง
    const user = (await usersRepo.findByUsername(this.db, username.trim().toLowerCase())).at(0);
    const credential = user === undefined ? undefined : (await usersRepo.findCredential(this.db, user.username)).at(0);
    if (!user || !credential || user.disabledAt || !(await verifyPassword(credential.passwordHash, password))) {
      throw new ApiError(401, "invalid_credentials", "Username or password is incorrect");
    }
    return this.issueSession(user);
  }

  async refresh(token: string | undefined) {
    if (!token) throw new ApiError(401, "refresh_token_invalid", "Missing refresh token; sign in again");
    const consumed = await refresh.consumeRefreshToken(this.db, token);
    if (consumed.kind === "invalid") throw new ApiError(401, "refresh_token_invalid", "Sign in again");
    if (consumed.kind === "reuse") {
      await refresh.revokeFamily(this.db, consumed.row.familyId);
      throw new ApiError(401, "refresh_token_reused", "Token reuse detected; all sessions revoked — sign in again");
    }
    const user = (await this.db.select().from(users).where(eq(users.userId, consumed.row.userId)).limit(1)).at(0);
    if (!user) throw new ApiError(401, "refresh_token_invalid", "Sign in again");
    const { row, token: next } = await refresh.rotateRefreshToken(this.db, consumed.row);
    return this.buildSession(user, next, row.expiresAt);
  }

  async signOut(token: string | undefined) {
    if (token) {
      const consumed = await refresh.consumeRefreshToken(this.db, token);
      if (consumed.kind !== "invalid") await refresh.revokeToken(this.db, consumed.row.tokenId);
    }
    return { object: "session" as const, deleted: true };
  }

  private async issueSession(user: UserRow) {
    const { row, token } = await refresh.issueRefreshToken(this.db, user.userId);
    return this.buildSession(user, token, row.expiresAt);
  }

  /** POST /users — สมัครแล้ว sign-in ทันที (FE contract: session object) */
  async issueSessionFor(user: UserRow) {
    return this.issueSession(user);
  }

  private async buildSession(user: UserRow, refreshToken: string, refreshExpiresAt: Date) {
    const { token, expiresAt } = await signAccessToken({ sub: user.userId, username: user.username, role: user.role });
    return {
      body: {
        object: "session" as const,
        access_token: token,
        token_type: "Bearer",
        expires_at: expiresAt.toISOString(),
        user: usersRepo.toUserResponse(user),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }
}
