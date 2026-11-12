// seed-ai — เตรียมชุดข้อมูลเดโมให้มนุษย์ทดสอบ AI API (SPEC-ai) ผ่าน dev server ที่รันอยู่
// ใช้: `pnpm dev` ค้างไว้ แล้ว `pnpm seed:ai` (BASE_URL ปรับได้, default http://localhost:3000)
// ยิง HTTP เท่านั้น — ไม่แตะ DB ตรง; รันซ้ำได้: user/project/proposal/แผน อันไหนมีอยู่แล้วใช้ของเดิม
// ขั้นตอน: register/login (researcher + committee) → project → upload FF2569 (parse+embed sync ใน response)
//          → แผนร่าง (chat/suggest/regenerate-field) → แผนที่ committee อนุมัติแล้ว (generate-tasks/checklist)
//          → พิมพ์ curl cheat sheet พร้อมเงื่อนไขของแต่ละ action
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

// บัญชีคณะกรรมการเดโม — สมัครเองได้เฉพาะ researcher (OC-1) จึงต้องเลื่อน role ใน DB ครั้งเดียว
// (script จะพิมพ์คำสั่ง psql ให้เมื่อยังไม่ได้เลื่อน) ก่อนจะ approve แผนเพื่อปลดล็อก generate-tasks/checklist ได้
const COMMITTEE = {
  username: "demo-committee",
  email: "demo.committee@example.edu",
  password: "demo-passw0rd",
  account_type: "citizen",
  name: "Demo",
  surname: "Committee",
} as const;

const PROJECT_NAME = "[DEMO] ข้อเสนอโครงการ FF2569";
const PROJECT_DESC = "โครงการเดโมสำหรับทดสอบ AI API — มี proposal FF2569 ที่ parse + embed แล้ว";
const PLAN_DRAFT_TITLE = "[DEMO] แผนร่าง (chat/suggest/regenerate-field)";
const PLAN_APPROVED_TITLE = "[DEMO] แผนอนุมัติแล้ว (generate-tasks/checklist)";
const DOCX_PATH = fileURLToPath(new URL("../docs/research/ข้อเสนอโครงการ FF2569.docx", import.meta.url));
const DOCX_NAME = "ข้อเสนอโครงการ FF2569.docx";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** draft ครบตาม validateDraft (ตรง fixture ใน tests/e2e) — ใช้ยื่นแผนเดโมเข้าคณะกรรมการ */
const APPROVAL_DRAFT = {
  title: PLAN_APPROVED_TITLE,
  description: "แผนเดโมผ่าน validateDraft — ยื่นเพื่อให้ committee approve แล้วปลดล็อก generate-tasks/checklist",
  language: "tha",
  begin_date: "2026-11-01",
  end_date: "2028-10-31",
  ethical_issues_exist: false,
  contributor: [{ name: DEMO.name, surname: DEMO.surname, role: "Principal investigator", is_contact: true, email: DEMO.email }],
  cost: [],
  dataset: [
    {
      dataset_id: "ds-demo-ff2569",
      type: "raw",
      title: "ข้อมูลจากข้อเสนอโครงการ FF2569",
      access: "open",
      personal_data: "no",
      sensitive_data: "no",
      protection_level: "other",
      security_classification_level: "public",
      keyword: [],
      domain: "generic",
      domain_metadata: {},
      preservation: { doi_requested: false },
      distribution: [],
    },
  ],
  schema_version: "v3.0",
} as const;

