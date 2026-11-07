// OpenAPI registry — zod schemas register ที่นี่ เพื่อ gen spec (ADR-0010)
// NOTE: @asteasolutions/zod-to-openapi v9 peer-require zod v4 — ใช้ `zod/v4`
// (มาในตัว zod@3.25) สำหรับ schema ที่ลงทะเบียน; contract จริง (v3 classic) คงอยู่ที่ไฟล์ข้างเคียง
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod/v4";
import { errorEnvelopeSchema } from "./envelope.js";

extendZodWithOpenApi(z as unknown as Parameters<typeof extendZodWithOpenApi>[0]);
export const registry = new OpenAPIRegistry();

export const notificationBatchSchema = z.union([
  z.object({ object: z.literal("notification_batch"), updated: z.number().int() }),
  z.object({ object: z.literal("notification_batch"), deleted: z.number().int() }),
]);

export { errorEnvelopeSchema };

// ── registrations สำหรับ /openapi-json (ADR-0010) ─────────────────────────
// errorEnvelopeSchema (v3) mirror เป็น v4 เพื่อ generator (peer zod v4)
const errorEnvelopeV4 = z.object({
  error: z.object({
    type: z.string(),
    code: z.string(),
    message: z.string(),
    param: z.string().optional(),
  }),
});
// รูปร่าง mirror ตาม notification.ts / task.ts (v3) — spec-facing เท่านั้น
const notificationResponseSchema = z.object({
  object: z.literal("notification"),
  notification_id: z.string(),
  user_id: z.string(),
  type: z.enum([
    "dmp_submitted",
    "dmp_approved",
    "dmp_finalized",
    "tasks_generated",
    "tasks_cancelled",
    "proposal_superseded",
    "review_requested",
    "dmp_returned",
  ]),
  title: z.string().min(1),
  message: z.string().min(1).nullable(),
  link: z.string().nullable(),
  dmp_id: z.string().nullable(),
  project_id: z.string().nullable(),
  read_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});

const taskResponseSchema = z.object({
  task_id: z.string(),
  dmp_id: z.string(),
  dataset_id: z.string().optional(),
  source_version_id: z.string().optional(),
  title: z.string().min(1),
  details: z.string().optional(),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
  progress_percent: z.number().min(0).max(100),
  checklist: z.array(z.object({ item_id: z.string(), label: z.string().min(1), done: z.boolean() })),
  evidence: z.union([
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("file"), file_id: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
    z.object({ type: z.literal("url"), url: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
    z.object({ type: z.literal("rdm_deposit"), doi: z.string(), label: z.string().optional(), attached_at: z.iso.datetime().optional() }),
  ]),
  file_id: z.string().optional(),
  lifecycle_stage: z.string(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  generated_by: z.enum(["ai", "user"]),
  completed_at: z.iso.datetime().optional(),
  completed_by: z.string().optional(),
  cancelled_from: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  cancel_reason: z.enum(["manual", "output_removed"]).optional(),
  cancelled_dataset_title: z.string().optional(),
  cancelled_at: z.iso.datetime().optional(),
});

export const registeredSchemas = {
  ErrorEnvelope: registry.register("ErrorEnvelope", errorEnvelopeV4 as never),
  Notification: registry.register("Notification", notificationResponseSchema as never),
  NotificationBatch: registry.register("NotificationBatch", notificationBatchSchema as never),
  Task: registry.register("Task", taskResponseSchema as never),
};

// extendZodWithOpenApi เติม .openapi บน prototype ตอน runtime; zod/v4 subpath ไม่มี typing นี้ — cast ครั้งเดียวที่นี่
// NB: .openapi() คืน instance ใหม่ที่แปะ metadata แล้ว (ต้นฉบับไม่แก้) — ต้องใช้ค่าที่คืน
function oa<T>(schema: T, meta: Record<string, unknown>): T {
  const patched = schema as { openapi: (m: Record<string, unknown>) => T };
  return patched.openapi(meta);
}

// ── session responses (mirror ของ buildSession + toUserResponse) ──────────
const sessionUserSchema = z.object({
  object: z.literal("user"),
  user_id: z.string(),
  title: z.string().nullable(),
  name: z.string(),
  surname: z.string(),
  email: z.string(),
  role: z.enum(["admin", "chief", "committee", "researcher"]),
  username: z.string(),
  ai_token_limit: z.number().int(),
  ai_token_used: z.number().int(),
  account_type: z.enum(["institutional", "citizen"]).nullable(),
  phone: z.string().nullable(),
  orcid: z.string().nullable(),
  affiliation: z
    .object({
      organization: z.string(),
      department: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
    })
    .nullable(),
  address: z.string().nullable(),
});

export const Session = registry.register(
  "Session",
  z.object({
    object: z.literal("session"),
    access_token: oa(z.string(), { description: "JWT access token (HS256) — แนบเป็น `Authorization: Bearer <token>`" }),
    token_type: z.literal("Bearer"),
    expires_at: oa(z.iso.datetime(), { description: "เวลาหมดอายุ access token (config: auth.accessTokenTtlMinutes)" }),
    user: sessionUserSchema,
  }) as never,
);

const signInRequestSchema = z.object({
  username: oa(z.string().min(1), { description: "ชื่อผู้ใช้ (ระบบ normalize เป็นตัวพิมพ์เล็กเอง)", example: "somchai.j" }),
  password: oa(z.string().min(1), { description: "รหัสผ่าน", example: "correct-horse" }),
});

registry.registerPath({
  path: "/auth/sessions",
  method: "post",
  tags: ["Auth"],
  summary: "Sign in — ได้ session (access token ใน body, refresh token ใน HttpOnly cookie)",
  operationId: "signIn",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: signInRequestSchema as never,
          example: { username: "somchai.j", password: "correct-horse" },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Sign in สำเร็จ — refresh token ถูกตั้งเป็น HttpOnly cookie `refresh_token`",
      content: {
        "application/json": {
          schema: Session,
          example: {
            object: "session",
            access_token: "eyJhbGciOiJIUzI1NiJ9...",
            token_type: "Bearer",
            expires_at: "2026-11-07T03:05:00.000Z",
            user: {
              object: "user",
              user_id: "0b8f6c1e-9d21-4f5a-8b3c-2e7a1d4f6a9b",
              title: "Dr.",
              name: "Somchai",
              surname: "Jaidee",
              email: "somchai.j@university.ac.th",
              role: "researcher",
              username: "somchai.j",
              ai_token_limit: 100000,
              ai_token_used: 0,
              account_type: "institutional",
              phone: null,
              orcid: null,
              affiliation: { organization: "Chulalongkorn University" },
              address: null,
            },
          },
        },
      },
    },
    400: {
      description: [
        "คำขอไม่ถูกต้อง:",
        "- `parameter_missing` — ไม่ส่ง username หรือ password",
        "- `field_invalid` — ชนิดข้อมูลผิด (`param` เป็น JSON pointer ชี้ field)",
      ].join("\n"),
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "parameter_missing", message: "username or password is empty" } },
        },
      },
    },
    401: {
      description: "- `invalid_credentials` — username/password ไม่ถูกต้อง (คำเดียวกันทั้ง username ไม่มีจริงและรหัสผิด — ไม่เปิดเผย)",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "authentication_error", code: "invalid_credentials", message: "Username or password is incorrect" } },
        },
      },
    },
  },
});

