CREATE TYPE "public"."account_type" AS ENUM('institutional', 'citizen');--> statement-breakpoint
CREATE TYPE "public"."ai_decision" AS ENUM('accepted', 'rejected', 'stale');--> statement-breakpoint
CREATE TYPE "public"."cancel_reason" AS ENUM('manual', 'output_removed');--> statement-breakpoint
CREATE TYPE "public"."dmp_status" AS ENUM('draft', 'pending', 'approved');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('none', 'file', 'url', 'rdm_deposit');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('proposal', 'task_deliverable', 'evidence');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('docx', 'pdf', 'other');--> statement-breakpoint
CREATE TYPE "public"."generated_by" AS ENUM('ai', 'user');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_stage" AS ENUM('collect', 'process', 'analyse', 'preserve', 'share');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('dmp_submitted', 'dmp_approved', 'dmp_finalized', 'tasks_generated', 'tasks_cancelled', 'proposal_superseded', 'review_requested', 'dmp_returned');--> statement-breakpoint
CREATE TYPE "public"."plan_mode" AS ENUM('institutional', 'independent');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_thread_entry_kind" AS ENUM('user', 'event', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'chief', 'committee', 'researcher');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_thread_entries" (
	"entry_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dmp_id" uuid,
	"owner_id" uuid NOT NULL,
	"kind" "ai_thread_entry_kind" NOT NULL,
	"content" jsonb NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"decision" "ai_decision",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"username" varchar(30) PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dmp_versions" (
	"version_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dmp_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "version_status" DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changes" jsonb,
	"edit_type" varchar(8),
	"minor_edits" jsonb,
	"carried_edits" jsonb,
	"dropped_edits" jsonb,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dmp_versions_dmp_number_uq" UNIQUE("dmp_id","number")
);
--> statement-breakpoint
CREATE TABLE "dmps" (
	"dmp_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"status" "dmp_status" DEFAULT 'draft' NOT NULL,
	"plan_mode" "plan_mode",
	"draft" jsonb NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"active_version" integer,
	"tasks_generated" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_chunks" (
	"chunk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"heading_path" text,
	"embedding" real[],
	"embedding_model" varchar(127)
);
--> statement-breakpoint
CREATE TABLE "file_records" (
	"file_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"file_type" "file_type" NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"byte_size" integer,
	"mime_type" varchar(127),
	"docx_extracted_text" text,
	"storage_path" text NOT NULL,
	"archived_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(127) NOT NULL,
	"response_snapshot" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_key_action_uq" UNIQUE("key","user_id","action")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(500) NOT NULL,
	"message" text,
	"link" text,
	"dmp_id" uuid,
	"project_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"project_role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"description" text,
	"proposal_file_id" uuid,
	"plan_mode" "plan_mode" DEFAULT 'institutional' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"token_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reopen_offers" (
	"offer_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"dmp_id" uuid NOT NULL,
	"dataset_id" uuid,
	"dataset_title" text NOT NULL,
	"offered_to" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"task_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dmp_id" uuid NOT NULL,
	"dataset_id" uuid,
	"source_version_id" uuid,
	"title" varchar(500) NOT NULL,
	"details" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_type" "evidence_type" DEFAULT 'none' NOT NULL,
	"evidence_ref" text,
	"evidence_label" text,
	"evidence_attached_at" timestamp with time zone,
	"lifecycle_stage" "lifecycle_stage" NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"generated_by" "generated_by" DEFAULT 'user' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"cancelled_from" "task_status",
	"cancel_reason" "cancel_reason",
	"cancelled_dataset_title" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(30) NOT NULL,
	"email" varchar(254) NOT NULL,
	"title" varchar(32),
	"name" varchar(200) NOT NULL,
	"surname" varchar(200) NOT NULL,
	"role" "user_role" DEFAULT 'researcher' NOT NULL,
	"account_type" "account_type",
	"phone" varchar(32),
	"orcid" varchar(19),
	"affiliation" jsonb,
	"address" text,
	"ai_token_limit" integer DEFAULT 0 NOT NULL,
	"ai_token_used" integer DEFAULT 0 NOT NULL,
	"quota_resets_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "ai_thread_entries" ADD CONSTRAINT "ai_thread_entries_dmp_id_dmps_dmp_id_fk" FOREIGN KEY ("dmp_id") REFERENCES "public"."dmps"("dmp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_thread_entries" ADD CONSTRAINT "ai_thread_entries_owner_id_users_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_username_users_username_fk" FOREIGN KEY ("username") REFERENCES "public"."users"("username") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_dmp_id_dmps_dmp_id_fk" FOREIGN KEY ("dmp_id") REFERENCES "public"."dmps"("dmp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_submitted_by_users_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_decided_by_users_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dmps" ADD CONSTRAINT "dmps_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_file_records_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_records"("file_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_records" ADD CONSTRAINT "file_records_uploaded_by_users_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dmp_id_dmps_dmp_id_fk" FOREIGN KEY ("dmp_id") REFERENCES "public"."dmps"("dmp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_proposal_file_id_file_records_file_id_fk" FOREIGN KEY ("proposal_file_id") REFERENCES "public"."file_records"("file_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reopen_offers" ADD CONSTRAINT "reopen_offers_task_id_tasks_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("task_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reopen_offers" ADD CONSTRAINT "reopen_offers_dmp_id_dmps_dmp_id_fk" FOREIGN KEY ("dmp_id") REFERENCES "public"."dmps"("dmp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reopen_offers" ADD CONSTRAINT "reopen_offers_offered_to_users_user_id_fk" FOREIGN KEY ("offered_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dmp_id_dmps_dmp_id_fk" FOREIGN KEY ("dmp_id") REFERENCES "public"."dmps"("dmp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_version_id_dmp_versions_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."dmp_versions"("version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_thread_scope_idx" ON "ai_thread_entries" USING btree ("dmp_id","owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dmp_versions_one_pending_uq" ON "dmp_versions" USING btree ("dmp_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "dmps_project_idx" ON "dmps" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "file_chunks_file_idx" ON "file_chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_records_project_idx" ON "file_records" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reopen_offers_user_idx" ON "reopen_offers" USING btree ("offered_to");--> statement-breakpoint
CREATE INDEX "tasks_dmp_idx" ON "tasks" USING btree ("dmp_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_uq" ON "users" USING btree (lower(btrim("email")));