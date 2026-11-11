// files service — use-case layer; limits (25 MB, MIME .docx), evidence protection, archive lifecycle
import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "@/shared/http/error-envelope.js";
import { listOf, type ListEnvelope } from "@/shared/contracts/envelope.js";
import { config } from "@/shared/config/index.js";
import { FILE_STORAGE, type FileStorage } from "@/shared/ports/file-storage.js";
import { EMBEDDING, type Embedding } from "@/shared/ports/embedding.js";
import { AI_CLIENT, type AiClient, type AiMessage } from "@/shared/ports/ai-client.js";
import { chargeQuota } from "@/features/ai/ai.repository.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ProjectsService } from "@/features/projects/projects.service.js";
import { DB } from "@/database/database.module.js";
import { blocksToChunks, fieldsToChunks } from "./chunking.js";
import { parseDocx, parseDocxBlocks } from "./docx.js";
import { parseDocxForm, readDocxImage, type RawFormDocument } from "./docx-form.js";
import { extractFields, type ExtractedField } from "./form-extract.js";
import type { Db, FileRow } from "./files.repository.js";
import * as repo from "./files.repository.js";

type FileResponse = ReturnType<typeof repo.toFileResponse>;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PURPOSES = ["proposal", "task_deliverable", "evidence"] as const;

