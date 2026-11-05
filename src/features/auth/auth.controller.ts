// auth controller — บาง; cookie + body เท่านั้น
import { Body, Controller, Delete, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { clearRefreshCookie, Public, readRefreshCookie, setRefreshCookie } from "./session.js";

@Public()
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("sessions")
  async signIn(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { body: session, refreshToken, refreshExpiresAt } = await this.auth.signIn(body);
    setRefreshCookie(res, req, refreshToken, refreshExpiresAt);
    return session;
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { body: session, refreshToken, refreshExpiresAt } = await this.auth.refresh(readRefreshCookie(req));
    setRefreshCookie(res, req, refreshToken, refreshExpiresAt);
    return session;
  }

  @Delete("sessions/current")
  signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = this.auth.signOut(readRefreshCookie(req));
    clearRefreshCookie(res, req);
    return result;
  }
}
