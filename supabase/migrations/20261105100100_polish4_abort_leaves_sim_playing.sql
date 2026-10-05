-- Polish 4 (replaces the last line of 20261105100000): Abort only aborts the start sequence. The simulator keeps playing; it is told not to raise the yellow of THIS heat again
-- (sim_control.config.noArm) until the head judge starts it. A real event has no sim_control row and is unchanged.
create or replace function public.abort_start(p_heat uuid) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_row public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat;
  if h.status <> 'scheduled' or h.armed_at is null then raise exception 'NOTHING_ARMED'; end if;
  perform set_config('app.audit_action', 'heat_start_aborted', true);
  perform set_config('app.reason', 'Start sequence aborted', true);
  update public.heats set armed_at = null, prestart_sec = null, armed_paused_at = null where id = p_heat returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  update public.sim_control set config = jsonb_set(coalesce(config, '{}'::jsonb), '{noArm}', to_jsonb(p_heat::text)) where event_id = h.event_id;
  return v_row;
end $$;
