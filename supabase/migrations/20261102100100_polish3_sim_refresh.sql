-- Polish 3, item 9: a simulation uses the real event's CURRENT settings. "Refresh from event" copies the event's settings and each division's scoring rules (the attempt
-- limit among them) onto the simulation copy; divisions are matched by name. Only before any heat of the simulation has started (the rules lock at the first heat).
alter table public.sim_control add column if not exists settings_from_at timestamptz;

create or replace function public.sim_refresh_from_event(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; src public.events; v_n int;
begin
  ev := private.sim_guard(p_event);
  if ev.simulation_of is null then raise exception 'NOT_A_COPY'; end if;
  select * into src from public.events where id = ev.simulation_of;
  if not found or not private.is_event_organiser(src.id) then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.armed_at is not null or h.rerun_of is not null)) then
    raise exception 'HEAT_STARTED';
  end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.events set settings = src.settings where id = p_event;
  update public.divisions d set scoring_model_id = s.scoring_model_id, scoring_overrides = s.scoring_overrides, live_settings = s.live_settings
    from public.divisions s where s.event_id = src.id and d.event_id = p_event and lower(btrim(s.name)) = lower(btrim(d.name));
  get diagnostics v_n = row_count;
  perform set_config('app.draw_bypass', '', true);
  update public.sim_control set settings_from_at = now() where event_id = p_event;
  insert into public.sim_log (event_id, run_no, kind, text, data)
    select p_event, c.run_no, 'info', 'Settings refreshed from ' || src.name, jsonb_build_object('source', src.id, 'divisions', v_n) from public.sim_control c where c.event_id = p_event;
  return jsonb_build_object('divisions', v_n, 'source', src.name, 'at', now());
end $$;
revoke all on function public.sim_refresh_from_event(uuid) from public, anon;
grant execute on function public.sim_refresh_from_event(uuid) to authenticated;