@Injectable()
export class FilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(EMBEDDING) private readonly embedding: Embedding,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
  ) {}

  /** upload response เพิ่ม `form_parsed` — response-only (SPEC ff2569 Q13) ไม่เก็น DB */
  async upload(
    claims: AccessClaims,
    projectId: string,
    file: { buffer: Buffer; size: number; mimetype: string; originalname: string } | undefined,
    purpose: string | undefined,
  ): Promise<FileResponse & { form_parsed: boolean }> {
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
    const fileType = file.mimetype === DOCX_MIME ? "docx" : file.mimetype === "application/pdf" ? "pdf" : "other";
    // parse → chunk → embed ก่อนเขียนทุกอย่าง — พังตรงไหน → 422 ไม่ทิ้งข้อมูลครึ่ง ๆ
    let extractedText: string | null = null;
    let formParsed = false;
    let buildChunks: (fileId: string) => repo.ChunkInsert[] = () => [];
    if (fileType === "docx") {
      try {
        extractedText = await parseDocx(file.buffer);
        const rag = config().files.rag;
        const chunkConfig = {
          targetTokens: rag.chunkTargetTokens,
          overlapPercent: rag.chunkOverlapPercent,
          tableMaxTokens: rag.chunkTableMaxTokens,
        };
        // fast path FF2569 (SPEC ff2569) — parse OOXML ตรง + extract ต่อ template schema;
        // match ไม่ครบพอ (ไม่ใช่ฟอร์ม/โครงเพี้ยน) หรือ parse พัง → fallback generic เดิม (ไม่ error)
        if (rag.formFastPath) {
          try {
            const raw = await parseDocxForm(file.buffer);
            const result = extractFields(raw);
            if (result.fields.length > 0 && result.misses.length <= result.fields.length) {
              await this.captionImages(claims, file.buffer, raw, result.fields);
              const chunks = fieldsToChunks(result.fields, chunkConfig);
              const vectors = await this.embedding.embedPassages(chunks.map((c) => c.content));
              buildChunks = (fileId) =>
                chunks.map((c, i) => ({
                  fileId,
                  chunkIndex: c.chunk_index,
                  content: c.content,
                  headingPath: c.heading_path,
                  meta: c.meta,
                  embedding: vectors[i],
                  embeddingModel: this.embedding.model,
                }));
              formParsed = true;
            } else {
              console.warn(`files: FF2569 schema match failed (${String(result.misses.length)} misses) — fallback generic`);
            }
          } catch {
            console.warn("files: form fast path parse failed — fallback generic");
          }
        }
        if (!formParsed) {
          const blocks = await parseDocxBlocks(file.buffer);
          const chunks = blocksToChunks(blocks, chunkConfig);
          const vectors = await this.embedding.embedPassages(chunks.map((c) => c.content));
          buildChunks = (fileId) =>
            chunks.map((c, i) => ({
              fileId,
              chunkIndex: c.chunk_index,
              content: c.content,
              headingPath: c.heading_path,
              embedding: vectors[i],
              embeddingModel: this.embedding.model,
            }));
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(422, "file_unparseable", "The .docx file could not be read");
      }
    }
    const row = await repo.insertWithChunks(
      this.db,
      {
        projectId,
        uploadedBy: claims.sub,
        filename: file.originalname,
        fileType,
        purpose: purpose as FileRow["purpose"],
        byteSize: file.size,
        mimeType: file.mimetype,
        docxExtractedText: extractedText,
        storagePath: await this.storage.put(file.buffer),
      },
      buildChunks,
    );
    return { ...repo.toFileResponse(row), form_parsed: formParsed };
  }

  /**
   * VLM caption best-effort (SPEC ff2569 Task 7, Q10): รูปของ field แบบ image → caption เติมลง field
   * แล้ว fieldsToChunks ใช้ทำ chunk — ปิดด้วย `vlmModel` ว่าง; quota หมด/ยิงพลาด → ข้าม + warn, upload ไม่ fail;
   * usage ทุก call นับโควตาผู้อัปโหลดผ่าน reconcile เดิม (ADR-0023)
   */
  private async captionImages(
    claims: AccessClaims,
    buffer: Buffer,
    doc: RawFormDocument,
    fields: ExtractedField[],
  ): Promise<void> {
    const model = config().files.rag.vlmModel;
    if (model === "") return;
    for (const f of fields) {
      if (f.type !== "image" || f.imageRid === null || !(f.imageRid in doc.rels)) continue;
      try {
        const dataUri = await readDocxImage(buffer, doc.rels[f.imageRid]);
        if (dataUri === null) {
          console.warn(`files: skip caption — image ${f.imageRid} not a VLM-supported format`);
          continue;
        }
        const messages: AiMessage[] = [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `ภาพนี้เป็นคำตอบของหัวข้อ "${f.question}" ในเอกสารข้อเสนอโครงการวิจัย (ตอนนี้จะถูกนำไปทำ index สำหรับระบบค้นคืน) — ` +
                  `ประมวลผลภาพด้วยลำดับดังนี้:\n` +
                  `1. ถ้าภาพมีข้อความ (เช่น ตาราง แผนผังที่มีป้ายชื่อ เอกสาร): ถอดข้อความออกมาให้ครบถ้วนทุกตัวอักษร ทุกช่อง รักษาโครงสร้างเดิม (ตารางใช้ markdown)\n` +
                  `2. ถ้าภาพเป็นแผนภาพ/ผังงาน: อธิบายลำดับการทำงานหรือความเชื่อมโยงระหว่างองค์ประกอบ ถ้าเป็นไปได้ให้เขียนเป็น mermaid flowchart ถ้าเขียน mermaid ไม่ได้ให้ใช้ลำดับขั้นแบบข้อความ ห้ามวาดด้วยอักขระ ASCII\n` +
                  `3. ถ้าภาพไม่มีข้อความเลย: บรรยายสิ่งที่เห็นอย่างละเอียด\n` +
                  `ตอบเป็นภาษาไทย หนึ่งคำตอบต่อเนื่อง (ไม่ต้องมีหัวข้อหรือคำนำ) เพื่อใช้ค้นคืนในระบบค้นหา`,
              },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ];
        let caption = "";
        let report: { input_tokens: number; output_tokens: number; cached_input_tokens: number } | null = null;
        for await (const chunk of this.ai.complete({ action: "vlm_caption", model, messages })) {
          if (chunk.type === "delta") caption += chunk.text;
          else if (chunk.type === "finish" && chunk.usage !== null) {
            report = {
              input_tokens: chunk.usage.promptTokens,
              output_tokens: chunk.usage.completionTokens,
              cached_input_tokens: chunk.usage.cachedTokens,
            };
          }
        }
        await chargeQuota(this.db, claims.sub, report);
        if (caption.trim() !== "") f.caption = caption.trim();
      } catch (error) {
        console.warn(`files: VLM caption failed (${f.fieldId}) — skip: ${String(error)}`);
      }
    }
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

  /**
   * retrieval สำรองสำหรับ ai module — กรอง file_id ก่อน cosine ฝั่ง app คืน top-k (ADR-0025)
   * `embedding_model` ไม่ตรง config หรือ embedding ว่าง → re-embed ทั้งไฟล์ แล้วบันทึก (backfill lazy)
   */
  async retrieve(claims: AccessClaims, fileId: string, query: string): Promise<{ content: string; heading_path: string | null; score: number }[]> {
    const row = await this.visibleFile(claims, fileId);
    const rag = config().files.rag;
    let chunks = await repo.chunksOfFile(this.db, row.fileId);
    const model = this.embedding.model;
    if (chunks.length === 0) return [];
    const stale = chunks.some((c) => c.embedding === null || c.embeddingModel !== model);
    if (stale) {
      const vectors = await this.embedding.embedPassages(chunks.map((c) => c.content));
      await repo.updateChunkEmbeddings(
        this.db,
        chunks.map((c, i) => ({ chunkId: c.chunkId, embedding: vectors[i], embeddingModel: model })),
      );
      chunks = chunks.map((c, i) => ({ ...c, embedding: vectors[i], embeddingModel: model }));
    }
    const queryVector = await this.embedding.embedQuery(query);
    const scored = chunks.map((c) => ({
      content: c.content,
      heading_path: c.headingPath,
      score: cosine(queryVector, c.embedding ?? []),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, rag.topK);
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
