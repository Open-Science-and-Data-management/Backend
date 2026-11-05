// chunking — pure functions; ตัดตาม heading/ย่อหน้า pack ถึง ~target token (overlap %) จาก config.toml
// ไม่แตะ DB/HTTP — เรียกตรงจาก service ได้, test-first ที่ tests/unit/files/chunking

export type DocxBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string };

export type Chunk = {
  chunk_index: number;
  content: string;
  heading_path: string | null;
};

export interface ChunkConfig {
  targetTokens: number;
  overlapPercent: number;
}

/** token estimate แบบ deterministic — นับ whitespace-delimited words */
function tokens(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function joinParagraphs(paras: string[]): string {
  return paras.join("\n\n");
}

/**
 * pack ย่อหน้าถึง ~targetTokens; เกิน → chunk ใหม่ heading เดิม
 * overlap = targetTokens * overlapPercent% ท้ายก้อนก่อน ต่อหัวก้อนใหม่
 * heading ไม่มีเนื้อหาตามหลัง → ไม่เกิด chunk เปล่า; heading_path เป็น "H1 > H2" ล่าสุด, null เมื่อไม่มี heading
 */
export function blocksToChunks(blocks: DocxBlock[], config: ChunkConfig): Chunk[] {
  const overlapTokens = Math.floor((config.targetTokens * config.overlapPercent) / 100);
  const stack: { level: number; text: string }[] = [];
  const chunks: Chunk[] = [];
  let paras: string[] = [];
  let count = 0;

  const flush = (carry: boolean) => {
    if (paras.length === 0) return;
    let content = joinParagraphs(paras);
    if (carry && chunks.length > 0 && overlapTokens > 0) {
      const prevTokens = tokens(chunks[chunks.length - 1].content);
      const overlap = prevTokens.slice(-overlapTokens).join(" ");
      if (overlap.length > 0) content = `${overlap}\n\n${content}`;
    }
    chunks.push({
      chunk_index: chunks.length,
      content,
      heading_path: stack.length === 0 ? null : stack.map((s) => s.text).join(" > "),
    });
    paras = [];
    count = 0;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      flush(false);
      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) stack.pop();
      stack.push({ level: block.level, text: block.text });
      continue;
    }
    const words = tokens(block.text);
    if (words.length === 0) continue;
    if (words.length > config.targetTokens) {
      // ย่อหน้ายาวเกิน target เอง — ตัดเป็นท่อน target โดยแยก chunk
      for (let i = 0; i < words.length; i += config.targetTokens) {
        flush(false);
        paras = [words.slice(i, i + config.targetTokens).join(" ")];
        flush(true);
      }
      continue;
    }
    if (count + words.length > config.targetTokens) flush(true);
    paras.push(block.text);
    count += words.length;
  }
  flush(false);
  return chunks;
}
