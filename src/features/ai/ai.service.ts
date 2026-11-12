// ai.service — use cases: scope resolve, quota pre-flight + reconcile, idempotency replay, thread persist
// SSE ผ่าน sink callback จาก controller — service ไม่แตะ HTTP (ADR-0018, ADR-0023)
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { DRAFT_KEYS, dmps, projects } from "@/database/schema/index.js";
import { DB } from "@/database/database.module.js";
import type { Db } from "@/features/projects/projects.repository.js";
import { ProjectsService } from "@/features/projects/projects.service.js";
import { ApiError, fieldInvalid } from "@/shared/http/error-envelope.js";
import {
  analyzeProposalInputSchema,
  chatInputSchema,
  genericActionInputSchema,
  type AiQuota,
  type AiThreadEntry,

  type AiUsageReport,
} from "@/shared/contracts/ai.js";
import type { AiSseEvent } from "@/shared/contracts/envelope.js";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { ReactLoop } from "./react-loop.js";
import type { AiToolContext } from "./ai.tools.js";
import * as aiRepo from "./ai.repository.js";
import * as dmpsRepo from "@/features/dmps/dmps.repository.js";
import * as filesRepo from "@/features/files/files.repository.js";

import { AI_ACTIONS, type AiAction } from "./actions.js";
import { prompts } from "./prompts/prompts.js";

/** action ที่ต้องการแผนผ่านการอนุมัติแล้ว (committee approve / independent finalize) — SPEC-ai */
const NEEDS_APPROVED_PLAN: Record<AiAction, boolean> = {
  chat: false,
  suggest: false,
  "regenerate-field": false,
  "generate-tasks": true,
  checklist: true,
};

const updateEntrySchema = z.object({
  status: z.enum(["accepted", "rejected", "stale"]),
  stale_reason: z.string().optional(),
});
const adoptSchema = z.object({ from: z.literal("unscoped"), to: z.string().uuid() });

function toEntryResponse(row: aiRepo.EntryRow): AiThreadEntry {
  return {
    object: "ai_thread_entry",
    entry_id: row.entryId,
    dmp_id: row.dmpId,
    kind: row.kind,
    content: row.content,
    token_count: row.tokenCount,
    decision: row.decision,
    hidden: row.hiddenAt !== null,
    created_at: row.createdAt.toISOString(),
  };
}

/** entry content {text} → ข้อความสำหรับ history; รูปแรงอื่น stringify */
function entryText(content: unknown): string {
  if (content !== null && typeof content === "object" && "text" in content) {
    const text = content.text;
    if (typeof text === "string") return text;
  }
  return JSON.stringify(content);
}

/** body ที่ parseBody validate แล้ว — chat มี message/section, action อื่นมี direction */
interface ActionBody {
  message?: string;
  section?: string;
  direction?: string;
}

export interface StreamParams {
  claims: AccessClaims;
  scope: string; // dmp_id | "unscoped"
  action: string;
  body: unknown;
  idempotencyKey: string;
  signal?: AbortSignal;
  /** เขียน event ออก SSE ทันที (controller เป็นคน set headers) */
  sink: (event: AiSseEvent) => void | Promise<void>;
}

export interface StreamResult {
  events: AiSseEvent[]; // ทั้ง run ตามลำดับ — idempotency snapshot ของ replay
  usage: AiUsageReport | null;
  dmpId: string | null;
}

