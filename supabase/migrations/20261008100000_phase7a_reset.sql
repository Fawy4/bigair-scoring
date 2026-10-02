-- Phase 7a-1: Reset event and Restore (docs/PLAN-phase-7a.md step 8d)
--   1. divisions.draw_at_lock: the draw as it was when it was locked, kept only while no heat of the division had left "scheduled"
--   2. lock / unlock write and clear that copy; the draw guard protects it like the draw itself
--   3. event_reset_snapshots: everything a Reset wipes, as JSON, for 30 days; organisers and platform owners can read it, only the functions write it
--   4. reset_event_preview: what a Reset would do (counts, who is running, which divisions cannot be reset, whether a reason is needed)
--   5. reset_event: one transaction: checks, snapshot, wipe, the ladder back to its locked draw, one audit line
--   6. restore_event_reset: platform owners only, while no heat has started since the reset and before the snapshot expires
-- It adds a column, a table and functions and changes the lock and unlock functions; it changes no existing data.

-- ---------------------------------------------------------------- 1. the copy
alter table public.divisions add column draw_at_lock jsonb;   -- not granted to anon (the column grant list of the stored draw does not include new columns)

create or replace function private.division_draw_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.draw_bypass() then return new; end if;
  if (new.draw, new.draw_locked_at, new.draw_at_lock) is distinct from (old.draw, old.draw_locked_at, old.draw_at_lock) then raise exception 'DRAW_FUNCTION_ONLY'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2. lock and unlock
-- The copy is only trusted when it was taken before any heat ran: unlocking after a heat started is allowed, and by then the stored draw holds results and later-round riders.
-- A cancelled heat that never started does not count.
create or replace function public.lock_division_draw(p_division uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions; v_clean boolean;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if d.draw is null then raise exception 'NO_DRAW'; end if;
  if d.draw_locked_at is not null then return; end if;
  v_clean := not exists (
    select 1 from public.heats h
    where h.division_id = p_division and (h.status <> 'scheduled' or h.started_at is not null) and not (h.status = 'cancelled' and h.started_at is null));
  perform set_config('app.draw_bypass', '1', true);
  update public.divisions
     set draw_locked_at = now(),
         draw = jsonb_set(draw, '{status}', '"locked"'),
         draw_at_lock = case when v_clean then jsonb_set(draw, '{status}', '"locked"') else null end
   where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_locked', jsonb_build_object('after', jsonb_build_object('locked', true, 'starting_draw_kept', v_clean)));
end $$;

create or replace function public.unlock_division_draw(p_division uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if d.draw_locked_at is null then return; end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.divisions set draw_locked_at = null, draw = jsonb_set(draw, '{status}', '"draft"'), draw_at_lock = null where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_unlocked', jsonb_build_object('before', jsonb_build_object('locked', true), 'after', jsonb_build_object('locked', false)), p_reason);
end $$;
revoke all on function public.lock_division_draw, public.unlock_division_draw from public, anon, authenticated;
grant execute on function public.lock_division_draw, public.unlock_division_draw to authenticated;

-- ---------------------------------------------------------------- 3. snapshots
create table public.event_reset_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  organisation_id uuid not null,
  taken_at timestamptz not null default now(),
  taken_by uuid,
  expires_at timestamptz not null default (now() + interval '30 days'),
  payload jsonb not null,
  restored_at timestamptz
);
create index on public.event_reset_snapshots (event_id);
alter table public.event_reset_snapshots enable row level security;
grant select on public.event_reset_snapshots to authenticated;
create policy read_own on public.event_reset_snapshots for select to authenticated using (private.is_event_organiser(event_id) or private.is_platform_owner());

-- ---------------------------------------------------------------- helpers
-- The divisions' starting draw: the copy taken at lock time; an unlocked draw that no heat has left yet is its own starting draw.
create or replace function private.reset_division_source(d public.divisions) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    d.draw_at_lock,
    case when d.draw_locked_at is null and not exists (select 1 from public.heats h where h.division_id = d.id and (h.status <> 'scheduled' or h.started_at is not null) and not (h.status = 'cancelled' and h.started_at is null)) then d.draw end);
