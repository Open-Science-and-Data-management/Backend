// docx parse — mammoth in-process; ได้ plain text เก็บที่ file_records.docx_extracted_text
import { extractRawText } from "mammoth";

export function parseDocx(data: Buffer): Promise<string> {
  return extractRawText({ buffer: data }).then((r) => r.value);
}
