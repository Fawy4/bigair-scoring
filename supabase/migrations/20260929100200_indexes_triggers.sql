-- Phase 3 / step 2b: indexes, updated_at triggers, server-filled columns, live counter, heat state machine, immutability.

-- ---------------------------------------------------------------- indexes (every foreign key, plus the hot paths)
create index on public.memberships (user_id);
create index on public.events (organisation_id);
create index on public.riders (organisation_id);
create index on public.scoring_models (organisation_id);
create index on public.format_templates (organisation_id);
create index on public.trick_vocabularies (organisation_id);
create index on public.trick_vocabularies (event_id);
create index on public.judge_seats (event_id);
create index on public.judge_seats (auth_user_id);
create unique index judge_seats_one_seat_per_login on public.judge_seats (event_id, auth_user_id) where auth_user_id is not null;
create index on public.panels (event_id);
create index on public.panel_members (event_id);
create index on public.panel_members (judge_seat_id);
create index on public.divisions (event_id);
create index on public.divisions (scoring_model_id);
create index on public.divisions (format_template_id);
create index on public.divisions (panel_id);
create index on public.entries (event_id);
create index on public.entries (rider_id);
create index on public.rounds (event_id);
create index on public.rounds (division_id);
create index on public.heats (event_id);
create index on public.heats (division_id);
create index on public.heats (round_id);
create unique index heats_number_unique on public.heats (division_id, number, coalesce(number_suffix, ''));
create index on public.heat_slots (event_id);
create index on public.heat_slots (entry_id);
create index on public.trick_attempts (event_id);
create index on public.trick_attempts (entry_id);
create index trick_attempts_live_count on public.trick_attempts (heat_id, entry_id) where deleted_at is null; -- the attempt-cap count
create index on public.trick_attempts (created_by_seat);
create index on public.trick_scores (event_id);
create index on public.trick_scores (heat_id);
create index on public.trick_scores (attempt_id);
create index on public.trick_scores (judge_seat_id);
create index on public.impression_scores (event_id);
create index on public.impression_scores (heat_id);
create index on public.impression_scores (entry_id);
create index on public.impression_scores (judge_seat_id);
create index on public.penalties (event_id);
create index on public.penalties (heat_id);
create index on public.penalties (entry_id);
create index on public.heat_results (event_id);
create index on public.heat_results (entry_id);
create index on public.schedule_plans (event_id);
create unique index schedule_plans_one_active on public.schedule_plans (event_id, day) where active;
create index on public.wind_calls (event_id, created_at desc);
create index on public.audit_log (event_id, at desc);
create index on public.audit_log (table_name, row_id);
create index on public.join_attempts (event_id, ip, at desc);

-- ---------------------------------------------------------------- updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'organisations','memberships','events','scoring_models','format_templates','trick_vocabularies','judge_seats','panels','panel_members',
    'divisions','riders','entries','rounds','heats','heat_slots','trick_attempts','trick_scores','impression_scores','penalties',
    'schedule_plans','wind_calls'
  ] loop
    execute format('create trigger z_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- server-filled columns (never trusted from the client)
create or replace function private.fill_denorm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid; v_div uuid; v_heat public.heats; v_att public.trick_attempts;
begin
  case tg_table_name
    when 'entries' then
      select d.event_id into v_event from public.divisions d where d.id = new.division_id;
      new.event_id := v_event;
    when 'rounds' then
      select d.event_id into v_event from public.divisions d where d.id = new.division_id;
      new.event_id := v_event;
    when 'panel_members' then
      select p.event_id into v_event from public.panels p where p.id = new.panel_id;
      new.event_id := v_event;
    when 'heats' then
      select r.event_id, r.division_id into v_event, v_div from public.rounds r where r.id = new.round_id;
      new.event_id := v_event;
      new.division_id := v_div;
    when 'trick_scores' then
      select * into v_att from public.trick_attempts a where a.id = new.attempt_id;
      new.event_id := v_att.event_id;
      new.heat_id := v_att.heat_id;
      v_event := v_att.event_id;
    else -- heat_slots, trick_attempts, impression_scores, penalties, heat_results
      select * into v_heat from public.heats h where h.id = new.heat_id;
      new.event_id := v_heat.event_id;
      v_event := v_heat.event_id;
      -- a rider can only be placed in, or log attempts for, a heat of their own division
      if tg_table_name in ('heat_slots', 'trick_attempts', 'impression_scores') and new.entry_id is not null then
        if not exists (select 1 from public.entries e where e.id = new.entry_id and e.division_id = v_heat.division_id) then
          raise exception 'ENTRY_NOT_IN_DIVISION';
        end if;
      end if;
  end case;
  if new.event_id is null then
    raise exception 'PARENT_NOT_FOUND';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entries','rounds','panel_members','heats','heat_slots','trick_attempts','trick_scores','impression_scores','penalties','heat_results'] loop
    execute format('create trigger a_fill_denorm before insert on public.%I for each row execute function private.fill_denorm()', t);
  end loop;
end $$;
-- a heat can be re-parented only by the server; keep event/division in step with the round on update
create trigger a_fill_denorm_upd before update of round_id on public.heats for each row execute function private.fill_denorm();

-- ---------------------------------------------------------------- live counter (public pages poll on this)
create or replace function private.bump_live_rev() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.heats set live_rev = live_rev + 1 where id = coalesce(new.heat_id, old.heat_id);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['trick_attempts','trick_scores','impression_scores','penalties','heat_slots'] loop
    execute format('create trigger z_bump_live_rev after insert or update or delete on public.%I for each row execute function private.bump_live_rev()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- heat state machine: server time is truth
create or replace function private.heats_guard() returns trigger
language plpgsql as $$
declare
  priv boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  v_end timestamptz;
  v_started timestamptz := new.started_at; v_paused_at timestamptz := new.paused_at;
  v_paused_total int := new.paused_total_sec; v_ended timestamptz := new.ended_at; v_published timestamptz := new.published_at;
begin
  if not priv then
    -- server-owned columns cannot be edited by hand
    new.started_at := old.started_at; new.paused_at := old.paused_at; new.paused_total_sec := old.paused_total_sec;
    new.ended_at := old.ended_at; new.published_at := old.published_at; new.live_rev := old.live_rev;
    new.event_id := old.event_id; new.division_id := old.division_id; new.round_id := old.round_id;
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

create trigger b_heats_guard before update on public.heats for each row execute function private.heats_guard();

-- ---------------------------------------------------------------- immutability (published results, audit trail)
create or replace function private.reject_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'APPEND_ONLY: % on % is not allowed', tg_op, tg_table_name;
end $$;

create trigger a_append_only before update or delete on public.heat_results for each row execute function private.reject_change();
create trigger a_append_only before update or delete on public.audit_log for each row execute function private.reject_change();
