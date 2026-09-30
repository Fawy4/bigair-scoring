-- Phase 4a-1c: saving the platform settings is one owner-only, audited step (all keys or none).
create or replace function public.admin_save_platform_settings(p_values jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'INVALID_JSON'; end if;
  for k in select jsonb_object_keys(p_values) loop
    if k not in ('product_name', 'logo_url', 'tagline', 'legal_texts', 'default_timezone') then raise exception 'INVALID_KEY'; end if;
  end loop;
  select coalesce(jsonb_object_agg(s.key, s.value), '{}') into v_before from public.platform_settings s;
  for k in select jsonb_object_keys(p_values) loop
    insert into public.platform_settings (key, value, updated_by) values (k, p_values -> k, auth.uid())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
  end loop;
  -- the legal texts can be long: the audit line records that they changed, not their content
  perform private.platform_audit('settings_changed', null, 'platform_settings', null, v_before - 'legal_texts', p_values - 'legal_texts', null);
end $$;
revoke all on function public.admin_save_platform_settings from public, anon, authenticated;
grant execute on function public.admin_save_platform_settings to authenticated;
