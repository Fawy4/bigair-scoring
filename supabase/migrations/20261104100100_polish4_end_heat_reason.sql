-- Polish 4, G: "End heat" asks once, with an optional reason for the audit log. Ending itself is unchanged (the same checks, the same move); this is the same
-- function with the reason passed to the audit line. The one-argument end_heat stays exactly as it was.
create or replace function public.end_heat(p_heat uuid, p_reason text) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.materialise_armed(p_heat);
  select * into h from public.heats where id = p_heat for update;
  if h.status not in ('running', 'paused') then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> ended', h.status; end if;
  return private.move_heat(p_heat, 'ended', 'heat_ended', p_reason);
end $$;
revoke all on function public.end_heat(uuid, text) from public, anon;
grant execute on function public.end_heat(uuid, text) to authenticated;
