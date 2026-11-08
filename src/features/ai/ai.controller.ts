// ai.controller — thin HTTP boundary (CON-1): SSE write + headers เท่านั้น; logic ทั้งหมดใน AiService
import { Controller, Get, Inject, Param, Post, Body, Headers, Query, Res, Put } from "@nestjs/common";
import type { Response } from "express";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { AiService } from "./ai.service.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";

/** เขียน event เดี่ยวเป็น SSE frame — lazy: error ก่อน event แรกยังได้ envelope ผ่าน global filter */
function sseSink(res: Response) {
  let started = false;
  return (event: AiSseEvent): void => {
    if (!started) {
      startSse(res);
      started = true;
    }
    res.write(`event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
  };
}

@Controller("ai")
export class AiController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  @Get("quota")
  quota(@CurrentUser() user: AccessClaims) {
    return this.ai.quota(user);
  }

  @Post("analyze-proposal")
  async analyzeProposal(
    @CurrentUser() user: AccessClaims,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    const result = await this.ai.analyze({ claims: user, body, idempotencyKey: idempotencyKey ?? "", signal: abort.signal, sink: sseSink(res) });
    res.end();
    return result;
  }

}

@Controller("ai-thread")
export class AiThreadController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  /** POST /ai-thread/adopt — ย้าย chat unscoped เข้าแผน (FE ai.md) */
  @Post("adopt")
  adopt(@CurrentUser() user: AccessClaims, @Body() body: unknown) {
    return this.ai.adopt(user, body);
  }
}

@Controller("dmps")
export class AiDmpController {
  constructor(@Inject(AiService) private readonly ai: AiService) {}

  /** POST /dmps/{scope}/ai/{action} — scope = dmp_id | "unscoped" (เฉพาะ chat) */
  @Post(":scope/ai/:action")
  async stream(
    @CurrentUser() user: AccessClaims,
    @Param("scope") scope: string,
    @Param("action") action: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    await this.ai.stream({ claims: user, scope, action, body, idempotencyKey: idempotencyKey ?? "", signal: abort.signal, sink: sseSink(res) });
    res.end();
  }

  @Get(":scope/ai-thread")
  thread(@CurrentUser() user: AccessClaims, @Param("scope") scope: string, @Query() query: { before?: string; limit?: string }) {
    return this.ai.thread(user, scope, query);
  }

  @Put(":scope/ai-thread/:entry_id")
  updateEntry(@CurrentUser() user: AccessClaims, @Param("scope") scope: string, @Param("entry_id") entryId: string, @Body() body: unknown) {
    return this.ai.updateEntry(user, scope, entryId, body);
  }

  @Post(":scope/ai-thread/clear")
  clear(@CurrentUser() user: AccessClaims, @Param("scope") scope: string) {
    return this.ai.clear(user, scope);
  }
}

function startSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}