$$;

-- "Ever shown publicly": a result was published and is not held (or was released), or a heat ran with live scores on (its own switch, else the division's, else the event's).
create or replace function private.event_ever_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.heats h
    join public.divisions d on d.id = h.division_id
    join public.events e on e.id = h.event_id
    where h.event_id = p_event and (
      (exists (select 1 from public.heat_results r where r.heat_id = h.id)
        and (not h.publish_hold or exists (select 1 from public.audit_log a where a.row_id = h.id and a.action = 'publish_release')))
      or (h.started_at is not null and coalesce(h.public_live, coalesce(nullif(d.live_settings ->> 'publicLiveScores', ''), nullif(e.settings ->> 'publicLiveScores', ''), 'after_publish') = 'live'))));
$$;

create or replace function private.reset_counts(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'heats', (select count(*) from public.heats where event_id = p_event and (status <> 'scheduled' or started_at is not null)),
    'all_heats', (select count(*) from public.heats where event_id = p_event),
    'reruns', (select count(*) from public.heats where event_id = p_event and rerun_of is not null),
    'attempts', (select count(*) from public.trick_attempts where event_id = p_event),
    'scores', (select count(*) from public.trick_scores where event_id = p_event) + (select count(*) from public.impression_scores where event_id = p_event),
    'published_results', (select count(distinct heat_id) from public.heat_results where event_id = p_event));
$$;

-- ---------------------------------------------------------------- 4. preview
create or replace function public.reset_event_preview(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_running text;
begin
  select * into ev from public.events where id = p_event;
  if not found or not (private.is_event_organiser(p_event) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  select coalesce(h.name, 'Heat ' || h.number::text) into v_running from public.heats h where h.event_id = p_event and h.status in ('running', 'paused') order by h.started_at limit 1;
  return jsonb_build_object(
    'slug', ev.slug,
    'counts', private.reset_counts(p_event),
    'running', v_running,
    'ever_public', private.event_ever_public(p_event),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'drawn', d.draw is not null, 'has_copy', private.reset_division_source(d) is not null,
        'heat_left_scheduled', exists (select 1 from public.heats h where h.division_id = d.id and (h.status <> 'scheduled' or h.started_at is not null) and not (h.status = 'cancelled' and h.started_at is null)))
        order by d.sort_order) from public.divisions d where d.event_id = p_event), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 5. reset