// ── @Public endpoints ที่ยังไม่มีรายละเอียดเต็ม — ประกาศ security: [] กันโดน default bearer ──
registry.registerPath({
  path: "/auth/refresh",
  method: "post",
  tags: ["Auth"],
  summary: "Refresh — หมุน access token ใหม่จาก HttpOnly cookie (rotation + reuse detection)",
  security: [],
  responses: {
    200: { description: "Session ใหม่ (รูปร่างเดียวกับ sign-in) — คืน 401 `refresh_token_reused` ถ้าตรวจพบการใช้ token ซ้ำ และจะ revoke ทุก session ใน family" },
  },
});

registry.registerPath({
  path: "/auth/sessions/current",
  method: "delete",
  tags: ["Auth"],
  summary: "Sign out — ลบ refresh token ปัจจุบัน + เคลียร์ cookie",
  security: [],
  responses: {
    200: { description: "ออกจากระบบสำเร็จ", content: { "application/json": { example: { object: "session", deleted: true } } } },
  },
});

// mirror ของ registrationSchema (contracts/registration.ts, v3) — spec-facing เท่านั้น
const registrationRequestSchema = z.object({
  account_type: oa(z.enum(["institutional", "citizen"]), {
    description: "institutional = นักวิจัยสถาบัน (ต้องระบุ organization), citizen = ประชาชนทั่วไป",
    example: "institutional",
  }),
  title: oa(z.string().optional(), { description: "คำนำหน้า เช่น Dr., Asst.Prof.", example: "Dr." }),
  name: oa(z.string().min(1), { description: "ชื่อ", example: "Somchai" }),
  surname: oa(z.string().min(1), { description: "นามสกุล", example: "Jaidee" }),
  email: oa(z.string(), { description: "อีเมลสถาบัน/ส่วนตัว (unique)", example: "somchai.j@university.ac.th" }),
  phone: oa(z.string().optional(), { description: "9–15 หลัก อนุญาต + และขีด", example: "+66 2 123 4567" }),
  orcid: oa(z.string().optional(), { description: "รูปแบบ 0000-0002-1825-0097", example: "0000-0002-1825-0097" }),
  organization: oa(z.string().optional(), { description: "สถาบันสังกัด — **บังคับเมื่อ account_type = institutional**", example: "Chulalongkorn University" }),
  department: oa(z.string().optional(), { example: "Computer Engineering" }),
  position: oa(z.string().optional(), { example: "Assistant Professor" }),
  address: oa(z.string().optional(), { description: "ที่อยู่ — เฉพาะ citizen researcher", example: "Bangkok" }),
  username: oa(z.string().min(3).max(30), {
    description: "3–30 ตัวอักษรพิมพ์เล็ก a-z, ตัวเลข, . _ - (ระบบ lowercase ให้เอง)",
    example: "somchai.j",
  }),
  password: oa(z.string().min(8), { description: "≥8 ตัว ต้องมีทั้งตัวอักษรและตัวเลข", example: "correct-horse-9" }),
  confirm_password: oa(z.string(), { description: "ต้องตรงกับ password", example: "correct-horse-9" }),
});

registry.registerPath({
  path: "/users",
  method: "post",
  tags: ["Users"],
  summary: "Register — สมัครผู้ใช้ใหม่แล้ว sign-in ทันที (คืน session เดียวกับ sign-in)",
  operationId: "register",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: registrationRequestSchema as never,
          examples: {
            institutional: {
              summary: "นักวิจัยสถาบัน — ต้องมี organization",
              value: {
                account_type: "institutional",
                title: "Dr.",
                name: "Somchai",
                surname: "Jaidee",
                email: "somchai.j@university.ac.th",
                organization: "Chulalongkorn University",
                department: "Computer Engineering",
                position: "Assistant Professor",
                username: "somchai.j",
                password: "correct-horse-9",
                confirm_password: "correct-horse-9",
              },
            },
            citizen: {
              summary: "ประชาชนทั่วไป — ไม่มีสถาบัน มี address ได้",
              value: {
                account_type: "citizen",
                name: "Somchai",
                surname: "Jaidee",
                email: "somchai.j@gmail.com",
                address: "Bangkok",
                username: "somchai.j",
                password: "correct-horse-9",
                confirm_password: "correct-horse-9",
              },
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "สมัครสำเร็จ — sign-in ทันที (รูปร่าง response เดียวกับ POST /auth/sessions, refresh token อยู่ใน HttpOnly cookie)",
      content: { "application/json": { schema: Session, example: {
        object: "session",
        access_token: "eyJhbGciOiJIUzI1NiJ9...",
        token_type: "Bearer",
        expires_at: "2026-11-07T03:05:00.000Z",
        user: { object: "user", user_id: "0b8f6c1e-9d21-4f5a-8b3c-2e7a1d4f6a9b", title: "Dr.", name: "Somchai", surname: "Jaidee", email: "somchai.j@university.ac.th", role: "researcher", username: "somchai.j", ai_token_limit: 100000, ai_token_used: 0, account_type: "institutional", phone: null, orcid: null, affiliation: { organization: "Chulalongkorn University" }, address: null },
      } } },
    },
    400: {
      description: [
        "- `role_not_allowed` — ส่ง `role` มาใน body (บทบาทอื่นสถาบันสร้างให้ สมัครเองไม่ได้)",
        "- `field_invalid` — body ผิดรูป เช่น password สั้น/ไม่มีตัวเลข, confirm_password ไม่ตรง, institutional ไม่กรอก organization (`param` = JSON pointer ชี้ field แรกที่ผิด)",
      ].join("\n"),
      content: { "application/json": { schema: registeredSchemas.ErrorEnvelope, example: { error: { type: "invalid_request_error", code: "field_invalid", message: "Passwords don't match", param: "/confirm_password" } } } },
    },
    409: {
      description: [
        "- `username_taken` — username ถูกใช้แล้ว (เช็คล่วงหน้าด้วย GET /users/username-available)",
        "- `email_taken` — อีเมลถูกใช้โดยบัญชีอื่น",
      ].join("\n"),
      content: { "application/json": { schema: registeredSchemas.ErrorEnvelope, example: { error: { type: "conflict_error", code: "username_taken", message: "That username is already in use" } } } },
    },
  },
});
// ── GET /users/username-available ──────────────────────────────────────────
export const UsernameAvailability = registry.register(
  "UsernameAvailability",
  z.object({
    object: z.literal("username_availability"),
    username: oa(z.string(), { description: "ค่าหลัง normalize (trim + lowercase) แล้ว" }),
    available: z.boolean(),
  }) as never,
);

