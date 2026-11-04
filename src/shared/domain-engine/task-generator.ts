// generateTasks — pure (CON-2): STAGE_PLAN semantics (ADR-0026, port จาก
// FE aiApi.ts แบบ read-only — ตัด direction/granular ของ AI ออก เพราะชุดแรก
// ที่ approve/finalize สร้างต้อง deterministic จาก outputsInForce)
export interface OutputInForce {
  dataset_id: string;
  title: string;
  type: string;
  access: string;
}

export interface GeneratedTask {
  title: string;
  details: string;
  lifecycle_stage: "collect" | "process" | "analyse" | "preserve" | "share";
  priority: "low" | "medium" | "high";
  dataset_id: string;
}

const STAGE_PLAN: {
  stage: GeneratedTask["lifecycle_stage"];
  verb: string;
  priority: GeneratedTask["priority"];
}[] = [
  { stage: "collect", verb: "Collect", priority: "high" },
  { stage: "process", verb: "Process and clean", priority: "medium" },
  { stage: "analyse", verb: "Analyse", priority: "medium" },
  { stage: "preserve", verb: "Deposit and preserve", priority: "high" },
  { stage: "share", verb: "Publish and share", priority: "low" },
];

export function generateTasks(outputsInForce: OutputInForce[]): GeneratedTask[] {
  return outputsInForce.flatMap((output) =>
    STAGE_PLAN
      // A closed output is never published, so no share task is proposed.
      .filter((s) => !(s.stage === "share" && output.access === "closed"))
      .map((s) => ({
        title: `${s.verb}: ${output.title}`,
        details: `${s.verb.toLowerCase()} the ${output.type} output “${output.title}” in line with the approved plan.`,
        lifecycle_stage: s.stage,
        priority: s.priority,
        dataset_id: output.dataset_id,
      })),
  );
}
