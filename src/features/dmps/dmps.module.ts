import { Module } from "@nestjs/common";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { DmpsController } from "./dmps.controller.js";
import { DmpsService } from "./dmps.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [DmpsController],
  providers: [DmpsService],
  exports: [DmpsService], // cross-feature: submit/tasks ใน slice ถัดไป, ai (M4)
})
export class DmpsModule {}
