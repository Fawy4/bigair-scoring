-- Observer seat: a read-only official (a sponsor, an engineer, a trainee head judge, a journalist, the owner watching a customer's event).
-- It joins with its own PIN like any seat and reads what the head judge reads, live. It writes nothing: every function and every table an official can
-- change is refused for it, because none of them lets a seat with this role through (their checks name the roles that may act, or ask for a place on a
-- panel, which an observer can never have). The one exception is touch_seat ("I am here"), which only moves the observer's own last-seen time, so the
-- head judge can see "2 observers watching". The simulator never plays an observer, and the public pages never name one.

-- ---------------------------------------------------------------- the role
alter table public.judge_seats drop constraint judge_seats_role_check;
alter table public.judge_seats add constraint judge_seats_role_check check (role in ('judge', 'head', 'spotter', 'announcer', 'observer'));

-- ---------------------------------------------------------------- never on a panel, never "also scores"
create or replace function private.observer_not_on_panel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'panel_members' then
    if exists (select 1 from public.judge_seats s where s.id = new.judge_seat_id and s.role = 'observer') then
      raise exception 'OBSERVER_NOT_ON_PANEL';
    end if;
  elsif new.role = 'observer' then
    if exists (select 1 from public.panel_members m where m.judge_seat_id = new.id) then raise exception 'OBSERVER_NOT_ON_PANEL'; end if;
    new.scores := false;
    new.spotter_assignment := null;
  end if;
  return new;
end $$;

create trigger b_observer_not_on_panel before insert or update of judge_seat_id on public.panel_members
  for each row execute function private.observer_not_on_panel();
create trigger b_observer_not_on_panel before insert or update of role, scores on public.judge_seats
  for each row execute function private.observer_not_on_panel();

-- ---------------------------------------------------------------- the simulator never plays an observer (every path that adds sim_seats rows goes through this)
create or replace function private.sim_seats_skip_observer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.judge_seats s where s.id = new.seat_id and s.role = 'observer') then return null; end if;
  return new;
end $$;
create trigger b_sim_seats_skip_observer before insert on public.sim_seats for each row execute function private.sim_seats_skip_observer();

-- ---------------------------------------------------------------- what an observer reads: everything the head judge reads
create or replace function private.is_observer(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.seat_role(p_event), '') = 'observer';
$$;

create policy observer_read on public.judge_seats for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.trick_scores for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.impression_scores for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.judge_sheets for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.attempt_flags for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.heat_decisions for select to authenticated using (private.is_observer(event_id));
create policy observer_read on public.audit_log for select to authenticated using (private.is_observer(event_id));

-- ---------------------------------------------------------------- the one function any seat could call that changes a heat: an observer may not
create or replace function public.end_heat_if_due(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or (private.has_seat(h.event_id) and not private.is_observer(h.event_id))) then raise exception 'NOT_ALLOWED'; end if;
  if h.status = 'running' and private.heat_effective_status(p_heat) = 'ended' then
    return private.move_heat(p_heat, 'ended', 'heat_ended_by_clock');
  end if;
  return h;
end $$;

-- ---------------------------------------------------------------- the public pages of a simulation: its observers see them as its organiser does (the preview)
create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.organisations o on o.id = e.organisation_id
    where e.id = p_event and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null
      and (not e.is_simulation or private.is_event_organiser(e.id) or private.is_observer(e.id) or current_setting('app.sim_preview', true) = e.id::text));
$$;

create or replace function public.sim_live_heat(p_heat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v jsonb;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  if private.is_observer(h.event_id) then
    if not exists (select 1 from public.events e where e.id = h.event_id and e.is_simulation) then raise exception 'NOT_A_SIMULATION'; end if;
  else
    perform private.sim_guard(h.event_id);
  end if;
  perform set_config('app.sim_preview', h.event_id::text, true);
  v := public.get_live_heat_for_server(p_heat);
  perform set_config('app.sim_preview', '', true);
  return v;
end $$;
