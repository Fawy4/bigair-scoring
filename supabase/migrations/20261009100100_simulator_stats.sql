-- The simulator panel also needs to know whether a starting point is saved (the baseline table itself is not readable by a browser) and whether anything has been played.
create or replace function public.sim_stats(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_run int;
begin
  perform private.sim_guard(p_event);
  select run_no into v_run from public.sim_control where event_id = p_event;
  return jsonb_build_object(
    'run', coalesce(v_run, 1),
    'heats_total', (select count(*) from public.heats h where h.event_id = p_event and h.status <> 'cancelled'),
    'heats_published', (select count(*) from public.heats h where h.event_id = p_event and h.status = 'published'),
    'heats_running', (select count(*) from public.heats h where h.event_id = p_event and h.status in ('running', 'paused')),
    'attempts', (select count(*) from public.trick_attempts a where a.event_id = p_event and a.deleted_at is null),
    'scores', (select count(*) from public.trick_scores t where t.event_id = p_event),
    'impressions', (select count(*) from public.impression_scores i where i.event_id = p_event),
    'blockers', (select count(*) from public.sim_log l where l.event_id = p_event and l.kind = 'blocker' and l.run_no = coalesce(v_run, 1)),
    'flagged_duplicates', (select count(*) from public.trick_attempts a where a.event_id = p_event and a.possible_duplicate_of is not null and a.deleted_at is null),
    'has_baseline', exists (select 1 from public.sim_baseline b where b.event_id = p_event),
    'baseline_at', (select b.taken_at from public.sim_baseline b where b.event_id = p_event),
    'played', exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.rerun_of is not null)),
    'locked_divisions', (select count(*) from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null),
    'divisions', (select count(*) from public.divisions d where d.event_id = p_event));
end $$;
revoke all on function public.sim_stats from public, anon, authenticated;
grant execute on function public.sim_stats to authenticated;