@Injectable()
export class AiService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ReactLoop) private readonly loop: ReactLoop,
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
  ) {}

  // ── quota ────────────────────────────────────────────────────────────────

  async quota(claims: AccessClaims): Promise<AiQuota> {
    const q = await aiRepo.getQuota(this.db, claims.sub);
    return {
      object: "ai_quota",
      limit: q.limit,
      used: q.used,
      remaining: q.limit === 0 ? Number.MAX_SAFE_INTEGER : q.limit - q.used,
      resets_at: q.resetsAt.toISOString(),
    };
  }

  // ── SSE action run (POST /dmps/{scope}/ai/{action}) ──────────────────────

  async stream(params: StreamParams): Promise<StreamResult> {
    const { claims } = params;
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const action = this.assertAction(params.action);
    const scoped = params.scope !== "unscoped";
    if (!scoped && action !== "chat") throw new ApiError(400, "field_invalid", `action "${action}" ต้องอยู่ใต้ dmp_id เท่านั้น`, "/scope");
    const dmp = scoped ? await this.findOwnedDmp(claims, params.scope) : null;
    const dmpId = dmp?.dmpId ?? null;
    // เงื่อนไข per-action (SPEC-ai) — generate-tasks/checklist ต้องการแผนที่ committee อนุมัติแล้ว
    if (dmp !== null && NEEDS_APPROVED_PLAN[action] && dmp.status !== "approved") {
      throw new ApiError(409, "plan_not_approved", "generate-tasks and checklist need a committee-approved plan");
    }
    const body = this.parseBody(action, params.body);

    const { idem, snapshot } = await this.idempotencyGate(claims, idempotencyKey, action);
    if (snapshot !== null) {
      for (const event of snapshot) await params.sink(event);
      return { events: snapshot, usage: null, dmpId: doneDmpId(snapshot) ?? dmpId };
    }

    const q = await this.quotaGate(claims);
    const hint = quotaHint(q.limit, q.used);

    // สถานะต่อ run — เข้าถึงจาก wrapper เท่านั้น (service เป็น singleton ห้าม field ต่อ request)
    let lastText: string | null = null;
    let lastProposal: unknown = null;
    let lastUsage: AiUsageReport | null = null;
    const events: AiSseEvent[] = [];
    const emit = async (event: AiSseEvent): Promise<void> => {
      if (event.event === "done") {
        event.entry_id = (
          await aiRepo.insertEntry(this.db, {
            dmpId,
            ownerId: claims.sub,
            kind: "assistant",
            content: { action, text: lastText, proposal: lastProposal },
            tokenCount: lastUsage?.total_tokens ?? 0,
          })
        ).entryId;
        await aiRepo.insertEntry(this.db, { dmpId, ownerId: claims.sub, kind: "event", content: { action, usage: event.usage ?? null } });
        if (dmpId !== null) event.dmp_id = dmpId;
      }
      if (event.event === "delta") lastText = (lastText ?? "") + event.text;
      else if (event.event === "proposal") lastProposal = event.proposal;
      else if ((event.event === "done" || event.event === "error") && event.usage !== undefined) lastUsage = event.usage;
      events.push(event);
      await params.sink(event);
    };

    await aiRepo.insertEntry(this.db, {
      dmpId,
      ownerId: claims.sub,
      kind: "user",
      content: action === "chat" ? { text: body.message, section: body.section ?? null } : { action, direction: body.direction ?? null },
    });

    const projectId = dmpId === null ? null : ((await dmpsRepo.findById(this.db, dmpId)).at(0)?.dmp.projectId ?? null);
    const ctx: AiToolContext = { claims, projectId, dmpId };
    if (hint !== null) await emit(hint);
    const result = await this.loop.run({
      action,
      system: prompts.systems[action],
      userMessage: body.message ?? body.direction ?? `ทำ action "${action}" กับแผนนี้`,
      history: action === "chat" ? await this.history(claims.sub, dmpId) : undefined,
      ctx,
      signal: params.signal,
      onEvent: emit,
    });
    await aiRepo.chargeQuota(this.db, claims.sub, result.usage);
    if (idem !== null) await aiRepo.setIdempotencySnapshot(this.db, idem.keyId, events);
    return { events, usage: lastUsage, dmpId };
  }

  // ── analyze-proposal (POST /ai/analyze-proposal — สร้างแผนใหม่เมื่อสำเร็จ) ─

  async analyze(params: Omit<StreamParams, "action" | "scope">): Promise<StreamResult> {
    const { claims } = params;
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const parsed = analyzeProposalInputSchema.safeParse(params.body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const input = parsed.data;

    const { idem, snapshot } = await this.idempotencyGate(claims, idempotencyKey, "analyze-proposal");
    if (snapshot !== null) {
      for (const event of snapshot) await params.sink(event);
      return { events: snapshot, usage: null, dmpId: doneDmpId(snapshot) };
    }

    await this.projectsService.assertVisible(claims, input.project_id);
    const file = (await filesRepo.findById(this.db, input.file_id)).at(0);
    if (file === undefined || file.projectId !== input.project_id || file.purpose !== "proposal") {
      throw new ApiError(404, "file_not_found", "No such proposal file on the project");
    }
    const chunks = await filesRepo.chunksOfFile(this.db, input.file_id);
    if (chunks.length === 0) {
      throw new ApiError(422, "proposal_unreadable", "อ่านเอกสาร proposal ไม่ได้ (ไม่มีข้อความที่ extract ได้) — ไม่มีแผนถูกสร้าง");
    }

    // redraft ในสถานที่ หรือสร้างแผนบางก่อนรัน — run fail → ลบแผนที่สร้างเอง (proposal อ่านไม่รู้เรื่องต้องไม่สร้างแผน)
    let dmpId = input.dmp_id ?? null;
    let createdHere = false;
    if (dmpId !== null) {
      await this.findOwnedDmp(claims, dmpId);
    } else {
      const planMode = (await dmpsRepo.projectPlanMode(this.db, input.project_id)).at(0)?.mode ?? "institutional";
      dmpId = (await dmpsRepo.create(this.db, { projectId: input.project_id, createdBy: claims.sub, planMode })).at(0)?.dmpId ?? null;
      createdHere = dmpId !== null;
    }
    await this.db.update(projects).set({ proposalFileId: input.file_id }).where(eq(projects.projectId, input.project_id));

    const q = await this.quotaGate(claims);
    const hint = quotaHint(q.limit, q.used);

    const events: AiSseEvent[] = [];
    let analyzedDraft: unknown = null; // loop ส่ง proposal event ก่อน terminal เสมอ — เก็บไว้เขียน draft ตอน terminal
    const emit = async (event: AiSseEvent): Promise<void> => {
      if (hint !== null && events.length === 0) {
        events.push(hint);
        await params.sink(hint);
      }
      if (event.event === "done" || event.event === "error") {
        // terminal — ทุกอย่างต้องลง DB ก่อน event สุดท้ายหลุดออก stream
        // (เคยพัง: done หลุดก่อน persist → persist throw → filter พยายามส่ง envelope ทับ SSE ได้ ERR_HTTP_HEADERS_SENT)
        let terminal: AiSseEvent = event;
        if (terminal.event === "done") {
          const targetId = dmpId;
          if (targetId !== null && draftWritable(analyzedDraft)) {
            const title =
              typeof analyzedDraft.title === "string" && analyzedDraft.title.trim() !== "" && analyzedDraft.title.length <= 500
                ? analyzedDraft.title
                : null; // ไม่มี title ใช้ได้ → คง title เดิมของแผน (เคย fallback "" แล้วลบชื่อแผนทิ้ง)
            await this.db.update(dmps).set({
              draft: analyzedDraft,
              draftRevision: 1,
              updatedAt: new Date(),
              ...(title !== null ? { title } : {}),
            }).where(eq(dmps.dmpId, targetId));
            terminal = { ...terminal, dmp_id: targetId };
          } else {
            // โมเดลคืนรูปที่เขียน draft ไม่ได้ (เช่น patch list ไม่ใช่ maDMP) → ถือว่า run ล้มเหลว ไม่ผลักขึ้น DB เอง
            if (createdHere && targetId !== null) {
              await this.db.delete(dmps).where(eq(dmps.dmpId, targetId));
              dmpId = null;
            }
            terminal = {
              event: "error",
              code: "ai_provider_error",
              message: "โมเดลคืนร่างแผนที่ใช้เขียน draft ไม่ได้ — ลองรันใหม่",
              ...(terminal.usage !== undefined ? { usage: terminal.usage } : {}),
            };
          }
        } else if (createdHere && dmpId !== null) {
          // run fail → แผนที่สร้างเองใน call นี้ ลบทิ้ง (ไม่มีแผนค้าง)
          await this.db.delete(dmps).where(eq(dmps.dmpId, dmpId));
          dmpId = null;
        }
        const usage = "usage" in terminal ? (terminal.usage ?? null) : null;
        await aiRepo.chargeQuota(this.db, claims.sub, usage);
        await aiRepo.insertEntry(this.db, {
          dmpId,
          ownerId: claims.sub,
          kind: "event",
          content: { action: "analyze-proposal", dmp_id: dmpId, usage },
        });
        // snapshot รวม terminal — บันทึกก่อน event หลุดออก stream เสมอ replay จึงได้ stream ครบ
        if (idem !== null) await aiRepo.setIdempotencySnapshot(this.db, idem.keyId, [...events, terminal]);
        events.push(terminal);
        await params.sink(terminal);
        return;
      }
      if (event.event === "proposal") analyzedDraft = event.proposal;
      events.push(event);
      await params.sink(event);
    };

    const result = await this.loop.run({
      action: "analyze_proposal",
      system: prompts.systems.analyze_proposal,
      userMessage: input.direction ?? prompts.defaultUserMessages.analyze_proposal,
      ctx: { claims, projectId: input.project_id, dmpId },
      signal: params.signal,
      onEvent: emit,
    });

    return { events, usage: result.usage, dmpId };
  }

  // ── thread ───────────────────────────────────────────────────────────────

  async thread(claims: AccessClaims, scope: string, query: { before?: string; limit?: string }) {
    const dmpId = scope === "unscoped" ? null : (await this.findOwnedDmp(claims, scope)).dmpId;
    const limit = query.limit === undefined ? undefined : Number.parseInt(query.limit, 10);
    if (limit !== undefined && (Number.isNaN(limit) || limit < 1 || limit > 100)) {
      throw new ApiError(400, "field_invalid", "limit ต้องเป็น 1..100", "/limit");
    }
    const page = await aiRepo.listEntries(this.db, claims.sub, dmpId, { before: query.before, limit });
    return { object: "list" as const, data: page.data, has_more: page.has_more, total_count: page.data.length };
  }

  async updateEntry(claims: AccessClaims, scope: string, entryId: string, body: unknown) {
    const dmpId = scope === "unscoped" ? null : (await this.findOwnedDmp(claims, scope)).dmpId;
    const parsed = updateEntrySchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const entry = await aiRepo.findEntry(this.db, claims.sub, entryId);
    if (entry === null || (entry.dmpId ?? null) !== dmpId) throw new ApiError(404, "entry_not_found", "No such thread entry");
    if (entry.decision !== null) throw new ApiError(409, "proposal_settled", "โปรซัลนี้ถูกตัดสินไปแล้ว");
    const updated = await aiRepo.setDecision(this.db, claims.sub, entryId, parsed.data.status, parsed.data.stale_reason);
    if (updated === null) throw new ApiError(404, "entry_not_found", "No such thread entry");
    return toEntryResponse(updated);
  }

  async clear(claims: AccessClaims, scope: string) {
    const dmpId = scope === "unscoped" ? null : (await this.findOwnedDmp(claims, scope)).dmpId;
    const { hidden, kept } = await aiRepo.clearThread(this.db, claims.sub, dmpId);
    return { object: "ai_thread" as const, scope, hidden, kept };
  }

  async adopt(claims: AccessClaims, body: unknown) {
    const parsed = adoptSchema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    const target = await this.findOwnedDmp(claims, parsed.data.to);
    const moved = await aiRepo.adoptThread(this.db, claims.sub, target.dmpId);
    return { object: "ai_thread" as const, scope: target.dmpId, moved };
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** researcher + เจ้าของเท่านั้น — ไม่ใช่ → 404 ซ่อนการมีอยู่ (FE ai.md: author-only) */
  private async findOwnedDmp(claims: AccessClaims, dmpId: string): Promise<{ dmpId: string; status: string }> {
    if (claims.role !== "researcher") throw new ApiError(403, "not_a_researcher", "AI endpoints สำหรับเจ้าของแผนเท่านั้น");
    const row = (await dmpsRepo.findById(this.db, dmpId)).at(0);
    if (row === undefined || row.dmp.createdBy !== claims.sub) throw new ApiError(404, "dmp_not_found", "No DMP with that id");
    return { dmpId: row.dmp.dmpId, status: row.dmp.status };
  }

  private assertAction(action: string): AiAction {
    if ((AI_ACTIONS as readonly string[]).includes(action)) return action as AiAction;
    throw new ApiError(404, "action_not_found", `ไม่มี AI action "${action}"`);
  }

  private parseBody(action: AiAction, body: unknown): ActionBody {
    const schema = action === "chat" ? chatInputSchema : genericActionInputSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw fieldInvalid(parsed.error);
    return parsed.data; // zod ตรวจแล้ว — chat: message/section, action อื่น: direction (passthrough)
  }

  /** replay (มี snapshot) → คืน snapshot; run แรก → insert key คืนแถว; ซ้ำระหว่างบิน → 409 */
  private async idempotencyGate(claims: AccessClaims, key: string, action: string): Promise<{ idem: aiRepo.IdempotencyRow | null; snapshot: AiSseEvent[] | null }> {
    const existing = await aiRepo.findIdempotencyKey(this.db, claims.sub, key, action);
    if (existing === null) {
      return { idem: await aiRepo.insertIdempotencyKey(this.db, { key, userId: claims.sub, action }), snapshot: null };
    }
    if (existing.responseSnapshot !== null) return { idem: existing, snapshot: existing.responseSnapshot as AiSseEvent[] };
    // snapshot ว่าง = run ค้าง/crash แล้วไม่จบ — รับ run ใหม่ด้วย key เดิม (อัปเดตแถวเดิมตอนจบ)
    return { idem: existing, snapshot: null };
  }

  /** reset-if-passed + ปฏิเสธเมื่อใช้เกินลิมิตอยู่แล้ว (run เดียวที่จะล้นไม่ปฏิเสธ — hint แทน) */
  private async quotaGate(claims: AccessClaims): Promise<aiRepo.QuotaRow> {
    const q = await aiRepo.getQuota(this.db, claims.sub);
    if (q.limit > 0 && q.used >= q.limit) {
      throw new ApiError(429, "quota_exceeded", "โควตา AI ของเดือนนี้หมดแล้ว", undefined, { resets_at: q.resetsAt.toISOString() });
    }
    return q;
  }

  /** ประวัติล่าสุดของ scope เป็น messages — user/assistant เท่านั้น (event/hidden ไม่ยัด) */
  private async history(ownerId: string, dmpId: string | null) {
    const page = await aiRepo.listEntries(this.db, ownerId, dmpId, { limit: 10 });
    return page.data
      .filter((e) => e.kind === "user" || e.kind === "assistant")
      .map((e) =>
        e.kind === "user"
          ? { role: "user" as const, content: entryText(e.content) }
          : { role: "assistant" as const, content: entryText(e.content), toolCalls: [] },
      );
  }
}

function requireIdempotencyKey(header: string): string {
  if (header === "") throw new ApiError(400, "field_invalid", "Idempotency-Key header is required for AI actions", "/idempotency-key");
  return header;
}

/** draft ที่เขียนลง dmps.draft ได้ — กรอบเดียวกับ constraint D1 (dmps_draft_object_keys, ADR-0031):
 * object และ top-level keys ⊆ DRAFT_KEYS ความครบถ้วนเป็นกฎตอน submit (validateDraft) ไม่ใช่ตอน persist */
function draftWritable(draft: unknown): draft is Record<string, unknown> {
  return (
    draft !== null &&
    typeof draft === "object" &&
    !Array.isArray(draft) &&
    Object.keys(draft).every((key) => DRAFT_KEYS.includes(key))
  );
}

function doneDmpId(events: AiSseEvent[]): string | null {
  const done = events.find((e) => e.event === "done");
  return done !== undefined && "dmp_id" in done && typeof done.dmp_id === "string" ? done.dmp_id : null;
}

/** hint ก่อน run เมื่อโควตาเหลือ ≤ 20% — pre-flight เป็น hint ไม่ปฏิเสธ (ADR-0023) */
function quotaHint(limit: number, used: number): AiSseEvent | null {
  if (limit === 0) return null;
  const remaining = limit - used;
  if (remaining > Math.ceil(limit * 0.2)) return null;
  return { event: "status", message: `โควตา AI คงเหลือ ${String(remaining)} tokens` };
}
