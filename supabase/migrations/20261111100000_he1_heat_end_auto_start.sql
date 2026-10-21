-- HE1 — Heat end, auto start, next heat (0.25.0). Everything here is additive: nothing is dropped, no published result is read or written.
--
--   1. add_attempt: the spotter (and the head judge, an organiser, a judge who may log) can log on an ENDED, unpublished heat: the clock reaching 0, End heat and a heat
--      under review all accept; a published heat refuses (HEAT_PUBLISHED); Re-open (published -> under review) gives the writes back. Paused stays head-only, as before.
--   2. A line logged after a judge has submitted reopens that judge's sheet (judge_sheets.reopened_at), so the judge scores the new line and the console counts him as
--      not finished again. A published or cancelled heat never reopens anything.
--   3. An attempt that is fixed (switched landed/crashed, moved to another rider, taken out) resolves the judges' open flags that were about it.
--   4. Auto start: events.settings.startNextHeat ('manual' | 'after_publish' | 'run_order'), events.settings.autoStartOff (the head judge's switch), and per heat
--      auto_start_at / auto_start_mode (the 10-second notice). plan_auto_start (head judge / organiser), stop_auto_start, set_auto_start and auto_start_if_due
--      (every official's phone and console calls it; it acts only when the server's own clock says the notice has run out and every rule still holds).
--      arm_heat's body moved to private.arm_heat_core so the automatic start is exactly the head judge's Start heat sequence.

-- ---------------------------------------------------------------- 1. a late line on an ended heat
create or replace function public.add_attempt(
  p_heat uuid, p_entry uuid, p_client_key uuid, p_status text,
  p_direction text default null, p_category_key text default null, p_trick_name text default null,
  p_trick_parts jsonb default '{}', p_height_m numeric default null,
  p_input_method text default 'builder', p_raw_text text default null, p_override_reason text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; ev public.events; slot public.heat_slots; v_row public.trick_attempts;
  v_role text; v_seat uuid; v_org boolean; v_privileged boolean; v_eff text;
  v_cap int; v_used int; v_seq int; v_dup uuid; v_window int; v_over boolean := false;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  select * into ev from public.events where id = h.event_id;
  v_org := private.is_event_organiser(h.event_id);
  v_seat := private.seat_id(h.event_id);
  v_role := coalesce(private.seat_role(h.event_id), ''); -- never null: `not (null)` would let a seatless user through
  if not v_org and not (v_role in ('spotter', 'head') or (v_role = 'judge' and coalesce((ev.settings ->> 'judgesMayLogAttempts')::boolean, false))) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_privileged := v_org or v_role = 'head';

  -- safe retry: the same client_key returns the attempt that already exists
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then
    if v_row.heat_id <> p_heat then raise exception 'CLIENT_KEY_REUSED'; end if;
    return v_row;
  end if;

  v_eff := private.heat_effective_status(p_heat);
  -- HE1: the clock reaching 0 or End heat never closes the spotter's sheet: a heat that has ended and is not published still takes lines (the last jumps are often logged
  -- after the horn). Once it is published nothing is added until the head judge re-opens it. A paused heat is the head judge's, as before.
  if v_eff = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if not (v_eff in ('running', 'ended', 'under_review') or (v_privileged and v_eff = 'paused')) then
    raise exception 'HEAT_NOT_RUNNING';
  end if;

  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if slot.modifier is not null or slot.flagged_out then raise exception 'RIDER_NOT_RIDING'; end if;

  -- one rider, one lock: two phones cannot both take the last place
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then return v_row; end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  select count(*) into v_used from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null;
  if v_cap is not null and v_used >= v_cap then
    if p_override_reason is null or not v_privileged then raise exception 'ATTEMPT_CAP_REACHED'; end if;
    if btrim(p_override_reason) = '' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
    -- owner's decision 8: the head judge, or an organiser when the event has no head judge (always with a reason)
    if not (v_role = 'head' or (v_org and not private.event_has_active_head(h.event_id))) then raise exception 'NOT_ALLOWED'; end if;
    v_over := true;
  end if;

  select coalesce(max(a.seq), 0) + 1 into v_seq from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry;

  -- two different spotters logging the same rider within the window: flag it for the head judge, never drop it
  v_window := coalesce((private.division_heat_setting(h.division_id, 'duplicateWindowSec') #>> '{}')::int, 20);
  select a.id into v_dup from public.trick_attempts a
   where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null
     and a.created_by_seat is distinct from v_seat and a.created_at > now() - make_interval(secs => v_window)
   order by a.created_at desc limit 1;

  if v_over then
    perform set_config('app.audit_action', 'attempt_cap_override', true);
    perform set_config('app.reason', p_override_reason, true);
  end if;
  insert into public.trick_attempts (heat_id, entry_id, seq, client_key, status, direction, category_key, trick_name, trick_parts,
                                     height_m, created_by_seat, input_method, raw_text, possible_duplicate_of, event_id)
  values (p_heat, p_entry, v_seq, p_client_key, p_status, p_direction, p_category_key, p_trick_name, coalesce(p_trick_parts, '{}'),
          p_height_m, v_seat, coalesce(p_input_method, 'builder'), p_raw_text, v_dup, h.event_id)
  returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- undo (10 seconds) and the spotter's own correction already refuse only a published or cancelled heat; the same words for a published heat everywhere
revoke all on function public.add_attempt(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, text, text, text) from public, anon;
grant execute on function public.add_attempt(uuid, uuid, uuid, text, text, text, text, jsonb, numeric, text, text, text) to authenticated;

-- ---------------------------------------------------------------- 2. a late line reopens the sheet of a judge who has submitted
create or replace function private.attempt_reopens_sheets() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text; s record; v_action text := coalesce(current_setting('app.audit_action', true), ''); v_reason text := coalesce(current_setting('app.reason', true), '');
begin
  if new.status <> 'landed' or new.deleted_at is not null then return null; end if; -- judges never score a crash
  if tg_op = 'UPDATE' then
    if old.status = 'landed' and old.deleted_at is null then return null; end if; -- only a line that has become scorable
  end if;
  select status into v_status from public.heats where id = new.heat_id;
  if v_status is null or v_status in ('published', 'cancelled', 'scheduled') then return null; end if; -- a published result is never touched
  for s in
    select js.id, js.judge_seat_id from public.judge_sheets js
     where js.heat_id = new.heat_id and js.submitted_at is not null and (js.reopened_at is null or js.submitted_at > js.reopened_at)
       and not exists (select 1 from public.trick_scores ts where ts.attempt_id = new.id and ts.judge_seat_id = js.judge_seat_id)
     for update
  loop
    perform private.audit_ctx('sheet_reopened_by_new_attempt', 'New attempt to score');
    update public.judge_sheets set reopened_at = now(), reopened_reason = 'New attempt to score' where id = s.id;
  end loop;
  -- this trigger runs before the audit trigger of the attempt: hand the caller's audit words back as they were (an over-the-cap line is audited as such)
  perform set_config('app.audit_action', v_action, true);
  perform set_config('app.reason', v_reason, true);
  return null;
end $$;
drop trigger if exists x_reopen_sheets on public.trick_attempts;
create trigger x_reopen_sheets after insert or update of status, deleted_at on public.trick_attempts for each row execute function private.attempt_reopens_sheets();

-- ---------------------------------------------------------------- 3. fixing an attempt resolves the flags about it
create or replace function private.attempt_fix_resolves_flags() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_reason text := nullif(btrim(coalesce(current_setting('app.reason', true), '')), ''); v_text text;
begin
  v_text := case
    when new.deleted_at is not null and old.deleted_at is null then 'Attempt taken out'
    when new.status is distinct from old.status then 'Switched to ' || new.status
    when new.entry_id is distinct from old.entry_id then 'Moved to another rider'
    else 'Attempt corrected' end;
  if v_reason is not null then v_text := v_text || ': ' || v_reason; end if;
  update public.attempt_flags f
     set resolved_at = now(), resolved_by = auth.uid(), resolution = v_text
   where f.attempt_id = new.id and f.resolved_at is null
     and (
       (new.deleted_at is not null and old.deleted_at is null)
       or (f.kind = 'crash' and new.status = 'crashed' and old.status is distinct from 'crashed')
       or (f.kind = 'landed' and new.status = 'landed' and old.status is distinct from 'landed')
       or (f.kind = 'wrong_rider' and new.entry_id is distinct from old.entry_id)
       or (f.kind = 'other' and (new.status is distinct from old.status or new.entry_id is distinct from old.entry_id or new.trick_name is distinct from old.trick_name or new.direction is distinct from old.direction))
     );
  return null;
end $$;
drop trigger if exists x_fix_resolves_flags on public.trick_attempts;
create trigger x_fix_resolves_flags after update of status, entry_id, deleted_at, trick_name, direction on public.trick_attempts for each row
  when (old.status is distinct from new.status or old.entry_id is distinct from new.entry_id or old.deleted_at is distinct from new.deleted_at
        or old.trick_name is distinct from new.trick_name or old.direction is distinct from new.direction)
  execute function private.attempt_fix_resolves_flags();

-- ---------------------------------------------------------------- 4. auto start: the notice lives on the heat
alter table public.heats add column if not exists auto_start_at timestamptz, add column if not exists auto_start_mode text;
alter table public.heats drop constraint if exists heats_auto_start_pair;
alter table public.heats add constraint heats_auto_start_pair check ((auto_start_at is null) = (auto_start_mode is null) and (auto_start_mode is null or auto_start_mode in ('after_publish', 'run_order')));

-- nobody edits the notice by hand; it ends the moment the heat is armed, started or cancelled by any other way
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
    new.auto_start_at := old.auto_start_at; new.auto_start_mode := old.auto_start_mode;
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
  -- the notice ends when the heat leaves "not started" or is armed (by hand or by the notice itself)
  if new.status is distinct from 'scheduled' or new.armed_at is not null then new.auto_start_at := null; new.auto_start_mode := null; end if;
  return new;
end $$;

-- the Start sequence itself, without the "who is asking" check: the head judge's button and the automatic start run exactly this
create or replace function private.arm_heat_core(p_heat uuid, p_prestart int, p_reason text default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; ev public.events; v_pre int; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  select * into ev from public.events where id = h.event_id for update;
  select * into h from public.heats where id = p_heat for update;
  if not private.flags_on(h.event_id) then raise exception 'FLAGS_OFF'; end if;
  if h.status <> 'scheduled' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> running', h.status; end if;
  if h.armed_at is not null then raise exception 'ALREADY_ARMED'; end if;
  v_pre := coalesce(p_prestart, (ev.settings -> 'flags' ->> 'prestartSec')::int, 60);
  if v_pre <> 0 and (v_pre < 10 or v_pre > 900) then raise exception 'BAD_PRESTART'; end if;
  perform private.start_gate(p_heat);
  v_pre := private.sim_arm_clock(p_heat, v_pre); -- a simulation at x10 has a 6 s pre-start
  if v_pre = 0 then return private.start_heat_at(p_heat, now(), coalesce(p_reason, 'Start now (no pre-start)')); end if;
  perform set_config('app.audit_action', 'heat_armed', true);
  perform set_config('app.reason', coalesce(p_reason || ' — ', '') || 'Start sequence: ' || v_pre || ' s pre-start', true);
  update public.heats set armed_at = now(), prestart_sec = v_pre where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

create or replace function public.arm_heat(p_heat uuid, p_prestart int default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  return private.arm_heat_core(p_heat, p_prestart, null);
end $$;
revoke all on function public.arm_heat(uuid, int) from public, anon;
grant execute on function public.arm_heat(uuid, int) to authenticated;

-- Why may this heat not be started by itself right now? Null = it may. The words are the console's.
create or replace function private.auto_start_blocker(p_heat uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; ev public.events; v_wind text; v_unfilled int; v_riding int;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return 'HEAT_NOT_FOUND'; end if;
  select * into ev from public.events where id = h.event_id;
  if h.status <> 'scheduled' or h.armed_at is not null then return 'NOT_WAITING'; end if;
  if coalesce(ev.settings ->> 'startNextHeat', 'manual') = 'manual' or coalesce((ev.settings ->> 'autoStartOff')::boolean, false) then return 'OFF'; end if;
  -- the previous heat is published: no heat of the event is still on the water, waiting for its result, or in its pre-start
  if exists (
    select 1 from public.heats x
     where x.event_id = h.event_id and x.id <> p_heat
       and (private.heat_effective_status(x.id) in ('running', 'paused', 'ended', 'under_review') or (x.status = 'scheduled' and x.armed_at is not null))
  ) then return 'PREVIOUS_NOT_PUBLISHED'; end if;
  if exists (select 1 from public.schedule_plans p where p.event_id = h.event_id and p.active and p.hold is not null) then return 'HOLD'; end if;
  select w.status into v_wind from public.wind_calls w where w.event_id = h.event_id order by w.created_at desc limit 1;
  if v_wind in ('red', 'amber') then return 'WIND_CALL'; end if;
  select count(*) into v_unfilled from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id is null and hs.modifier is distinct from 'DNS';
  if v_unfilled > 0 then return 'SEATS_NOT_FILLED'; end if;
  select count(*) into v_riding from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id is not null and hs.modifier is null;
  if v_riding < 2 then return 'WALKOVER_UNDECIDED'; end if;
  return null;
end $$;

-- The notice: "Next heat sequence starts in 10 s — Stop". Called by the head judge's / organiser's console (after Publish, or when the run order time is near).
-- After Publish the sequence starts 10 s from now; at the run order time it starts so that the heat itself begins at p_heat_start_at (never sooner than 10 s from now).
create or replace function public.plan_auto_start(p_heat uuid, p_mode text, p_heat_start_at timestamptz default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; ev public.events; v_block text; v_pre int; v_at timestamptz; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_mode is null or p_mode not in ('after_publish', 'run_order') then raise exception 'BAD_AUTO_START'; end if;
  select * into ev from public.events where id = h.event_id for update;
  select * into h from public.heats where id = p_heat for update;
  if h.auto_start_at is not null then return h; end if; -- a second press / second console: one notice
  if coalesce(ev.settings ->> 'startNextHeat', 'manual') <> p_mode or coalesce((ev.settings ->> 'autoStartOff')::boolean, false) then raise exception 'AUTO_START_OFF'; end if;
  v_block := private.auto_start_blocker(p_heat);
  if v_block is not null then raise exception 'AUTO_START_BLOCKED: %', v_block; end if;
  if p_mode = 'after_publish' then
    v_at := now() + interval '10 seconds';
  else
    if p_heat_start_at is null then raise exception 'BAD_AUTO_START'; end if;
    v_pre := case when private.flags_on(h.event_id) then coalesce((ev.settings -> 'flags' ->> 'prestartSec')::int, 60) else 0 end;
    v_at := greatest(p_heat_start_at - v_pre * interval '1 second', now() + interval '10 seconds');
    if v_at > now() + interval '12 seconds' then raise exception 'AUTO_START_TOO_EARLY'; end if;
  end if;
  update public.heats set auto_start_at = v_at, auto_start_mode = p_mode where id = p_heat returning * into v_row;
  perform private.head_audit(h.event_id, 'heats', p_heat, 'auto_start_planned', null, jsonb_build_object('mode', p_mode, 'at', v_at),
    case p_mode when 'after_publish' then 'Next heat sequence starts in 10 s (after Publish)' else 'Next heat sequence starts in 10 s (run order time)' end);
  return v_row;
end $$;

-- Stop: this heat is not started by itself (the head judge starts it by hand). The switch for the rest of the event is set_auto_start.
create or replace function public.stop_auto_start(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.auto_start_at is null then return h; end if;
  update public.heats set auto_start_at = null, auto_start_mode = null where id = p_heat returning * into v_row;
  perform private.head_audit(h.event_id, 'heats', p_heat, 'auto_start_stopped', null, jsonb_build_object('mode', h.auto_start_mode), 'Stopped by the head judge before the sequence started');
  return v_row;
end $$;

-- The head judge's switch for the rest of the event (the Event step's setting stays as written). Switching off also ends a notice that is running.
create or replace function public.set_auto_start(p_event uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_off boolean; h record;
begin
  if p_on is null then raise exception 'BAD_AUTO_START'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if not private.can_run_heat(p_event) then raise exception 'NOT_ALLOWED'; end if;
  v_off := not p_on;
  if coalesce((ev.settings ->> 'autoStartOff')::boolean, false) = v_off then return p_on; end if;
  update public.events set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{autoStartOff}', to_jsonb(v_off), true) where id = p_event;
  perform private.head_audit(p_event, 'events', p_event, 'auto_start_switched', null, jsonb_build_object('on', p_on), case when p_on then 'Auto start switched on' else 'Auto start switched off' end);
  if v_off then
    for h in select id from public.heats where event_id = p_event and auto_start_at is not null for update loop
      update public.heats set auto_start_at = null, auto_start_mode = null where id = h.id;
      perform private.head_audit(p_event, 'heats', h.id, 'auto_start_stopped', null, null, 'Auto start switched off');
    end loop;
  end if;
  return p_on;
end $$;

-- Every official's phone and console calls this about once a second while a notice runs. It acts only when the notice has run out on the server's clock, and only if every
-- rule still holds (the previous heat published, no Hold, no stop or hold wind call, every seat filled, auto start still on): otherwise the notice ends and the audit log says why.
create or replace function public.auto_start_if_due(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h record; v_block text; v_row public.heats; v_how text; v_started uuid; v_blocked text;
begin
  if not (private.is_event_organiser(p_event) or (private.has_seat(p_event) and not private.is_observer(p_event))) then raise exception 'NOT_ALLOWED'; end if;
  for h in select id, auto_start_mode from public.heats where event_id = p_event and auto_start_at is not null and auto_start_at <= now() order by auto_start_at for update skip locked loop
    -- the notice itself is not a reason to refuse: clear it first, then ask the rules
    perform set_config('app.audit_action', 'auto_start_notice_ended', true);
    perform set_config('app.reason', '', true);
    update public.heats set auto_start_at = null, auto_start_mode = null where id = h.id;
    perform set_config('app.audit_action', '', true);
    v_block := private.auto_start_blocker(h.id);
    v_how := case h.auto_start_mode when 'after_publish' then 'after Publish' else 'at its run order time' end;
    if v_block is null then
      begin
        if private.flags_on(p_event) then
          v_row := private.arm_heat_core(h.id, null, 'Started by itself ' || v_how);
        else
          perform 1 from public.events where id = p_event for update; -- one start at a time, as Start heat does
          perform private.start_gate(h.id);
          v_row := private.move_heat(h.id, 'running', 'heat_started', 'Started by itself ' || v_how);
        end if;
        perform private.head_audit(p_event, 'heats', h.id, 'heat_auto_started', null, jsonb_build_object('mode', h.auto_start_mode), 'Next heat started by itself ' || v_how);
        v_started := h.id;
      exception when others then
        v_blocked := 'GATE: ' || sqlerrm;
        perform private.head_audit(p_event, 'heats', h.id, 'auto_start_blocked', null, jsonb_build_object('why', v_blocked), 'Next heat not started by itself: ' || v_blocked);
      end;
    else
      v_blocked := v_block;
      perform private.head_audit(p_event, 'heats', h.id, 'auto_start_blocked', null, jsonb_build_object('why', v_block),
        'Next heat not started by itself: ' || case v_block
          when 'PREVIOUS_NOT_PUBLISHED' then 'the previous heat is not published'
          when 'HOLD' then 'the run order is on hold'
          when 'WIND_CALL' then 'a wind call is on'
          when 'SEATS_NOT_FILLED' then 'a seat has no rider yet'
          when 'WALKOVER_UNDECIDED' then 'fewer than two riders (walkover not decided)'
          when 'OFF' then 'auto start was switched off'
          else v_block end);
    end if;
  end loop;
  return jsonb_build_object('started', v_started, 'blocked', v_blocked);
end $$;

revoke all on function public.plan_auto_start(uuid, text, timestamptz), public.stop_auto_start(uuid), public.set_auto_start(uuid, boolean), public.auto_start_if_due(uuid) from public, anon;
grant execute on function public.plan_auto_start(uuid, text, timestamptz), public.stop_auto_start(uuid), public.set_auto_start(uuid, boolean), public.auto_start_if_due(uuid) to authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
