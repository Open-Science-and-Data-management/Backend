// files repository — Drizzle เดียวต่อ flow; snake_case response ตาม FE contract
import { and, desc, eq, sql } from "drizzle-orm";
import { fileChunks, fileRecords, projects, tasks } from "@/database/schema/index.js";
import type { Db } from "@/features/projects/projects.repository.js";

export type { Db };

export type FileRow = typeof fileRecords.$inferSelect;

export function toFileResponse(row: FileRow) {
  return {
    object: "file" as const,
    file_id: row.fileId,
    project_id: row.projectId,
    uploaded_by: row.uploadedBy,
    filename: row.filename,
    file_type: row.fileType,
    purpose: row.purpose,
    metadata: { byte_size: row.byteSize, mime_type: row.mimeType },
    uploaded_at: row.uploadedAt,
    superseded_at: row.supersededAt ?? null,
    archived_at: row.archivedAt ?? null,
  };
}

export function findById(db: Db, fileId: string) {
  return db.select().from(fileRecords).where(eq(fileRecords.fileId, fileId)).limit(1);
}

export function listForProject(db: Db, projectId: string, purpose?: string) {
  return db
    .select()
    .from(fileRecords)
    .where(
      and(
        eq(fileRecords.projectId, projectId),
        purpose ? eq(fileRecords.purpose, purpose as FileRow["purpose"]) : undefined,
      ),
    )
    // current files ก่อน แล้ว proposal ที่ถูกแทน
    .orderBy(sql`superseded_at is null desc`, desc(fileRecords.uploadedAt));
}

export function activeProposal(db: Db, projectId: string) {
  return db
    .select()
    .from(fileRecords)
    .where(and(eq(fileRecords.projectId, projectId), eq(fileRecords.purpose, "proposal"), sql`superseded_at is null`))
    .limit(1);
}

export function setArchived(db: Db, fileId: string, when: Date) {
  return db.update(fileRecords).set({ archivedAt: when }).where(eq(fileRecords.fileId, fileId)).returning();
}

/** `409 file_in_use` — task อ้างไฟล์นี้เป็น evidence (ADR-0022: evidence_ref เก็บ file_id) */
export function usedAsEvidence(db: Db, fileId: string) {
  return db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(and(eq(tasks.evidenceType, "file"), eq(tasks.evidenceRef, fileId)))
    .limit(1);
}

export async function remove(db: Db, file: FileRow): Promise<void> {
  await db.delete(fileRecords).where(eq(fileRecords.fileId, file.fileId));
  // projects.proposal_file_id FK onDelete: set null — ลบ proposal แล้วชี้ที่ว่างเอง
}

export type ChunkInsert = typeof fileChunks.$inferInsert;

/** upload pipeline ทั้ง g้อนใน transaction เดียว — file + chunks + supersede (ลบ chunks ของ proposal เก่า) */
export async function insertWithChunks(
  db: Db,
  row: typeof fileRecords.$inferInsert,
  buildChunks: (fileId: string) => ChunkInsert[],
): Promise<FileRow> {
  return db.transaction(async (tx) => {
    const [inserted] = await tx.insert(fileRecords).values(row).returning();
    const projectId = row.projectId;
    if (row.purpose === "proposal" && typeof projectId === "string") {
      const superseded = await tx
        .update(fileRecords)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(fileRecords.projectId, projectId),
            eq(fileRecords.purpose, "proposal"),
            sql`superseded_at is null`,
            sql`file_id <> ${inserted.fileId}`,
          ),
        )
        .returning({ fileId: fileRecords.fileId });
      // แทน proposal → chunks เก่าระเบิด (CASCADE ตามไฟล์เดิม — spec SC-4)
      for (const s of superseded) {
        await tx.delete(fileChunks).where(eq(fileChunks.fileId, s.fileId));
      }
      await tx.update(projects).set({ proposalFileId: inserted.fileId }).where(eq(projects.projectId, projectId));
    }
    const chunks = buildChunks(inserted.fileId);
    if (chunks.length > 0) await tx.insert(fileChunks).values(chunks);
    return inserted;
  });
}

export function chunksOfFile(db: Db, fileId: string) {
  return db
    .select()
    .from(fileChunks)
    .where(eq(fileChunks.fileId, fileId))
    .orderBy(fileChunks.chunkIndex);
}

export async function updateChunkEmbeddings(
  db: Db,
  updates: { chunkId: string; embedding: number[]; embeddingModel: string }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(fileChunks)
        .set({ embedding: u.embedding, embeddingModel: u.embeddingModel })
        .where(eq(fileChunks.chunkId, u.chunkId));
    }
  });
}
