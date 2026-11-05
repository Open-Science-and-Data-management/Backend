import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { DatabaseModule } from "@/database/database.module.js";
import { ErrorEnvelopeFilter } from "./shared/http/error-envelope.js";
import { UsersModule } from "./features/users/users.module.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  providers: [{ provide: APP_FILTER, useClass: ErrorEnvelopeFilter }],
})
export class AppModule {}
