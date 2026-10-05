-- Polish 4: "Update preset from this division" writes a new version (the existing insert); this records that it happened, with the optional reason.
create or replace function public.log_org_preset_update(p_org uuid, p_kind text, p_key text, p_version int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind);
begin
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if not private.is_org_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  insert into public.audit_log (organisation_id, actor_user_id, action, table_name, after, reason)
  values (p_org, auth.uid(), 'preset_updated_from_division', v_table, jsonb_build_object('key', p_key, 'version', p_version), nullif(btrim(coalesce(p_reason, '')), ''));
end $$;
revoke all on function public.log_org_preset_update from public, anon;
grant execute on function public.log_org_preset_update to authenticated;
