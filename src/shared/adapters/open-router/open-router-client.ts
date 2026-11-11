// OpenRouterClient — anti-corruption adapter (TC-6, ADR-0005)
// แปล wire format OpenAI-compatible ↔ AiClient port ที่นี่ที่เดียว:
//  - request: POST /chat/completions, stream:true, model ต่อ action จาก config.toml `ai.models`
//  - stream: SSE — ข้าม comment line `:` (เช่น `: OPENROUTER PROCESSING`), จบที่ `data: [DONE]`
//  - usage: chunk สุดท้ายก่อน [DONE] แนบ usage มาพร้อม choices ไม่ว่าง (OpenRouter เจตนาไม่ตรง spec OpenAI)
//  - error ก่อน commit: JSON ปกติบน status ≠ 2xx; error กลาง stream: chunk ที่มี top-level `error`
// Source: https://openrouter.ai/docs/api-reference/overview (request/response schemas)
// Source: https://openrouter.ai/docs/api-reference/streaming (SSE comments, usage chunk, mid-stream errors)
import { Injectable } from "@nestjs/common";
import { config } from "@/shared/config/index.js";
import {
  AiError,
  type AiClient,
  type AiCompleteParams,
  type AiFinishReason,
  type AiMessage,
  type AiStreamChunk,
  type AiToolCall,
  type AiToolDef,
  type AiUsage,
} from "@/shared/ports/ai-client.js";
import type { AiErrorCode } from "@/shared/contracts/ai.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

@Injectable()
export class OpenRouterClient implements AiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  // baseUrl/apiKey inject ได้เพื่อ test ต่อ mock server — production ใช้ค่าจริง (key จาก env)
  constructor(baseUrl = DEFAULT_BASE_URL, apiKey = process.env.OPENROUTER_KEY) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async *complete(params: AiCompleteParams): AsyncIterable<AiStreamChunk> {
    if (this.apiKey === undefined || this.apiKey === "") {
      throw new AiError({ code: "ai_auth_failed", message: "OPENROUTER_KEY is not set", retryable: false });
    }
    const models = config().ai.models;
    const model = params.model !== undefined ? params.model : (models[params.action] ?? models.default);
    const body = {
      model,
      stream: true,
      messages: params.messages.map(toWireMessage),
      ...(params.tools !== undefined && params.tools.length > 0
        ? {
            tools: params.tools.map(toWireTool),
            tool_choice: "auto" as const, // ให้โมเดลตัดสินใจเรียก tool เองตาม loop
          }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new AiError({ code: "ai_aborted", message: "Request aborted", retryable: false });
      }
      throw new AiError({ code: "ai_network_error", message: `OpenRouter unreachable: ${String(e)}`, retryable: true });
    }

    if (!response.ok) {
      // error ก่อน stream เริ่ม = JSON ธรรมดา ไม่ใช่ SSE
      throw wireError(response.status, await safeJson(response));
    }
    if (response.body === null) {
      throw new AiError({ code: "ai_provider_error", message: "Empty response body", retryable: true });
    }

    // สะสม tool-call delta ตาม index (OpenAI streaming แตก arguments เป็นทอนๆ)
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let content = "";
    let finishReason: AiFinishReason | null = null;
    let usage: AiUsage | null = null;

    try {
      for await (const data of sseData(response.body)) {
      if (data === "[DONE]") break;
      let chunk: WireChunk;
      try {
        chunk = JSON.parse(data) as WireChunk;
      } catch {
        continue; // ข้าม payload ที่ไม่ใช่ JSON (spec บอกให้ ignore ปลอดภัย)
      }
      if (chunk.error !== undefined) {
        // error กลาง stream: HTTP ยัง 200 แต่ top-level error มาพร้อม chunk — stream จบหลัง event นี้เสมอ
        const errCode = typeof chunk.error.code === "string" ? Number(chunk.error.code) : chunk.error.code;
        throw new AiError({
          code: "ai_stream_error",
          message: chunk.error.message,
          retryable: errCode === 429 || (Number.isFinite(errCode) && errCode >= 500),
        });
      }
      const choice = chunk.choices.at(0);
      if (choice === undefined) continue;
      const text = choice.delta?.content;
      if (typeof text === "string" && text !== "") {
        // delta.content === "" มาจาก usage chunk (content-free) — ไม่ emit
        content += text;
        yield { type: "delta", text };
      }
      for (const d of choice.delta?.tool_calls ?? []) {
        const acc = toolCalls.get(d.index) ?? { id: "", name: "", args: "" };
        acc.id ||= d.id ?? "";
        acc.name += d.function?.name ?? "";
        acc.args += d.function?.arguments ?? "";
        toolCalls.set(d.index, acc);
      }
      if (choice.finish_reason !== null) {
        finishReason = normalizeFinish(choice.finish_reason);
      }
      if (chunk.usage !== undefined) {
        // usage chunk (choices ไม่ว่างตาม OpenRouter) — ใช้เป็นค่าความจริงเรื่อง token เสมอ
        usage = toUsage(chunk.usage);
      }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new AiError({ code: "ai_aborted", message: "Stream aborted", retryable: false });
      }
      throw e;
    }

    // abort มาช่วงหว่าง read — บาง runtime ปิด stream แบบ done ไม่ throw → ตรวจเอง
    if (params.signal?.aborted === true) {
      throw new AiError({ code: "ai_aborted", message: "Stream aborted", retryable: false });
    }

    const calls: AiToolCall[] = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b) // index จาก wire — รักษาลำดับที่โมเดลเรียก
      .map(([, c]) => ({ id: c.id, name: c.name, argumentsJson: c.args === "" ? "{}" : c.args }));

    yield { type: "assistant_message", content: content === "" ? null : content, toolCalls: calls };
    yield { type: "finish", finishReason: finishReason ?? "error", usage };
  }
}

