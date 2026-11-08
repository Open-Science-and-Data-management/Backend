// ReAct loop — เขียนเองบน AiClient port (ADR-0005, ADR-0018)
// event ออกทาง onEvent ตาม shapes ใน shared/contracts/envelope.ts (status/tool/delta/proposal/done|error)
// รับประกัน: ทุก run จบด้วย terminal event (done|error) ตัวเดียวเสมอ — ไม่มี stream ค้าง
import { Inject, Injectable } from "@nestjs/common";
import type { AiClient, AiMessage } from "@/shared/ports/ai-client.js";
import { AiError, AI_CLIENT } from "@/shared/ports/ai-client.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";
import { AiTools, type AiToolContext } from "./ai.tools.js";

import type { AiUsageReport } from "@/shared/contracts/ai.js";

const MAX_TOOL_ROUNDS = 6;

export interface RunLoopParams {
  /** key ใน config.toml [ai.models] */
  action: string;
  system: string;
  userMessage: string;
  /** ประวัติก่อนหน้า (thread) — ถูกบรรจุหลัง system ก่อน userMessage */
  history?: AiMessage[];
  ctx: AiToolContext;
  signal?: AbortSignal;
  onEvent: (event: AiSseEvent) => void | Promise<void>;
}

/** ผลลัพธ์ที่ service ใช้ persist thread / reconcile โควตา / snapshot idempotency */
export interface RunLoopResult {
  /** terminal event แล้ว (done|error) — service บันทึกลง idempotency snapshot */
  events: AiSseEvent[];
  usage: AiUsageReport | null;
  text: string | null;
  proposal: unknown;
  error: { code: string; message: string } | null;
}

@Injectable()
export class ReactLoop {
  constructor(
    @Inject(AI_CLIENT) private readonly client: AiClient,
    @Inject(AiTools) private readonly tools: AiTools,
  ) {}

  async run(params: RunLoopParams): Promise<RunLoopResult> {
    const { onEvent } = params;
    const messages: AiMessage[] = [
      { role: "system", content: params.system },
      ...(params.history ?? []),
      { role: "user", content: params.userMessage },
    ];
    const emitted: AiSseEvent[] = [];
    const emit = async (event: AiSseEvent): Promise<void> => {
      emitted.push(event);
      await onEvent(event);
    };

    let finalContent: string | null = null;
    let usage: AiUsageReport | null = null;

    try {
      await emit({ event: "status", message: "กำลังประมวลผล" });

      let rounds = 0;
      let finishReason: "stop" | "tool_calls" | "length" | "error" = "error";

      for (;;) {
        if (params.signal?.aborted === true) {
          throw new AiError({ code: "ai_aborted", message: "Run aborted", retryable: false });
        }
        rounds += 1;
        if (rounds > MAX_TOOL_ROUNDS) {
          throw new AiError({ code: "ai_invalid_request", message: `loop เกิน ${String(MAX_TOOL_ROUNDS)} รอบ tool — หยุดเพื่อกันวนไม่จบ`, retryable: false });
        }

        for await (const c of this.client.complete({ action: params.action, messages, tools: this.tools.all.map((t) => t.def), signal: params.signal })) {
          if (c.type === "delta") await emit({ event: "delta", text: c.text });
          else if (c.type === "assistant_message") {
            finalContent = c.content;
            messages.push({ role: "assistant", content: c.content, toolCalls: c.toolCalls });
          } else {
            finishReason = c.finishReason;
            usage = c.usage === null ? usage : toReport(c.usage);
          }
        }

        if (finishReason === "tool_calls") {
          const last = messages.at(-1);
          const calls = last !== undefined && last.role === "assistant" ? last.toolCalls : [];
          for (const call of calls) {
            await emit({ event: "tool", name: call.name });
            const content = await this.tools.dispatch(params.ctx, call);
            messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
          }
          continue;
        }

        if (finishReason === "stop") break;
        // length/error — length ไม่ใช่ความผิดพลาดฝั่งระบบ แต่ยังต้องจบ terminal event
        throw new AiError(
          finishReason === "length"
            ? { code: "ai_invalid_request", message: "โมเดลตัดคำตอบยาวเกิน limit", retryable: false }
            : { code: "ai_provider_error", message: "โมเดลจบลำดับอย่างผิดปกติ", retryable: true },
        );
      }

      // คำตอบสุดท้ายเป็น JSON object → structured proposal (FE แก้ต่อได้); ไม่ใช่ → delta ธรรมดาจบเลย
      const proposal = parseProposal(finalContent);
      if (proposal !== undefined) {
        await emit({ event: "proposal", proposal });
      }
      await emit({ event: "done", ...(usage === null ? {} : { usage }) });
      return { events: emitted, usage, text: finalContent, proposal: proposal ?? null, error: null };
    } catch (e) {
      const detail =
        e instanceof AiError
          ? e.detail
          : // ไม่รั่ว error ดิบออกนอกชั้น — log เก็บไว้ฝั่ง server, FE เห็น code contract เท่านั้น
            (console.error("ai loop crashed:", e), { code: "ai_provider_error" as const, message: "เกิดข้อผิดพลาดภายในระหว่างรัน AI", retryable: true });
      const event: AiSseEvent = { event: "error", code: detail.code, message: detail.message, ...(usage === null ? {} : { usage }) };
      await emit(event);
      return { events: emitted, usage, text: finalContent, proposal: null, error: { code: detail.code, message: detail.message } };
    }
  }
}

/** AiUsage (camelCase ของ port) → รายงาน snake_case ของ contract — แปลจุดเดียว */
function toReport(u: { promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number }): AiUsageReport {
  return {
    input_tokens: u.promptTokens,
    output_tokens: u.completionTokens,
    cached_input_tokens: u.cachedTokens,
    total_tokens: u.totalTokens,
  };
}

function parseProposal(content: string | null): unknown {
  if (content === null) return undefined;
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
