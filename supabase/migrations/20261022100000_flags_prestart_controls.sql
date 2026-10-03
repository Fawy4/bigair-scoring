-- Flags, console controls: Pre-start choice, +1 min, and one pause for the yellow too.
--
--   * heats.armed_paused_at: the pre-start is frozen (Pause on the console, or Pause on the simulator): the countdown stands still, Resume carries on from the same remaining time.
--   * extend_prestart: "+1 min" adds exactly 60 seconds to the remaining pre-start (in a simulation 60 s of fast-clock time); the heat length and the last-minute setting never change.
--   * heats.time_scale: the simulator's speed a heat runs at (1, 5, 10, 20), so every screen can scale the last-minute length and the break the same way as the heat clock and the pre-start.
--   * a heat that goes back to "not started" (Reset this heat, a re-run) never keeps a start sequence.
--   * the pre-start the head judge types is 0:10 to 15:00 (or 0 = Start now).
--   * sim_fast_forward: "Skip to end of heat" brings the clock of the heat on the water to 0:00 without ending it.

-- Start at a given moment: the start sequence is over (and with it a frozen pre-start)
create or replace function private.start_heat_at(p_heat uuid, p_at timestamptz, p_reason text) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare v_row public.heats;
begin
  perform set_config('app.audit_action', 'heat_started', true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  update public.heats set status = 'running', started_at = p_at, armed_at = null, prestart_sec = null, armed_paused_at = null where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

alter table public.heats add column armed_paused_at timestamptz, add column time_scale int not null default 1 check (time_scale in (1, 5, 10, 20));
alter table public.heats drop constraint heats_armed_pair;
alter table public.heats add constraint heats_armed_pair check ((armed_at is null) = (prestart_sec is null) and (prestart_sec is null or prestart_sec between 0 and 3600) and (armed_paused_at is null or armed_at is not null));

create or replace function private.heats_guard() returns trigger
language plpgsql as $$
declare
  priv boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  v_end timestamptz;
  v_started timestamptz := new.started_at; v_paused_at timestamptz := new.paused_at;
  v_paused_total int := new.paused_total_sec; v_ended timestamptz := new.ended_at; v_published timestamptz := new.published_at;
begin
  if not priv then
    if new.status is distinct from old.status then raise exception 'USE_HEAT_FUNCTIONS'; end if;
    -- server-owned columns cannot be edited by hand
    new.started_at := old.started_at; new.paused_at := old.paused_at; new.paused_total_sec := old.paused_total_sec;
    new.ended_at := old.ended_at; new.published_at := old.published_at; new.live_rev := old.live_rev;
    new.reopened_at := old.reopened_at;
    new.event_id := old.event_id; new.division_id := old.division_id; new.round_id := old.round_id;
    new.publish_hold := old.publish_hold; new.public_live := old.public_live; new.rerun_of := old.rerun_of;
    new.armed_at := old.armed_at; new.prestart_sec := old.prestart_sec; new.armed_paused_at := old.armed_paused_at; new.time_scale := old.time_scale;
    v_started := old.started_at; v_paused_at := old.paused_at; v_paused_total := old.paused_total_sec; v_ended := old.ended_at; v_published := old.published_at;
  end if;

  if new.status is distinct from old.status then
    if not priv and not (
      (old.status = 'scheduled' and new.status in ('running', 'cancelled')) or
      (old.status = 'running' and new.status in ('paused', 'ended', 'cancelled')) or
      (old.status = 'paused' and new.status in ('running', 'ended', 'cancelled')) or
      (old.status = 'ended' and new.status in ('under_review', 'cancelled')) or
      (old.status = 'under_review' and new.status in ('cancelled')) or
      (old.status = 'published' and new.status = 'under_review')
    ) then
      raise exception 'ILLEGAL_HEAT_TRANSITION: % -> %', old.status, new.status;
    end if;

    if old.status = 'scheduled' and new.status = 'running' then
      v_started := now();
    elsif old.status = 'running' and new.status = 'paused' then
      v_paused_at := now();
    elsif old.status = 'paused' and new.status = 'running' then
      v_paused_total := old.paused_total_sec + greatest(0, ceil(extract(epoch from (now() - coalesce(old.paused_at, now()))))::int);
      v_paused_at := null;
    elsif new.status = 'ended' and old.status in ('running', 'paused') then
      if old.status = 'paused' then
        v_ended := coalesce(old.paused_at, now());
      else
        v_end := old.started_at + make_interval(secs => old.duration_sec + old.paused_total_sec);
        v_ended := least(now(), coalesce(v_end, now()));
      end if;
    elsif new.status = 'published' then
      v_published := now();
    end if;

    -- privileged callers (publish, seeds, tests) may set a column explicitly; everyone else gets the computed value
    if not priv or new.started_at is not distinct from old.started_at then new.started_at := v_started; end if;
    if not priv or new.paused_at is not distinct from old.paused_at then new.paused_at := v_paused_at; end if;
    if not priv or new.paused_total_sec is not distinct from old.paused_total_sec then new.paused_total_sec := v_paused_total; end if;
    if not priv or new.ended_at is not distinct from old.ended_at then new.ended_at := v_ended; end if;
    if not priv or new.published_at is not distinct from old.published_at then new.published_at := v_published; end if;
  end if;
  if new.status = 'scheduled' and old.status is distinct from 'scheduled' then new.armed_at := null; new.prestart_sec := null; new.armed_paused_at := null; end if;
  return new;
end $$;

create or replace function private.heat_started_at(h public.heats) returns timestamptz
language sql stable as $$
  select case when h.started_at is null and h.status = 'scheduled' and h.armed_at is not null and h.armed_paused_at is null and now() >= h.armed_at + h.prestart_sec * interval '1 second'
              then h.armed_at + h.prestart_sec * interval '1 second' else h.started_at end;
$$;

create or replace function private.heat_effective_status(p_heat uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when h.status = 'scheduled' and h.armed_at is not null and h.armed_paused_at is null and now() >= h.armed_at + h.prestart_sec * interval '1 second'
      then case when now() >= h.armed_at + (h.prestart_sec + h.duration_sec) * interval '1 second' then 'ended' else 'running' end
    when h.status = 'running' and h.started_at is not null
         and now() >= h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec) then 'ended'
    else h.status end
  from public.heats h where h.id = p_heat;
$$;

create or replace function private.materialise_armed(p_heat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found or h.status <> 'scheduled' or h.armed_at is null then return; end if;
  if h.armed_paused_at is not null or now() < h.armed_at + h.prestart_sec * interval '1 second' then return; end if;
  perform set_config('app.audit_action', 'heat_started', true);
  perform set_config('app.reason', 'The pre-start ended: the heat started by itself', true);
  update public.heats set status = 'running', started_at = h.armed_at + h.prestart_sec * interval '1 second', armed_at = null, prestart_sec = null, armed_paused_at = null where id = p_heat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
end $$;

create or replace function public.start_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; ev public.events; v_at timestamptz;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  -- one start at a time per event, so two heads pressing together cannot both get the last place
  select * into ev from public.events where id = h.event_id for update;
  select * into h from public.heats where id = p_heat for update;
  if h.status <> 'scheduled' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  if h.armed_at is not null then
    v_at := case when h.armed_paused_at is not null then now() else least(now(), h.armed_at + h.prestart_sec * interval '1 second') end;
    return private.start_heat_at(p_heat, v_at, case when h.armed_paused_at is null and v_at < now() then 'The pre-start ended: the heat started by itself' else 'Start now during the pre-start' end);
  end if;
  perform private.start_gate(p_heat);
  return private.move_heat(p_heat, 'running', 'heat_started');
end $$;

create or replace function public.arm_heat(p_heat uuid, p_prestart int default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; ev public.events; v_pre int; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = h.event_id for update;
  select * into h from public.heats where id = p_heat for update;
  if not private.flags_on(h.event_id) then raise exception 'FLAGS_OFF'; end if;
  if h.status <> 'scheduled' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  if h.armed_at is not null then raise exception 'ALREADY_ARMED'; end if;
  v_pre := coalesce(p_prestart, (ev.settings -> 'flags' ->> 'prestartSec')::int, 60);
  if v_pre <> 0 and (v_pre < 10 or v_pre > 900) then raise exception 'BAD_PRESTART'; end if;
  perform private.start_gate(p_heat);
  v_pre := private.sim_arm_clock(p_heat, v_pre); -- a simulation at x10 has a 6 s pre-start
  if v_pre = 0 then return private.start_heat_at(p_heat, now(), 'Start now (no pre-start)'); end if;
  perform set_config('app.audit_action', 'heat_armed', true);
  perform set_config('app.reason', 'Start sequence: ' || v_pre || ' s pre-start', true);
  update public.heats set armed_at = now(), prestart_sec = v_pre where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

create or replace function public.abort_start(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat;
  if h.status <> 'scheduled' or h.armed_at is null then raise exception 'NOTHING_ARMED'; end if;
  perform set_config('app.audit_action', 'heat_start_aborted', true);
  perform set_config('app.reason', 'Start sequence aborted', true);
  update public.heats set armed_at = null, prestart_sec = null, armed_paused_at = null where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- Pause: a heat in its yellow freezes the countdown (red "Paused"); a running heat pauses as before.
create or replace function public.pause_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status = 'scheduled' and h.armed_at is not null then
    if h.armed_paused_at is not null then raise exception 'ILLEGAL_HEAT_TRANSITION: scheduled -> paused'; end if;
    perform set_config('app.audit_action', 'heat_prestart_paused', true);
    perform set_config('app.reason', 'Pre-start paused', true);
    update public.heats set armed_paused_at = now() where id = p_heat returning * into h;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
    return h;
  end if;
  if h.status <> 'running' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> paused', h.status; end if;
  if private.heat_effective_status(p_heat) = 'ended' then raise exception 'HEAT_TIME_UP'; end if;
  return private.move_heat(p_heat, 'paused', 'heat_paused');
end $$;

-- Resume: a paused pre-start carries on from the same remaining time (the start moment moves by the time it was paused).
create or replace function public.resume_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.status = 'scheduled' and h.armed_at is not null and h.armed_paused_at is not null then
    perform set_config('app.audit_action', 'heat_prestart_resumed', true);
    perform set_config('app.reason', 'Pre-start resumed', true);
    update public.heats set armed_at = armed_at + (now() - armed_paused_at), armed_paused_at = null where id = p_heat returning * into h;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
    return h;
  end if;
  if h.status <> 'paused' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  return private.move_heat(p_heat, 'running', 'heat_resumed');
end $$;

-- +1 min: exactly 60 seconds more on the pre-start that is running (or paused). Whole minutes only, repeatable, audited. Nothing else changes.
create or replace function public.extend_prestart(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_add int; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status <> 'scheduled' or h.armed_at is null then raise exception 'NOTHING_ARMED'; end if;
  v_add := greatest(1, 60 / h.time_scale);
  if h.prestart_sec + v_add > 3600 then raise exception 'BAD_PRESTART'; end if;
  perform set_config('app.audit_action', 'heat_prestart_extended', true);
  perform set_config('app.reason', '+1 min: pre-start ' || h.prestart_sec || ' s to ' || (h.prestart_sec + v_add) || ' s', true);
  update public.heats set prestart_sec = prestart_sec + v_add where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- the simulator's fast clock also stamps the speed on the heat; a Reset puts it back
create or replace function private.sim_fast_clock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_speed int;
begin
  if old.status = 'scheduled' and new.status = 'running' then
    if exists (select 1 from public.sim_clock where heat_id = new.id) then return new; end if;
    select c.speed into v_speed from public.sim_control c join public.events e on e.id = c.event_id where c.event_id = new.event_id and e.is_simulation;
    if coalesce(v_speed, 1) > 1 then
      insert into public.sim_clock (heat_id, event_id, original_sec, speed) values (new.id, new.event_id, old.duration_sec, v_speed) on conflict (heat_id) do nothing;
      new.duration_sec := greatest(3, ceil(old.duration_sec::numeric / v_speed))::int;
      new.time_scale := v_speed;
    end if;
  end if;
  return new;
end $$;

create or replace function private.sim_arm_clock(p_heat uuid, p_pre int) returns int
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_speed int;
begin
  select * into h from public.heats where id = p_heat;
  select c.speed into v_speed from public.sim_control c join public.events e on e.id = c.event_id where c.event_id = h.event_id and e.is_simulation;
  if coalesce(v_speed, 1) <= 1 then return p_pre; end if;
  if not exists (select 1 from public.sim_clock where heat_id = p_heat) then
    insert into public.sim_clock (heat_id, event_id, original_sec, speed) values (p_heat, h.event_id, h.duration_sec, v_speed) on conflict (heat_id) do nothing;
    update public.heats set duration_sec = greatest(3, ceil(h.duration_sec::numeric / v_speed))::int, time_scale = v_speed where id = p_heat;
  end if;
  return case when p_pre = 0 then 0 else greatest(3, ceil(p_pre::numeric / v_speed))::int end;
end $$;

create or replace function private.sim_clock_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.heats set time_scale = 1 where id = old.heat_id;
  return null;
end $$;
drop trigger if exists z_sim_clock_deleted on public.sim_clock;
create trigger z_sim_clock_deleted after delete on public.sim_clock for each row execute function private.sim_clock_deleted();

-- ONE pause: a frozen pre-start moves the simulator to "paused", a resumed one back to "playing", exactly like a heat on the water (Polish 2b)
create or replace function private.heats_sync_sim_prestart() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.armed_paused_at is null and new.armed_paused_at is not null then
    update public.sim_control set state = 'paused', updated_at = now() where event_id = new.event_id and state = 'playing';
  elsif old.armed_paused_at is not null and new.armed_paused_at is null and new.armed_at is not null then
    update public.sim_control set state = 'playing', updated_at = now() where event_id = new.event_id and state = 'paused';
  end if;
  return null;
end $$;
drop trigger if exists z_heats_sync_sim_prestart on public.heats;
create trigger z_heats_sync_sim_prestart after update of armed_paused_at on public.heats for each row when (old.armed_paused_at is distinct from new.armed_paused_at) execute function private.heats_sync_sim_prestart();

-- the "paused by the simulator" mark also lives while a pre-start is frozen
create or replace function private.heats_clear_paused_reason() returns trigger
language plpgsql as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then new.paused_reason := old.paused_reason; end if;
  if new.status is distinct from 'paused' and new.armed_paused_at is null then new.paused_reason := null; end if;
  return new;
end $$;

create or replace function public.sim_pause_heats(p_event uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare h record; n int := 0;
begin
  perform private.sim_guard(p_event);
  for h in select id from public.heats where event_id = p_event and status = 'running' for update loop
    if private.heat_effective_status(h.id) = 'ended' then continue; end if; -- its time is up: the next tick ends it
    perform private.move_heat(h.id, 'paused', 'heat_paused', 'Paused by the simulator');
    update public.heats set paused_reason = 'simulator' where id = h.id;
    n := n + 1;
  end loop;
  -- a heat in its yellow: the countdown freezes where it is
  for h in select id from public.heats where event_id = p_event and status = 'scheduled' and armed_at is not null and armed_paused_at is null and now() < armed_at + prestart_sec * interval '1 second' for update loop
    perform set_config('app.audit_action', 'heat_prestart_paused', true);
    perform set_config('app.reason', 'Pre-start paused by the simulator', true);
    update public.heats set armed_paused_at = now(), paused_reason = 'simulator' where id = h.id;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.sim_resume_heats(p_event uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare h record; n int := 0;
begin
  perform private.sim_guard(p_event);
  for h in select id from public.heats where event_id = p_event and status = 'paused' for update loop
    perform private.move_heat(h.id, 'running', 'heat_resumed', 'Resumed by the simulator');
    n := n + 1;
  end loop;
  for h in select id from public.heats where event_id = p_event and status = 'scheduled' and armed_at is not null and armed_paused_at is not null for update loop
    perform set_config('app.audit_action', 'heat_prestart_resumed', true);
    perform set_config('app.reason', 'Pre-start resumed by the simulator', true);
    update public.heats set armed_at = armed_at + (now() - armed_paused_at), armed_paused_at = null where id = h.id;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Skip to end of heat (the simulator): the clock of the heat on the water goes to 0:00 so the virtual officials can finish it; the heat is ended by the clock as usual
create or replace function public.sim_fast_forward(p_event uuid, p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_row public.heats;
begin
  perform private.sim_guard(p_event);
  select * into h from public.heats where id = p_heat and event_id = p_event for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if h.status <> 'running' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> ended', h.status; end if;
  perform set_config('app.audit_action', 'heat_fast_forwarded', true);
  perform set_config('app.reason', 'Skip to end of heat (simulator): the clock went to 0:00', true);
  update public.heats set started_at = least(started_at, now() - (duration_sec + paused_total_sec) * interval '1 second') where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

drop trigger z_audit on public.heats;
create trigger z_audit after update on public.heats for each row
  when (old.status is distinct from new.status or old.manual_override is distinct from new.manual_override or old.publish_hold is distinct from new.publish_hold
        or old.armed_at is distinct from new.armed_at or old.prestart_sec is distinct from new.prestart_sec or old.armed_paused_at is distinct from new.armed_paused_at
        or old.started_at is distinct from new.started_at)
  execute function private.audit_row();

create or replace function public.get_public_timetable(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object(
    'allowed', true, 'server_now', now(), 'timezone', ev.timezone,
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'flags', coalesce(ev.settings -> 'flags', '{}'::jsonb),
    'ready_call_min', coalesce((ev.settings ->> 'readyCallMin')::int, 15),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'day', p.day, 'name', p.name, 'items', p.items, 'anchors', p.anchors,
                'actual_starts', p.actual_starts, 'hold', p.hold, 'defaults', p.defaults) order by p.day, p.created_at)
              from public.schedule_plans p where p.event_id = p_event and p.active), '[]'::jsonb),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'sort_order', d.sort_order) order by d.sort_order, d.created_at)
              from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'division_id', r.division_id, 'name', r.name, 'short_name', r.short_name, 'sort_order', r.sort_order) order by r.sort_order)
              from public.rounds r join public.divisions d on d.id = r.division_id where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'heats', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'division_id', h.division_id, 'round_id', h.round_id, 'number', h.number, 'suffix', h.number_suffix, 'name', h.name,
          'status', h.status, 'effective_status', private.heat_effective_status(h.id), 'held', h.publish_hold,
          'started_at', private.heat_started_at(h), 'armed_at', h.armed_at, 'prestart_sec', h.prestart_sec, 'armed_paused_at', h.armed_paused_at, 'time_scale', h.time_scale, 'ended_at', h.ended_at, 'paused_at', h.paused_at, 'paused_total_sec', h.paused_total_sec,
          'duration_sec', h.duration_sec, 'warm_up_sec', h.warm_up_sec, 'rerun_of', h.rerun_of,
          'round_last', coalesce((dh.j ->> 'roundLast')::boolean, h.number = (select max(x.number) from public.heats x where x.round_id = h.round_id)),
          'break_after_heat_min', (dh.j ->> 'breakAfterHeatMin')::numeric, 'break_after_round_min', (dh.j ->> 'breakAfterRoundMin')::numeric)
          order by d.sort_order, r.sort_order, h.number, coalesce(h.number_suffix, ''))
        from public.heats h
        join public.divisions d on d.id = h.division_id
        join public.rounds r on r.id = h.round_id
        cross join lateral (select private.draw_heat(d.draw, h.draw_uid) as j) dh
        where h.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb));
end $$;

revoke all on function public.pause_heat(uuid), public.resume_heat(uuid), public.extend_prestart(uuid), public.sim_pause_heats(uuid), public.sim_resume_heats(uuid), public.sim_fast_forward(uuid, uuid), public.start_heat(uuid), public.arm_heat(uuid, int), public.abort_start(uuid) from public, anon;
grant execute on function public.pause_heat(uuid), public.resume_heat(uuid), public.extend_prestart(uuid), public.sim_pause_heats(uuid), public.sim_resume_heats(uuid), public.sim_fast_forward(uuid, uuid), public.start_heat(uuid), public.arm_heat(uuid, int), public.abort_start(uuid) to authenticated;
