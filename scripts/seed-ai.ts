// seed-ai — เตรียมชุดข้อมูลเดโมให้มนุษย์ทดสอบ AI API (SPEC-ai) ผ่าน dev server ที่รันอยู่
// ใช้: `pnpm dev` ค้างไว้ แล้ว `pnpm seed:ai` (BASE_URL ปรับได้, default http://localhost:3000)
// ยิง HTTP เท่านั้น — ไม่แตะ DB ตรง; รันซ้ำได้: user/project/proposal/แผน อันไหนมีอยู่แล้วใช้ของเดิม
// ขั้นตอน: register/login → project → upload FF2569 (parse+embed sync ใน response) → แผนเปล่า → พิมพ์ curl cheat sheet
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/shared/config/index.js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const DEMO = {
  username: "demo-researcher",
  email: "demo.researcher@example.edu",
  password: "demo-passw0rd",
  account_type: "institutional",
  name: "Demo",
  surname: "Researcher",
  organization: "Uni",
} as const;

const PROJECT_NAME = "[DEMO] ข้อเสนอโครงการ FF2569";
const PROJECT_DESC = "โครงการเดโมสำหรับทดสอบ AI API — มี proposal FF2569 ที่ parse + embed แล้ว";
const DOCX_PATH = fileURLToPath(new URL("../docs/research/ข้อเสนอโครงการ FF2569.docx", import.meta.url));
const DOCX_NAME = "ข้อเสนอโครงการ FF2569.docx";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ── response shapes ที่ script แตะ (แค่ field ที่ใช้) ─────────────────────────
interface Session {
  access_token: string;
  expires_at: string;
  user: { user_id: string; username: string };
}
interface Project {
  project_id: string;
  project_name: string;
}
interface FileRec {
  file_id: string;
  filename: string;
}
interface DmpRec {
  dmp_id: string;
  title: string;
}

/** HTTP error จากฝั่ง server — แยกรูปแบบ envelope {error:{code,message}} ออกให้ caller อ่าน status */
class SeedHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${String(status)} ${code}: ${message}`);
  }
}

// ── narrowing helpers — response ผิดรูปต้องสะดุดชัด ๆ ตรงจุด ─────────────────
function pick(v: unknown, key: string): unknown {
  if (v === null || typeof v !== "object") throw new Error(`response ผิดรูป: คาด object แต่ได้ ${typeof v}`);
  return (v as Record<string, unknown>)[key];
}

function str(v: unknown, key: string): string {
  const got = pick(v, key);
  if (typeof got !== "string") throw new Error(`response ผิดรูป: ${key} ไม่ใช่ string`);
  return got;
}

function num(v: unknown, key: string): number {
  const got = pick(v, key);
  if (typeof got !== "number") throw new Error(`response ผิดรูป: ${key} ไม่ใช่ number`);
  return got;
}

function listOf(v: unknown): unknown[] {
  const data = pick(v, "data");
  if (!Array.isArray(data)) throw new Error("response ผิดรูป: data ไม่ใช่ array");
  return data;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function api(
  method: string,
  path: string,
  init: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`;
  let payload: string | FormData | undefined = init.form;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  } catch (cause) {
    throw new Error(`เซิร์ฟเวอร์ที่ ${BASE_URL} ไม่ตอบสนอง — รัน \`pnpm dev\` ค้างไว้ก่อน (หรือตั้ง BASE_URL)`, { cause });
  }
  const text = await res.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`ตอบกลับไม่ใช่ JSON (HTTP ${String(res.status)}): ${text.slice(0, 120)}`);
    }
  }
  if (!res.ok) {
    const err =
      json !== null && typeof json === "object"
        ? ((json as Record<string, unknown>).error as Record<string, unknown> | undefined)
        : undefined;
    const code = typeof err?.code === "string" ? err.code : "unknown";
    const message = typeof err?.message === "string" ? err.message : text.slice(0, 120);
    throw new SeedHttpError(res.status, code, message);
  }
  return json;
}

// ── ขั้นตอน seed ทีละทรัพยากร ────────────────────────────────────────────────

