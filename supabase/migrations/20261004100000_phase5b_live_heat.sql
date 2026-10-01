-- Phase 5b: live heat operations, part 1 (docs/PLAN-phase-5.md steps 1 to 3; owner's answers of 1 Oct 2026).
--   1. columns: heats.reopened_at, divisions.live_settings, the height columns and sensor_bindings (data model only, no screens)
--   2. who may run a heat, and the heat functions: start, pause, resume, end, end-if-due, cancel (server time is truth)
--   3. plan changes for the head judge: hold and pins (set_plan_hold, set_plan_anchors)
--   4. the spotter's Undo (10 seconds)
--   5. judge sheets (submit and reopen), attempt flags, and the new lock rule for a judge's marks
--   6. realtime for the new tables

-- ---------------------------------------------------------------- 1. columns
alter table public.heats add column reopened_at timestamptz;
alter table public.divisions add column live_settings jsonb not null default '{}' check (jsonb_typeof(live_settings) = 'object');

-- WOO height data plugs in later (trick_attempts.height_m exists since Phase 3).
alter table public.trick_attempts
  add column height_source text check (height_source is null or height_source in ('manual', 'sensor', 'woo')),
  add column height_ref text,
  add column height_at timestamptz;

create table public.sensor_bindings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade, -- filled from the entry by trigger
  entry_id uuid not null references public.entries on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  external_user_id text,
  device_serial text,
  bound_at timestamptz not null default now(),
  unbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (external_user_id is not null or device_serial is not null)
);
create index on public.sensor_bindings (event_id);
create index on public.sensor_bindings (entry_id);

create or replace function private.sensor_binding_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select e.event_id into new.event_id from public.entries e where e.id = new.entry_id;
  if new.event_id is null then raise exception 'PARENT_NOT_FOUND'; end if;
  return new;
end $$;
create trigger a_fill before insert on public.sensor_bindings for each row execute function private.sensor_binding_fill();
create trigger z_updated_at before update on public.sensor_bindings for each row execute function private.set_updated_at();
create trigger z_audit after insert or update or delete on public.sensor_bindings for each row execute function private.audit_row();

alter table public.sensor_bindings enable row level security;
grant select, insert, update, delete on public.sensor_bindings to authenticated;
create policy org_all on public.sensor_bindings for all to authenticated using (private.is_event_organiser(event_id)) with check (private.is_event_organiser(event_id));
create policy seat_read on public.sensor_bindings for select to authenticated using (private.has_seat(event_id));

-- The trick base now also holds the spotter's layout; it must be an object.
create or replace function private.divisions_trick_base_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.trick_base is distinct from old.trick_base then
    if new.trick_base ? 'disabled' and jsonb_typeof(new.trick_base -> 'disabled') is distinct from 'array' then raise exception 'TRICK_BASE_INVALID'; end if;
    if new.trick_base ? 'layout' and jsonb_typeof(new.trick_base -> 'layout') is distinct from 'object' then raise exception 'TRICK_BASE_INVALID'; end if;
    if exists (select 1 from public.heats h where h.division_id = old.id and h.started_at is not null)
       and exists (select 1 from jsonb_array_elements_text(coalesce(new.trick_base -> 'disabled', '[]'::jsonb)) d(v)
                   where not (coalesce(old.trick_base -> 'disabled', '[]'::jsonb) ? d.v)) then
      raise exception 'TRICK_BASE_LOCKED';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2. who runs a heat, and the heat functions
