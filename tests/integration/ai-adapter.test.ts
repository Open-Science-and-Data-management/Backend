// integration — SPEC-ai S4.1: OpenRouter adapter ต่อ mock server (ไม่ยิง key จริงใน CI)
// ตรวจ: wire format แปลถูกที่ adapter, SSE comment ข้าม, usage chunk, error mapping เป็น AiErrorCode, abort
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { config, loadConfig } from "@/shared/config/index.js";
import { OpenRouterClient } from "@/shared/adapters/open-router/open-router-client.js";
import { AiError, type AiMessage, type AiToolDef } from "@/shared/ports/ai-client.js";

async function collect(iter: AsyncIterable<{ type: string; [k: string]: unknown }>) {
  const chunks: { type: string; [k: string]: unknown }[] = [];
  for await (const c of iter) chunks.push(c);
  return chunks;
}

function sse(events: string[]) {
  // ต่อบรรทัดแบบ SSE จริง — comment `:` ต้องถูกข้าม
  return events.map((e) => `data: ${e}\n\n`).join("") + ": OPENROUTER PROCESSING\n\n" + "data: [DONE]\n\n";
}

const chunk = (delta: object, extra: object = {}) =>
  JSON.stringify({
    id: "gen-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "test/model",
    choices: [{ index: 0, delta, finish_reason: null }],
    ...extra,
  });

describe("open-router adapter (integration)", () => {
  let server: Server;
  let baseUrl: string;
  let requests: { headers: Record<string, string | string[] | undefined>; body: unknown }[] = [];
  let script: ((req: unknown, res: ServerResponse, i: number) => void)[];

  beforeAll(async () => {
    await loadConfig();
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const i = requests.length;
        requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
        script[i]?.(requests[i].body, res, i);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => { r(); }));
  });

  function reset(scripted: typeof script) {
    requests = [];
    script = scripted;
  }

  const TOOLS: AiToolDef[] = [
    { name: "read_draft", description: "d", parametersJsonSchema: { type: "object", properties: {} } },
  ];

  it("stream → delta + tool_calls รวมจากทอนๆ + usage chunk + finish", async () => {
    reset([
      (_b, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.end(
          sse([
            chunk({ role: "assistant", content: "สวัส" }),
            chunk({ content: "ดี้" }),
            chunk({ tool_calls: [{ index: 0, id: "call_1", function: { name: "read_dr", arguments: "{\"d" } }] }),
            chunk({ tool_calls: [{ index: 0, function: { name: "aft", arguments: "raft_id\":\x20\"d1\"}" } }] }),
            chunk({ content: "", finish_reason: "tool_calls" }),
            // usage chunk — choices ไม่ว่าง (OpenRouter เจตนาไม่ตรง spec OpenAI) + usage
            JSON.stringify({
              id: "gen-1",
              object: "chat.completion.chunk",
              created: 1,
              model: "test/model",
              choices: [{ index: 0, delta: { content: "", role: "assistant" }, finish_reason: "tool_calls" }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
                prompt_tokens_details: { cached_tokens: 40 },
              },
            }),
          ]),
        );
      },
    ]);
    const client = new OpenRouterClient(baseUrl, "test-key");
    const messages: AiMessage[] = [{ role: "user", content: "hello" }];
    const chunks = await collect(client.complete({ action: "analyze_proposal", messages, tools: TOOLS }));

    // request แปลถูกที่ adapter
    expect(requests[0].headers.authorization).toBe("Bearer test-key");
    const body = requests[0].body as { model: string; stream: boolean; messages: unknown[]; tools: unknown[]; tool_choice: string };
    expect(body.model).toBe(config().ai.models.analyze_proposal); // จาก config.toml [ai.models] — action analyze_proposal
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.tools).toEqual([
      { type: "function", function: { name: "read_draft", description: "d", parameters: { type: "object", properties: {} } } },
    ]);
    expect(body.tool_choice).toBe("auto");

    // stream → delta ไล่ตามทอน
    expect(chunks.filter((c) => c.type === "delta").map((c) => c.text)).toEqual(["สวัส", "ดี้"]);
    const msg = chunks.find((c) => c.type === "assistant_message");
    expect(msg).toBeDefined();
    if (msg === undefined) throw new Error("no assistant_message");
    expect(msg.content).toBe("สวัสดี้");
    expect(msg.toolCalls).toEqual([{ id: "call_1", name: "read_draft", argumentsJson: '{"draft_id": "d1"}' }]);
    const fin = chunks.at(-1);
    expect(fin).toBeDefined();
    if (fin === undefined) throw new Error("no finish chunk");
    expect(fin.type).toBe("finish");
    expect(fin.finishReason).toBe("tool_calls");
    expect(fin.usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedTokens: 40 });
  });

  it.each([
    [401, { error: { message: "Invalid key" } }, "ai_auth_failed", false],
    [402, { error: { message: "no credits" } }, "ai_payment_required", false],
    [429, { error: { message: "rate limited" } }, "ai_rate_limited", true],
    [502, { error: { message: "no provider" } }, "ai_provider_error", true],
  ] as const)("HTTP %i → %s (retryable=%s)", async (status, payload, expectedCode, retryable) => {
    reset([(_b, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    }]);
    const client = new OpenRouterClient(baseUrl, "k");
    const run = async () => {
      const it = client.complete({ action: "analyze_proposal", messages: [{ role: "user", content: "x" }] })[Symbol.asyncIterator]();
      for (let r = await it.next(); r.done !== true; r = await it.next()) {
        // drain
      }
    };
    await expect(run).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AiError && e.detail.code === expectedCode && e.detail.retryable === retryable,
    );
  });

  it("error กลาง stream (top-level error chunk, HTTP 200) → ai_stream_error", async () => {
    reset([(_b, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(sse([chunk({ content: "partial" }), JSON.stringify({ id: "g", error: { code: 502, message: "Provider disconnected" }, choices: [] })]));
    }]);
    const client = new OpenRouterClient(baseUrl, "k");
    const err = await (async () => {
      try {
        const it = client.complete({ action: "analyze_proposal", messages: [{ role: "user", content: "x" }] })[Symbol.asyncIterator]();
        for (let r = await it.next(); r.done !== true; r = await it.next()) {
          // drain
        }
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AiError);
    if (!(err instanceof AiError)) throw new Error("expected AiError");
    expect(err.detail.code).toBe("ai_stream_error");
    expect(err.detail.retryable).toBe(true);
  });

  it("ไม่มี key → ai_auth_failed โดยไม่ยิง request", async () => {
    reset([]);
    const client = new OpenRouterClient(baseUrl, "");
    await expect(
      collect(client.complete({ action: "analyze_proposal", messages: [{ role: "user", content: "x" }] })),
    ).rejects.toMatchObject({ detail: { code: "ai_auth_failed" } });
    expect(requests).toHaveLength(0);
  });

  it("abort กลาง stream → ai_aborted", async () => {
    reset([(_b, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse([chunk({ content: "a" })]));
      // ไม่ res.end — ค้างให้ caller abort ปิด connection เอง
    }]);
    const client = new OpenRouterClient(baseUrl, "k");
    const ac = new AbortController();
    const it = client.complete({
      action: "analyze_proposal",
      messages: [{ role: "user", content: "x" }],
      signal: ac.signal,
    })[Symbol.asyncIterator]();
    await it.next();
    ac.abort();
    await expect(it.next()).rejects.toSatisfy(
      (e: unknown) => e instanceof AiError && e.detail.code === "ai_aborted",
    );
  });
});
