import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "@/database/database.module.js";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";
import { UsersModule } from "./features/users/users.module.js";
import { AuthModule } from "./features/auth/auth.module.js";
import { ProjectsModule } from "./features/projects/projects.module.js";
import { FilesModule } from "./features/files/files.module.js";
import { DmpsModule } from "./features/dmps/dmps.module.js";
import { ReviewsModule } from "./features/reviews/reviews.module.js";
import { TasksModule } from "./features/tasks/tasks.module.js";
import { NotificationsModule } from "./features/notifications/notifications.module.js";
import { MetaModule } from "./features/meta/meta.module.js";
import { AuthGuard } from "./features/auth/session.js";

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, ProjectsModule, FilesModule, DmpsModule, ReviewsModule, TasksModule, NotificationsModule, MetaModule],
  providers: [
    { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
    { provide: APP_GUARD, useClass: AuthGuard }, // ครอบทุก endpoint — @Public ยกเว้นเฉพาะที่ประกาศ
  ],
})
export class AppModule {}
