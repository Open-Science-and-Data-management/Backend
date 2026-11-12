ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_snapshot_object_keys" CHECK ("dmp_versions"."snapshot" = '{}'::jsonb or (jsonb_typeof("dmp_versions"."snapshot") = 'object' and not exists (select 1 from jsonb_object_keys("dmp_versions"."snapshot") k where k not in ('dmp_id', 'project_id', 'title', 'description', 'language', 'alternate_identifier', 'begin_date', 'end_date', 'ethical_issues_exist', 'ethical_issues_description', 'ethical_issues_report', 'indigenous_considerations', 'contributor', 'cost', 'dataset', 'schema_version'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_based_on_snapshot_object_keys" CHECK ("dmp_versions"."based_on_snapshot" = '{}'::jsonb or (jsonb_typeof("dmp_versions"."based_on_snapshot") = 'object' and not exists (select 1 from jsonb_object_keys("dmp_versions"."based_on_snapshot") k where k not in ('dmp_id', 'project_id', 'title', 'description', 'language', 'alternate_identifier', 'begin_date', 'end_date', 'ethical_issues_exist', 'ethical_issues_description', 'ethical_issues_report', 'indigenous_considerations', 'contributor', 'cost', 'dataset', 'schema_version'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_changes_field_changes" CHECK ("dmp_versions"."changes" is null or (jsonb_typeof("dmp_versions"."changes") = 'array' and not exists (
    select 1 from jsonb_array_elements("dmp_versions"."changes") e
    where jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'label', 'from', 'to'))
       or exists (select 1 from jsonb_object_keys(e) k where k in ('path', 'label', 'from', 'to') and jsonb_typeof(e -> k) <> 'string'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_minor_edits_field_changes" CHECK ("dmp_versions"."minor_edits" is null or (jsonb_typeof("dmp_versions"."minor_edits") = 'array' and not exists (
    select 1 from jsonb_array_elements("dmp_versions"."minor_edits") e
    where jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'label', 'from', 'to'))
       or exists (select 1 from jsonb_object_keys(e) k where k in ('path', 'label', 'from', 'to') and jsonb_typeof(e -> k) <> 'string'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_carried_edits_field_changes" CHECK ("dmp_versions"."carried_edits" is null or (jsonb_typeof("dmp_versions"."carried_edits") = 'array' and not exists (
    select 1 from jsonb_array_elements("dmp_versions"."carried_edits") e
    where jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'label', 'from', 'to'))
       or exists (select 1 from jsonb_object_keys(e) k where k in ('path', 'label', 'from', 'to') and jsonb_typeof(e -> k) <> 'string'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_dropped_edits_field_changes" CHECK ("dmp_versions"."dropped_edits" is null or (jsonb_typeof("dmp_versions"."dropped_edits") = 'array' and not exists (
    select 1 from jsonb_array_elements("dmp_versions"."dropped_edits") e
    where jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('path', 'label', 'from', 'to'))
       or exists (select 1 from jsonb_object_keys(e) k where k in ('path', 'label', 'from', 'to') and jsonb_typeof(e -> k) <> 'string'))));--> statement-breakpoint
ALTER TABLE "dmp_versions" ADD CONSTRAINT "dmp_versions_decision_approver_keys" CHECK ("dmp_versions"."decision_approver" is null or (jsonb_typeof("dmp_versions"."decision_approver") = 'object' and not exists (select 1 from jsonb_object_keys("dmp_versions"."decision_approver") k where k not in ('user_id', 'name', 'position', 'mbox')) and not exists (select 1 from jsonb_object_keys("dmp_versions"."decision_approver") k where jsonb_typeof("dmp_versions"."decision_approver" -> k) <> 'string')));