// ── response shapes ที่ script แตะ (แค่ field ที่ใช้) ─────────────────────────
interface Session {
  access_token: string;
  expires_at: string;
  user: { user_id: string; username: string; role: string };
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
  status: string;
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

/** array ดิบ (เช่น versions ใน GET /dmps/:id) — ไม่ใช่ envelope เหมือน listOf */
function arrayOf(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error("response ผิดรูป: คาด array แต่ได้ " + typeof v);
  return v;
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
    user: { user_id: str(user, "user_id"), username: str(user, "username"), role: str(user, "role") },
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

/** หาแผนใต้โครงการด้วยชื่อคงที่ของชุดเดโม — ไม่แตะแผนของคนอื่น */
async function findDmpByTitle(token: string, projectId: string, title: string): Promise<DmpRec | undefined> {
  const query = new URLSearchParams({ project_id: projectId, limit: "100" });
  const list = await api("GET", `/dmps?${String(query)}`, { token });
  return listOf(list)
    .map((d) => d as DmpRec)
    .find((d) => d.title === title);
}

/** แผนร่างสำหรับ scoped action (chat/suggest/regenerate-field) — สถานะใดก็ใช้ได้ จึงไม่ต้องยื่นอนุมัติ */
async function ensureDraftDmp(token: string, projectId: string): Promise<DmpRec> {
  const existing = await findDmpByTitle(token, projectId, PLAN_DRAFT_TITLE);
  if (existing !== undefined) {
    console.log(`✓ แผนร่าง: มีอยู่แล้ว — ใช้ของเดิม`);
    return existing;
  }
  const created = await api("POST", "/dmps", { token, body: { project_id: projectId, title: PLAN_DRAFT_TITLE } });
  const dmp: DmpRec = { dmp_id: str(created, "dmp_id"), title: PLAN_DRAFT_TITLE, status: str(created, "status") };
  // POST /dmps ไม่เก็บ title จาก body — ชื่อแผนมาจาก draft.title เท่านั้น จึงต้อง PUT draft ตั้งชื่อไว้ให้รันซ้ำจับด้วยชื่อ
  await api("PUT", `/dmps/${dmp.dmp_id}/draft`, { token, body: { draft_revision: 0, draft: { title: PLAN_DRAFT_TITLE } } });
  console.log(`✓ แผนร่าง: สร้างใหม่ (ไว้ทดสอบ chat/suggest/regenerate-field ทันที)`);
  return dmp;
}

function warnCommitteePromotion(): void {
  console.warn(
    [
      `⚠ บัญชี ${COMMITTEE.username} ยังไม่ใช่ committee — approve แผนให้ไม่ได้ (สมัครเองได้เฉพาะ researcher — OC-1)`,
      `  เลื่อน role ด้วยคำสั่งนี้ครั้งเดียว แล้วรัน \`pnpm seed:ai\` ซ้ำ:`,
      `  docker compose -f docker-compose.dev.yml exec postgres psql -U postgres -d uni -c "update users set role='committee' where username='${COMMITTEE.username}'"`,
      `  แผนเดโมค้างสถานะ pending — generate-tasks/checklist ยังโดน 409 plan_not_approved จนกว่าจะ approve`,
    ].join("\n"),
  );
}

/** session ของคณะกรรมการเดโม — ยังไม่มีบัญชี (401) ค่อย register (ได้ role researcher รอเลื่อน); ยังไม่ใช่ committee → คืน null */
async function ensureCommitteeSession(): Promise<Session | null> {
  let session: Session;
  try {
    session = toSession(await api("POST", "/auth/sessions", { body: { username: COMMITTEE.username, password: COMMITTEE.password } }));
  } catch (cause) {
    if (!(cause instanceof SeedHttpError) || cause.status !== 401) throw cause;
    const registration = { ...COMMITTEE, confirm_password: COMMITTEE.password };
    try {
      session = toSession(await api("POST", "/users", { body: registration }));
    } catch (registerCause) {
      if (registerCause instanceof SeedHttpError && registerCause.status === 409) {
        throw new Error(`บัญชี ${COMMITTEE.username} มีอยู่แล้วแต่ sign-in ไม่ผ่าน — รหัสผ่านไม่ตรงที่ script ใช้`);
      }
      throw registerCause;
    }
    console.log(`✓ user: ${COMMITTEE.username} — สมัครใหม่ (role researcher — รอเลื่อนเป็น committee)`);
    return null;
  }
  console.log(`✓ user: ${COMMITTEE.username} — ใช้บัญชีเดิม (role ${session.user.role})`);
  if (session.user.role !== "committee" && session.user.role !== "chief") {
    warnCommitteePromotion();
    return null;
  }
  return session;
}

/**
 * แผนที่ committee อนุมัติแล้ว — เงื่อนไขของ generate-tasks/checklist (ยังไม่อนุมัติ → 409 plan_not_approved)
 * ทางเดิน: สร้างแผน → เขียน draft ครบตาม validateDraft → submit (หรือ revisions หลังถูก reject)
 * → approve ด้วยบัญชี committee; approve ไม่ได้ (ยังไม่ได้เลื่อน role) → เตือนแล้วปล่อย pending
 */
async function ensureApprovedDmp(token: string, projectId: string, committee: Session | null): Promise<DmpRec> {
  let dmp = await findDmpByTitle(token, projectId, PLAN_APPROVED_TITLE);
  if (dmp === undefined) {
    const created = await api("POST", "/dmps", { token, body: { project_id: projectId, title: PLAN_APPROVED_TITLE } });
    dmp = { dmp_id: str(created, "dmp_id"), title: str(created, "title"), status: str(created, "status") };
    console.log(`✓ แผนอนุมัติ: สร้างใหม่`);
  }
  if (dmp.status === "approved") {
    console.log(`✓ แผนอนุมัติ: approved อยู่แล้ว — ข้ามขั้น submit/approve`);
    return dmp;
  }
  if (dmp.status === "draft") {
    const detail = await api("GET", `/dmps/${dmp.dmp_id}?include=draft,versions`, { token });
    const revision = num(detail, "draft_revision");
    await api("PUT", `/dmps/${dmp.dmp_id}/draft`, { token, body: { draft_revision: revision, draft: APPROVAL_DRAFT } });
    // submit ได้ครั้งแรกครั้งเดียว — แผนที่เคยถูก reject ยื่นซ้ำผ่าน /revisions
    const hadVersions = arrayOf(pick(detail, "versions")).length > 0;
    const submitted = hadVersions
      ? await api("POST", `/dmps/${dmp.dmp_id}/revisions`, { token, body: { draft_revision: revision + 1 } })
      : await api("POST", `/dmps/${dmp.dmp_id}/submit`, { token, body: { draft_revision: revision + 1 } });
    const number = hadVersions ? num(submitted, "number") : 1;
    console.log(`✓ แผนอนุมัติ: เขียน draft ครบ + ส่งเข้าการพิจารณา (version ${String(number)} pending)`);
    dmp = { ...dmp, status: "pending" };
    if (committee !== null) dmp.status = await approveVersion(committee, dmp, number);
    else console.warn(`⚠ ข้าม approve — แผนค้าง pending (ดูคำเตือนบัญชี committee ด้านบน)`);
    return dmp;
  }
  // pending ค้างจากรอบก่อน — หาเลข version ที่รอพิจารณาแล้ว approve ต่อ
  const detail = await api("GET", `/dmps/${dmp.dmp_id}?include=versions`, { token });
  const pending = arrayOf(pick(detail, "versions"))
    .map((v) => v as { number: number; status: string })
    .find((v) => v.status === "pending");
  if (pending === undefined) {
    console.warn(`⚠ แผนอนุมัติ: สถานะ ${dmp.status} แต่ไม่มี version pending — ตรวจแผนด้วยตัวเองต่อ`);
    return dmp;
  }
  if (committee !== null) dmp.status = await approveVersion(committee, dmp, pending.number);
  else console.warn(`⚠ ข้าม approve — แผนค้าง pending (ดูคำเตือนบัญชี committee ด้านบน)`);
  return dmp;
}

/** approve เวอร์ชันที่รอพิจารณา — คืนสถานะใหม่; ไม่มีสิทธิ์/ตัดสินไปแล้ว → เตือนแล้วคง pending */
async function approveVersion(committee: Session, dmp: DmpRec, number: number): Promise<string> {
  try {
    await api("POST", `/dmps/${dmp.dmp_id}/versions/${String(number)}/approve`, {
      token: committee.access_token,
      body: { position: "Chair", note: "DEMO — seed approve" },
    });
  } catch (cause) {
    if (cause instanceof SeedHttpError && (cause.status === 403 || cause.status === 409)) {
      console.warn(`⚠ approve version ${String(number)} ไม่สำเร็จ (${cause.code}) — แผนยังไม่ approved`);
      warnCommitteePromotion();
      return "pending";
    }
    throw cause;
  }
  console.log(`✓ แผนอนุมัติ: committee approve version ${String(number)} แล้ว — พร้อมทดสอบ generate-tasks/checklist`);
  return "approved";
}

async function printQuota(token: string): Promise<void> {
  const quota = await api("GET", "/ai/quota", { token });
  const limit = num(quota, "limit");
  const used = num(quota, "used");
  console.log(`✓ quota: ใช้ไป ${String(used)} token / ${limit === 0 ? "ไม่จำกัด (limit 0)" : String(limit)}`);
}

// ── cheat sheet ──────────────────────────────────────────────────────────────
function printCheatSheet(session: Session, project: Project, file: FileRec, dmp: DmpRec, approved: DmpRec): void {
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
      "─── เงื่อนไขของ AI action (server บังคับก่อนเริ่ม stream — SPEC-ai) ──",
      "  chat               unscoped หรือใต้ dmp_id ก็ได้ — แผนทุกสถานะ",
      "  suggest            ต้องใต้ dmp_id — แผนทุกสถานะ",
      "  regenerate-field   ต้องใต้ dmp_id — แผนทุกสถานะ",
      "  generate-tasks     ต้องใต้ dmp_id — เฉพาะแผน approved (ยังไม่อนุมัติ → 409 plan_not_approved)",
      "  checklist          เช่นเดียวกับ generate-tasks",
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
      "# 3) chat บนแผนร่าง (SSE)",
      `curl -N $API/dmps/${dmp.dmp_id}/ai/chat \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-chat-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"message":"สรุป proposal นี้สั้น ๆ ว่าศึกษาอะไร มี dataset อะไร"}'`,
      "",
      "# 4) suggest — ใต้แผนร่าง (ทุกสถานะใช้ได้)",
      `curl -N $API/dmps/${dmp.dmp_id}/ai/suggest \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-suggest-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"direction":"เสนอวิธีเก็บรักษา dataset ชุดหลักให้ปลอดภัย"}'`,
      "",
      "# 5) regenerate-field — ใต้แผนร่าง (ทุกสถานะใช้ได้); path = JSON pointer ลง draft",
      `curl -N $API/dmps/${dmp.dmp_id}/ai/regenerate-field \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-regen-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"path":"/dataset/0/title","direction":"เขียนชื่อ dataset ใหม่ให้สื่อความหมายขึ้น"}'`,
      "",
      "# 6) generate-tasks — ใต้แผนที่ committee อนุมัติแล้วเท่านั้น (แผนร่าง/pending → 409 plan_not_approved)",
      `curl -N $API/dmps/${approved.dmp_id}/ai/generate-tasks \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-tasks-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"direction":"ร่าง lifecycle tasks ชุดแรกจากแผน"}'`,
      "",
      "# 7) checklist — เงื่อนไขเดียวกับ generate-tasks; บริบท task ส่งทาง body",
      `curl -N $API/dmps/${approved.dmp_id}/ai/checklist \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: demo-checklist-1" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '{"task_title":"เก็บข้อมูลภาคสนาม","lifecycle_stage":"collect","dataset_title":"ข้อมูลจากข้อเสนอโครงการ FF2569"}'`,
      "",
      "# 8) ประวัติ thread (เอา entry_id ไปตัดสิน proposal ในข้อ 9)",
      `curl -s "$API/dmps/${dmp.dmp_id}/ai-thread?limit=20" -H "Authorization: Bearer $TOKEN"`,
      "",
      "# 9) ตัดสิน proposal — <entry_id> จากข้อ 8 (kind=assistant ที่ content.proposal ไม่ null)",
      `curl -X PUT $API/dmps/${dmp.dmp_id}/ai-thread/<entry_id> \\`,
      '  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\',
      '  -d \'{"status":"accepted"}\'',
      "",
      "# 10) ซ่อนประวัติที่ยังไม่ถูกตัดสิน",
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
  const committee = await ensureCommitteeSession();
  const project = await ensureProject(token);
  const file = await ensureProposal(token, project.project_id);
  const dmp = await ensureDraftDmp(token, project.project_id);
  const approved = await ensureApprovedDmp(token, project.project_id, committee);
  await printQuota(token);
  console.log(
    `ids → user ${session.user.user_id} | project ${project.project_id} | file ${file.file_id} | dmp(ร่าง) ${dmp.dmp_id} | dmp(อนุมัติ=${approved.status}) ${approved.dmp_id}`,
  );
  printCheatSheet(session, project, file, dmp, approved);
} catch (cause) {
  console.error(`✗ ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
}
