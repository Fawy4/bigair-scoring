-- Polish 2b, item 1 — heat pause and simulator pause are ONE state.
--
-- Before: the simulator's Pause paused the heats, but the head judge's Pause on the console left the simulator "playing" (its virtual officials kept going), and
-- afterwards the simulator's Resume only resumed heats it had paused itself (paused_reason = 'simulator'), so it did nothing for a heat the console had paused.
-- Now:
--   * a heat of a simulation that goes running -> paused (from the console, the wind Hold, or the simulator) moves the simulator from "playing" to "paused";
--   * a heat that goes paused -> running moves the simulator from "paused" to "playing";
--   * the simulator's Resume resumes every paused heat of the simulation, whoever paused it. Stop is untouched (a stopped simulator stays stopped).

create or replace function private.heats_sync_sim_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'running' and new.status = 'paused' then
    update public.sim_control set state = 'paused', updated_at = now() where event_id = new.event_id and state = 'playing';
  elsif old.status = 'paused' and new.status = 'running' then
    update public.sim_control set state = 'playing', updated_at = now() where event_id = new.event_id and state = 'paused';
  end if;
  return null;
end $$;
drop trigger if exists z_heats_sync_sim_state on public.heats;
create trigger z_heats_sync_sim_state after update of status on public.heats for each row when (old.status is distinct from new.status) execute function private.heats_sync_sim_state();

create or replace function public.sim_resume_heats(p_event uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare h record; n int := 0;
begin
  perform private.sim_guard(p_event);
  for h in select id from public.heats where event_id = p_event and status = 'paused' for update loop
    perform private.move_heat(h.id, 'running', 'heat_resumed', 'Resumed by the simulator');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.sim_resume_heats(uuid) from public, anon;
grant execute on function public.sim_resume_heats(uuid) to authenticated;
