// unit — MockAiClient (ai.mock = true): ลำดับ ReAct canned — tool round ก่อนแล้วคำตอบ JSON + usage คงที่
import { describe, expect, it } from "vitest";
import { MockAiClient } from "@/shared/adapters/mock-ai/mock-ai-client.js";
import type { AiMessage, AiStreamChunk, AiToolDef } from "@/shared/ports/ai-client.js";

const tools: AiToolDef[] = [{ name: "read_draft", description: "", parametersJsonSchema: { type: "object" } }];

describe("MockAiClient", () => {
  it("รอบแรกเรียก tool ตัวแรกหนึ่งครั้ง (finish_reason tool_calls)", async () => {
    const chunks = await collect(new MockAiClient().complete({ action: "chat", messages: [{ role: "user", content: "สวัสดี" }], tools }));
    expect(chunks.some((c) => c.type === "assistant_message" && c.toolCalls.at(0)?.name === "read_draft")).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "tool_calls", usage: null });
  });

  it("มีผล tool แล้ว → คำตอบ JSON (delta หลายชิ้น) + usage คงที่", async () => {
    const messages: AiMessage[] = [
      { role: "user", content: "สวัสดี" },
      { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "read_draft", argumentsJson: "{}" }] },
      { role: "tool", toolCallId: "c1", name: "read_draft", content: "{}" },
    ];
    const chunks = await collect(new MockAiClient().complete({ action: "chat", messages, tools }));
    const deltas = chunks.filter((c) => c.type === "delta");
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    const final = chunks.find((c): c is Extract<AiStreamChunk, { type: "assistant_message" }> => c.type === "assistant_message");
    if (final === undefined) throw new Error("mock ไม่คืนคำตอบสุดท้าย");
    const content: string | null = final.content;
    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(content ?? "null");
    }).not.toThrow();
    expect(parsed).toBeTypeOf("object");
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop", usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 20 } });
  });

  it("action ไม่มี tools → ตอบเลยโดยไม่เรียก tool", async () => {
    const chunks = await collect(new MockAiClient().complete({ action: "chat", messages: [{ role: "user", content: "ถามหน่อย" }] }));
    expect(chunks.some((c) => c.type === "assistant_message" && c.toolCalls.length > 0)).toBe(false);
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  });
});

async function collect(iterable: AsyncIterable<AiStreamChunk>): Promise<AiStreamChunk[]> {
  const chunks: AiStreamChunk[] = [];
  for await (const c of iterable) chunks.push(c);
  return chunks;
}