registry.registerPath({
  path: "/users/username-available",
  method: "get",
  tags: ["Users"],
  summary: "ตรวจว่า username ยังว่างอยู่ไหม (สำหรับ live check ตอนสมัคร)",
  operationId: "usernameAvailable",
  security: [],
  request: {
    // lib รับ query เป็น ZodObject เดียว — แต่ละ key กลายเป็น query parameter เอง
    query: z.object({
      username: oa(z.string().min(1), { description: "ชื่อผู้ใช้ที่ต้องการตรวจ", example: "somchai.j" }),
    }),
  },
  responses: {
    200: {
      description: "ผลการตรวจ",
      content: {
        "application/json": {
          schema: UsernameAvailability,
          example: { object: "username_availability", username: "somchai.j", available: true },
        },
      },
    },
    400: {
      description: "- `parameter_missing` — ไม่ส่ง query `username` (`param` = `/username`)",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "parameter_missing", message: "No username", param: "/username" } },
        },
      },
    },
  },
});

// ── POST bodies — example ทุก endpoint (projects/plans/files/tasks) ────────

const fieldInvalid400 = {
  description: "- `field_invalid` — body ผิดรูป (`param` = JSON pointer ชี้ field แรกที่ผิด)",
  content: {
    "application/json": {
      schema: registeredSchemas.ErrorEnvelope,
      example: { error: { type: "invalid_request_error", code: "field_invalid", message: "Invalid input", param: "/draft_revision" } },
    },
  },
};

// ── POST /projects ────────────────────────────────────────────────────────
const createProjectRequestSchema = z.object({
  project_name: oa(z.string().min(1), { description: "ชื่อโครงการ", example: "โครงการดิจิทัลภาพถ่ายมรดกไทย" }),
  description: oa(z.string().optional(), { description: "คำอธิบายโครงการ", example: "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata" }),
  proposal_file_id: oa(z.string().optional(), {
    description: "file id ของไฟล์ proposal (.docx) ที่อัปโหลดแล้วผ่าน POST /projects/{projectId}/files (purpose=proposal)",
    example: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  }),
});

registry.registerPath({
  path: "/projects",
  method: "post",
  tags: ["Projects"],
  summary: "สร้างโครงการ",
  operationId: "createProject",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createProjectRequestSchema as never,
          example: {
            project_name: "โครงการดิจิทัลภาพถ่ายมรดกไทย",
            description: "แปลงภาพถ่ายโบราณสถานเป็นดิจิทัลพร้อม metadata",
            proposal_file_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
          },
        },
      },
    },
  },
  responses: {
    201: { description: "สร้างโครงการสำเร็จ" },
    400: fieldInvalid400,
  },
});

// ── POST /dmps ────────────────────────────────────────────────────────────
const createDmpRequestSchema = z.object({
  project_id: oa(z.uuid().optional(), {
    description: "โครงการที่แผนนี้ผูกอยู่ — ใส่ = แผน institutional (ตัดสินโดยคณะกรรมการ), เว้น = แผน independent (finalize เอง)",
    example: "1b4f0e28-9a71-4d5c-8f2e-3a6b9c0d5e81",
  }),
});

registry.registerPath({
  path: "/dmps",
  method: "post",
  tags: ["Plans"],
  summary: "สร้างแผน (DMP) — researcher เท่านั้น",
  operationId: "createDmp",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createDmpRequestSchema as never,
          examples: {
            institutional: {
              summary: "แผนสถาบัน — ผูกโครงการ ตัดสินโดยคณะกรรมการ",
              value: { project_id: "1b4f0e28-9a71-4d5c-8f2e-3a6b9c0d5e81" },
            },
            independent: {
              summary: "แผนอิสระ — ไม่ผูกโครงการ finalize เอง",
              value: {},
            },
          },
        },
      },
    },
  },
  responses: {
    201: { description: "สร้างแผนสำเร็จ (draft เปล่า พร้อม draft_revision = 0)" },
    400: fieldInvalid400,
    403: { description: "- `not_a_researcher` — บทบาทอื่นสร้างแผนไม่ได้" },
    404: { description: "- `project_not_found` — ไม่มีโครงการนั้น หรือไม่ใช่โครงการของผู้เรียก" },
  },
});

// ── POST /dmps/{dmpId}/draft/restore ──────────────────────────────────────
registry.registerPath({
  path: "/dmps/{dmpId}/draft/restore",
  method: "post",
  tags: ["Plans"],
  summary: "โหลด snapshot ของเวอร์ชันเข้า working draft",
  operationId: "restoreDmpVersion",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            number: oa(z.number().int().min(1), { description: "หมายเลขเวอร์ชันที่จะ restore", example: 2 }),
            draft_revision: oa(z.number().int().nonnegative(), {
              description: "draft_revision ปัจจุบัน (CAS — ไม่ตรง → 409 draft_conflict)",
              example: 0,
            }),
          }) as never,
          example: { number: 2, draft_revision: 0 },
        },
      },
    },
  },
  responses: {
    201: { description: "Restore สำเร็จ — คืนแผนพร้อม draft ใหม่" },
    400: fieldInvalid400,
    409: { description: "- `draft_conflict` — draft ถูกแก้หลังอ่าน / `version_pending` — เวอร์ชันนั้นยังรอพิจารณา" },
  },
});

