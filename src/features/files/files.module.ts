import { Module } from "@nestjs/common";
import { ProjectsModule } from "@/features/projects/projects.module.js";
import { FILE_STORAGE } from "@/shared/ports/file-storage.js";
import { DiskStorage } from "@/shared/adapters/disk-storage/disk-storage.js";
import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: FILE_STORAGE, useClass: DiskStorage }],
  exports: [FilesService],
})
export class FilesModule {}