-- "Head" means a head seat of the event or an organiser of the event (docs/05 decision 20).
create or replace function private.can_run_heat(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_event_organiser(p_event) or coalesce(private.seat_role(p_event), '') = 'head';
$$;

create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

-- A setting of the merged model for a division (the division's override wins), at any path, e.g. {panel,minJudges}.
create or replace function private.division_model_setting(p_division uuid, p_path text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(d.scoring_overrides #> p_path, m.json #> p_path)
  from public.divisions d left join public.scoring_models m on m.id = d.scoring_model_id
  where d.id = p_division;
$$;

-- Nobody moves a heat by editing its row: the functions below are the only way (they check the rules and write the audit line).
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
    new.publish_hold := old.publish_hold;
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

-- One place to change a heat's state: checks the caller, the current state, and writes the audit line.
create or replace function private.move_heat(p_heat uuid, p_to text, p_action text, p_reason text default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare v_row public.heats;
begin
  perform set_config('app.audit_action', p_action, true);
  perform set_config('app.reason', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), ''), true);
  update public.heats set status = p_to where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

create or replace function public.start_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; d public.divisions; ev public.events;
  v_min int; v_panel int; v_unfilled int; v_running int; v_max int;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  -- one start at a time per event, so two heads pressing together cannot both get the last place
  select * into ev from public.events where id = h.event_id for update;
  select * into h from public.heats where id = p_heat for update;
  if h.status <> 'scheduled' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  select * into d from public.divisions where id = h.division_id;

  if d.draw_locked_at is null then raise exception 'DRAW_NOT_LOCKED: %', d.name; end if;

  v_min := coalesce((private.division_model_setting(d.id, array['panel', 'minJudges']) #>> '{}')::int, 3);
  select count(*) into v_panel from public.panel_members pm join public.judge_seats s on s.id = pm.judge_seat_id
   where pm.panel_id = d.panel_id and s.active and s.status = 'active';
  if v_panel < v_min then raise exception 'PANEL_TOO_SMALL: %|%|%', d.name, v_panel, v_min; end if;

  select count(*) into v_unfilled from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id is null and hs.modifier is distinct from 'DNS';
  if v_unfilled > 0 then raise exception 'SEATS_NOT_FILLED: %', v_unfilled; end if;

  v_max := coalesce((ev.settings ->> 'maxRunningHeats')::int, 1);
  select count(*) into v_running from public.heats x
   where x.event_id = h.event_id and x.id <> p_heat and private.heat_effective_status(x.id) in ('running', 'paused');
  if v_running >= v_max then raise exception 'HEAT_ALREADY_RUNNING: %', v_max; end if;

  return private.move_heat(p_heat, 'running', 'heat_started');
end $$;

create or replace function public.pause_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.status <> 'running' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> paused', h.status; end if;
  if private.heat_effective_status(p_heat) = 'ended' then raise exception 'HEAT_TIME_UP'; end if;
  return private.move_heat(p_heat, 'paused', 'heat_paused');
end $$;

create or replace function public.resume_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.status <> 'paused' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  return private.move_heat(p_heat, 'running', 'heat_resumed');
end $$;

create or replace function public.end_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.status not in ('running', 'paused') then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> ended', h.status; end if;
  return private.move_heat(p_heat, 'ended', 'heat_ended');
end $$;

-- Every official device calls this when its timer reaches 0, so "end at zero" needs no cron and no trusted client.
-- It ends the heat only when the time is really up, and a second call changes nothing.
create or replace function public.end_heat_if_due(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or private.has_seat(h.event_id)) then raise exception 'NOT_ALLOWED'; end if;
  if h.status = 'running' and private.heat_effective_status(p_heat) = 'ended' then
    return private.move_heat(p_heat, 'ended', 'heat_ended_by_clock');
  end if;
  return h;
end $$;

create or replace function public.cancel_heat(p_heat uuid, p_reason text) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if h.status = 'cancelled' then return h; end if;
  v_row := private.move_heat(p_heat, 'cancelled', 'heat_cancelled', p_reason);
  -- a heat that had started keeps started_at and gets an end, so the timetable knows how long it really ran
  if h.started_at is not null and v_row.ended_at is null then
    perform set_config('app.audit_action', '', true);
    update public.heats set ended_at = case when h.status = 'paused' then coalesce(h.paused_at, now()) else now() end where id = p_heat returning * into v_row;
  end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------- 3. plan changes for the head judge (hold and pins only, on the active plan)
create or replace function public.set_plan_hold(p_plan uuid, p_hold jsonb, p_reason text default null, p_expected timestamptz default null, p_anchors jsonb default null)
returns public.schedule_plans
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_new public.schedule_plans; k text; v text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not private.can_run_heat(p.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not p.active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if p_expected is not null and p.updated_at is distinct from p_expected then raise exception 'PLAN_CHANGED'; end if;
  if p_hold is not null and (jsonb_typeof(p_hold) <> 'object' or (p_hold ->> 'since')::timestamptz is null) then raise exception 'BAD_PLAN_VALUE'; end if;
  if p_anchors is not null then
    if jsonb_typeof(p_anchors) <> 'object' then raise exception 'BAD_PLAN_VALUE'; end if;
    for k, v in select * from jsonb_each_text(p_anchors) loop
      if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'BAD_PLAN_VALUE'; end if;
    end loop;
  end if;
  update public.schedule_plans set hold = p_hold, anchors = coalesce(p_anchors, anchors) where id = p_plan returning * into v_new;
  perform private.draw_audit(p.event_id, p_plan, case when p_hold is null then 'plan_hold_cleared' else 'plan_hold_set' end,
    jsonb_build_object('before', jsonb_build_object('hold', p.hold, 'anchors', p.anchors), 'after', jsonb_build_object('hold', v_new.hold, 'anchors', v_new.anchors)), p_reason, 'schedule_plans');
  return v_new;
end $$;

create or replace function public.set_plan_anchors(p_plan uuid, p_anchors jsonb, p_reason text default null, p_expected timestamptz default null)
returns public.schedule_plans
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_new public.schedule_plans; k text; v text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not private.can_run_heat(p.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not p.active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if p_expected is not null and p.updated_at is distinct from p_expected then raise exception 'PLAN_CHANGED'; end if;
  if p_anchors is null or jsonb_typeof(p_anchors) <> 'object' then raise exception 'BAD_PLAN_VALUE'; end if;
  for k, v in select * from jsonb_each_text(p_anchors) loop
    if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'BAD_PLAN_VALUE'; end if;
  end loop;
  update public.schedule_plans set anchors = p_anchors where id = p_plan returning * into v_new;
  perform private.draw_audit(p.event_id, p_plan, 'plan_anchors_set',
    jsonb_build_object('before', jsonb_build_object('anchors', p.anchors), 'after', jsonb_build_object('anchors', v_new.anchors)), p_reason, 'schedule_plans');
  return v_new;
end $$;

-- ---------------------------------------------------------------- 4. spotter Undo last (10 seconds, the creating seat only)
create or replace function public.undo_attempt(p_attempt uuid) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; h public.heats; v_row public.trick_attempts;
begin
  select * into a from public.trick_attempts where id = p_attempt for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if a.created_by_seat is null or a.created_by_seat is distinct from private.seat_id(a.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if a.deleted_at is not null then return a; end if;
  select * into h from public.heats where id = a.heat_id;
  if h.status in ('published', 'cancelled') then raise exception 'HEAT_PUBLISHED'; end if;
  if now() > a.created_at + interval '10 seconds' then raise exception 'UNDO_TOO_LATE'; end if;
  perform set_config('app.audit_action', 'attempt_undone', true);
  update public.trick_attempts set deleted_at = now(), deleted_by = auth.uid() where id = p_attempt returning * into v_row;
  perform set_config('app.audit_action', '', true);
  return v_row;
end $$;

-- ---------------------------------------------------------------- 5. judge sheets, flags and the new lock rule
-- A judge's marks lock at Submit or when the head judge moves the heat to review, whichever comes first (owner, 1 Oct 2026).
-- The head judge can reopen one judge's sheet. The three-minute grace period (events.settings.judgeGraceSec) is no longer read.
create table public.judge_sheets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  heat_id uuid not null references public.heats on delete cascade,
  judge_seat_id uuid not null references public.judge_seats on delete cascade,
  submitted_at timestamptz,
  reopened_at timestamptz,
  reopened_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, judge_seat_id)
);
create index on public.judge_sheets (event_id);
create index on public.judge_sheets (judge_seat_id);

create table public.attempt_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  heat_id uuid not null references public.heats on delete cascade,
  attempt_id uuid not null references public.trick_attempts on delete cascade,
  judge_seat_id uuid not null references public.judge_seats on delete cascade,
  kind text not null check (kind in ('crash', 'landed', 'wrong_rider', 'duplicate', 'other')),
  note text,
  client_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text
);
create index on public.attempt_flags (event_id);
create index on public.attempt_flags (heat_id);
create index on public.attempt_flags (attempt_id);
create index on public.attempt_flags (judge_seat_id);

create trigger z_updated_at before update on public.judge_sheets for each row execute function private.set_updated_at();
create trigger z_updated_at before update on public.attempt_flags for each row execute function private.set_updated_at();
create trigger z_audit after insert or update or delete on public.judge_sheets for each row execute function private.audit_row();
create trigger z_audit after insert or update or delete on public.attempt_flags for each row execute function private.audit_row();

alter table public.judge_sheets enable row level security;
alter table public.attempt_flags enable row level security;
grant select on public.judge_sheets, public.attempt_flags to authenticated;
-- written only through submit_sheet, reopen_sheet and submit_flag below
create policy own_read on public.judge_sheets for select to authenticated using (judge_seat_id = private.seat_id(event_id));
create policy head_read on public.judge_sheets for select to authenticated using (coalesce(private.seat_role(event_id), '') = 'head');
create policy org_read on public.judge_sheets for select to authenticated using (private.is_event_organiser(event_id));
create policy own_read on public.attempt_flags for select to authenticated using (judge_seat_id = private.seat_id(event_id));
create policy head_read on public.attempt_flags for select to authenticated using (coalesce(private.seat_role(event_id), '') = 'head');
create policy org_read on public.attempt_flags for select to authenticated using (private.is_event_organiser(event_id));

-- Why may this judge not write a mark for this heat right now? Null = they may. The code is what the phone shows.
create or replace function private.judge_write_block(p_heat uuid, p_impression boolean) returns text
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; v_seat uuid; v_eff text; s public.judge_sheets; v_found boolean; v_locked boolean; v_reopened boolean;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then return 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = v_seat) then
    return 'NOT_ALLOWED';
  end if;
  select * into s from public.judge_sheets where heat_id = p_heat and judge_seat_id = v_seat;
  v_found := found;
  v_locked := v_found and s.submitted_at is not null and (s.reopened_at is null or s.submitted_at > s.reopened_at);
  v_reopened := v_found and s.reopened_at is not null and (s.submitted_at is null or s.reopened_at >= s.submitted_at);
  if v_locked then return 'SHEET_LOCKED'; end if;
  v_eff := private.heat_effective_status(p_heat);
  if v_eff in ('under_review', 'published') then return case when v_reopened then null else 'SHEET_LOCKED' end; end if;
  if v_eff = 'ended' then return null; end if;
  if v_eff in ('running', 'paused') then return case when p_impression then 'IMPRESSION_NOT_OPEN' else null end; end if;
  return 'HEAT_NOT_RUNNING';
end $$;

-- the row policies of trick_scores and impression_scores keep calling this (RLS stays the backstop)
create or replace function private.judge_can_write(p_heat uuid, p_impression boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.judge_write_block(p_heat, p_impression) is null;
$$;

create or replace function public.submit_trick_score(
  p_attempt uuid, p_criteria jsonb, p_score numeric, p_missed boolean, p_flag text, p_client_key uuid, p_client_rev bigint
) returns public.trick_scores
language plpgsql security invoker set search_path = '' as $$
declare a public.trick_attempts; r public.trick_scores; v_seat uuid; v_block text;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  v_seat := private.seat_id(a.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  -- judges never score a crash (owner, 1 Oct 2026); a judge who saw a landing flags it and the head judge switches it
  if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
  v_block := private.judge_write_block(a.heat_id, false);
  if v_block is not null then raise exception '%', v_block; end if;
  insert into public.trick_scores as ts (attempt_id, judge_seat_id, criteria, score, missed, flag, client_key, client_rev, edited_by, event_id, heat_id)
  values (p_attempt, v_seat, coalesce(p_criteria, '{}'), case when p_missed then null else p_score end, coalesce(p_missed, false), p_flag,
          p_client_key, p_client_rev, auth.uid(), a.event_id, a.heat_id)
  on conflict (attempt_id, judge_seat_id) do update
    set criteria = excluded.criteria, score = excluded.score, missed = excluded.missed, flag = excluded.flag,
        client_key = excluded.client_key, client_rev = excluded.client_rev, version = ts.version + 1, edited_by = auth.uid()
    where excluded.client_rev > ts.client_rev
  returning * into r;
  if r.id is null then -- an older queued edit arrived late: keep the newer mark
    select * into r from public.trick_scores where attempt_id = p_attempt and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

create or replace function public.submit_impression(p_heat uuid, p_entry uuid, p_value numeric, p_client_key uuid, p_client_rev bigint)
returns public.impression_scores
language plpgsql security invoker set search_path = '' as $$
declare h public.heats; r public.impression_scores; v_seat uuid; v_block text;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  v_block := private.judge_write_block(p_heat, true);
  if v_block is not null then raise exception '%', v_block; end if;
  if not exists (select 1 from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  insert into public.impression_scores as i (heat_id, entry_id, judge_seat_id, value, client_key, client_rev, event_id)
  values (p_heat, p_entry, v_seat, p_value, p_client_key, p_client_rev, h.event_id)
  on conflict (heat_id, entry_id, judge_seat_id) do update
    set value = excluded.value, client_key = excluded.client_key, client_rev = excluded.client_rev
    where excluded.client_rev > i.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.impression_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

-- A flag needs no score (trick_scores.flag stays unused). "That was a crash" only on a landed attempt, "That was a landing" only on a crashed one.
create or replace function public.submit_flag(p_attempt uuid, p_kind text, p_note text, p_client_key uuid) returns public.attempt_flags
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; r public.attempt_flags; v_seat uuid; v_block text;
begin
  select * into r from public.attempt_flags where client_key = p_client_key;
  if found then return r; end if; -- a retry of the same tap
  select * into a from public.trick_attempts where id = p_attempt;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  v_seat := private.seat_id(a.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  v_block := private.judge_write_block(a.heat_id, false);
  if v_block is not null then raise exception '%', v_block; end if;
  if p_kind not in ('crash', 'landed', 'wrong_rider', 'duplicate', 'other') then raise exception 'BAD_FLAG'; end if;
  if (p_kind = 'crash' and a.status <> 'landed') or (p_kind = 'landed' and a.status <> 'crashed') then raise exception 'FLAG_NOT_APPLICABLE'; end if;
  insert into public.attempt_flags (event_id, heat_id, attempt_id, judge_seat_id, kind, note, client_key)
  values (a.event_id, a.heat_id, a.id, v_seat, p_kind, nullif(btrim(coalesce(p_note, '')), ''), p_client_key)
  returning * into r;
  return r;
end $$;

-- "Submit": the server half of "Submit only when every rider has a score". Locks this judge's marks for the heat.
create or replace function public.submit_sheet(p_heat uuid) returns public.judge_sheets
language plpgsql security definer set search_path = '' as $$
declare h public.heats; s public.judge_sheets; v_seat uuid; v_block text; v_imp jsonb; v_missing int; v_locked boolean;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null or not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = v_seat) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into s from public.judge_sheets where heat_id = p_heat and judge_seat_id = v_seat;
  v_locked := found and s.submitted_at is not null and (s.reopened_at is null or s.submitted_at > s.reopened_at);
  if v_locked then return s; end if; -- pressing twice is harmless
  if private.heat_effective_status(p_heat) not in ('ended', 'under_review') then raise exception 'IMPRESSION_NOT_OPEN'; end if;
  v_imp := private.division_model_setting(h.division_id, array['heat', 'impression']);
  if v_imp is not null and jsonb_typeof(v_imp) = 'object' and coalesce((v_imp ->> 'required')::boolean, true) then
    select count(*) into v_missing from public.heat_slots hs
     where hs.heat_id = p_heat and hs.entry_id is not null and hs.modifier is null
       and not exists (select 1 from public.impression_scores i where i.heat_id = p_heat and i.entry_id = hs.entry_id and i.judge_seat_id = v_seat);
    if v_missing > 0 then raise exception 'IMPRESSION_MISSING: %', v_missing; end if;
  end if;
  insert into public.judge_sheets (event_id, heat_id, judge_seat_id, submitted_at) values (h.event_id, p_heat, v_seat, now())
  on conflict (heat_id, judge_seat_id) do update set submitted_at = now()
  returning * into s;
  return s;
end $$;

create or replace function public.reopen_sheet(p_heat uuid, p_seat uuid, p_reason text) returns public.judge_sheets
language plpgsql security definer set search_path = '' as $$
declare h public.heats; s public.judge_sheets;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (select 1 from public.judge_seats js where js.id = p_seat and js.event_id = h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform set_config('app.audit_action', 'sheet_reopened', true);
  perform set_config('app.reason', btrim(p_reason), true);
  insert into public.judge_sheets (event_id, heat_id, judge_seat_id, reopened_at, reopened_reason) values (h.event_id, p_heat, p_seat, now(), btrim(p_reason))
  on conflict (heat_id, judge_seat_id) do update set reopened_at = now(), reopened_reason = btrim(p_reason)
  returning * into s;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return s;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.start_heat, public.pause_heat, public.resume_heat, public.end_heat, public.end_heat_if_due, public.cancel_heat,
  public.set_plan_hold, public.set_plan_anchors, public.undo_attempt, public.submit_trick_score, public.submit_impression, public.submit_flag,
  public.submit_sheet, public.reopen_sheet from public, anon;
grant execute on function public.start_heat, public.pause_heat, public.resume_heat, public.end_heat, public.end_heat_if_due, public.cancel_heat,
  public.set_plan_hold, public.set_plan_anchors, public.undo_attempt, public.submit_trick_score, public.submit_impression, public.submit_flag,
  public.submit_sheet, public.reopen_sheet to authenticated;
revoke all on function public.server_now from public;
grant execute on function public.server_now to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 6. realtime for the new tables
alter publication supabase_realtime add table public.attempt_flags, public.judge_sheets;
alter table public.attempt_flags replica identity full;
alter table public.judge_sheets replica identity full;