// ── approve / reject ──────────────────────────────────────────────────────
const decideRequestSchema = z.object({
  position: oa(z.string().trim().min(1), { description: "ตำแหน่งของผู้ตัดสิน (บันทึกใน approver)", example: "กรรมการสภาวิจัย" }),
  note: oa(z.string().trim().optional(), { description: "หมายเหตุ — approve: เว้นได้, reject: **บังคับ** (ไม่มี → 400 note_required)" }),
});

registry.registerPath({
  path: "/dmps/{dmpId}/versions/{number}/approve",
  method: "post",
  tags: ["Plans"],
  summary: "อนุมัติเวอร์ชัน — committee/chief เท่านั้น (approve → แผนมีผล + generate tasks)",
  operationId: "approveDmpVersion",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: decideRequestSchema as never,
          example: { position: "กรรมการสภาวิจัย", note: "ผ่านการพิจารณา" },
        },
      },
    },
  },
  responses: {
    201: { description: "อนุมัติสำเร็จ — คืนเวอร์ชันพร้อม approver/carried_minor_edits/dropped_minor_edits" },
    400: fieldInvalid400,
    403: { description: "- `plan_not_reviewable` — แผน independent คณะกรรมมีไม่มีส่วนเกี่ยว" },
    409: { description: "- `version_not_pending` — เวอร์ชันนั้นตัดสินไปแล้ว" },
  },
});

registry.registerPath({
  path: "/dmps/{dmpId}/versions/{number}/reject",
  method: "post",
  tags: ["Plans"],
  summary: "ส่งเวอร์ชันกลับ — committee/chief เท่านั้น (note บังคับ)",
  operationId: "rejectDmpVersion",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: decideRequestSchema as never,
          example: { position: "กรรมการสภาวิจัย", note: "ส่วนอนุรักษ์ยังไม่ระบุมาตรฐานการเก็บรักษา" },
        },
      },
    },
  },
  responses: {
    201: { description: "ส่งกลับสำเร็จ — คืนเวอร์ชันพร้อม approver และ plan_status" },
    400: {
      description: "- `note_required` — ส่งกลับต้องมีเหตุผล (`param` = `/note`) / `field_invalid` — body ผิดรูป",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "note_required", message: "A version can't be sent back without a reason", param: "/note" } },
        },
      },
    },
    409: { description: "- `version_not_pending` — เวอร์ชันนั้นตัดสินไปแล้ว" },
  },
});

// ── draft_revision เดียว — minor-edits / revisions / submit / finalize ────
const revisionRequestSchema = z.object({
  draft_revision: oa(z.number().int().nonnegative(), {
    description: "draft_revision ปัจจุบัน (CAS — ไม่ตรง → 409 draft_conflict)",
    example: 3,
  }),
});

function registerRevisionPost(path: string, operationId: string, summary: string) {
  registry.registerPath({
    path,
    method: "post",
    tags: ["Plans"],
    summary,
    operationId,
    request: {
      body: {
        required: true,
        content: {
          "application/json": { schema: revisionRequestSchema as never, example: { draft_revision: 3 } },
        },
      },
    },
    responses: {
      201: { description: "สำเร็จ" },
      400: fieldInvalid400,
      409: { description: "- `draft_conflict` — draft ถูกแก้หลังอ่าน (CAS) / โค้ด 409 เฉพาะของแต่ละ use-case" },
    },
  });
}

registerRevisionPost("/dmps/{dmpId}/minor-edits", "saveDmpMinorEdits", "บันทึก minor edits — fold ลงเวอร์ชันที่มีผลทันที (แก้ major ไม่ได้)");
registerRevisionPost("/dmps/{dmpId}/revisions", "submitDmpRevision", "ส่ง revision เข้าพิจารณา — institutional เท่านั้น หนึ่ง pending ต่อแผน");
registerRevisionPost("/dmps/{dmpId}/submit", "submitDmp", "ส่งแผนเข้าพิจารณา (version 1 pending) — institutional เท่านั้น ต้องผ่าน checklist");
registerRevisionPost("/dmps/{dmpId}/finalize", "finalizeDmp", "ประกาศแผนให้มีผลเอง (independent) — generate tasks จาก outputs ทันที");

// ── POST /projects/{projectId}/files — multipart ──────────────────────────
registry.registerPath({
  path: "/projects/{projectId}/files",
  method: "post",
  tags: ["Files"],
  summary: "อัปโหลดไฟล์เข้าโครงการ (multipart/form-data) — proposal ต้องเป็น .docx",
  operationId: "uploadProjectFile",
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              file: { type: "string", format: "binary", description: "เนื้อไฟล์ — proposal ต้องเป็น .docx" },
              purpose: {
                type: "string",
                enum: ["proposal", "task_deliverable", "evidence"],
                description: "จุดประสงค์ของไฟล์",
              },
            },
            required: ["file", "purpose"],
          },
        },
      },
    },
  },
  responses: {
    201: { description: "อัปโหลดสำเร็จ — คืน file record (docx จะถูก parse → chunk → embed อัตโนมัติ)" },
    400: { description: "- `invalid_purpose` — purpose ไม่อยู่ใน 3 ค่า / `field_invalid` — ไม่มีไฟล์ / `file_type_not_allowed` — proposal ไม่ใช่ .docx" },
    413: { description: "- `file_too_large` — ไฟล์เกินขนาดสูงสุด (config.toml)" },
    422: { description: "- `file_unparseable` — อ่าน .docx ไม่ได้" },
  },
});

// ── POST /tasks ───────────────────────────────────────────────────────────
const createTaskRequestSchema = z.object({
  dmp_id: oa(z.string(), { description: "แผนที่งานนี้สังกัด", example: "5d2b7c1a-4e8f-4b3a-9c6d-1f0a2b3c4d5e" }),
  dataset_id: oa(z.string().optional(), { description: "output ที่งานนี้ทำหน้าที่ — ต้องอยู่ในเวอร์ชันที่มีผล", example: "ds-photos-001" }),
  title: oa(z.string().min(1), { description: "ชื่องาน", example: "ถ่ายภาพซ้ำชุดเก็บรักษา" }),
  details: oa(z.string().optional(), { description: "รายละเอียด", example: "ถ่าย 3 มุม อัตรา 600 dpi" }),
  start_date: oa(z.string().optional(), { description: "วันเริ่ม (ISO 8601)", example: "2026-11-10" }),
  end_date: oa(z.string().optional(), { description: "วันสิ้นสุด — ต้องไม่ก่อน start_date", example: "2026-12-01" }),
  lifecycle_stage: oa(z.enum(["collect", "process", "analyse", "preserve", "share"]), { description: "ระยะวงจรชีวิตข้อมูล", example: "preserve" }),
  priority: oa(z.enum(["low", "medium", "high"]).optional(), { description: "ค่าเริ่มต้น medium", example: "high" }),
});

