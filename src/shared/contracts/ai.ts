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
