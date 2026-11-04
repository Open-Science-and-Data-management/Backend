import { z } from "zod";

// ── Error envelope (ADR-0014) ─────────────────────────────────────────────
// Stripe-style; `param` ถือ JSON pointer เมื่อ error ชี้ตำแหน่งใน draft

export const errorDetailSchema = z.object({
  type: z.string(),
  code: z.string(),
  message: z.string(),
  param: z.string().optional(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorEnvelopeSchema = z.object({
  error: errorDetailSchema,
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// ── List envelope (ADR-0015 — Stripe v1) ──────────────────────────────────

export type ListEnvelope<T = unknown> = {
  object: "list";
  data: T[];
  has_more: boolean;
  total_count: number;
};

export function listOf<T>(data: T[], hasMore: boolean, totalCount: number): ListEnvelope<T> {
  return { object: "list", data, has_more: hasMore, total_count: totalCount };
}

// ── SSE events (ADR-0018) ─────────────────────────────────────────────────
// ชุด FE: status/tool/delta/proposal แล้วจบด้วย done หรือ error ตัวเดียว;
// FE ต้องเมิน event ที่ไม่รู้จัก (forward compatibility)

export const aiSseEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("status"), message: z.string() }),
  z.object({
    event: z.literal("tool"),
    name: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ event: z.literal("delta"), text: z.string() }),
  z.object({ event: z.literal("proposal"), proposal: z.unknown() }),
  z.object({ event: z.literal("done") }),
  z.object({ event: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type AiSseEvent = z.infer<typeof aiSseEventSchema>;