registry.registerPath({
  path: "/tasks",
  method: "post",
  tags: ["Tasks"],
  summary: "สร้างงานใหม่ — researcher เท่านั้น (generated_by บังคับ user เสมอ)",
  operationId: "createTask",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createTaskRequestSchema as never,
          example: {
            dmp_id: "5d2b7c1a-4e8f-4b3a-9c6d-1f0a2b3c4d5e",
            dataset_id: "ds-photos-001",
            title: "ถ่ายภาพซ้ำชุดเก็บรักษา",
            details: "ถ่าย 3 มุม อัตรา 600 dpi",
            start_date: "2026-11-10",
            end_date: "2026-12-01",
            lifecycle_stage: "preserve",
            priority: "high",
          },
        },
      },
    },
  },
  responses: {
    201: { description: "สร้างงานสำเร็จ" },
    400: fieldInvalid400,
    403: { description: "- `not_a_researcher` — บทบาทอื่นสร้างงานไม่ได้" },
  },
});

// ── POST /dmps/{dmpId}/tasks/generated ────────────────────────────────────
const generatedRequestSchema = z.object({
  mode: oa(z.enum(["add", "replace"]), {
    description: "add = เพิ่มบนงานเดิม, replace = ลบ AI task ที่ยังไม่ถูกแตะก่อนเพิ่ม",
    example: "replace",
  }),
  tasks: z.array(
    z.object({
      dataset_id: oa(z.string().optional(), { description: "output ที่งานผูก — ต้องอยู่ในเวอร์ชันที่มีผล", example: "ds-photos-001" }),
      title: oa(z.string().min(1), { example: "จัดทำ metadata ชุดภาพถ่าย" }),
      details: oa(z.string().nullish(), { example: "กรอก Dublin Core ให้ครบทุกภาพ" }),
      lifecycle_stage: oa(z.enum(["collect", "process", "analyse", "preserve", "share"]), { example: "process" }),
      priority: oa(z.enum(["low", "medium", "high"]).optional(), { description: "ค่าเริ่มต้น medium", example: "medium" }),
      start_date: oa(z.string().optional(), { example: "2026-11-15" }),
      end_date: oa(z.string().optional(), { example: "2026-11-30" }),
    }),
  ),
});

registry.registerPath({
  path: "/dmps/{dmpId}/tasks/generated",
  method: "post",
  tags: ["Tasks"],
  summary: "นำเข้าชุดงานที่ AI เสนอ (mode add|replace)",
  operationId: "importGeneratedTasks",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: generatedRequestSchema as never,
          example: {
            mode: "replace",
            tasks: [
              { dataset_id: "ds-photos-001", title: "จัดทำ metadata ชุดภาพถ่าย", details: "กรอก Dublin Core ให้ครบทุกภาพ", lifecycle_stage: "process", priority: "medium" },
              { title: "เตรียมแผนสำรองข้อมูล", lifecycle_stage: "preserve", priority: "high", start_date: "2026-11-15", end_date: "2026-11-30" },
            ],
          },
        },
      },
    },
  },
  responses: {
    201: { description: "คืน { object: generated_tasks, added, removed, kept, data }" },
    400: { description: "- `field_invalid` — body ผิดรูป / `dataset_not_in_force` — output ไม่อยู่ในเวอร์ชันที่มีผล" },
  },
});

// ── POST /tasks/{taskId}/checklist ────────────────────────────────────────
registry.registerPath({
  path: "/tasks/{taskId}/checklist",
  method: "post",
  tags: ["Tasks"],
  summary: "เพิ่ม step ใน checklist ของงาน",
  operationId: "addTaskChecklistItem",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            label: oa(z.string(), { description: "ชื่อ step (ว่าง → 400 label_required)", example: "ถ่ายภาพมุมหน้า" }),
          }) as never,
          example: { label: "ถ่ายภาพมุมหน้า" },
        },
      },
    },
  },
  responses: {
    201: { description: "คืนงานพร้อม checklist ใหม่ (item_id สร้างให้เอง, done = false)" },
    400: {
      description: "- `field_invalid` — body ผิดรูป / `label_required` — label ว่าง",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "label_required", message: "The step needs a label", param: "/label" } },
        },
      },
    },
  },
});

// ── POST /reopen-offers/{offerId}/accept ──────────────────────────────────
registry.registerPath({
  path: "/reopen-offers/{offerId}/accept",
  method: "post",
  tags: ["Tasks"],
  summary: "รับ offer เปิดงานคืน (หลัง output ที่ถูก cancel กลับมา) — เลือกงานที่จะเปิดคืน",
  operationId: "acceptReopenOffer",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            task_ids: oa(z.array(z.string()).min(1), {
              description: "งานที่จะเปิดคืน — ต้องเป็นงานใน offer นี้เท่านั้น",
            }) as never,
          }) as never,
          example: {
            task_ids: ["a1c3e5f7-2b4d-4f6a-8c0e-9d1b3a5c7e9f", "b2d4f6a8-3c5e-4a7b-9d1f-0e2a4b6d8f0a"],
          },
        },
      },
    },
  },
  responses: {
    201: { description: "คืน { object: reopen_offer, reopened, data }" },
    400: { description: "- `field_invalid` — body ผิดรูป / `task_not_offered` — งานไม่อยู่ใน offer นี้" },
  },
});

// ── PUT/PATCH bodies — example ทุก endpoint ───────────────────────────────

