-- Polish 1, item 2: organiser access.
--   * admin_remove_organiser: the platform owner takes a person out of one organisation. Their access ends at once (the organisation's rows stop being readable
--     to them, because every rule asks the memberships table) and every session they hold is deleted, so a phone that is still open is signed out the next time it
--     asks the auth service. The login itself stays, so the same address can be invited again later. Audited.

create or replace function public.admin_remove_organiser(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  select * into m from public.memberships where organisation_id = p_org and user_id = p_user;
  if not found then raise exception 'NOT_A_MEMBER'; end if;
  delete from public.memberships where id = m.id;
  -- signed out everywhere: their refresh tokens go with the sessions
  delete from auth.sessions where user_id = p_user;
  perform private.platform_audit('organiser_removed', p_org, 'memberships', m.id, jsonb_build_object('user_id', p_user, 'role', m.role), null, null);
end $$;

revoke all on function public.admin_remove_organiser from public, anon, authenticated;
grant execute on function public.admin_remove_organiser to authenticated;
