// โหลด system prompts จาก prompts.yaml — แยก prompt ออกจาก code, อ่านครั้งเดียวตอน import
// fail-fast: ไฟล์หาย/schema เพี้ยน → throw ตอน start ไม่ปล่อย run ด้วย prompt ว่าง
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { AI_ACTIONS, type AiAction } from "../actions.js";

const raw: unknown = parse(readFileSync(new URL("./prompts.yaml", import.meta.url), "utf8"));

const shape = raw as {
  systems?: Record<string, string>;
  default_user_messages?: Record<string, string>;
};

const systems = shape.systems ?? {};
for (const action of AI_ACTIONS) {
  const text = systems[action];
  if (typeof text !== "string" || text.trim() === "") throw new Error(`prompts.yaml: missing systems.${action}`);
}
const defaultUserMessages = shape.default_user_messages ?? {};
for (const [key, text] of Object.entries(defaultUserMessages)) {
  if (typeof text !== "string" || text.trim() === "") throw new Error(`prompts.yaml: empty default_user_messages.${key}`);
}

export const prompts: {
  systems: Record<AiAction, string>;
  defaultUserMessages: Record<string, string>;
} = {
  systems,
  defaultUserMessages,
};
