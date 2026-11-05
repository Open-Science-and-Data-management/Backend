ALTER TABLE "dmps" ADD COLUMN "created_by" uuid;--> statement-breakpoint
UPDATE "dmps" SET "created_by" = "projects"."created_by" FROM "projects" WHERE "dmps"."project_id" = "projects"."project_id";--> statement-breakpoint
ALTER TABLE "dmps" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dmps" ADD CONSTRAINT "dmps_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;