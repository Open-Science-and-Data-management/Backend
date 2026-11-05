// auth guard — Bearer JWT → req.user; 401 not_signed_in / token_expired (flow #15 seam)
import { type ExecutionContext, HttpException, Injectable, createParamDecorator, type CanActivate } from "@nestjs/common";
import type { Request, Response } from "express";
import { verifyAccessToken, type AccessClaims } from "./jwt.js";

class HttpError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}

export interface AuthedRequest extends Request {
  auth?: AccessClaims;
}

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new HttpError(401, "not_signed_in", "Sign in to continue");
    const claims = await verifyAccessToken(token);
    if (!claims) throw new HttpError(401, "token_expired", "Access token expired; refresh and retry");
    req.auth = claims;
    return true;
  }
}

/** ผู้กระทำจาก JWT subject — ทุก mutation ใช้อันนี้ (§8.2) */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AccessClaims => {
  const req = context.switchToHttp().getRequest<AuthedRequest>();
  if (req.auth === undefined) throw new HttpError(401, "not_signed_in", "Sign in to continue");
  return req.auth;
});

export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "refresh_token") return rest.join("=");
  }
  return undefined;
}

export function setRefreshCookie(res: Response, req: Request, token: string, expiresAt: Date): void {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader(
    "Set-Cookie",
    `refresh_token=${token}; Path=/auth; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`,
  );
}

export function clearRefreshCookie(res: Response, req: Request): void {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `refresh_token=; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
}
