// notifications controller — บาง; HTTP boundary เท่านั้น
import { Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessClaims, @Query() query: { unread?: string; limit?: string; starting_after?: string }) {
    return this.notifications.list(user, query);
  }

  @Post(":notification_id/read")
  markRead(@CurrentUser() user: AccessClaims, @Param("notification_id") notificationId: string) {
    return this.notifications.markRead(user, notificationId);
  }

  @Post("read_all")
  readAll(@CurrentUser() user: AccessClaims) {
    return this.notifications.readAll(user);
  }

  @Delete(":notification_id")
  deleteOne(@CurrentUser() user: AccessClaims, @Param("notification_id") notificationId: string) {
    return this.notifications.deleteOne(user, notificationId);
  }

  @Delete()
  deleteAll(@CurrentUser() user: AccessClaims) {
    return this.notifications.deleteAll(user);
  }
}
