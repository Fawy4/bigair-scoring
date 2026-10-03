-- Flags: the start sequence and the four flag states (docs/manual/screens/flags.md).
--
--   * heats.armed_at + heats.prestart_sec: "Start sequence" arms a heat. It stays 'scheduled' while the yellow runs; the heat is running once
--     now() >= armed_at + prestart_sec and its start time is exactly that moment (server clock, so no phone has to stay awake).
--   * arm_heat, abort_start; start_heat on an armed heat is "Start now" (green at once); start_armed_if_due writes the start down once the pre-start is over.
--   * private.heat_effective_status already answers 'running' for an armed heat whose pre-start is over, so every write gate opens at green, never at the yellow.
--   * the Flags card: events.settings.flags (on by default; this migration writes it for every event, existing ones included). Switching it off cancels any armed start.
--   * the public timetable and site functions also tell the page the armed columns and the flag settings (the Flag view and the flag strip read them).

-- ---------------------------------------------------------------- 1. columns
alter table public.heats add column armed_at timestamptz, add column prestart_sec int;
alter table public.heats add constraint heats_armed_pair check ((armed_at is null) = (prestart_sec is null) and (prestart_sec is null or prestart_sec between 0 and 600));

-- every event gets the Flags card switched on (Arrow, EKL and Demo included); an event that already has a choice keeps it
update public.events
   set settings = jsonb_set(settings, '{flags}', coalesce(settings -> 'flags', '{}'::jsonb) || jsonb_build_object('enabled', coalesce((settings -> 'flags' ->> 'enabled')::boolean, true)))
 where settings is not null and jsonb_typeof(settings) = 'object' and (settings -> 'flags' ->> 'enabled') is null;

-- ---------------------------------------------------------------- 2. nobody edits the armed columns by hand
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
    new.armed_at := old.armed_at; new.prestart_sec := old.prestart_sec;
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
  return new;
end $$;

-- ---------------------------------------------------------------- 3. the server clock decides
create or replace function private.flags_on(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (e.settings -> 'flags' ->> 'enabled')::boolean from public.events e where e.id = p_event), true);
$$;

-- an armed heat whose pre-start is over: its start moment (armed_at + prestart_sec); otherwise the stored started_at
create or replace function private.heat_started_at(h public.heats) returns timestamptz
language sql stable as $$
  select case when h.started_at is null and h.status = 'scheduled' and h.armed_at is not null and now() >= h.armed_at + h.prestart_sec * interval '1 second'
              then h.armed_at + h.prestart_sec * interval '1 second' else h.started_at end;
$$;

create or replace function private.heat_effective_status(p_heat uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when h.status = 'scheduled' and h.armed_at is not null and now() >= h.armed_at + h.prestart_sec * interval '1 second'
      then case when now() >= h.armed_at + (h.prestart_sec + h.duration_sec) * interval '1 second' then 'ended' else 'running' end
    when h.status = 'running' and h.started_at is not null
         and now() >= h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec) then 'ended'
    else h.status end
  from public.heats h where h.id = p_heat;
$$;

