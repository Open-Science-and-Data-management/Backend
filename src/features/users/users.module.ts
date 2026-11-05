import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module.js";
import { AuthModule } from "@/features/auth/auth.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
