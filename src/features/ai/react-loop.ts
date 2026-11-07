// ReAct loop — เขียนเองบน AiClient port (ADR-0005, ADR-0018)
// event ออกทาง onEvent ตาม shapes ใน shared/contracts/envelope.ts (status/tool/delta/proposal/done|error)
// รับประกัน: ทุก run จบด้วย terminal event (done|error) ตัวเดียวเสมอ — ไม่มี stream ค้าง
import { Inject, Injectable } from "@nestjs/common";
import type { AiClient, AiMessage } from "@/shared/ports/ai-client.js";
import { AiError, AI_CLIENT } from "@/shared/ports/ai-client.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";
import { AiTools, type AiToolContext } from "./ai.tools.js";

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
  onEvent: (event: AiSseEvent) => void;
}

@Injectable()
export class ReactLoop {
  constructor(
    @Inject(AI_CLIENT) private readonly client: AiClient,
    @Inject(AiTools) private readonly tools: AiTools,
  ) {}

  async run(params: RunLoopParams): Promise<void> {
    const { onEvent } = params;
    const messages: AiMessage[] = [
      { role: "system", content: params.system },
      ...(params.history ?? []),
      { role: "user", content: params.userMessage },
    ];

    try {
      onEvent({ event: "status", message: "กำลังประมวลผล" });

      let rounds = 0;
      let finishReason: "stop" | "tool_calls" | "length" | "error" = "error";
      let finalContent: string | null = null;

      for (;;) {
        if (params.signal?.aborted === true) {
          throw new AiError({ code: "ai_aborted", message: "Run aborted", retryable: false });
        }
        rounds += 1;
        if (rounds > MAX_TOOL_ROUNDS) {
          throw new AiError({ code: "ai_invalid_request", message: `loop เกิน ${String(MAX_TOOL_ROUNDS)} รอบ tool — หยุดเพื่อกันวนไม่จบ`, retryable: false });
        }

        for await (const c of this.client.complete({ action: params.action, messages, tools: this.tools.all.map((t) => t.def), signal: params.signal })) {
          if (c.type === "delta") onEvent({ event: "delta", text: c.text });
          else if (c.type === "assistant_message") {
            finalContent = c.content;
            messages.push({ role: "assistant", content: c.content, toolCalls: c.toolCalls });
          } else finishReason = c.finishReason; // ชนิดที่เหลือมีแต่ "finish"
        }

        if (finishReason === "tool_calls") {
          const last = messages.at(-1);
          const calls = last !== undefined && last.role === "assistant" ? last.toolCalls : [];
          for (const call of calls) {
            onEvent({ event: "tool", name: call.name });
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
        onEvent({ event: "proposal", proposal });
      }
      onEvent({ event: "done" });
    } catch (e) {
      if (e instanceof AiError) {
        onEvent({ event: "error", code: e.detail.code, message: e.detail.message });
      } else {
        // ไม่รั่ว error ดิบออกนอกชั้น — log เก็บไว้ฝั่ง server, FE เห็น code contract เท่านั้น
        console.error("ai loop crashed:", e);
        onEvent({ event: "error", code: "ai_provider_error", message: "เกิดข้อผิดพลาดภายในระหว่างรัน AI" });
      }
    }
  }
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