// ── PUT /dmps/{dmpId}/draft — ส่ง draft ทั้งก้อน + CAS (ADR-0020) ─────────
registry.registerPath({
  path: "/dmps/{dmpId}/draft",
  method: "put",
  tags: ["Plans"],
  summary: "บันทึก working draft ทั้งก้อน (CAS บน draft_revision) — researcher เจ้าของแผนเท่านั้น",
  operationId: "saveDmpDraft",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            draft_revision: oa(z.number().int().nonnegative(), {
              description: "draft_revision ที่ได้จากการอ่านครั้งล่าสุด (ไม่ตรง → 409 draft_conflict พร้อม draft ปัจจุบันให้ rebase)",
              example: 2,
            }),
            draft: oa(z.record(z.string(), z.unknown()), {
              description: "เนื้อ draft ทั้งก้อน (maDMP แบบบางส่วนได้) — field locked: schema_version (และ begin/end_date เมื่อแผนมีผลแล้ว)",
              example: {
                title: "แผนการจัดการข้อมูลโครงการดิจิทัลภาพถ่ายมรดกไทย",
                description: "จัดเก็บและเผยแพร่ภาพถ่ายโบราณสถานอย่างยั่งยืน",
                language: "th",
                begin_date: "2026-11-01",
                end_date: "2027-10-31",
                ethical_issues_exist: false,
                contributor: [
                  { name: "Somchai", surname: "Jaidee", role: "principal_investigator", email: "somchai.j@university.ac.th", is_contact: true },
                ],
                dataset: [
                  {
                    type: "raw",
                    title: "ภาพถ่ายดิบจากการถ่ายซ้ำ",
                    access: "closed",
                    personal_data: "yes",
                    sensitive_data: "no",
                    protection_level: "restricted access",
                    security_classification_level: "internal",
                  },
                ],
              },
            }),
          }) as never,
          example: {
            draft_revision: 2,
            draft: {
              title: "แผนการจัดการข้อมูลโครงการดิจิทัลภาพถ่ายมรดกไทย",
              description: "จัดเก็บและเผยแพร่ภาพถ่ายโบราณสถานอย่างยั่งยืน",
              language: "th",
              begin_date: "2026-11-01",
              end_date: "2027-10-31",
              ethical_issues_exist: false,
              contributor: [
                { name: "Somchai", surname: "Jaidee", role: "principal_investigator", email: "somchai.j@university.ac.th", is_contact: true },
              ],
              dataset: [
                {
                  type: "raw",
                  title: "ภาพถ่ายดิบจากการถ่ายซ้ำ",
                  access: "closed",
                  personal_data: "yes",
                  sensitive_data: "no",
                  protection_level: "restricted access",
                  security_classification_level: "internal",
                },
              ],
            },
          },
        },
      },
    },
  },
  responses: {
    200: { description: "บันทึกสำเร็จ — คืน { object: dmp_draft, dmp_id, draft_revision (เพิ่มแล้ว), draft }" },
    400: {
      description: "- `field_invalid` — body ผิดรูป / `field_locked` — แก้ locked field (`param` = `/draft/<field>`)",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "field_locked", message: "The schema_version field is locked", param: "/draft/schema_version" } },
        },
      },
    },
    409: {
      description: "- `draft_conflict` — draft ถูกแก้หลังอ่าน (คืน draft ปัจจุบัน + draft_revision ให้ rebase)",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "conflict_error", code: "draft_conflict", message: "The draft changed since your last read", draft: {}, draft_revision: 3 } },
        },
      },
    },
  },
});

// ── PATCH /tasks/{taskId} ─────────────────────────────────────────────────
registry.registerPath({
  path: "/tasks/{taskId}",
  method: "patch",
  tags: ["Tasks"],
  summary: "แก้งานบางส่วน (ส่งเฉพาะ field ที่จะแก้) — เปลี่ยน dataset ของงานที่เสร็จแล้ว → 409 output_locked",
  operationId: "updateTask",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            title: oa(z.string().min(1).optional(), { example: "ถ่ายภาพซ้ำชุดเก็บรักษา (ฉบับแก้ไข)" }),
            details: oa(z.string().nullish(), { example: "ถ่าย 4 มุม อัตรา 600 dpi" }),
            dataset_id: oa(z.string().nullish(), { description: "output ที่งานผูก — ต้องอยู่ในเวอร์ชันที่มีผล", example: "ds-photos-001" }),
            start_date: oa(z.string().optional(), { example: "2026-11-12" }),
            end_date: oa(z.string().optional(), { example: "2026-12-05" }),
            lifecycle_stage: oa(z.enum(["collect", "process", "analyse", "preserve", "share"]).optional(), { example: "preserve" }),
            status: oa(z.enum(["todo", "in_progress", "cancelled"]).optional(), {
              description: "ทำเสร็จต้องใช้ POST /tasks/{taskId}/complete — ส่ง done มา → 409 use_complete",
              example: "in_progress",
            }),
            priority: oa(z.enum(["low", "medium", "high"]).optional(), { example: "high" }),
          }) as never,
          example: { title: "ถ่ายภาพซ้ำชุดเก็บรักษา (ฉบับแก้ไข)", status: "in_progress", priority: "high", end_date: "2026-12-05" },
        },
      },
    },
  },
  responses: {
    200: { description: "แก้สำเร็จ — คืนงานทั้งก้อน" },
    400: fieldInvalid400,
    409: { description: "- `use_complete` — ส่ง status=done / `output_locked` — เปลี่ยน dataset ของงานที่เสร็จแล้ว" },
  },
});

// ── PUT /tasks/{taskId}/checklist — แทนที่ทั้ง checklist ──────────────────
registry.registerPath({
  path: "/tasks/{taskId}/checklist",
  method: "put",
  tags: ["Tasks"],
  summary: "แทนที่ checklist ทั้งชุด — step ที่ tick แล้วจะรอด (preservation), progress_percent คำนวณให้เอง",
  operationId: "replaceTaskChecklist",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            labels: oa(z.array(z.string()), { description: "ชื่อ step ทั้งหมด (item_id/done สร้างให้ใหม่เอง)", example: ["ถ่ายภาพมุมหน้า", "ถ่ายภาพมุมข้าง", "ตรวจสี"] }) as never,
          }) as never,
          example: { labels: ["ถ่ายภาพมุมหน้า", "ถ่ายภาพมุมข้าง", "ตรวจสี"] },
        },
      },
    },
  },
  responses: {
    200: { description: "คืนงานพร้อม checklist ใหม่" },
    400: fieldInvalid400,
  },
});

// ── PATCH /tasks/{taskId}/checklist/{itemId} ──────────────────────────────
registry.registerPath({
  path: "/tasks/{taskId}/checklist/{itemId}",
  method: "patch",
  tags: ["Tasks"],
  summary: "tick หรือแก้ชื่อ step ใน checklist",
  operationId: "patchTaskChecklistItem",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            label: oa(z.string().optional(), { description: "ชื่อ step ใหม่ (เว้น = คงเดิม)", example: "ถ่ายภาพมุมหน้า" }),
            done: oa(z.boolean().optional(), { description: "สถานะ tick (เว้น = คงเดิม)", example: true }),
          }) as never,
          example: { done: true },
        },
      },
    },
  },
  responses: {
    200: { description: "คืนงานพร้อม checklist ที่แก้แล้ว" },
    400: fieldInvalid400,
    404: { description: "- `item_not_found` — งานไม่มี step ตาม id นั้น" },
  },
});

