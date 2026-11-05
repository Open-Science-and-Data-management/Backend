// users controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Get, Inject, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service.js";
import { AuthGuard, CurrentUser } from "@/features/auth/session.js";

@Controller("users")
export class UsersController {
  // @Inject ชัดเจนทุกจุด — tsx/esbuild ไม่ emit design:paramtypes
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Post()
  register(@Body() body: unknown) {
    return this.users.register(body);
  }

  @Get("username-available")
  usernameAvailable(@Query("username") username?: string) {
    return this.users.isUsernameAvailable(username);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: { username: string }) {
    return this.users.getMe(user.username);
  }

  @Patch("me")
  @UseGuards(AuthGuard)
  patchMe(@CurrentUser() user: { username: string }, @Body() body: unknown) {
    return this.users.patchMe(user.username, body);
  }
}
