// users controller — บาง; HTTP boundary เท่านั้น
import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { UsersService } from "./users.service.js";

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
}