/** เตือนสภาพแวดล้อมที่ทำให้ทดสอบ AI จริงไม่ได้ — ไม่หยุด script (upload/embed ยังใช้ได้) */
async function warnIfNotReadyForRealAi(): Promise<void> {
  try {
    const cfg = await loadConfig();
    if (cfg.ai.mock) {
      console.warn(`⚠ config.toml [ai] mock = true — AI ตอบแบบ canned ไม่ใช่โมเดลจริง (แก้เป็น false แล้ว restart \`pnpm dev\`)`);
    }
  } catch {
    console.warn("⚠ อ่าน config.toml ไม่สำเร็จ — ข้ามการตรวจ ai.mock (script ต้องรันจาก root ของ repo)");
  }
  if (process.env.OPENROUTER_KEY === undefined || process.env.OPENROUTER_KEY === "") {
    console.warn("⚠ ไม่มี OPENROUTER_KEY ใน .env — upload/embed ยังใช้ได้ แต่ AI action ทุกตัวจะ error ตอนเรียกจริง");
  }
}

/** probe — GET /users/me ไม่มี token ต้องได้ 401 เท่านั้น ถึงแปลว่า server ตอบ */
async function probeServer(): Promise<void> {
  try {
    await api("GET", "/users/me");
    return;
  } catch (cause) {
    if (cause instanceof SeedHttpError && cause.status === 401) return; // คาดหมาย — server up + guard ทำงาน
    throw cause;
  }
}

function toSession(v: unknown): Session {
  const user = pick(v, "user");
  return {
    access_token: str(v, "access_token"),
    expires_at: str(v, "expires_at"),
    user: { user_id: str(user, "user_id"), username: str(user, "username") },
  };
}

/** sign-in ด้วย handle คงที่; ยังไม่มีบัญชี (401) ค่อย register — register สำเร็จ sign-in ให้ทันที */
async function ensureSession(): Promise<Session> {
  try {
    const signed = await api("POST", "/auth/sessions", {
      body: { username: DEMO.username, password: DEMO.password },
    });
    console.log(`✓ user: ${DEMO.username} — ใช้บัญชีเดิม`);
    return toSession(signed);
  } catch (cause) {
    if (!(cause instanceof SeedHttpError) || cause.status !== 401) throw cause;
  }
  const registration = { ...DEMO, confirm_password: DEMO.password };
  let session: Session;
  try {
    session = toSession(await api("POST", "/users", { body: registration }));
  } catch (cause) {
    if (cause instanceof SeedHttpError && cause.status === 409) {
      throw new Error(`สมัครไม่สำเร็จ (${cause.code}) — มีบัญชีเดิมอยู่แต่ sign-in ไม่ผ่าน รหัสผ่านไม่ตรงที่ script ใช้`);
    }
    throw cause;
  }
  console.log(`✓ user: ${DEMO.username} — สมัครใหม่`);
  return session;
}

async function ensureProject(token: string): Promise<Project> {
  const list = await api("GET", "/projects?limit=100", { token });
  const mine = listOf(list)
    .map((p) => p as Project)
    .find((p) => p.project_name === PROJECT_NAME);
  if (mine !== undefined) {
    console.log(`✓ project: ${PROJECT_NAME} — ใช้ของเดิม`);
    return mine;
  }
  const created = await api("POST", "/projects", {
    token,
    body: { project_name: PROJECT_NAME, description: PROJECT_DESC, plan_mode: "institutional" },
  });
  console.log(`✓ project: ${PROJECT_NAME} — สร้างใหม่`);
  return { project_id: str(created, "project_id"), project_name: str(created, "project_name") };
}

/** proposal file = ตัวที่ analyze-proposal/search_proposal ใช้ — upload เป็น sync: parse+chunk+embed จบใน response */
async function ensureProposal(token: string, projectId: string): Promise<FileRec> {
  const query = new URLSearchParams({ project_id: projectId, purpose: "proposal" });
  const list = await api("GET", `/files?${String(query)}`, { token });
  const existing = listOf(list).at(0) as FileRec | undefined;
  if (existing !== undefined) {
    console.log(`✓ proposal: มีไฟล์อยู่แล้ว (${existing.filename}) — ข้าม upload/embed`);
    return existing;
  }
  const buf = await readFile(DOCX_PATH);
  const form = new FormData();
  form.append("purpose", "proposal");
  form.append("file", new Blob([buf], { type: DOCX_MIME }), DOCX_NAME);
  const uploaded = await api("POST", `/projects/${projectId}/files`, { token, form });
  const formParsed = pick(uploaded, "form_parsed") === true;
  const file = { file_id: str(uploaded, "file_id"), filename: str(uploaded, "filename") };
  console.log(`✓ proposal: ${file.filename} — upload + parse + embed เสร็จ (form_parsed=${String(formParsed)})`);
  if (!formParsed) {
    console.warn("⚠ fast path FF2569 ไม่ match — ใช้ generic chunking (RAG ยังใช้ได้ แต่ chunk ไม่ผูก field ของฟอร์ม)");
  }
  return file;
}

