-- Polish 2, item 4b — the simulator's tick lock is released at the end of every step.
--
-- Before: each step took sim_tick_lock for 6 seconds and never gave it back, while the panel asks for a step every 2 seconds: the page blocked itself two
-- requests in three, said "Another tab is playing this simulation" with one tab open, and ran about three times slower than the chosen speed.
-- Now a step takes the lock with a token (sim_tick_begin) and gives it back when it is done, also after an error (sim_tick_end). The lock stays only as a guard
-- against two steps at the same moment (a genuine second tab); its time limit (30 s) only matters if a step dies half-way.

alter table public.sim_control add column if not exists tick_lock_token uuid;

create or replace function public.sim_tick_begin(p_event uuid, p_ms int default 30000) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_token uuid := gen_random_uuid(); v_ok boolean;
begin
  perform private.sim_guard(p_event);
  -- an official added since the last step gets its simulator row
  insert into public.sim_seats (seat_id, event_id, mode)
  select s.id, p_event, 'virtual' from public.judge_seats s where s.event_id = p_event and s.status = 'active' and s.active on conflict (seat_id) do nothing;
  update public.sim_control set tick_lock_until = now() + make_interval(secs => greatest(p_ms, 500) / 1000.0), tick_lock_token = v_token
   where event_id = p_event and (tick_lock_until is null or tick_lock_until < now()) returning true into v_ok;
  return case when coalesce(v_ok, false) then v_token else null end;
end $$;

-- Gives the lock back, only if this step still holds it (a step that outlived its limit does not free somebody else's).
create or replace function public.sim_tick_end(p_event uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  perform private.sim_guard(p_event);
  update public.sim_control set tick_lock_until = null, tick_lock_token = null
   where event_id = p_event and tick_lock_token = p_token returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke all on function public.sim_tick_begin(uuid, int), public.sim_tick_end(uuid, uuid) from public, anon;
grant execute on function public.sim_tick_begin(uuid, int), public.sim_tick_end(uuid, uuid) to authenticated;