// ── PUT /tasks/{taskId}/evidence ──────────────────────────────────────────
registry.registerPath({
  path: "/tasks/{taskId}/evidence",
  method: "put",
  tags: ["Tasks"],
  summary: "ตั้งหลักฐานการทำงาน — DOI ที่วางมาเองถูก classify เป็น rdm_deposit เสมอ",
  operationId: "setTaskEvidence",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            type: oa(z.enum(["none", "file", "url", "rdm_deposit"]), {
              description: "none = ไม่มีหลักฐาน, file = ไฟล์ output บนโครงการ, url = ลิงก์, rdm_deposit = DOI จาก repository",
              example: "rdm_deposit",
            }),
            ref: oa(z.string().optional(), {
              description: "file id / URL / DOI ตาม type — ต้องมีเมื่อ type ≠ none (ไม่มี → 400 ref_required)",
              example: "10.5281/zenodo.10245312",
            }),
            label: oa(z.string().optional(), { description: "ชื่อแสดงผลของหลักฐาน", example: "เก็บใน Zenodo แล้ว" }),
          }) as never,
          examples: {
            rdm_deposit: {
              summary: "DOI จาก repository — วาง URL ของ doi.org ก็ถูก classify เป็น rdm_deposit",
              value: { type: "rdm_deposit", ref: "10.5281/zenodo.10245312", label: "เก็บใน Zenodo แล้ว" },
            },
            file: {
              summary: "ไฟล์ output ที่อัปโหลดไว้บนโครงการของแผน",
              value: { type: "file", ref: "7c9e6679-7425-40de-944b-e07fc1f90ae7", label: "ชุดภาพถ่ายสุดท้าย" },
            },
          },
        },
      },
    },
  },
  responses: {
    200: { description: "คืนงานพร้อม evidence ใหม่" },
    400: { description: "- `field_invalid` — body ผิดรูป / `ref_required` — type ≠ none แต่ไม่มี ref" },
    404: { description: "- `file_not_found` — file id ไม่อยู่บนโครงการของแผน (`param` = `/ref`)" },
    409: { description: "- `task_done` — งานเสร็จแล้วแก้ evidence ไม่ได้ ต้อง reopen ก่อน" },
  },
});

// ── PATCH /users/me ───────────────────────────────────────────────────────
registry.registerPath({
  path: "/users/me",
  method: "patch",
  tags: ["Users"],
  summary: "แก้โปรไฟล์ตัวเอง — role และโควตา AI แก้ไม่ได้",
  operationId: "updateMyProfile",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            title: oa(z.string().optional(), { description: "คำนำหน้า เช่น Dr., Asst.Prof.", example: "Dr." }),
            name: oa(z.string(), { description: "ชื่อ (ห้ามว่าง)", example: "Somchai" }),
            surname: oa(z.string(), { description: "นามสกุล (ห้ามว่าง)", example: "Jaidee" }),
            email: oa(z.string(), { description: "อีเมลใหม่ — ซ้ำกับบัญชีอื่น → 409 email_taken", example: "somchai.j@university.ac.th" }),
          }) as never,
          example: { title: "Dr.", name: "Somchai", surname: "Jaidee", email: "somchai.j@university.ac.th" },
        },
      },
    },
  },
  responses: {
    200: { description: "คืนโปรไฟล์หลังแก้ (รูปร่างเดียวกับ GET /users/me)" },
    400: {
      description: "- `name_required` — ชื่อ/นามสกุลว่าง / `email_invalid` — อีเมลผิดรูปแบบ",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "email_invalid", message: "Enter a valid email address", param: "/email" } },
        },
      },
    },
    409: { description: "- `email_taken` — อีเมลถูกใช้โดยบัญชีอื่น" },
  },
});

// ── GET query parameters — ทุก endpoint ที่รับ filter ─────────────────────

const limitParam = () => oa(z.coerce.number().int().min(1).max(100).optional(), { description: "จำนวนผลลัพธ์ต่อหน้า (มากสุด 100)", example: 20 });
const cursorParam = () => oa(z.string().optional(), { description: "cursor หน้าถัดไป จาก has_more/next_cursor ของผลลัพธ์ก่อนหน้า" });

// ── GET /tasks — ต้องส่ง project_id หรือ dmp_id อย่างน้อยหนึ่ง ─────────────
registry.registerPath({
  path: "/tasks",
  method: "get",
  tags: ["Tasks"],
  summary: "รายการงาน — ต้องกรองด้วย project_id หรือ dmp_id อย่างน้อยหนึ่ง",
  operationId: "listTasks",
  request: {
    query: z.object({
      project_id: oa(z.string().optional(), { description: "กรองด้วยโครงการ — ต้องส่งอย่างน้อยหนึ่งจาก project_id/dmp_id ไม่งั้น 400 filter_required" }),
      dmp_id: oa(z.string().optional(), { description: "กรองด้วยแผน — ต้องส่งอย่างน้อยหนึ่งจาก project_id/dmp_id ไม่งั้น 400 filter_required" }),
      status: oa(z.enum(["todo", "in_progress", "done", "cancelled"]).optional(), { description: "ค่าอื่น → 400 invalid_status" }),
      limit: limitParam(),
      starting_after: cursorParam(),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของงาน (พร้อม unread-style has_more/total)" },
    400: {
      description: "- `filter_required` — ไม่ส่ง project_id และ dmp_id / `invalid_status` — status ไม่อยู่ใน 4 ค่า",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "filter_required", message: "Send project_id or dmp_id" } },
        },
      },
    },
    403: { description: "- `permission_denied` — admin ไม่มีสิทธิ์เข้างาน" },
  },
});

// ── GET /files — project_id บังคับ ────────────────────────────────────────
registry.registerPath({
  path: "/files",
  method: "get",
  tags: ["Files"],
  summary: "รายการไฟล์ของโครงการ — project_id บังคับ",
  operationId: "listFiles",
  request: {
    query: z.object({
      project_id: oa(z.string(), { description: "โครงการที่จะดูไฟล์ — ไม่ส่ง → 400 project_id_required", example: "1b4f0e28-9a71-4d5c-8f2e-3a6b9c0d5e81" }),
      purpose: oa(z.enum(["proposal", "task_deliverable", "evidence"]).optional(), { description: "กรองด้วยจุดประสงค์ — ค่าอื่น → 400 invalid_purpose" }),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของไฟล์" },
    400: {
      description: "- `project_id_required` — ไม่ส่ง project_id / `invalid_purpose` — purpose ไม่อยู่ใน 3 ค่า",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "project_id_required", message: "No project_id", param: "/project_id" } },
        },
      },
    },
    404: { description: "- `project_not_found` — ไม่มีโครงการนั้น หรือไม่ใช่โครงการของผู้เรียก" },
  },
});

