-- Reset per section (branch fix-reset-visibility). Builds on Phase 7a-1's Reset event (20261008100000):
--   1. heat_reset_records: what a heat held when it was reset (attempts, scores, results...), kept for the audit. Nothing reads it live.
--   2. helpers: who is running, per-heat "ever public", counts for a list of heats, the purge of a list of heats, the ladder restore of one division.
--   3. reset_event now also works for a division with no saved starting copy: TypeScript rebuilds the starting draw from the current one
--      (Round 1 seats kept, every later seat back to its placeholder) and says so on the screen. The audit line names the rebuilt divisions.
--   4. reset_division_preview / reset_division: one division back to its starting draw. Same wipe, same rebuild rule, one audit line.
--   5. clear_plan_actuals: a run order's actual starts and pins cleared (the first pin stays) so the day re-flows from it.
--   6. reset_heat_preview / reset_heat: one heat back to "not started", seats unchanged, its records moved to heat_reset_records.
-- Every reset is refused while any heat of the event is running or paused. It adds a table and functions and replaces reset_event; it changes no existing data.

-- ---------------------------------------------------------------- 1. the kept record
create table public.heat_reset_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  heat_id uuid not null,            -- no foreign key: the record outlives a heat that a later Reset event removes
  taken_at timestamptz not null default now(),
  taken_by uuid,
  reason text,
  payload jsonb not null
);
create index on public.heat_reset_records (event_id);
create index on public.heat_reset_records (heat_id);
alter table public.heat_reset_records enable row level security;
grant select on public.heat_reset_records to authenticated;
create policy read_own on public.heat_reset_records for select to authenticated using (private.can_run_heat(event_id) or private.is_platform_owner());

-- ---------------------------------------------------------------- 2. helpers
create or replace function private.running_heat_name(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(h.name, 'Heat ' || h.number::text) from public.heats h where h.event_id = p_event and h.status in ('running', 'paused') order by h.started_at limit 1;
$$;

-- "Ever shown publicly" for one heat: a result was published and not held (or was released), or the heat ran with live scores on (its own switch, else the division's, else the event's).
create or replace function private.heat_ever_public(p_heat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.heats h
    join public.divisions d on d.id = h.division_id
    join public.events e on e.id = h.event_id
    where h.id = p_heat and (
      (exists (select 1 from public.heat_results r where r.heat_id = h.id)
        and (not h.publish_hold or exists (select 1 from public.audit_log a where a.row_id = h.id and a.action = 'publish_release')))
      or (h.started_at is not null and coalesce(h.public_live, coalesce(nullif(d.live_settings ->> 'publicLiveScores', ''), nullif(e.settings ->> 'publicLiveScores', ''), 'after_publish') = 'live'))));
$$;
-- the event's answer is the same rule over its heats (as 7a-1 had it, now in one place)
create or replace function private.event_ever_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.heats h where h.event_id = p_event and private.heat_ever_public(h.id));
$$;

create or replace function private.heat_counts(p_heats uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'heats', (select count(*) from public.heats where id = any (p_heats) and (status <> 'scheduled' or started_at is not null)),
    'all_heats', (select count(*) from public.heats where id = any (p_heats)),
    'reruns', (select count(*) from public.heats where id = any (p_heats) and rerun_of is not null),
    'attempts', (select count(*) from public.trick_attempts where heat_id = any (p_heats)),
    'scores', (select count(*) from public.trick_scores where heat_id = any (p_heats)) + (select count(*) from public.impression_scores where heat_id = any (p_heats)),
    'published_results', (select count(distinct heat_id) from public.heat_results where heat_id = any (p_heats)));
$$;

