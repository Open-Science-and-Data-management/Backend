// files controller — บาง; HTTP boundary เท่านั้น (multipart ผ่าน multer memory storage)
import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { FilesService } from "./files.service.js";

@Controller() // routes ครอบทั้ง /projects/:id/files และ /files — global AuthGuard ครอบ
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  // ขนาดไฟล์ตรวจใน service จาก byteLength (config.toml) — interceptor เก็บเป็น buffer ใน memory
  @Post("projects/:projectId/files")
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @CurrentUser() user: AccessClaims,
    @Param("projectId") projectId: string,
    @UploadedFile() file: { buffer: Buffer; size: number; mimetype: string; originalname: string } | undefined,
    @Body("purpose") purpose: string | undefined,
  ) {
    return this.files.upload(user, projectId, file, purpose);
  }

  @Get("files")
  list(@CurrentUser() user: AccessClaims, @Query() query: { project_id?: string; purpose?: string }) {
    return this.files.list(user, query);
  }

  @Get("files/:fileId/content")
  async content(@CurrentUser() user: AccessClaims, @Param("fileId") fileId: string, @Res() res: Response) {
    const { row, data } = await this.files.content(user, fileId);
    res.setHeader("Content-Disposition", `attachment; filename="${row.filename}"`);
    res.setHeader("Content-Type", row.mimeType ?? "application/octet-stream");
    res.send(data);
  }

  @Post("files/:fileId/archive")
  archive(@CurrentUser() user: AccessClaims, @Param("fileId") fileId: string) {
    return this.files.archive(user, fileId);
  }

  @Delete("files/:fileId")
  remove(@CurrentUser() user: AccessClaims, @Param("fileId") fileId: string) {
    return this.files.remove(user, fileId);
  }
}