// ── GET /dmps — committee ต้องส่ง project_id ──────────────────────────────
registry.registerPath({
  path: "/dmps",
  method: "get",
  tags: ["Plans"],
  summary: "รายการแผน — researcher เห็นของตัวเอง, committee/chief ต้องกรองด้วย project_id (เฉพาะ institutional)",
  operationId: "listDmps",
  request: {
    query: z.object({
      project_id: oa(z.string().optional(), { description: "กรองด้วยโครงการ — **จำเป็นสำหรับ committee/chief** (ไม่ส่ง → 400 project_id_required)" }),
      archived: oa(z.enum(["true"]).optional(), { description: "true = เห็นแผนที่ archive ด้วย (researcher เท่านั้น)" }),
      status: oa(z.string().optional(), {
        description: "draft, pending, approved — แยกด้วย , หรือส่งซ้ำ; ค่าอื่น → 400 field_invalid",
        example: "pending",
      }),
      q: oa(z.string().optional(), { description: "ค้นหาจากชื่อแผน", example: "มรดกไทย" }),
      sort: oa(z.enum(["updated", "title", "status"]).optional(), { description: "ค่าเริ่มต้น updated" }),
      limit: limitParam(),
      include: oa(z.string().optional(), {
        description: "field เสริม: versions, readiness — แยกด้วย , หรือส่งซ้ำ",
        example: "versions,readiness",
      }),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของแผน" },
    400: {
      description: "- `project_id_required` — committee ไม่ส่ง project_id / `field_invalid` — status นอกชุด draft|pending|approved",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "project_id_required", message: "project_id is required for committee members" } },
        },
      },
    },
    403: { description: "- `permission_denied` — admin ไม่มีสิทธิ์เข้าแผน" },
  },
});

// ── GET /dmps/{dmpId} — include ───────────────────────────────────────────
registry.registerPath({
  path: "/dmps/{dmpId}",
  method: "get",
  tags: ["Plans"],
  summary: "อ่านแผนหนึ่งฉบับ — include=draft ได้เฉพาะผู้เขียน (committee ขอก็ไม่ได้)",
  operationId: "getDmp",
  request: {
    query: z.object({
      include: oa(z.string().optional(), {
        description: "field เสริม: versions, readiness — แยกด้วย , หรือส่งซ้ำ; draft ส่งมาก็ได้แต่เห็นเฉพาะ author",
        example: "versions,readiness",
      }),
    }) as never,
  },
  responses: {
    200: { description: "แผนหนึ่งฉบับ (พร้อม draft ล่าสุดถ้าเป็นผู้เขียน + readiness จาก snapshot)" },
    403: { description: "- `permission_denied` — admin / `plan_not_reviewable` — แผน independent ไม่ผ่านคณะกรรมการ" },
    404: { description: "- `dmp_not_found` — ไม่มีแผน หรือไม่ใช่ของผู้เรียก (ซ่อนการมีอยู่)" },
  },
});

// ── GET /reviews — committee/chief เท่านั้น ───────────────────────────────
registry.registerPath({
  path: "/reviews",
  method: "get",
  tags: ["Reviews"],
  summary: "คิวพิจารณา — committee/chief เท่านั้น",
  operationId: "listReviews",
  request: {
    query: z.object({
      status: oa(z.string().optional(), {
        description: "pending, approved, rejected — แยกด้วย , หรือส่งซ้ำ; ค่าอื่น → 400 invalid_status",
        example: "pending",
      }),
      decided_by: oa(z.string().optional(), { description: "กรองด้วยผู้ตัดสิน (user id)" }),
      project_id: oa(z.string().optional(), { description: "กรองด้วยโครงการ" }),
      submitted_after: oa(z.string().optional(), { description: "ส่งหลังเวลานี้ (ISO 8601) — ผิดรูป → 400 field_invalid", example: "2026-11-01T00:00:00Z" }),
      sort: oa(z.string().optional(), { description: "ค่าเริ่มต้น submitted_at", example: "submitted_at" }),
      limit: limitParam(),
      starting_after: cursorParam(),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของรายการพิจารณา" },
    400: {
      description: "- `invalid_status` — status ไม่อยู่ใน 3 ค่า / `field_invalid` — submitted_after หรือ starting_after ผิดรูป",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "invalid_request_error", code: "invalid_status", message: "status must be pending, approved or rejected", param: "/status" } },
        },
      },
    },
    403: {
      description: "- `permission_denied` — อ่านได้เฉพาะ committee/chief",
      content: {
        "application/json": {
          schema: registeredSchemas.ErrorEnvelope,
          example: { error: { type: "permission_error", code: "permission_denied", message: "Only committee members read the review queue" } },
        },
      },
    },
  },
});

// ── GET /notifications ────────────────────────────────────────────────────
registry.registerPath({
  path: "/notifications",
  method: "get",
  tags: ["Notifications"],
  summary: "รายการแจ้งเตือนของผู้เรียก (พร้อม unread_count)",
  operationId: "listNotifications",
  request: {
    query: z.object({
      unread: oa(z.enum(["true", "false"]).optional(), { description: "true = เฉพาะที่ยังไม่อ่าน", example: "true" }),
      limit: limitParam(),
      starting_after: cursorParam(),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของแจ้งเตือน + unread_count" },
    400: fieldInvalid400,
  },
});

// ── GET /projects ─────────────────────────────────────────────────────────
registry.registerPath({
  path: "/projects",
  method: "get",
  tags: ["Projects"],
  summary: "รายการโครงการ — researcher เห็นของตัวเอง, committee/chief เห็น institutional ทั้งหมด",
  operationId: "listProjects",
  request: {
    query: z.object({
      plan_mode: oa(z.enum(["institutional", "independent"]).optional(), { description: "committee/chief: ค่าอื่นนอกจาก institutional → ไม่มีผลลัพธ์" }),
      limit: limitParam(),
      starting_after: cursorParam(),
    }) as never,
  },
  responses: {
    200: { description: "ListEnvelope ของโครงการ" },
    403: { description: "- `permission_denied` — admin ไม่มีสิทธิ์เข้าโครงการ" },
  },
});
