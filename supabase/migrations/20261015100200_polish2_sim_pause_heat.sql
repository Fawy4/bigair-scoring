-- Polish 2, item 3 — the simulator's Pause pauses the heat clock.
--
-- Before: Pause (and Stop) on the simulator panel only stopped the auto-play; the heat on the water kept running on the console, because the heat clock comes from
-- the heat's own times in the database, not from the simulator.
-- Now Pause and Stop pause every running heat of the simulation with the same server-side pause the head judge's Pause (and the wind Hold) uses, and mark it
-- "paused by the simulator" (heats.paused_reason = 'simulator'); Start / Resume resumes only the heats the simulator paused. A heat the head judge paused stays
-- theirs. Any change of state away from paused clears the mark, so a head judge who presses Resume on the console also clears it.

alter table public.heats add column if not exists paused_reason text check (paused_reason is null or paused_reason in ('simulator'));

-- The mark lives only while the heat is paused.
create or replace function private.heats_clear_paused_reason() returns trigger
language plpgsql as $$
begin
  -- only the server's functions set the mark
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then new.paused_reason := old.paused_reason; end if;
  if new.status is distinct from 'paused' then new.paused_reason := null; end if;
  return new;
end $$;
drop trigger if exists c_heats_clear_paused_reason on public.heats;
create trigger c_heats_clear_paused_reason before update on public.heats for each row execute function private.heats_clear_paused_reason();

-- Pause every running heat of the simulation (Pause and Stop on the panel). Returns how many were paused.
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
  return n;
end $$;

-- Resume the heats the simulator paused (Start / Resume on the panel). A heat the head judge paused is left alone.
create or replace function public.sim_resume_heats(p_event uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare h record; n int := 0;
begin
  perform private.sim_guard(p_event);
  for h in select id from public.heats where event_id = p_event and status = 'paused' and paused_reason = 'simulator' for update loop
    perform private.move_heat(h.id, 'running', 'heat_resumed', 'Resumed by the simulator');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.sim_pause_heats(uuid), public.sim_resume_heats(uuid) from public, anon;
grant execute on function public.sim_pause_heats(uuid), public.sim_resume_heats(uuid) to authenticated;