-- p_draws: [{ division, draw, projection }] for every drawn division. `draw` must be the division's starting draw as the database holds it; `projection` is what the
-- pure drawProjection makes of it (rounds, heats, seats). Same pattern as save_division_draw: TypeScript computes, the function checks and writes.
create or replace function public.reset_event(p_event uuid, p_slug text, p_reason text, p_draws jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; d public.divisions; v_run text; v_missing text; v_counts jsonb; v_snapshot uuid; v_public boolean; v_item jsonb;
  h jsonb; s jsonb; v_round uuid; v_heat public.heats; v_id uuid; v_kept uuid[]; v_expected int; v_role text;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not (private.is_event_organiser(p_event) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  if lower(btrim(coalesce(p_slug, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;

  delete from public.event_reset_snapshots where expires_at < now();

  select coalesce(x.name, 'Heat ' || x.number::text) into v_run from public.heats x where x.event_id = p_event and x.status in ('running', 'paused') order by x.started_at limit 1;
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;

  select string_agg(dv.name, ', ' order by dv.sort_order) into v_missing from public.divisions dv where dv.event_id = p_event and dv.draw is not null and private.reset_division_source(dv) is null;
  if v_missing is not null then raise exception 'DRAW_COPY_MISSING: %', v_missing; end if;

  v_public := private.event_ever_public(p_event);
  if v_public and (p_reason is null or char_length(btrim(p_reason)) < 5) then raise exception 'REASON_REQUIRED'; end if;

  -- every drawn division comes with its starting draw and the rows that draw is made of
  if p_draws is null or jsonb_typeof(p_draws) <> 'array' then raise exception 'BAD_PROJECTION'; end if;
  for d in select * from public.divisions dv where dv.event_id = p_event and dv.draw is not null loop
    select i into v_item from jsonb_array_elements(p_draws) i where i ->> 'division' = d.id::text limit 1;
    if v_item is null or (v_item -> 'draw') is distinct from private.reset_division_source(d) then raise exception 'BAD_PROJECTION'; end if;
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

  -- the wipe (published results and tie decisions are append-only: the transaction-local purge switch lets this function, and only inside this transaction, delete them)
  perform set_config('app.allow_purge', 'on', true);
  perform set_config('app.draw_bypass', '1', true);
  delete from public.trick_scores where event_id = p_event;
  delete from public.attempt_flags where event_id = p_event;
  delete from public.impression_scores where event_id = p_event;
  delete from public.penalties where event_id = p_event;
  delete from public.judge_sheets where event_id = p_event;
  delete from public.heat_decisions where event_id = p_event;
  delete from public.heat_results where event_id = p_event;
  delete from public.trick_attempts where event_id = p_event;
  perform set_config('app.allow_purge', '', true);

  -- a re-run goes (its run order row with it, by the run order trigger); the original returns to "scheduled" with its draw id back below
  delete from public.heats where event_id = p_event and rerun_of is not null;
  update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
         publish_hold = false, public_live = null, flag_out = null
   where event_id = p_event;
  update public.heat_slots set place = null, total = null, breakdown = null, flagged_out = false where event_id = p_event;
  update public.schedule_plans set actual_starts = '{}'::jsonb, hold = null where event_id = p_event;

  -- the ladder back to its starting draw: seats, rounds' later riders and heat numbers as the draw made them
  for d in select * from public.divisions dv where dv.event_id = p_event and dv.draw is not null order by dv.sort_order loop
    select i into v_item from jsonb_array_elements(p_draws) i where i ->> 'division' = d.id::text limit 1;
    v_kept := '{}';
    v_expected := jsonb_array_length(v_item -> 'projection' -> 'heats');
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
  end loop;
  perform set_config('app.draw_bypass', '', true);

  v_role := case when private.is_event_organiser(p_event) then 'organiser' else 'platform_owner' end;
  insert into public.audit_log (event_id, organisation_id, actor_user_id, action, table_name, row_id, before, after, reason)
  values (p_event, ev.organisation_id, auth.uid(), 'event_reset', 'events', p_event, v_counts, jsonb_build_object('role', v_role, 'snapshot', v_snapshot, 'ever_public', v_public), nullif(btrim(coalesce(p_reason, '')), ''));

  return v_counts || jsonb_build_object('snapshot', v_snapshot);
end $$;

-- ---------------------------------------------------------------- 6. restore
create or replace function public.restore_event_reset(p_snapshot uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sn public.event_reset_snapshots; ev public.events; pl jsonb; d jsonb;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  delete from public.event_reset_snapshots where expires_at < now() and id <> p_snapshot;
  select * into sn from public.event_reset_snapshots where id = p_snapshot for update;
  if not found then raise exception 'SNAPSHOT_NOT_FOUND'; end if;
  if sn.expires_at < now() then
    delete from public.event_reset_snapshots where id = p_snapshot;
    raise exception 'SNAPSHOT_EXPIRED';
  end if;
  select * into ev from public.events where id = sn.event_id for update;
  if exists (select 1 from public.heats h where h.event_id = sn.event_id and (h.status <> 'scheduled' or h.started_at is not null)) then raise exception 'HEAT_STARTED'; end if;
  pl := sn.payload;

  perform set_config('app.draw_bypass', '1', true);
  -- heats: the draw ids are freed first (a re-run and its original shared one), then every heat takes its saved row; a deleted re-run is put back
  update public.heats set draw_uid = null where event_id = sn.event_id;
  update public.heats h set round_id = r.round_id, number = r.number, number_suffix = r.number_suffix, name = r.name, status = r.status, duration_sec = r.duration_sec, warm_up_sec = r.warm_up_sec,
         draw_uid = r.draw_uid, started_at = r.started_at, paused_at = r.paused_at, paused_total_sec = r.paused_total_sec, ended_at = r.ended_at, published_at = r.published_at,
         reopened_at = r.reopened_at, publish_hold = r.publish_hold, public_live = r.public_live, flag_out = r.flag_out, manual_override = r.manual_override, rerun_of = null
    from jsonb_populate_recordset(null::public.heats, pl -> 'heats') r where h.id = r.id;
  insert into public.heats select r.* from jsonb_populate_recordset(null::public.heats, pl -> 'heats') r where r.rerun_of is null and not exists (select 1 from public.heats x where x.id = r.id);
  insert into public.heats select r.* from jsonb_populate_recordset(null::public.heats, pl -> 'heats') r where r.rerun_of is not null and not exists (select 1 from public.heats x where x.id = r.id);
  update public.heats h set rerun_of = r.rerun_of from jsonb_populate_recordset(null::public.heats, pl -> 'heats') r where h.id = r.id and r.rerun_of is not null;
  delete from public.heat_slots where event_id = sn.event_id;
  insert into public.heat_slots select r.* from jsonb_populate_recordset(null::public.heat_slots, pl -> 'heat_slots') r;
  for d in select * from jsonb_array_elements(pl -> 'divisions') loop
    update public.divisions set draw = d -> 'draw' where id = (d ->> 'id')::uuid;
  end loop;
  perform set_config('app.draw_bypass', '', true);

  insert into public.trick_attempts select r.* from jsonb_populate_recordset(null::public.trick_attempts, pl -> 'trick_attempts') r;
  insert into public.trick_scores select r.* from jsonb_populate_recordset(null::public.trick_scores, pl -> 'trick_scores') r;
  insert into public.attempt_flags select r.* from jsonb_populate_recordset(null::public.attempt_flags, pl -> 'attempt_flags') r;
  insert into public.impression_scores select r.* from jsonb_populate_recordset(null::public.impression_scores, pl -> 'impression_scores') r;
  insert into public.penalties select r.* from jsonb_populate_recordset(null::public.penalties, pl -> 'penalties') r;
  insert into public.judge_sheets select r.* from jsonb_populate_recordset(null::public.judge_sheets, pl -> 'judge_sheets') r;
  insert into public.heat_decisions select r.* from jsonb_populate_recordset(null::public.heat_decisions, pl -> 'heat_decisions') r;
  insert into public.heat_results select r.* from jsonb_populate_recordset(null::public.heat_results, pl -> 'heat_results') r;
  update public.schedule_plans p set items = r.items, anchors = r.anchors, actual_starts = r.actual_starts, hold = r.hold
    from jsonb_populate_recordset(null::public.schedule_plans, pl -> 'schedule_plans') r where p.id = r.id;

  insert into public.audit_log (event_id, organisation_id, actor_user_id, action, table_name, row_id, before, after, reason)
  values (sn.event_id, ev.organisation_id, auth.uid(), 'event_reset_restored', 'events', sn.event_id, null, jsonb_build_object('snapshot', sn.id, 'taken_at', sn.taken_at), null);
  delete from public.event_reset_snapshots where id = p_snapshot;
  return jsonb_build_object('event', sn.event_id, 'taken_at', sn.taken_at);
end $$;

revoke all on function public.reset_event_preview, public.reset_event, public.restore_event_reset from public, anon, authenticated;
grant execute on function public.reset_event_preview, public.reset_event, public.restore_event_reset to authenticated;