/** แผนเปล่าสำหรับ scoped action (chat/suggest/...) — analyze-proposal จะ mint แผนใหม่ของตัวเองตอนรัน */
async function ensureDmp(token: string, projectId: string): Promise<DmpRec> {
  const query = new URLSearchParams({ project_id: projectId, limit: "100" });
  const list = await api("GET", `/dmps?${String(query)}`, { token });
  const existing = listOf(list).at(0) as DmpRec | undefined;
  if (existing !== undefined) {
    console.log("✓ แผน: มีอยู่แล้วใต้โครงการ — ใช้ของเดิม");
    return existing;
  }
  const created = await api("POST", "/dmps", { token, body: { project_id: projectId } });
  console.log("✓ แผน: สร้างแผนเปล่าใหม่ (ไว้ทดสอบ scoped action ทันที)");
  return { dmp_id: str(created, "dmp_id"), title: str(created, "title") };
}

async function printQuota(token: string): Promise<void> {
  const quota = await api("GET", "/ai/quota", { token });
  const limit = num(quota, "limit");
  const used = num(quota, "used");
  console.log(`✓ quota: ใช้ไป ${String(used)} token / ${limit === 0 ? "ไม่จำกัด (limit 0)" : String(limit)}`);
}

// ── cheat sheet ──────────────────────────────────────────────────────────────
function printCheatSheet(session: Session, project: Project, file: FileRec, dmp: DmpRec): void {
  const analyzeBody = JSON.stringify({ project_id: project.project_id, file_id: file.file_id });
  const base = BASE_URL;
  console.log(
    [
      "",
      "─── ทดสอบด้วย curl (copy ได้เลย) ─────────────────────────────",
      `export API=${base}`,
      `export TOKEN='${session.access_token}'`,
      `# token อายุ 15 นาที — หมดแล้ว sign-in ใหม่ด้วย ${DEMO.username} / ${DEMO.password}:`,
      `#   curl -s $API/auth/sessions -H 'Content-Type: application/json' -d '{"username":"${DEMO.username}","password":"${DEMO.password}"}'`,
      "",
      "# 1) โควตาโทเค็น",
      'curl -s $API/ai/quota -H "Authorization: Bearer $TOKEN"',
      "",
      "# 2) analyze-proposal — ร่างแผนใหม่จาก FF2569 (SSE: -N; โมเดลจริงมีค่าใช้จ่าย, ใช้เวลา ~นาที)",
      "curl -N $API/ai/analyze-proposal \\",
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-analyze-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '${analyzeBody}'`,
      "",
      "# 3) chat บนแผน (SSE)",
      `curl -N $API/dmps/${dmp.dmp_id}/ai/chat \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-chat-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"message":"สรุป proposal นี้สั้น ๆ ว่าศึกษาอะไร มี dataset อะไร"}'`,
      "",
      "# 4) ประวัติ thread (เอา entry_id ไปตัดสิน proposal ในข้อ 5)",
      `curl -s "$API/dmps/${dmp.dmp_id}/ai-thread?limit=20" -H "Authorization: Bearer $TOKEN"`,
      "",
      "# 5) ตัดสิน proposal — <entry_id> จากข้อ 4 (kind=assistant ที่ content.proposal ไม่ null)",
      `curl -X PUT $API/dmps/${dmp.dmp_id}/ai-thread/<entry_id> \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\',
      '  -d \'{"status":"accepted"}\'',
      "",
      "# 6) ซ่อนประวัติที่ยังไม่ถูกตัดสิน",
      `curl -X POST $API/dmps/${dmp.dmp_id}/ai-thread/clear -H "Authorization: Bearer $TOKEN"`,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  await warnIfNotReadyForRealAi();
  await probeServer();
  const session = await ensureSession();
  const token = session.access_token;
  const project = await ensureProject(token);
  const file = await ensureProposal(token, project.project_id);
  const dmp = await ensureDmp(token, project.project_id);
  await printQuota(token);
  console.log(
    `ids → user ${session.user.user_id} | project ${project.project_id} | file ${file.file_id} | dmp ${dmp.dmp_id}`,
  );
  printCheatSheet(session, project, file, dmp);
} catch (cause) {
  console.error(`✗ ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
}
