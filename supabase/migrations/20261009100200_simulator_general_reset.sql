-- The simulator uses the general Reset of Phase 7a-1 (reset_event, which returns every division to the draw copied when it was locked). What is left for the simulator:
--   * sim_after_reset: the simulator's own leftovers (wind calls, shortened clocks, a Plan B it made, the panel's state and numbers)
--   * sim_rebuild: for a simulation event with no starting draw copy (the Demo, played before Reset existed): wipe everything played and unlock every draw, so the server
--     can draw and lock it again (locking takes the copy)
--   * sim_stats: "a starting point is saved" now means every drawn division has the draw copy Reset needs
-- The simulation-only Reset and the "save the starting point" function are removed.

drop function if exists public.sim_reset(uuid, text, boolean);
drop function if exists public.sim_capture_baseline(uuid);

create or replace function public.sim_after_reset(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.sim_baseline; it jsonb; v_run int;
begin
  perform private.sim_guard(p_event);
  if exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null)) then raise exception 'NOT_RESET'; end if;
  delete from public.wind_calls where event_id = p_event;
  -- heats that started at a faster clock get their own length back (Reset also restores it from the draw; this covers a heat the draw does not describe)
  update public.heats h set duration_sec = c.original_sec from public.sim_clock c where c.heat_id = h.id and c.event_id = p_event;
  delete from public.sim_clock where event_id = p_event;
  -- the run order as it was when the copy was made: a Plan B made since goes, the active plan is the saved one
  select * into b from public.sim_baseline where event_id = p_event;
  if found then
    delete from public.schedule_plans p where p.event_id = p_event and not exists (select 1 from jsonb_array_elements(b.plans) x where (x ->> 'id')::uuid = p.id);
    for it in select * from jsonb_array_elements(b.plans) loop
      update public.schedule_plans set active = (it ->> 'active')::boolean where id = (it ->> 'id')::uuid;
    end loop;
  end if;
  update public.sim_control set state = 'stopped', stats = '{}'::jsonb, blocker = null, run_no = run_no + 1,
    config = coalesce(config, '{}'::jsonb) - 'armed' - 'tie' - 'dead' - 'windHeld' - 'finalHeldHeat' where event_id = p_event returning run_no into v_run;
  insert into public.sim_log (event_id, run_no, kind, text) values (p_event, coalesce(v_run, 1), 'reset', 'Reset to the locked draw');
end $$;

create or replace function public.sim_rebuild(p_event uuid, p_slug_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_running record; v_counts jsonb; v_run int;
begin
  ev := private.sim_guard(p_event);
  if lower(btrim(coalesce(p_slug_confirm, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;
  select h.number, h.name into v_running from public.heats h where h.event_id = p_event and h.status in ('running', 'paused') order by h.number limit 1;
  if found then raise exception 'HEAT_RUNNING: %', coalesce(v_running.name, 'Heat ' || v_running.number); end if;
  v_counts := jsonb_build_object(
    'heats', (select count(*) from public.heats where event_id = p_event and status <> 'scheduled'),
    'attempts', (select count(*) from public.trick_attempts where event_id = p_event),
    'results', (select count(*) from public.heat_results where event_id = p_event));
  perform set_config('app.allow_purge', 'on', true);
  perform set_config('app.draw_bypass', '1', true);
  delete from public.heat_decisions where event_id = p_event;
  delete from public.heat_results where event_id = p_event;
  delete from public.judge_sheets where event_id = p_event;
  delete from public.attempt_flags where event_id = p_event;
  delete from public.penalties where event_id = p_event;
  delete from public.impression_scores where event_id = p_event;
  delete from public.trick_scores where event_id = p_event;
  delete from public.trick_attempts where event_id = p_event;
  delete from public.wind_calls where event_id = p_event;
  delete from public.heats where event_id = p_event and rerun_of is not null;
  update public.heats h set duration_sec = c.original_sec from public.sim_clock c where c.heat_id = h.id and c.event_id = p_event;
  update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
    publish_hold = false, public_live = null, flag_out = null where event_id = p_event;
  update public.divisions set draw_locked_at = null, draw_at_lock = null, draw = case when draw is not null then jsonb_set(draw, '{status}', '"draft"') end,
    status = case when status in ('running', 'complete') then 'ready' else status end where event_id = p_event;
  update public.schedule_plans set actual_starts = '{}'::jsonb, hold = null where event_id = p_event;
  delete from public.sim_baseline where event_id = p_event;
  delete from public.sim_clock where event_id = p_event;
  update public.sim_control set state = 'stopped', stats = '{}'::jsonb, blocker = null, run_no = run_no + 1,
    config = coalesce(config, '{}'::jsonb) - 'armed' - 'tie' - 'dead' - 'windHeld' - 'finalHeldHeat' where event_id = p_event returning run_no into v_run;
  insert into public.sim_log (event_id, run_no, kind, text, data) values (p_event, coalesce(v_run, 1), 'reset', 'Wiped; the draw is being rebuilt', v_counts);
  perform private.head_audit(p_event, 'events', p_event, 'simulation_rebuilt', null, v_counts, null);
  perform set_config('app.allow_purge', 'off', true);
  perform set_config('app.draw_bypass', '', true);
  return v_counts;
end $$;

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
    -- Reset can run when every drawn division has the draw it was locked with (or is unlocked and untouched)
    'has_baseline', not exists (select 1 from public.divisions d where d.event_id = p_event and d.draw is not null and private.reset_division_source(d) is null),
    'baseline_at', null,
    'played', exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.rerun_of is not null)),
    'locked_divisions', (select count(*) from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null),
    'divisions', (select count(*) from public.divisions d where d.event_id = p_event));
end $$;

revoke all on function public.sim_after_reset, public.sim_rebuild, public.sim_stats from public, anon, authenticated;
grant execute on function public.sim_after_reset, public.sim_rebuild, public.sim_stats to authenticated;
