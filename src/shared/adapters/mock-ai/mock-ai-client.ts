// MockAiClient — AiClient ปลอมสำหรับ dev/test เมื่อ config.toml `ai.mock = true`
// ไม่ออก network ไม่ใช้ OPENROUTER_KEY — คำตอบ canned ตามลำดับ ReAct เดิม (tool → คำตอบสุดท้าย)
// usage คงที่ (prompt 100 / cached 20 / completion 50) → โควตายังถูกหักจาก usage ปลอมนี้ (ADR-0023)
import { Injectable } from "@nestjs/common";
import type { AiClient, AiCompleteParams, AiStreamChunk } from "@/shared/ports/ai-client.js";

const MOCK_USAGE = { promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedTokens: 20 };

@Injectable()
export class MockAiClient implements AiClient {
  // eslint-disable-next-line @typescript-eslint/require-await -- canned chunks พร้อมใช้ทันที ไม่มี await จริง
  async *complete(params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    const firstTool = params.tools?.at(0);
    const hasToolResult = params.messages.some((m) => m.role === "tool");
    // ยังไม่มีผล tool และ action นี้มี tools ให้ใช้ → เรียก tool ตัวแรกหนึ่งครั้งก่อน (ครบทั้ง flow แบบ deterministic)
    if (!hasToolResult && firstTool !== undefined) {
      yield { type: "assistant_message", content: null, toolCalls: [{ id: "mock-call-1", name: firstTool.name, argumentsJson: "{}" }] };
      yield { type: "finish", finishReason: "tool_calls", usage: null };
      return;
    }
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    // content เป็น multipart (VLM) ได้ — ตัดเอาเฉพาะ text part มาโชว์ใน canned answer
    const lastUserText =
      typeof lastUser?.content === "string"
        ? lastUser.content
        : (lastUser?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join(" ");
    const text = JSON.stringify({
      note: "คำตอบจาก mock — ตั้ง ai.mock = false เพื่อใช้ OpenRouter จริง",
      action: params.action,
      question: lastUserText.slice(0, 120),
    });
    yield { type: "delta", text: text.slice(0, 40) };
    yield { type: "delta", text: text.slice(40) };
    yield { type: "assistant_message", content: text, toolCalls: [] };
    yield { type: "finish", finishReason: "stop", usage: MOCK_USAGE };
  }
}
