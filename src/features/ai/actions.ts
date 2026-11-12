// รายชื่อ AI actions — แยกไฟล์เพื่อให้ prompts.ts ใช้ได้โดยไม่วน import กลับ ai.service
export const AI_ACTIONS = ["chat", "suggest", "regenerate-field", "generate-tasks", "checklist"] as const;
export type AiAction = (typeof AI_ACTIONS)[number];
