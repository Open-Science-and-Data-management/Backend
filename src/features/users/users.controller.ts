// users controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Get, Inject, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { UsersService } from "./users.service.js";
import { AuthService } from "@/features/auth/auth.service.js";
import { CurrentUser, Public, setRefreshCookie } from "@/features/auth/session.js";

@Controller("users") // global AuthGuard ครอบ — me ต้อง sign-in
export class UsersController {
  // @Inject ชัดเจนทุกจุด — tsx/esbuild ไม่ emit design:paramtypes
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Public()
  @Post()
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.users.register(body);
    const { body: session, refreshToken, refreshExpiresAt } = await this.auth.issueSessionFor(user);
    setRefreshCookie(res, req, refreshToken, refreshExpiresAt);
    return session;
  }

  @Public()
  @Get("username-available")
  usernameAvailable(@Query("username") username?: string) {
    return this.users.isUsernameAvailable(username);
  }

  @Get("me")
  me(@CurrentUser() user: { username: string }) {
    return this.users.getMe(user.username);
  }

  @Patch("me")
  patchMe(@CurrentUser() user: { username: string }, @Body() body: unknown) {
    return this.users.patchMe(user.username, body);
  }
}
