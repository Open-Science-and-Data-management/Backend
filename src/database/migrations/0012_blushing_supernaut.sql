ALTER TABLE "ai_thread_entries" ADD CONSTRAINT "ai_thread_entries_content_by_kind" CHECK (
    jsonb_typeof("ai_thread_entries"."content") = 'object' and case "ai_thread_entries"."kind"
      when 'user' then
        (not exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k not in ('text', 'section'))
          and exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k in ('text', 'section')))
        or (not exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k not in ('action', 'direction'))
          and exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k in ('action', 'direction')))
      when 'assistant' then
        exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k = 'action')
        and not exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k not in ('action', 'text', 'proposal', 'stale_reason'))
      when 'event' then
        exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k = 'action')
        and not exists (select 1 from jsonb_object_keys("ai_thread_entries"."content") k where k not in ('action', 'usage', 'dmp_id'))
    end
  );