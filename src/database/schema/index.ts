// 13 ตารางตาม arc42 §5.3 — constraint หนักบังคับที่ Postgres เอง (Quality Goal 1)
// DATASET/DISTRIBUTION/CONTRIBUTOR/COST เป็น nested ใน dmps.draft (JSONB)
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── enums ──────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["admin", "chief", "committee", "researcher"]);
export const accountTypeEnum = pgEnum("account_type", ["institutional", "citizen"]);
export const planModeEnum = pgEnum("plan_mode", ["institutional", "independent"]);
export const dmpStatusEnum = pgEnum("dmp_status", ["draft", "pending", "approved"]);
export const versionStatusEnum = pgEnum("version_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "done", "cancelled"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);
export const lifecycleStageEnum = pgEnum("lifecycle_stage", [
  "collect",
  "process",
  "analyse",
  "preserve",
  "share",
]);
export const generatedByEnum = pgEnum("generated_by", ["ai", "user"]);
export const evidenceTypeEnum = pgEnum("evidence_type", ["none", "file", "url", "rdm_deposit"]);
export const fileTypeEnum = pgEnum("file_type", ["docx", "pdf", "other"]);
export const filePurposeEnum = pgEnum("file_purpose", ["proposal", "task_deliverable", "evidence"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "dmp_submitted",
  "dmp_approved",
  "dmp_finalized",
  "tasks_generated",
  "tasks_cancelled",
  "proposal_superseded",
  "review_requested",
  "dmp_returned",
]);
export const threadEntryKindEnum = pgEnum("ai_thread_entry_kind", ["user", "event", "assistant"]);
export const aiDecisionEnum = pgEnum("ai_decision", ["accepted", "rejected", "stale"]);
export const cancelReasonEnum = pgEnum("cancel_reason", ["manual", "output_removed"]);

// ── users / credentials / refresh_tokens ──────────────────────────────────
export const users = pgTable("users", {
  userId: uuid("user_id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 30 }).unique().notNull(),
  email: varchar("email", { length: 254 }).notNull(), // normalized lowercase+trim, unique ด้านล่าง
  title: varchar("title", { length: 32 }),
  name: varchar("name", { length: 200 }).notNull(),
  surname: varchar("surname", { length: 200 }).notNull(),
  role: userRoleEnum("role").notNull().default("researcher"),
  accountType: accountTypeEnum("account_type"),
  phone: varchar("phone", { length: 32 }),
  orcid: varchar("orcid", { length: 19 }),
  affiliation: jsonb("affiliation"),
  address: text("address"),
  aiTokenLimit: integer("ai_token_limit").notNull().default(0),
  aiTokenUsed: integer("ai_token_used").notNull().default(0),
  quotaResetsAt: timestamp("quota_resets_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // email unique แบบ normalize — บังคับที่ DB
  uniqueIndex("users_email_normalized_uq").on(sql`lower(btrim(${t.email}))`),
]);

export const credentials = pgTable("credentials", {
  username: varchar("username", { length: 30 })
    .primaryKey()
    .references(() => users.username, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(), // argon2id — ADR-0029
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  tokenId: uuid("token_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  familyId: uuid("family_id").notNull(), // rotation + reuse detection — ADR-0016
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedBy: uuid("replaced_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("refresh_tokens_user_idx").on(t.userId),
  unique("refresh_tokens_hash_uq").on(t.tokenHash),
]);

// ── projects / members ─────────────────────────────────────────────────────
export const fileRecords = pgTable("file_records", {
  fileId: uuid("file_id").primaryKey().defaultRandom(),
  projectId: uuid("project_id"), // FK เพิ่มด้านล่าง (projects อ้างถึง file ก่อนได้แต่วน — เก็บ FK ที่ projects)
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.userId),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileType: fileTypeEnum("file_type").notNull(),
  purpose: filePurposeEnum("purpose").notNull(),
  byteSize: integer("byte_size"),
  mimeType: varchar("mime_type", { length: 127 }),
  docxExtractedText: text("docx_extracted_text"), // เก็บในตารางเพื่อให้ agent อ่านสำเร็จรูป
  storagePath: text("storage_path").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("file_records_project_idx").on(t.projectId),
]);

export const projects = pgTable("projects", {
  projectId: uuid("project_id").primaryKey().defaultRandom(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  description: text("description"),
  proposalFileId: uuid("proposal_file_id").references(() => fileRecords.fileId, {
    onDelete: "set null",
  }), // ตั้งโดย analyze-proposal — ADR-0024
  planMode: planModeEnum("plan_mode").notNull().default("institutional"),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.userId),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.projectId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    projectRole: userRoleEnum("project_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })], // PK คู่ — ห้ามสมาชิกซ้ำ
);

// ── dmps / versions ────────────────────────────────────────────────────────
export const dmps = pgTable("dmps", {
  dmpId: uuid("dmp_id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.projectId, { onDelete: "restrict" }), // null = ยังไม่ file เข้าโครงการ
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.userId), // author — FE contract `researcher` (single-writer autosave)
  title: varchar("title", { length: 500 }).notNull(),
  status: dmpStatusEnum("status").notNull().default("draft"),
  planMode: planModeEnum("plan_mode"), // freeze ตอน submit แรก
  draft: jsonb("draft").notNull(),
  draftRevision: integer("draft_revision").notNull().default(0), // optimistic concurrency — ADR-0020
  activeVersion: integer("active_version"),
  tasksGenerated: boolean("tasks_generated").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dmps_project_idx").on(t.projectId),
]);

export const dmpVersions = pgTable(
  "dmp_versions",
  {
    versionId: uuid("version_id").primaryKey().defaultRandom(),
    dmpId: uuid("dmp_id")
      .notNull()
      .references(() => dmps.dmpId, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: versionStatusEnum("status").notNull().default("draft"),
    snapshot: jsonb("snapshot").notNull(),
    changes: jsonb("changes"), // FieldChange[] จาก diffDraft
    editType: varchar("edit_type", { length: 8 }), // minor | major
    minorEdits: jsonb("minor_edits"),
    carriedEdits: jsonb("carried_edits"),
    droppedEdits: jsonb("dropped_edits"), // จดแทนการหายเงียบ — QS-2
    submittedBy: uuid("submitted_by").references(() => users.userId),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.userId),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("dmp_versions_dmp_number_uq").on(t.dmpId, t.number),
    // หนึ่ง pending ต่อแผน — Postgres บังคับเอง (หมวด 4.3/4.4)
    uniqueIndex("dmp_versions_one_pending_uq").on(t.dmpId).where(sql`status = 'pending'`),
  ],
);

// ── tasks ──────────────────────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  taskId: uuid("task_id").primaryKey().defaultRandom(),
  dmpId: uuid("dmp_id")
    .notNull()
    .references(() => dmps.dmpId, { onDelete: "cascade" }),
  datasetId: uuid("dataset_id"), // id ใน draft — ไม่ใช่ FK ตาราง (draft เป็น JSONB)
  sourceVersionId: uuid("source_version_id").references(() => dmpVersions.versionId),
  title: varchar("title", { length: 500 }).notNull(),
  details: text("details"),
  startDate: timestamp("start_date", { withTimezone: false }),
  endDate: timestamp("end_date", { withTimezone: false }),
  progressPercent: integer("progress_percent").notNull().default(0), // คำนวณจาก checklist เสมอ
  checklist: jsonb("checklist").notNull().default([]),
  evidenceType: evidenceTypeEnum("evidence_type").notNull().default("none"),
  evidenceRef: text("evidence_ref"), // ไม่มี file_id — เก็บ ref (ADR-0022)
  evidenceLabel: text("evidence_label"),
  evidenceAttachedAt: timestamp("evidence_attached_at", { withTimezone: true }),
  lifecycleStage: lifecycleStageEnum("lifecycle_stage").notNull(),
  status: taskStatusEnum("status").notNull().default("todo"),
  priority: priorityEnum("priority").notNull().default("medium"),
  generatedBy: generatedByEnum("generated_by").notNull().default("user"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.userId),
  cancelledFrom: taskStatusEnum("cancelled_from"),
  cancelReason: cancelReasonEnum("cancel_reason"),
  cancelledDatasetTitle: text("cancelled_dataset_title"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tasks_dmp_idx").on(t.dmpId),
]);

// ── file_chunks (RAG — ADR-0025/0028) ─────────────────────────────────────
export const fileChunks = pgTable(
  "file_chunks",
  {
    chunkId: uuid("chunk_id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileRecords.fileId, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    headingPath: text("heading_path"),
    embedding: real("embedding").array(), // 1024 dims — e5-large-instruct
    embeddingModel: varchar("embedding_model", { length: 127 }),
  },
  (t) => [index("file_chunks_file_idx").on(t.fileId)], // กรอง file_id ก่อนแล้ว cosine ฝั่ง app
);

// ── notifications ──────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  notificationId: uuid("notification_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  link: text("link"),
  dmpId: uuid("dmp_id").references(() => dmps.dmpId, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.projectId, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }), // ลบได้ — UX ไม่ใช่ record (ADR-0024)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_idx").on(t.userId, t.createdAt),
]);

// ── ai_thread_entries / idempotency_keys (ADR-0023) ───────────────────────
export const aiThreadEntries = pgTable("ai_thread_entries", {
  entryId: uuid("entry_id").primaryKey().defaultRandom(),
  dmpId: uuid("dmp_id").references(() => dmps.dmpId, { onDelete: "cascade" }), // null = scope "unscoped"
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  kind: threadEntryKindEnum("kind").notNull(),
  content: jsonb("content").notNull(),
  tokenCount: integer("token_count").notNull().default(0),
  decision: aiDecisionEnum("decision"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_thread_scope_idx").on(t.dmpId, t.ownerId, t.createdAt),
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  keyId: uuid("key_id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 255 }).notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.userId, { onDelete: "cascade" }),
  action: varchar("action", { length: 127 }).notNull(),
  responseSnapshot: jsonb("response_snapshot"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // replay 24 ชม.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("idempotency_keys_key_action_uq").on(t.key, t.userId, t.action),
]);

// ── reopen_offers (ADR-0022) ───────────────────────────────────────────────
export const reopenOffers = pgTable("reopen_offers", {
  offerId: uuid("offer_id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.taskId, { onDelete: "cascade" }),
  dmpId: uuid("dmp_id")
    .notNull()
    .references(() => dmps.dmpId, { onDelete: "cascade" }),
  datasetId: uuid("dataset_id"),
  datasetTitle: text("dataset_title").notNull(),
  offeredTo: uuid("offered_to")
    .notNull()
    .references(() => users.userId),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reopen_offers_user_idx").on(t.offeredTo),
]);

// ── relations (สำหรับ drizzle relational query) ────────────────────────────
export const projectRelations = relations(projects, ({ many, one }) => ({
  members: many(projectMembers),
  dmps: many(dmps),
  proposal: one(fileRecords, {
    fields: [projects.proposalFileId],
    references: [fileRecords.fileId],
  }),
}));

export const projectMemberRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.projectId],
  }),
  user: one(users, { fields: [projectMembers.userId], references: [users.userId] }),
}));

export const dmpRelations = relations(dmps, ({ many, one }) => ({
  versions: many(dmpVersions),
  tasks: many(tasks),
  project: one(projects, { fields: [dmps.projectId], references: [projects.projectId] }),
}));

export const dmpVersionRelations = relations(dmpVersions, ({ one, many }) => ({
  dmp: one(dmps, { fields: [dmpVersions.dmpId], references: [dmps.dmpId] }),
  tasks: many(tasks),
}));

export const taskRelations = relations(tasks, ({ one, many }) => ({
  dmp: one(dmps, { fields: [tasks.dmpId], references: [dmps.dmpId] }),
  reopenOffers: many(reopenOffers),
}));
