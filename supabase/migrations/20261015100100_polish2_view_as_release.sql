-- Polish 2, item 2 — View as gives a seat back to the simulator.
--
-- Before: "View as Judge 1" gave the seat to the organiser's own sign-in, and nothing ever gave it back: the virtual judge stopped scoring for the rest of the
-- run, and choosing "Virtual" again did not help (the seat was already virtual; only its holder had changed).
-- Now:
--   * the tab that views as a seat says "I am here" every few seconds (sim_view_beat); closing it says "I am leaving" (sim_view_leave, a beacon);
--   * each tick of the simulator gives back a seat whose View-as tab has left (6 seconds after the beacon, unless the tab came back: a reload) or has been
--     silent for 90 seconds (a crashed browser, a phone that slept) — sim_release_stale_views;
--   * choosing "Virtual" for a seat gives it back at once, whoever holds it (View as or a phone that joined with the PIN);
--   * the panel shows who holds each seat and when that View-as tab was last seen.

alter table public.sim_seats add column if not exists viewed_by uuid references auth.users on delete set null;
alter table public.sim_seats add column if not exists view_seen_at timestamptz;
alter table public.sim_seats add column if not exists view_release_at timestamptz;

-- View as: one seat at a time for the organiser's sign-in; the seat they held before goes back to the simulator. p_seat null lets go of whatever they hold.
create or replace function public.sim_view_as(p_event uuid, p_seat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; r jsonb;
begin
  perform private.sim_guard(p_event);
  update public.sim_seats set viewed_by = null, view_seen_at = null, view_release_at = null where event_id = p_event and viewed_by = auth.uid();
  if p_seat is null then
    update public.judge_seats set auth_user_id = null where event_id = p_event and auth_user_id = auth.uid();
    return jsonb_build_object('ok', true, 'released', true);
  end if;
  select * into s from public.judge_seats where id = p_seat and event_id = p_event and active and status = 'active';
  if not found then raise exception 'SEAT_NOT_FOUND'; end if;
  r := private.bind_seat(s, auth.uid(), 'simulator', 'View as');
  if coalesce((r ->> 'ok')::boolean, false) then
    update public.sim_seats set viewed_by = auth.uid(), view_seen_at = now(), view_release_at = null where seat_id = p_seat;
  end if;
  return r;
end $$;

-- The View-as tab is open (every few seconds, also while it is in the background). False when this login holds no View-as seat of the event (a phone that joined
-- with a PIN, or a person who is not an organiser): nothing happens then.
create or replace function public.sim_view_beat(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  update public.sim_seats ss set view_seen_at = now(), view_release_at = null
    from public.judge_seats js
   where ss.event_id = p_event and ss.viewed_by = auth.uid() and js.id = ss.seat_id and js.auth_user_id = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- The View-as tab is closing (a beacon on page hide). The seat is given back by the next tick unless the tab beats again within 6 seconds (a reload).
create or replace function public.sim_view_leave(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  update public.sim_seats set view_release_at = now() where event_id = p_event and viewed_by = auth.uid();
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Called by each tick (as the organiser): gives back every View-as seat whose tab has left or gone silent. Returns the seats' names, for the log.
create or replace function public.sim_release_stale_views(p_event uuid, p_silent_sec int default 90, p_leave_grace_sec int default 6) returns text[]
language plpgsql security definer set search_path = '' as $$
declare v_names text[];
begin
  perform private.sim_guard(p_event);
  with gone as (
    select ss.seat_id, js.name, ss.viewed_by
      from public.sim_seats ss join public.judge_seats js on js.id = ss.seat_id
     where ss.event_id = p_event and ss.viewed_by is not null
       and (js.auth_user_id is distinct from ss.viewed_by
            or (ss.view_release_at is not null and ss.view_release_at < now() - make_interval(secs => p_leave_grace_sec)
                and (ss.view_seen_at is null or ss.view_seen_at <= ss.view_release_at))
            or ss.view_seen_at is null or ss.view_seen_at < now() - make_interval(secs => p_silent_sec))
  ), freed as (
    update public.judge_seats js set auth_user_id = null from gone g where js.id = g.seat_id and js.auth_user_id = g.viewed_by returning js.id
  ), cleared as (
    update public.sim_seats ss set viewed_by = null, view_seen_at = null, view_release_at = null from gone g where ss.seat_id = g.seat_id returning ss.seat_id
  )
  select coalesce(array_agg(g.name order by g.name) filter (where g.seat_id in (select id from freed)), '{}') into v_names from gone g;
  return v_names;
end $$;

-- Virtual or real for one seat. Choosing Virtual gives the seat back to the simulator at once, whoever holds it now (View as, or a phone that joined with
-- the PIN: the organiser asked for it). Real lets go of the simulator's own login so a PIN can take the seat.
create or replace function public.sim_set_mode(p_seat uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; ss public.sim_seats;
begin
  select * into s from public.judge_seats where id = p_seat;
  if not found then raise exception 'SEAT_NOT_FOUND'; end if;
  perform private.sim_guard(s.event_id);
  if p_mode not in ('virtual', 'real') then raise exception 'BAD_MODE'; end if;
  select * into ss from public.sim_seats where seat_id = p_seat;
  if not found then raise exception 'SIM_NOT_ENABLED'; end if;
  if p_mode = 'real' and ss.virtual_user is not null and s.auth_user_id = ss.virtual_user then
    update public.judge_seats set auth_user_id = null where id = p_seat;
  end if;
  if p_mode = 'virtual' and s.auth_user_id is not null and s.auth_user_id is distinct from ss.virtual_user then
    perform set_config('app.audit_action', 'seat_released', true);
    perform set_config('app.reason', 'given back to the simulator', true);
    update public.judge_seats set auth_user_id = null where id = p_seat;
    perform set_config('app.audit_action', '', true);
    perform set_config('app.reason', '', true);
  end if;
  update public.sim_seats set mode = p_mode, viewed_by = case when p_mode = 'virtual' then null else viewed_by end,
         view_seen_at = case when p_mode = 'virtual' then null else view_seen_at end, view_release_at = case when p_mode = 'virtual' then null else view_release_at end
   where seat_id = p_seat;
end $$;

revoke all on function public.sim_view_beat(uuid), public.sim_view_leave(uuid), public.sim_release_stale_views(uuid, int, int) from public, anon;
grant execute on function public.sim_view_beat(uuid), public.sim_view_leave(uuid), public.sim_release_stale_views(uuid, int, int) to authenticated;
