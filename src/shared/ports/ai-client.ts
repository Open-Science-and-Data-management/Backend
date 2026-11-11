// AiClient port — SPEC-ai S4.1 (ADR-0005): loop เขียนเอง คุยผ่าน port นี้เท่านั้น
// wire format OpenAI-compatible ถูกแปลที่ adapter — port เห็น message/stream รูปแบบของเรา (TC-6)
import type { AiErrorDetail } from "@/shared/contracts/ai.js";

export interface AiToolCall {
  id: string;
  name: string;
  /** JSON string ตามธรรมเนียม tool-calling — parse ที่ loop */
  argumentsJson: string;
}

export type AiRole = "system" | "user" | "assistant" | "tool";

/** part ของ user message แบบ multipart — ใช้เฉพาะ VLM (image caption, SPEC ff2569 Task 7); text-only call ใช้ string เดิม */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }; // data URI (base64) — แปลเป็น wire ที่ adapter เท่านั้น

export type AiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | AiContentPart[] }
  | { role: "assistant"; content: string | null; toolCalls: AiToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface AiToolDef {
  name: string;
  description: string;
  /** JSON Schema ของ arguments */
  parametersJsonSchema: object;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** tokens ที่ cache hit — โควตานับ 10% (ADR-0023) */
  cachedTokens: number;
}

export type AiFinishReason = "stop" | "tool_calls" | "length" | "error";

export type AiStreamChunk =
  | { type: "delta"; text: string }
  | { type: "assistant_message"; content: string | null; toolCalls: AiToolCall[] }
  | { type: "finish"; finishReason: AiFinishReason; usage: AiUsage | null };

export interface AiCompleteParams {
  /** key ใน `ai.models` ของ config.toml — adapter เลือก model เอง */
  action: string;
  /** override slug โดยตรง (เช่น `[files.rag] vlmModel`) — มีค่า → ข้ามตาราง ai.models */
  model?: string;
  messages: AiMessage[];
  tools?: AiToolDef[];
  signal?: AbortSignal;
}

export interface AiClient {
  complete(params: AiCompleteParams): AsyncIterable<AiStreamChunk>;
}

/** Error ของชั้น AI — ถือ AiErrorCode ที่ contract กำหนด; loop/FE ไม่เห็น error ดิบของ OpenRouter */
export class AiError extends Error {
  readonly detail: AiErrorDetail;

  constructor(detail: AiErrorDetail) {
    super(detail.message);
    this.name = "AiError";
    this.detail = detail;
  }
}

export const AI_CLIENT = Symbol("AI_CLIENT");
