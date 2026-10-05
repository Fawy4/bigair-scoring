-- Polish 4, F: "+1 min" on a heat that is running. The server adds exactly 60 seconds to the remaining heat time (in a simulation at x10, 6 seconds: 60 s of heat time),
-- as often as needed, and writes it to the audit log. Nothing else changes: the heat's start, its pauses and the attempt cap stay as they are.
--
--   * heats.extra_sec: the seconds added to this heat's length so far. The end of the heat is still started_at + duration_sec + paused_total_sec, so every clock, the
--     last-minute flag, the run order and the public pages follow by themselves. A heat that goes back to "not started" (Reset, a re-run) gets its own length back.

alter table public.heats add column extra_sec int not null default 0 check (extra_sec >= 0);

-- the added time is the server's: an organiser's hand edit of the row cannot move it; going back to "not started" gives the heat its own length back
create or replace function private.heats_unextend() returns trigger
language plpgsql as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then new.extra_sec := old.extra_sec; end if;
  if new.status = 'scheduled' and old.status is distinct from 'scheduled' and old.extra_sec > 0 then
    new.duration_sec := greatest(1, new.duration_sec - old.extra_sec);
    new.extra_sec := 0;
  end if;
  return new;
end $$;
create trigger c_heats_unextend before update on public.heats for each row execute function private.heats_unextend();

create or replace function public.extend_heat(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_add int; v_row public.heats; v_who text; v_tz text; v_end timestamptz;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat); -- a heat whose yellow just ran out is running now
  select * into h from public.heats where id = p_heat for update;
  -- only a heat that is running: not started, paused, ended (or out of time: the clock has reached 0:00)
  if h.status <> 'running' or h.started_at is null or now() >= h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec) then raise exception 'HEAT_NOT_RUNNING'; end if;
  v_add := greatest(1, 60 / h.time_scale);
  v_end := h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec + v_add);
  select e.timezone into v_tz from public.events e where e.id = h.event_id;
  v_who := coalesce((select s.name from public.judge_seats s where s.event_id = h.event_id and s.auth_user_id = auth.uid() and s.role = 'head' limit 1), 'the organiser');
  perform set_config('app.audit_action', 'heat_extended', true);
  perform set_config('app.reason', '+1 min by ' || v_who || ' at ' || to_char(now() at time zone v_tz, 'HH24:MI:SS') || ', heat now ends ' || to_char(v_end at time zone v_tz, 'HH24:MI:SS'), true);
  update public.heats set duration_sec = duration_sec + v_add, extra_sec = extra_sec + v_add where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

drop trigger z_audit on public.heats;
create trigger z_audit after update on public.heats for each row
  when (old.status is distinct from new.status or old.manual_override is distinct from new.manual_override or old.publish_hold is distinct from new.publish_hold
        or old.armed_at is distinct from new.armed_at or old.prestart_sec is distinct from new.prestart_sec or old.armed_paused_at is distinct from new.armed_paused_at
        or old.started_at is distinct from new.started_at or old.extra_sec is distinct from new.extra_sec)
  execute function private.audit_row();

revoke all on function public.extend_heat(uuid) from public, anon;
grant execute on function public.extend_heat(uuid) to authenticated;
