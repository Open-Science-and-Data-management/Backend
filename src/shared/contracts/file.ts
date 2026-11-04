import { z } from "zod";
import { FileType, FilePurpose } from "./enums.js";

export const fileMetadataSchema = z.object({
  byte_size: z.coerce.number().int().nonnegative().optional(),
  mime_type: z.string().optional(),
});

export const fileSchema = z.object({
  file_id: z.string().optional(),
  project_id: z.string(),
  uploaded_by: z.string(),
  filename: z.string().min(1),
  file_type: FileType,
  purpose: FilePurpose,
  metadata: fileMetadataSchema.optional(),
  uploaded_at: z.coerce.date(),
  superseded_at: z.coerce.date().optional(),
});

export const createFileSchema = fileSchema.omit({ file_id: true });

export type FileRecord = z.infer<typeof fileSchema>;
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export type CreateFile = z.infer<typeof createFileSchema>;
