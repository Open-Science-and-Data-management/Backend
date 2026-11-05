// unit — chunking: ตัดตาม heading/ย่อหน้า pack ถึง ~450 token (overlap 10%)
import { describe, expect, it } from "vitest";
import { blocksToChunks, type DocxBlock } from "@/features/files/chunking.js";

const CFG = { targetTokens: 450, overlapPercent: 10 };

const h = (level: 1 | 2 | 3, text: string): DocxBlock => ({ kind: "heading", level, text });
const p = (text: string): DocxBlock => ({ kind: "paragraph", text });

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(" ");

describe("blocksToChunks", () => {
  it("เอกสารสั้น — 1 chunk, heading_path ตาม heading ล่าสุด, index เริ่ม 0", () => {
    const chunks = blocksToChunks([h(1, "Methods"), p("Short body.")], CFG);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ chunk_index: 0, heading_path: "Methods" });
    expect(chunks[0].content).toContain("Short body.");
  });

  it("heading ซ้อน — heading_path เป็น H1 > H2, เปลี่ยนเมื่อเจอ heading ใหม่", () => {
    const chunks = blocksToChunks([h(1, "A"), h(2, "B"), p("one"), h(2, "C"), p("two")], CFG);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading_path).toBe("A > B");
    expect(chunks[0].content).toContain("one");
    expect(chunks[1].heading_path).toBe("A > C");
    expect(chunks[1].content).toContain("two");
  });

  it("ย่อหน้ายาวเกิน target — แยก chunk, overlap ~10% ท้ายก้อนก่อน, ทุก chunk ≤ target+overlap", () => {
    const paras = [p(words(300)), p(words(300)), p(words(300))];
    const chunks = blocksToChunks(paras, CFG);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      const n = c.content.split(/\s+/).length;
      expect(n).toBeLessThanOrEqual(450 + 45); // target + 10%
    }
    // overlap: ท้าย chunk ก่อน ปรากฏต้น chunk ถัดไป
    const tail = chunks[0].content.split(/\s+/).slice(-10).join(" ");
    expect(chunks[1].content).toContain(tail);
    expect(chunks.map((c) => c.chunk_index)).toEqual(chunks.map((_, i) => i));
  });

  it("ไม่มี heading เลย — fallback heading_path null, ยัง pack ตามย่อหน้า", () => {
    const chunks = blocksToChunks([p(words(600)), p(words(600))], CFG);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.heading_path).toBeNull();
  });

  it("heading ไม่มีเนื้อหาตามหลัง — ไม่เกิด chunk เปล่า", () => {
    const chunks = blocksToChunks([h(1, "Empty"), p("real")], CFG);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.trim().length).toBeGreaterThan(0);
  });
});
