-- Fix 2, item 2: A1b-2 (a reset during a yellow left the heat armed, and it went green by itself on the reset division), A1b-1 (switching Flags off a moment after 0:00
-- turned a running heat back into "not started") and A1b-18 (switching Flags off during a paused yellow was refused by a check).
--   * private.armed_heat_name: a heat of the event that is in its start sequence (scheduled with armed_at set: yellow, running yellow or frozen yellow).
--   * Reset event, Reset this division, Reset this heat and Clear actual times refuse with HEAT_ARMED: <heat> ("Abort the start sequence first"); the three that
--     put heats back to scheduled also clear every armed column (armed_at, prestart_sec, armed_paused_at), so nothing can start by itself after a reset.
--   * Flags off: a heat whose pre-start is over is written down as running first (the start is the server's, not a phone's) and only heats still in their yellow are
--     cancelled; a frozen yellow is cleared with the rest (armed_paused_at too).

create or replace function private.armed_heat_name(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(h.name, 'Heat ' || h.number::text) from public.heats h where h.event_id = p_event and h.status = 'scheduled' and h.armed_at is not null order by h.armed_at limit 1;
$$;

create or replace function public.reset_event(p_event uuid, p_slug text, p_reason text, p_draws jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; d public.divisions; v_run text; v_counts jsonb; v_snapshot uuid; v_public boolean; v_item jsonb; v_role text; v_rebuilt text[];
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not (private.is_event_organiser(p_event) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  if lower(btrim(coalesce(p_slug, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;

  delete from public.event_reset_snapshots where expires_at < now();

  v_run := private.running_heat_name(p_event);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  if private.armed_heat_name(p_event) is not null then raise exception 'HEAT_ARMED: %', private.armed_heat_name(p_event); end if;

  v_public := private.event_ever_public(p_event);
  if v_public and (p_reason is null or char_length(btrim(p_reason)) < 5) then raise exception 'REASON_REQUIRED'; end if;

  -- every drawn division comes with its starting draw and the rows that draw is made of: the saved copy, or (no copy) the rebuild of its own current draw
  if p_draws is null or jsonb_typeof(p_draws) <> 'array' then raise exception 'BAD_PROJECTION'; end if;
  v_rebuilt := '{}';
  for d in select * from public.divisions dv where dv.event_id = p_event and dv.draw is not null order by dv.sort_order loop
    select i into v_item from jsonb_array_elements(p_draws) i where i ->> 'division' = d.id::text limit 1;
    if v_item is null then raise exception 'BAD_PROJECTION'; end if;
    if private.reset_division_source(d) is not null then
      if (v_item -> 'draw') is distinct from private.reset_division_source(d) then raise exception 'BAD_PROJECTION'; end if;
    else
      if not private.rebuild_matches(d, v_item -> 'draw') then raise exception 'BAD_PROJECTION'; end if;
      v_rebuilt := v_rebuilt || d.name;
    end if;
  end loop;

  v_counts := private.reset_counts(p_event);

  -- the snapshot: every row that is about to change, so Restore can put it back
  insert into public.event_reset_snapshots (event_id, organisation_id, taken_by, payload)
  values (p_event, ev.organisation_id, auth.uid(), jsonb_build_object(
    'heats', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heats x where x.event_id = p_event),
    'heat_slots', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_slots x where x.event_id = p_event),
    'trick_attempts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_attempts x where x.event_id = p_event),
    'trick_scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_scores x where x.event_id = p_event),
    'impression_scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.impression_scores x where x.event_id = p_event),
    'penalties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.penalties x where x.event_id = p_event),
    'attempt_flags', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.attempt_flags x where x.event_id = p_event),
    'judge_sheets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.judge_sheets x where x.event_id = p_event),
    'heat_decisions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_decisions x where x.event_id = p_event),
    'heat_results', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_results x where x.event_id = p_event),
    'schedule_plans', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.schedule_plans x where x.event_id = p_event),
    'divisions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'draw', x.draw)), '[]'::jsonb) from public.divisions x where x.event_id = p_event)))
  returning id into v_snapshot;

  perform set_config('app.draw_bypass', '1', true);
  perform private.wipe_heat_data(array(select id from public.heats where event_id = p_event));

  -- a re-run goes (its run order row with it, by the run order trigger); the original returns to "scheduled" with its draw id back below
  delete from public.heats where event_id = p_event and rerun_of is not null;
  update public.heats set status = 'scheduled', armed_at = null, prestart_sec = null, armed_paused_at = null, started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
         publish_hold = false, public_live = null, flag_out = null
   where event_id = p_event;
  update public.heat_slots set place = null, total = null, breakdown = null, flagged_out = false where event_id = p_event;
  update public.schedule_plans set actual_starts = '{}'::jsonb, hold = null where event_id = p_event;

  for d in select * from public.divisions dv where dv.event_id = p_event and dv.draw is not null order by dv.sort_order loop
    select i into v_item from jsonb_array_elements(p_draws) i where i ->> 'division' = d.id::text limit 1;
    perform private.restore_division_ladder(d, v_item);
  end loop;
  perform set_config('app.draw_bypass', '', true);

  v_role := case when private.is_event_organiser(p_event) then 'organiser' else 'platform_owner' end;
  insert into public.audit_log (event_id, organisation_id, actor_user_id, action, table_name, row_id, before, after, reason)
  values (p_event, ev.organisation_id, auth.uid(), 'event_reset', 'events', p_event, v_counts,
          jsonb_build_object('role', v_role, 'snapshot', v_snapshot, 'ever_public', v_public, 'rebuilt_divisions', to_jsonb(v_rebuilt)), nullif(btrim(coalesce(p_reason, '')), ''));

  return v_counts || jsonb_build_object('snapshot', v_snapshot, 'rebuilt', to_jsonb(v_rebuilt));
end $$;

create or replace function public.reset_division(p_division uuid, p_reason text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.divisions; ev public.events; v_run text; v_heats uuid[]; v_counts jsonb; v_public boolean; v_source jsonb; v_rebuilt boolean;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = d.event_id for update;
  if not (private.is_event_organiser(d.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(d.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  if private.armed_heat_name(d.event_id) is not null then raise exception 'HEAT_ARMED: %', private.armed_heat_name(d.event_id); end if;
  if d.draw is null then raise exception 'NO_DRAW'; end if;

  v_heats := array(select id from public.heats where division_id = p_division);
  v_public := exists (select 1 from unnest(v_heats) x where private.heat_ever_public(x));
  if v_public and (p_reason is null or char_length(btrim(p_reason)) < 5) then raise exception 'REASON_REQUIRED'; end if;

  v_source := private.reset_division_source(d);
  v_rebuilt := v_source is null;
  if p_item is null or jsonb_typeof(p_item) <> 'object' or p_item ->> 'division' is distinct from p_division::text then raise exception 'BAD_PROJECTION'; end if;
  if v_rebuilt then
    if not private.rebuild_matches(d, p_item -> 'draw') then raise exception 'BAD_PROJECTION'; end if;
  elsif (p_item -> 'draw') is distinct from v_source then raise exception 'BAD_PROJECTION';
  end if;

  v_counts := private.heat_counts(v_heats);

  perform set_config('app.draw_bypass', '1', true);
  perform private.wipe_heat_data(v_heats);
  delete from public.heats where division_id = p_division and rerun_of is not null;
  update public.heats set status = 'scheduled', armed_at = null, prestart_sec = null, armed_paused_at = null, started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
         publish_hold = false, public_live = null, flag_out = null
   where division_id = p_division;
  update public.heat_slots set place = null, total = null, breakdown = null, flagged_out = false where heat_id in (select id from public.heats where division_id = p_division);
  perform private.restore_division_ladder(d, p_item);
  perform set_config('app.draw_bypass', '', true);

  perform private.draw_audit(d.event_id, p_division, 'division_reset',
    jsonb_build_object('before', v_counts, 'after', jsonb_build_object('rebuilt', v_rebuilt, 'ever_public', v_public)), p_reason, 'divisions');
  return v_counts || jsonb_build_object('rebuilt', v_rebuilt);
end $$;

create or replace function public.reset_heat(p_heat uuid, p_reason text, p_before jsonb, p_draw jsonb, p_seats jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.heats; d public.divisions; v_run text; v_counts jsonb; v_record uuid; v_public boolean; p jsonb; s jsonb; v_target public.heats; v_changed int := 0;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found or not (private.can_run_heat(h.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(h.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  if private.armed_heat_name(h.event_id) is not null then raise exception 'HEAT_ARMED: %', private.armed_heat_name(h.event_id); end if;
  if h.status = 'scheduled' then raise exception 'HEAT_NOT_STARTED'; end if;
  if h.status = 'cancelled' and exists (select 1 from public.heats r where r.rerun_of = p_heat) then raise exception 'HEAT_ALREADY_RERUN'; end if;
  v_public := private.heat_ever_public(p_heat);
  if v_public and (p_reason is null or char_length(btrim(p_reason)) < 5) then raise exception 'REASON_REQUIRED'; end if;

  select * into d from public.divisions where id = h.division_id for update;
  if p_draw is not null then
    if p_before is distinct from d.draw then raise exception 'DRAW_CHANGED'; end if;
    for p in select * from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) loop
      select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
      if not found then continue; end if;
      if v_target.status <> 'scheduled' or v_target.started_at is not null then raise exception 'DOWNSTREAM_STARTED: %', p ->> 'uid'; end if;
    end loop;
  end if;

  v_counts := private.heat_counts(array[p_heat]);

  -- the record kept for the audit: the heat as it was, its seats and everything it recorded
  insert into public.heat_reset_records (event_id, heat_id, taken_by, reason, payload)
  values (h.event_id, p_heat, auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object(
    'heat', to_jsonb(h),
    'heat_slots', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_slots x where x.heat_id = p_heat),
    'trick_attempts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_attempts x where x.heat_id = p_heat),
    'trick_scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_scores x where x.heat_id = p_heat),
    'impression_scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.impression_scores x where x.heat_id = p_heat),
    'penalties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.penalties x where x.heat_id = p_heat),
    'attempt_flags', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.attempt_flags x where x.heat_id = p_heat),
    'judge_sheets', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.judge_sheets x where x.heat_id = p_heat),
    'heat_decisions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_decisions x where x.heat_id = p_heat),
    'heat_results', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_results x where x.heat_id = p_heat)))
  returning id into v_record;

  perform set_config('app.draw_bypass', '1', true);
  perform private.wipe_heat_data(array[p_heat]);
  update public.heats set status = 'scheduled', armed_at = null, prestart_sec = null, armed_paused_at = null, started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
         publish_hold = false, public_live = null, flag_out = null
   where id = p_heat;
  update public.heat_slots set place = null, total = null, breakdown = null, flagged_out = false,
         modifier = case when modifier = 'DNS' then 'DNS' when modifier = 'DSQ' and h.rerun_of is not null then 'DSQ' end
   where heat_id = p_heat;
  if p_draw is not null then
    update public.divisions set draw = p_draw where id = h.division_id;
    for p in select * from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) loop
      select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
      if not found then continue; end if;
      for s in select * from jsonb_array_elements(p -> 'slots') loop
        update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
         where heat_id = v_target.id and position = (s ->> 'position')::int;
      end loop;
      v_changed := v_changed + 1;
    end loop;
  end if;
  perform set_config('app.draw_bypass', '', true);

  perform private.head_audit(h.event_id, 'heats', p_heat, 'heat_reset',
    v_counts || jsonb_build_object('status', h.status, 'heat_id', p_heat),
    jsonb_build_object('status', 'scheduled', 'record', v_record, 'later_seats_changed', v_changed, 'ever_public', v_public), p_reason);
  return v_counts || jsonb_build_object('record', v_record, 'later_seats_changed', v_changed);
end $$;

create or replace function public.clear_plan_actuals(p_plan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_keep jsonb; v_actuals int; v_cleared int; v_run text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found or not (private.is_event_organiser(p.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(p.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  if private.armed_heat_name(p.event_id) is not null then raise exception 'HEAT_ARMED: %', private.armed_heat_name(p.event_id); end if;
  v_keep := case when p.hand_pins is null then p.anchors
                 else coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(p.anchors) e where p.hand_pins ? e.key), '{}'::jsonb) end;
  v_actuals := (select count(*) from jsonb_object_keys(p.actual_starts));
  v_cleared := (select count(*) from jsonb_object_keys(p.anchors)) - (select count(*) from jsonb_object_keys(v_keep));
  perform set_config('app.pin_source', 'console', true);
  update public.schedule_plans set anchors = v_keep, actual_starts = '{}'::jsonb where id = p_plan;
  perform set_config('app.pin_source', '', true);
  perform private.draw_audit(p.event_id, p_plan, 'plan_actuals_cleared',
    jsonb_build_object('before', jsonb_build_object('actual_starts', p.actual_starts, 'anchors', p.anchors), 'after', jsonb_build_object('actual_starts', '{}'::jsonb, 'anchors', v_keep, 'pins_known', p.hand_pins is not null)), null, 'schedule_plans');
  return jsonb_build_object('actual_starts', v_actuals, 'pins', v_cleared, 'kept', (select count(*) from jsonb_object_keys(v_keep)), 'known', p.hand_pins is not null);
end $$;

create or replace function private.events_flags_off() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  if coalesce((old.settings -> 'flags' ->> 'enabled')::boolean, true) and not coalesce((new.settings -> 'flags' ->> 'enabled')::boolean, true) then
    -- a pre-start that is already over is a heat that is running: write its start down first (at the armed moment), then cancel only what is still in its yellow
    for h in select id from public.heats where event_id = new.id and status = 'scheduled' and armed_at is not null loop
      perform private.materialise_armed(h.id);
    end loop;
    for h in select id from public.heats where event_id = new.id and status = 'scheduled' and armed_at is not null for update loop
      perform set_config('app.audit_action', 'heat_start_aborted', true);
      perform set_config('app.reason', 'Flags switched off', true);
      update public.heats set armed_at = null, prestart_sec = null, armed_paused_at = null where id = h.id;
    end loop;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
  end if;
  return null;
end $$;

revoke all on function public.reset_event, public.reset_division, public.reset_heat, public.clear_plan_actuals from public, anon, authenticated;
grant execute on function public.reset_event, public.reset_division, public.reset_heat, public.clear_plan_actuals to authenticated;
