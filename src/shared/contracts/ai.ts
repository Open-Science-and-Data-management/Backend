import { z } from "zod";

// ── AI error codes (SPEC-ai S4.1) ─────────────────────────────────────────
// Adapter แปล error ฝั่ง OpenRouter/wire เป็นชุดนี้เท่านั้น — anti-corruption (TC-6):
// FE เห็น code ชุดนี้อย่างเดียว ไม่รู้จัก schema ของ OpenRouter

export const aiErrorCodeSchema = z.enum([
  "ai_auth_failed", // 401 จาก OpenRouter — key ไม่ถูก/ไม่มี
  "ai_payment_required", // 402 — เครดิตหมด
  "ai_rate_limited", // 429 — rate limit (retry ได้)
  "ai_invalid_request", // 400 — request เราผิด (model ไม่มี, params เกิน)
  "ai_provider_error", // 502/503 — ไม่มี provider รับงาน (retry ได้)
  "ai_network_error", // fetch ล้ม/timeout ก่อนได้ response (retry ได้)
  "ai_stream_error", // error กลาง stream (top-level error chunk)
  "ai_content_filtered", // provider ตัดคำตอบด้วย safety filter (finish_reason: content_filter — retry ไม่ช่วย)
  "ai_aborted", // caller ยกเลิกกลางทาง
]);
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;

/** OpenRouter บอกได้ว่า request เดิม retry ได้หรือไม่ — ใช้ตั้ง retryable ใน error event */
export const aiErrorDetailSchema = z.object({
  code: aiErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
});
export type AiErrorDetail = z.infer<typeof aiErrorDetailSchema>;

// ── usage / quota (SPEC-ai S4.4, ADR-0023) ────────────────────────────────
// รายงาน usage แยกส่วนเสมอ — cached นับ 10% ตอน reconcile โควตา
export const aiUsageReportSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cached_input_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type AiUsageReport = z.infer<typeof aiUsageReportSchema>;

export const aiQuotaSchema = z.object({
  object: z.literal("ai_quota"),
  limit: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int(),
  resets_at: z.string().nullable(), // ISO — ต้นเดือนถัดไป UTC
});
export type AiQuota = z.infer<typeof aiQuotaSchema>;

// ── thread entries (ai_thread_entries — ADR-0023) ─────────────────────────
export const aiThreadEntryKindSchema = z.enum(["user", "event", "assistant"]);
export const aiThreadEntrySchema = z.object({
  object: z.literal("ai_thread_entry"),
  entry_id: z.string().uuid(),
  dmp_id: z.string().uuid().nullable(), // null = scope "unscoped"
  kind: aiThreadEntryKindSchema,
  content: z.unknown(),
  token_count: z.number().int().nonnegative(),
  decision: z.enum(["accepted", "rejected", "stale"]).nullable(),
  hidden: z.boolean(),
  created_at: z.string(),
});
export type AiThreadEntry = z.infer<typeof aiThreadEntrySchema>;

export const threadDecisionSchema = z.enum(["accepted", "rejected", "stale"]);

// ── request bodies ต่อ action ─────────────────────────────────────────────
export const chatInputSchema = z.object({
  message: z.string().min(1),
  section: z.string().optional(),
});

export const analyzeProposalInputSchema = z.object({
  project_id: z.string().uuid(),
  file_id: z.string().uuid(),
  dmp_id: z.string().uuid().optional(), // redraft แผนบางที่สร้างจาก proposal เดียวกันแทนสร้างใหม่
  direction: z.string().optional(),
});

// action อื่น (suggest / regenerate-field / generate-tasks / checklist) — body อิสระ
// ส่งตรงเข้า prompt; ผลลัพธ์ออกทาง delta/proposal เสมอ
export const genericActionInputSchema = z.object({
  direction: z.string().optional(),
}).passthrough();