// ── wire ↔ port ────────────────────────────────────────────────────────────

type WireToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type WireContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type WireMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | WireContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

function toWireMessage(m: AiMessage): WireMessage {
  switch (m.role) {
    case "system":
      return { role: m.role, content: m.content };
    case "user":
      // multipart (VLM) — โครงสร้าง OpenAI-compatible ตรงตัว (https://openrouter.ai/docs/features/multimodal/image-inputs)
      return {
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((p) => (p.type === "text" ? { type: p.type, text: p.text } : { type: p.type, image_url: p.image_url })),
      };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: c.argumentsJson },
              })),
            }
          : {}),
      };
    case "tool":
      return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
  }
}

function toWireTool(t: AiToolDef) {
  return { type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parametersJsonSchema } };
}

type WireChunk = {
  choices: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason: string | null;
  }[];
  usage?: WireUsage;
  error?: { code: number | string; message: string };
};

type WireUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

function toUsage(u: WireUsage | undefined): AiUsage | null {
  if (u === undefined) return null;
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
    cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

function normalizeFinish(reason: string): AiFinishReason {
  // OpenRouter normalize เป็น stop/tool_calls/length/content_filter/error — ตัด content_filter ลง error
  return reason === "stop" || reason === "tool_calls" || reason === "length" ? reason : "error";
}

function wireError(status: number, body: unknown): AiError {
  let message = `OpenRouter HTTP ${String(status)}`;
  if (typeof body === "object" && body !== null && "message" in body) {
    const m = body.message; // unknown — ต้องตรวจก่อนใช้
    if (typeof m === "string" && m !== "") message = m;
  }
  const code: AiErrorCode =
    status === 401
      ? "ai_auth_failed"
      : status === 402
        ? "ai_payment_required"
        : status === 429
          ? "ai_rate_limited"
          : status === 400
            ? "ai_invalid_request"
            : status >= 500
              ? "ai_provider_error"
              : "ai_provider_error";
  return new AiError({ code, message, retryable: status === 429 || status >= 500 });
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// ── SSE framing ────────────────────────────────────────────────────────────
// hand-rolled แทน eventsource-parser: รูปแบบง่าย (single-line data) และเลี่ยง dep เพิ่ม;
// ครอบคลุมข้อกำหนดจาก docs — ข้ามบรรทัด `:` comment, จับ multi-line data, [DONE]
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith(":")) continue; // comment (เช่น `: OPENROUTER PROCESSING`) — ข้าม
        if (line === "") {
          // บรรทัดว่าง = จบ event — ปล่อย data ที่สะสมไว้เป็น event เดียว (multi-line data)
          if (dataLines.length > 0) {
            yield dataLines.join("\n");
            dataLines = [];
          }
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
        // event:/id:/retry: — ไม่ใช้
      }
    }
    // stream จบทั้งที่ event สุดท้ายยังไม่โดนบรรทัดว่าง — ปล่อยส่วนที่เหลือ
    if (dataLines.length > 0) {
      yield dataLines.join("\n");
      dataLines = [];
    }
  } finally {
    reader.releaseLock();
    try {
      await reader.cancel(); // abort ระหว่าง stream — ปิด connection ให้ provider หยุดคิดเงิน
    } catch {
      // stream ปิดไปแล้ว
    }
  }
}
