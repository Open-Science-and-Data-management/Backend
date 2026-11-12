// SPEC-draft-integrity — drift guard (unit, ไม่มี DB)
// เทียบ key-set ที่ CHECK constraint ใช้ (export จาก schema/index.ts) กับแหล่งจริง:
// contracts (dmpSchema), domain-engine (FieldChange), service literals (approver, ai content)
// — test ตาย = Zod/SQL/engine คลาดเคลื่อน (ADR-0031 §5)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dmpSchema } from "@shared/contracts/index.js";
import {
  APPROVER_KEYS,
  ASSISTANT_CONTENT_KEYS,
  DRAFT_KEYS,
  EVENT_CONTENT_KEYS,
  FIELD_CHANGE_KEYS,
  USER_CONTENT_KEYS,
} from "@/database/schema/index.js";

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const sorted = (keys: readonly string[]) => [...keys].sort();

/** keys ระดับบนของ object literal — รองรับทั้ง `key: value` และ shorthand `key,` */
const literalKeys = (literal: string): string[] =>
  [...literal.matchAll(/(?:^|[{,])\s*(\w+)\s*(?=[,:}])/g)].map((m) => m[1]);

describe("draft-integrity drift guard", () => {
  it("D1 — DRAFT_KEYS ตรงกับ Object.keys(dmpSchema.shape)", () => {
    expect(sorted(DRAFT_KEYS)).toEqual(sorted(Object.keys(dmpSchema.shape)));
    expect(DRAFT_KEYS).toHaveLength(16);
  });

  it("D2 — FIELD_CHANGE_KEYS ต้องถูก FieldChange ใน diff-draft.ts ใช้ครบ", () => {
    // SQL require แค่ 4 key — engine เพิ่ม required อื่น (target/edit_type) ได้เพราะ SQL อนุญาต extra
    // drift ที่ต้องจับ: engine ถอด/เปลี่ยนชื่อ key ใดใน 4 นี้ → constraint จะตีของจริง
    const allKeys = src("../../src/shared/domain-engine/diff-draft.ts")
      .match(/export interface FieldChange \{([\s\S]*?)\n\}/)?.[1]
      ?.match(/^\s{2}\w+\??\s*:/gm)?.map((line) => line.trim().split(/[?:]/)[0]);
    expect(allKeys, "interface FieldChange ไม่เจอใน diff-draft.ts").toBeTruthy();
    for (const key of FIELD_CHANGE_KEYS) expect(allKeys!).toContain(key);
  });

  it("D4 — APPROVER_KEYS ตรงกับรูป approver ที่ dmps.service.ts decide เขียน", () => {
    const literal = src("../../src/features/dmps/dmps.service.ts")
      .match(/const approver = \{([\s\S]*?)\};/)?.[1];
    expect(literal, "approver literal ไม่เจอใน dmps.service.ts").toBeTruthy();
    expect(sorted(literalKeys(literal!))).toEqual(sorted(APPROVER_KEYS));
  });

  it("D5 — content key-set ต่อ kind ตรงกับ literal ที่ ai.service.ts เขียน", () => {
    const source = src("../../src/features/ai/ai.service.ts");
    const shapes: Record<string, string[][]> = { user: [], assistant: [], event: [] };
    // assistant/event — content literal ต่อท้าย kind ตรง ๆ (insertEntry ทั้ง 3 จุด)
    for (const m of source.matchAll(/kind: "(assistant|event)",\s*content: (\{[^{}]*\})/g)) {
      shapes[m[1]].push(literalKeys(m[2]));
    }
    // user — chat ให้ {text,section} / action อื่นให้ {action,direction} (ternary เดียว)
    const userTernary = source.match(/content: action === "chat" \? (\{[^{}]*\}) : (\{[^{}]*\})/);
    expect(userTernary, "user content ternary ไม่เจอใน ai.service.ts").toBeTruthy();
    shapes.user.push(literalKeys(userTernary![1]), literalKeys(userTernary![2]));

    const allowed = {
      user: USER_CONTENT_KEYS.map((ks) => sorted(ks)),
      assistant: [sorted(ASSISTANT_CONTENT_KEYS)],
      event: [sorted(EVENT_CONTENT_KEYS)],
    };
    for (const kind of ["user", "assistant", "event"] as const) {
      expect(shapes[kind].length, `ไม่เจอ content literal ของ kind "${kind}"`).toBeGreaterThan(0);
      for (const shape of shapes[kind]) {
        // ทุก literal ต้องอยู่ใน key-set ที่ SQL อนุญาต (key ⊆ ชุดใดชุดหนึ่ง)
        expect(
          allowed[kind].some((ks) => shape.every((k) => ks.includes(k))),
          `content ของ "${kind}" มี key นอกชุด constraint: [${shape}]`,
        ).toBe(true);
      }
    }
    // ชุด user ต้องมี 2 รูป — ป้องกัน constraint หายรูปใดรูปหนึ่ง
    expect(allowed.user).toHaveLength(2);
    expect(shapes.assistant.length + shapes.event.length).toBe(3);
  });
});
