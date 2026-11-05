// files service — use-case layer; limits (25 MB, MIME .docx), evidence protection, archive lifecycle
import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import { config } from "@/shared/config/index.js";
import { FILE_STORAGE, type FileStorage } from "@/shared/ports/file-storage.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ProjectsService } from "@/features/projects/projects.service.js";
import { DB } from "@/database/database.module.js";
import type { Db, FileRow } from "./files.repository.js";
import * as repo from "./files.repository.js";

type FileResponse = ReturnType<typeof repo.toFileResponse>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PURPOSES = ["proposal", "task_deliverable", "evidence"] as const;

@Injectable()
export class FilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
  ) {}

  async upload(
    claims: AccessClaims,
    projectId: string,
    file: { buffer: Buffer; size: number; mimetype: string; originalname: string } | undefined,
    purpose: string | undefined,
  ): Promise<FileResponse> {
    await this.projectsService.assertVisible(claims, projectId);
    if (!purpose || !PURPOSES.includes(purpose as (typeof PURPOSES)[number])) {
      throw new ApiError(400, "invalid_purpose", "purpose must be proposal, task_deliverable or evidence", "/purpose");
    }
    if (file === undefined) {
      throw new ApiError(400, "field_invalid", "file is required", "/file");
    }
    const maxBytes = config().files.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new ApiError(413, "file_too_large", `File exceeds ${String(config().files.maxFileSizeMb)} MB`);
    }
    if (purpose === "proposal" && file.mimetype !== DOCX_MIME) {
      throw new ApiError(400, "file_type_not_allowed", "A proposal must be a .docx file");
    }
    const row = await repo.insert(this.db, {
      projectId,
      uploadedBy: claims.sub,
      filename: file.originalname,
      fileType: file.mimetype === DOCX_MIME ? "docx" : file.mimetype === "application/pdf" ? "pdf" : "other",
      purpose: purpose as FileRow["purpose"],
      byteSize: file.size,
      mimeType: file.mimetype,
      storagePath: await this.storage.put(file.buffer),
    });
    return repo.toFileResponse(row);
  }

  async list(
    claims: AccessClaims,
    query: { project_id?: string; purpose?: string },
  ): Promise<ListEnvelope<FileResponse>> {
    if (!query.project_id) throw new ApiError(400, "project_id_required", "No project_id", "/project_id");
    await this.projectsService.assertVisible(claims, query.project_id);
    if (query.purpose !== undefined && !PURPOSES.includes(query.purpose as (typeof PURPOSES)[number])) {
      throw new ApiError(400, "invalid_purpose", "purpose must be proposal, task_deliverable or evidence", "/purpose");
    }
    const rows = await repo.listForProject(this.db, query.project_id, query.purpose);
    return listOf(rows.map(repo.toFileResponse), false, rows.length);
  }

  /** bytes สำหรับ /content — controller ตั้ง Content-Disposition เอง */
  async content(claims: AccessClaims, fileId: string): Promise<{ row: FileRow; data: Buffer }> {
    const row = await this.visibleFile(claims, fileId);
    const data = await this.storage.get(row.storagePath);
    if (data === null) throw new ApiError(410, "file_content_gone", "The file's content is no longer stored");
    return { row, data };
  }

  async archive(claims: AccessClaims, fileId: string): Promise<FileResponse> {
    const row = await this.visibleFile(claims, fileId);
    if (row.archivedAt !== null) return repo.toFileResponse(row); // idempotent
    const [updated] = await repo.setArchived(this.db, row.fileId, new Date());
    return repo.toFileResponse(updated);
  }

  async remove(claims: AccessClaims, fileId: string) {
    const row = await this.visibleFile(claims, fileId);
    // preservation — evidence เป็นส่วนของบันทึกงาน ลบไม่ได้ archive เท่านั้น
    const inUse = await repo.usedAsEvidence(this.db, row.fileId);
    if (inUse.length > 0) {
      throw new ApiError(409, "file_in_use", "A task uses this file as evidence; archive it instead");
    }
    await repo.remove(this.db, row);
    await this.storage.delete(row.storagePath);
    return { object: "file" as const, file_id: row.fileId, deleted: true };
  }

  private async visibleFile(claims: AccessClaims, fileId: string): Promise<FileRow> {
    const row = (await repo.findById(this.db, fileId)).at(0);
    if (row === undefined || row.projectId === null) {
      throw new ApiError(404, "file_not_found", "No file with that id");
    }
    await this.projectsService.assertVisible(claims, row.projectId);
    return row;
  }
}
