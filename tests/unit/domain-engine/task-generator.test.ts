import { describe, expect, it } from "vitest";
import { generateTasks } from "@shared/domain-engine/task-generator.js";

const outputs = () => [
  { dataset_id: "d-1", title: "Reads", type: "raw", access: "shared" },
  { dataset_id: "d-2", title: "Secret docs", type: "other", access: "closed" },
];

describe("generateTasks (STAGE_PLAN — ADR-0026)", () => {
  it("ต่อ dataset 1 task ต่อ stage; open=5, closed=4 → 9 tasks สำหรับ 2 outputs", () => {
    const tasks = generateTasks(outputs());
    expect(tasks).toHaveLength(9);
    expect(tasks.filter((t) => t.dataset_id === "d-1")).toHaveLength(5);
    const stages = tasks.filter((t) => t.dataset_id === "d-1").map((t) => t.lifecycle_stage);
    expect(stages).toEqual(["collect", "process", "analyse", "preserve", "share"]);
  });

  it("ข้าม share เมื่อ access=closed → 4 tasks สำหรับ output ปิด", () => {
    const tasks = generateTasks(outputs()).filter((t) => t.dataset_id === "d-2");
    expect(tasks).toHaveLength(4);
    expect(tasks.map((t) => t.lifecycle_stage)).not.toContain("share");
  });

  it("priority ตาม STAGE_PLAN: high/medium/medium/high/low", () => {
    const tasks = generateTasks([{ dataset_id: "d-1", title: "Reads", type: "raw", access: "open" }]);
    expect(tasks.map((t) => t.priority)).toEqual(["high", "medium", "medium", "high", "low"]);
  });

  it("ชื่อ `${verb}: ${title}`", () => {
    const tasks = generateTasks([{ dataset_id: "d-1", title: "Reads", type: "raw", access: "open" }]);
    expect(tasks[0].title).toBe("Collect: Reads");
    expect(tasks[4].title).toBe("Publish and share: Reads");
  });

  it("outputs ว่าง → ไม่มี task", () => {
    expect(generateTasks([])).toEqual([]);
  });
});