-- writes the start down: the heat is running from the armed moment (not from the moment somebody looked)
create or replace function private.materialise_armed(p_heat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found or h.status <> 'scheduled' or h.armed_at is null then return; end if;
  if now() < h.armed_at + h.prestart_sec * interval '1 second' then return; end if;
  perform set_config('app.audit_action', 'heat_started', true);
  perform set_config('app.reason', 'The pre-start ended: the heat started by itself', true);
  update public.heats set status = 'running', started_at = h.armed_at + h.prestart_sec * interval '1 second', armed_at = null, prestart_sec = null where id = p_heat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
end $$;

-- Start the heat at a given moment (now, or the armed moment).
create or replace function private.start_heat_at(p_heat uuid, p_at timestamptz, p_reason text) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare v_row public.heats;
begin
  perform set_config('app.audit_action', 'heat_started', true);
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  update public.heats set status = 'running', started_at = p_at, armed_at = null, prestart_sec = null where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- ---------------------------------------------------------------- 4. the rules a heat must meet before it may start (shared by Start heat and Start sequence)
create or replace function private.start_gate(p_heat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; d public.divisions; ev public.events;
  v_min int; v_panel int; v_unfilled int; v_running int; v_max int;
begin
  select * into h from public.heats where id = p_heat;
  select * into ev from public.events where id = h.event_id;
  select * into d from public.divisions where id = h.division_id;
  if d.draw_locked_at is null then raise exception 'DRAW_NOT_LOCKED: %', d.name; end if;
  v_min := coalesce((private.division_model_setting(d.id, array['panel', 'minJudges']) #>> '{}')::int, 3);
  select count(*) into v_panel from public.panel_members pm join public.judge_seats s on s.id = pm.judge_seat_id
   where pm.panel_id = d.panel_id and s.active and s.status = 'active';
  if v_panel < v_min then raise exception 'PANEL_TOO_SMALL: %|%|%', d.name, v_panel, v_min; end if;
  select count(*) into v_unfilled from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id is null and hs.modifier is distinct from 'DNS';
  if v_unfilled > 0 then raise exception 'SEATS_NOT_FILLED: %', v_unfilled; end if;
  v_max := coalesce((ev.settings ->> 'maxRunningHeats')::int, 1);
  -- a heat that is armed counts as taking the water: one heat at a time
  select count(*) into v_running from public.heats x
   where x.event_id = h.event_id and x.id <> p_heat
     and (private.heat_effective_status(x.id) in ('running', 'paused') or (x.status = 'scheduled' and x.armed_at is not null));
  if v_running >= v_max then raise exception 'HEAT_ALREADY_RUNNING: %', v_max; end if;
end $$;

-- Start heat. On an armed heat it is "Start now": green at once (or, if the pre-start is already over, from the armed moment).
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
    v_at := least(now(), h.armed_at + h.prestart_sec * interval '1 second');
    return private.start_heat_at(p_heat, v_at, case when v_at < now() then 'The pre-start ended: the heat started by itself' else 'Start now during the pre-start' end);
  end if;
  perform private.start_gate(p_heat);
  return private.move_heat(p_heat, 'running', 'heat_started');
end $$;

-- Start sequence: raise the yellow. p_prestart null = the event's default; 0 = Start now (no yellow).
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
  if v_pre < 0 or v_pre > 600 then raise exception 'BAD_PRESTART'; end if;
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

-- Abort: back to red, the heat not started. The audit line has the time.
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
  update public.heats set armed_at = null, prestart_sec = null where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- Every official device may call this when the pre-start reaches 0: it writes the start down (the same moment whoever calls, and a second call changes nothing).
create or replace function public.start_armed_if_due(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or (private.has_seat(h.event_id) and not private.is_observer(h.event_id))) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat;
  return h;
end $$;

-- the heat functions that look at the stored status first write an armed heat's start down first
create or replace function public.pause_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status <> 'running' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> paused', h.status; end if;
  if private.heat_effective_status(p_heat) = 'ended' then raise exception 'HEAT_TIME_UP'; end if;
  return private.move_heat(p_heat, 'paused', 'heat_paused');
end $$;

create or replace function public.end_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status not in ('running', 'paused') then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> ended', h.status; end if;
  return private.move_heat(p_heat, 'ended', 'heat_ended');
end $$;

create or replace function public.end_heat_if_due(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or (private.has_seat(h.event_id) and not private.is_observer(h.event_id))) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status = 'running' and private.heat_effective_status(p_heat) = 'ended' then
    return private.move_heat(p_heat, 'ended', 'heat_ended_by_clock');
  end if;
  return h;
end $$;

-- switching the flags off cancels a start that is armed (the pre-start would otherwise still end in a start nobody sees on a flag)
create or replace function private.events_flags_off() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  if coalesce((old.settings -> 'flags' ->> 'enabled')::boolean, true) and not coalesce((new.settings -> 'flags' ->> 'enabled')::boolean, true) then
    for h in select id from public.heats where event_id = new.id and status = 'scheduled' and armed_at is not null for update loop
      perform set_config('app.audit_action', 'heat_start_aborted', true);
      perform set_config('app.reason', 'Flags switched off', true);
      update public.heats set armed_at = null, prestart_sec = null where id = h.id;
    end loop;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
  end if;
  return null;
end $$;
drop trigger if exists z_flags_off on public.events;
create trigger z_flags_off after update of settings on public.events for each row when (old.settings is distinct from new.settings) execute function private.events_flags_off();

-- ---------------------------------------------------------------- 5. who may call what
revoke all on function public.arm_heat(uuid, int), public.abort_start(uuid), public.start_armed_if_due(uuid), public.start_heat(uuid), public.pause_heat(uuid), public.end_heat(uuid), public.end_heat_if_due(uuid) from public, anon;
grant execute on function public.arm_heat(uuid, int), public.abort_start(uuid), public.start_armed_if_due(uuid), public.start_heat(uuid), public.pause_heat(uuid), public.end_heat(uuid), public.end_heat_if_due(uuid) to authenticated;

-- ---------------------------------------------------------------- 6. the public pages: armed columns and the flag settings
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
          'started_at', private.heat_started_at(h), 'armed_at', h.armed_at, 'prestart_sec', h.prestart_sec, 'ended_at', h.ended_at, 'paused_at', h.paused_at, 'paused_total_sec', h.paused_total_sec,
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

create or replace function public.get_public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; w public.wind_calls; v_banner boolean;
begin
  select e.* into ev from public.events e where e.slug = lower(coalesce(p_slug, '')) and private.event_is_public(e.id);
  if not found then return jsonb_build_object('found', false); end if;
  select * into org from public.organisations where id = ev.organisation_id;
  v_banner := coalesce((ev.settings ->> 'windCallBanner')::boolean, true);
  select * into w from public.wind_calls where event_id = ev.id order by created_at desc, id desc limit 1;
  return jsonb_build_object(
    'found', true,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'location', ev.location, 'start_date', ev.start_date, 'end_date', ev.end_date,
                                'status', ev.status, 'timezone', ev.timezone),
    'organisation', jsonb_build_object('name', org.name, 'slug', org.slug, 'logo_url', org.branding ->> 'logoUrl'),
    'branding', jsonb_build_object('logoUrl', ev.branding ->> 'logoUrl', 'sponsors', coalesce(ev.branding -> 'sponsors', '[]'::jsonb)),
    'settings', jsonb_build_object(
      'windCallBanner', v_banner,
      'readyCallMin', coalesce((ev.settings ->> 'readyCallMin')::int, 15),
      'livePollSec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
      'screenRotateSec', coalesce((ev.settings ->> 'screenRotateSec')::int, 20),
      'screenColourMode', case when ev.settings ->> 'screenColourMode' = 'day' then 'day' else 'dark' end,
      'publicTabsOff', case when jsonb_typeof(ev.settings -> 'publicTabsOff') = 'array' then ev.settings -> 'publicTabsOff' else '[]'::jsonb end,
      'registrationOpen', coalesce(private.registration_open(ev), false),
      'externalLeaderboards', coalesce(ev.settings -> 'externalLeaderboards', '[]'::jsonb),
      'identification', ev.settings -> 'identification',
      'publicLiveScores', coalesce(ev.settings ->> 'publicLiveScores', 'after_publish'),
      'flags', coalesce(ev.settings -> 'flags', '{}'::jsonb)),
    'wind', case when w.id is null or w.status = 'clear' or not v_banner then null
                 else jsonb_build_object('status', w.status, 'message', w.message, 'at', w.created_at) end,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'sort_order', d.sort_order, 'identification', d.identification,
        'attempt_display', coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score'),
        'show_percent', coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false),
        'drawn', d.draw_locked_at is not null) order by d.sort_order, d.created_at)
      from public.divisions d where d.event_id = ev.id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 7. arming and aborting are worth an audit line (who, when, why)
drop trigger z_audit on public.heats;
create trigger z_audit after update on public.heats for each row
  when (old.status is distinct from new.status or old.manual_override is distinct from new.manual_override or old.publish_hold is distinct from new.publish_hold
        or old.armed_at is distinct from new.armed_at)
  execute function private.audit_row();

-- ---------------------------------------------------------------- 8. the simulator's fast clock covers the start sequence
-- At speed x10 a 1:00 pre-start lasts 6 seconds. The heat's length is divided when the heat is armed (not only when it starts), so the yellow, the green and the
-- clock all use the same fast clock; the start that follows must not divide it a second time.
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
    perform set_config('app.sim_arm', 'on', true);
    update public.heats set duration_sec = greatest(3, ceil(h.duration_sec::numeric / v_speed))::int where id = p_heat;
    perform set_config('app.sim_arm', '', true);
  end if;
  return case when p_pre = 0 then 0 else greatest(3, ceil(p_pre::numeric / v_speed))::int end;
end $$;
