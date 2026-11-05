// docx parse — mammoth in-process; ได้ plain text + blocks (heading/paragraph) สำหรับ chunking
import { extractRawText, convertToHtml } from "mammoth";
import type { DocxBlock } from "./chunking.js";

export function parseDocx(data: Buffer): Promise<string> {
  return extractRawText({ buffer: data }).then((r) => r.value);
}

/** html จาก mammoth → blocks ตามลำดับ; heading ระดับ 1–3 เท่านั้น ที่เหลือเป็น paragraph */
export async function parseDocxBlocks(data: Buffer): Promise<DocxBlock[]> {
  const { value: html } = await convertToHtml({ buffer: data });
  const blocks: DocxBlock[] = [];
  for (const match of html.matchAll(/<(h[1-3]|p)>(.*?)<\/\1>/gs)) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text.length === 0) continue;
    const tag = match[1];
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      blocks.push({ kind: "heading", level: Number(tag[1]) as 1 | 2 | 3, text });
    } else {
      blocks.push({ kind: "paragraph", text });
    }
  }
  return blocks;
}
