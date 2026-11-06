// notifications module — read model ของแจ้งเตือน (ADR-0013 poll)
import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
