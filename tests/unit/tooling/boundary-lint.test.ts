import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURE = fileURLToPath(new URL("../../../src/shared/domain-engine/__fixtures__/boundary-violation.fixture.ts", import.meta.url));

interface LintMessage {
  ruleId: string | null;
  message: string;
  source?: string;
}
interface LintResult {
  filePath: string;
  messages: LintMessage[];
}

function runEslint(args: string[]): LintResult[] {
  try {
    const stdout = execFileSync("pnpm", ["exec", "eslint", ...args], {
      encoding: "utf8",
      cwd: ROOT,
    });
    return JSON.parse(stdout) as LintResult[];
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    if (e.stdout === undefined) throw new Error(`eslint failed: ${String(e.stderr ?? err)}`);
    if (!e.stdout.trim()) throw new Error(`eslint exit ${String(e.status)}: stderr=${e.stderr ?? ""} args=${args.join(" ")}`);
    return JSON.parse(e.stdout) as LintResult[];
  }
}

describe("CON-2 lint boundary — shared/domain-engine", () => {
  it("บล็อก import @nestjs/* / DB / HTTP ใน domain-engine", () => {
    const results = runEslint(["--no-ignore", "--format", "json", FIXTURE]);
    const restricted = results
      .flatMap((r) => r.messages)
      .filter((m) => m.ruleId === "@typescript-eslint/no-restricted-imports");
    expect(restricted.length).toBeGreaterThanOrEqual(3);
    const text = restricted.map((m) => m.message + (m.source ?? "")).join("\n");
    expect(text).toContain("CON-2");
    // ครบทั้งสามประเภท: @nestjs, DB (pg), HTTP (axios)
    expect(text).toContain("@nestjs/common");
    expect(text).toContain("pg");
    expect(text).toContain("axios");
  });

  it("ไม่บล็อกไฟล์นอก domain-engine", () => {
    const results = runEslint(["--format", "json", "vitest.config.ts"]);
    const all = results.flatMap((r) => r.messages);
    expect(all.filter((m) => m.ruleId === "@typescript-eslint/no-restricted-imports")).toHaveLength(0);
  });
});