-- Deletes what the given heats recorded (published results and tie decisions are append-only: the transaction-local purge switch lets this, and only inside it, delete them).
create or replace function private.wipe_heat_data(p_heats uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.allow_purge', 'on', true);
  delete from public.trick_scores where heat_id = any (p_heats);
  delete from public.attempt_flags where heat_id = any (p_heats);
  delete from public.impression_scores where heat_id = any (p_heats);
  delete from public.penalties where heat_id = any (p_heats);
  delete from public.judge_sheets where heat_id = any (p_heats);
  delete from public.heat_decisions where heat_id = any (p_heats);
  delete from public.heat_results where heat_id = any (p_heats);
  delete from public.trick_attempts where heat_id = any (p_heats);
  perform set_config('app.allow_purge', '', true);
end $$;

-- A rebuilt starting draw must be the division's own draw with the results taken off: same riders, same seed order, same rounds.
create or replace function private.rebuild_matches(d public.divisions, p_draw jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_draw is not null and d.draw is not null
    and (p_draw -> 'seedOrder') is not distinct from (d.draw -> 'seedOrder')
    and (p_draw -> 'entrants') is not distinct from (d.draw -> 'entrants')
    and (select jsonb_agg(r ->> 'id' order by o) from jsonb_array_elements(p_draw -> 'rounds') with ordinality t(r, o))
        is not distinct from (select jsonb_agg(r ->> 'id' order by o) from jsonb_array_elements(d.draw -> 'rounds') with ordinality t(r, o));
$$;

-- The ladder of one division back to a starting draw: seats, later riders and heat numbers as the draw made them. The caller has switched app.draw_bypass on
-- and deleted a re-run heat before (so every heat of the projection is found). v_item = { draw, projection }.
create or replace function private.restore_division_ladder(d public.divisions, v_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare h jsonb; s jsonb; v_round uuid; v_heat public.heats; v_kept uuid[] := '{}'; v_expected int := jsonb_array_length(v_item -> 'projection' -> 'heats');
begin
  update public.heats set number = -number - 1000000 where division_id = d.id and number > 0;
  for h in select * from jsonb_array_elements(v_item -> 'projection' -> 'heats') loop
    select id into v_round from public.rounds where division_id = d.id and spec ->> 'key' = h ->> 'round_key';
    if v_round is null then raise exception 'BAD_PROJECTION'; end if;
    select * into v_heat from public.heats where division_id = d.id and draw_uid = h ->> 'uid';
    if not found then
      select * into v_heat from public.heats where division_id = d.id and draw_uid is null and round_id = v_round and (number = (h ->> 'number')::int or number = -(h ->> 'number')::int - 1000000) and number_suffix is null;
    end if;
    if not found then raise exception 'BAD_PROJECTION'; end if;
    update public.heats set round_id = v_round, number = (h ->> 'number')::int, draw_uid = h ->> 'uid', name = nullif(h ->> 'name', ''),
           duration_sec = (h ->> 'duration_sec')::int, warm_up_sec = coalesce((h ->> 'warm_up_sec')::int, 0), manual_override = coalesce((h ->> 'manual_override')::boolean, false)
     where id = v_heat.id;
    v_kept := v_kept || v_heat.id;
    delete from public.heat_slots where heat_id = v_heat.id;
    for s in select * from jsonb_array_elements(h -> 'slots') loop
      insert into public.heat_slots (heat_id, position, entry_id, vest_colour, source, modifier)
      values (v_heat.id, (s ->> 'position')::int, nullif(s ->> 'entry_id', '')::uuid, nullif(s ->> 'vest_colour', ''), s -> 'source', case when s ->> 'modifier' = 'DNS' then 'DNS' end);
    end loop;
  end loop;
  if (select count(*) from public.heats where division_id = d.id and id <> all (v_kept)) > 0 or array_length(v_kept, 1) is distinct from v_expected then raise exception 'BAD_PROJECTION'; end if;
  update public.divisions set draw = v_item -> 'draw' where id = d.id;
end $$;

-- ---------------------------------------------------------------- 3. reset_event: a division without a saved copy is rebuilt
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
  update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
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

-- ---------------------------------------------------------------- 4. reset one division
create or replace function public.reset_division_preview(p_division uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.divisions; v_heats uuid[];
begin
  select * into d from public.divisions where id = p_division;
  if not found or not (private.is_event_organiser(d.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_heats := array(select id from public.heats where division_id = p_division);
  return jsonb_build_object(
    'name', d.name,
    'drawn', d.draw is not null,
    'has_copy', private.reset_division_source(d) is not null,
    'counts', private.heat_counts(v_heats),
    'running', private.running_heat_name(d.event_id),
    'ever_public', exists (select 1 from unnest(v_heats) x where private.heat_ever_public(x)));
end $$;

-- p_item = { division, draw, projection } for this division: the saved copy and what the draw makes of it, or (no copy) its own current draw rebuilt. Same shape as reset_event.
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
  update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
         publish_hold = false, public_live = null, flag_out = null
   where division_id = p_division;
  update public.heat_slots set place = null, total = null, breakdown = null, flagged_out = false where heat_id in (select id from public.heats where division_id = p_division);
  perform private.restore_division_ladder(d, p_item);
  perform set_config('app.draw_bypass', '', true);

  perform private.draw_audit(d.event_id, p_division, 'division_reset',
    jsonb_build_object('before', v_counts, 'after', jsonb_build_object('rebuilt', v_rebuilt, 'ever_public', v_public)), p_reason, 'divisions');
  return v_counts || jsonb_build_object('rebuilt', v_rebuilt);
end $$;

-- ---------------------------------------------------------------- 5. clear a run order's actual times
-- Actual starts of breaks and notes, and every pin except the first one in run order (the day's start). The heats' own real times are the heats' (Reset this heat / division wipes those);
-- a hold is left as it is (Resume ends it).
create or replace function public.clear_plan_actuals(p_plan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_first text; v_keep jsonb; v_actuals int; v_pins int; v_run text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found or not (private.is_event_organiser(p.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(p.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  select i ->> 'id' into v_first from jsonb_array_elements(p.items) with ordinality t(i, o) where p.anchors ? (i ->> 'id') order by o limit 1;
  v_keep := case when v_first is null then '{}'::jsonb else jsonb_build_object(v_first, p.anchors -> v_first) end;
  v_actuals := (select count(*) from jsonb_object_keys(p.actual_starts));
  v_pins := (select count(*) from jsonb_object_keys(p.anchors)) - (select count(*) from jsonb_object_keys(v_keep));
  update public.schedule_plans set anchors = v_keep, actual_starts = '{}'::jsonb where id = p_plan;
  perform private.draw_audit(p.event_id, p_plan, 'plan_actuals_cleared',
    jsonb_build_object('before', jsonb_build_object('actual_starts', p.actual_starts, 'anchors', p.anchors), 'after', jsonb_build_object('actual_starts', '{}'::jsonb, 'anchors', v_keep)), null, 'schedule_plans');
  return jsonb_build_object('actual_starts', v_actuals, 'pins', v_pins, 'kept', v_first);
end $$;

-- ---------------------------------------------------------------- 6. reset one heat
create or replace function public.reset_heat_preview(p_heat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found or not (private.can_run_heat(h.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'status', h.status,
    'counts', private.heat_counts(array[p_heat]),
    'running', private.running_heat_name(h.event_id),
    'ever_public', private.heat_ever_public(p_heat),
    'already_rerun', exists (select 1 from public.heats r where r.rerun_of = p_heat),
    'is_rerun', h.rerun_of is not null);
end $$;

-- p_before: the division's draw as the server read it (refused when it changed since). p_draw / p_seats: what TypeScript makes of taking a published result back out
-- of the draw (null / [] when the heat was never published): the new draw, and the later heats whose seats change, as publish_heat_commit has them.
-- Seats stay as they are; a DNS stays, a DSQ stays on a re-run (it was set when it was made), every other mark of the heat goes with its records.
create or replace function public.reset_heat(p_heat uuid, p_reason text, p_before jsonb, p_draw jsonb, p_seats jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.heats; d public.divisions; v_run text; v_counts jsonb; v_record uuid; v_public boolean; p jsonb; s jsonb; v_target public.heats; v_changed int := 0;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found or not (private.can_run_heat(h.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(h.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
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
  update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
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

revoke all on function public.reset_event, public.reset_division_preview, public.reset_division, public.clear_plan_actuals, public.reset_heat_preview, public.reset_heat from public, anon, authenticated;
grant execute on function public.reset_event, public.reset_division_preview, public.reset_division, public.clear_plan_actuals, public.reset_heat_preview, public.reset_heat to authenticated;
