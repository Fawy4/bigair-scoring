-- Polish 4: organisations manage their own presets (rename, delete, update), hide built-ins for themselves; the owner manages the built-ins
-- (rename, retire, restore, DEFAULT, delete). Nothing here edits a row a division may have loaded: a change of settings is always a NEW version row;
-- rename only changes the name, and retiring / deleting only changes what the menus offer.

-- ---------------------------------------------------------------- columns and tables
alter table public.scoring_models add column retired_at timestamptz;
alter table public.format_templates add column retired_at timestamptz;

-- which built-ins an organisation has hidden from ITS OWN Load… menu (written through hide_builtin_preset only)
create table public.organisation_hidden_presets (
  organisation_id uuid not null references public.organisations on delete cascade,
  kind text not null check (kind in ('scoring_model', 'format_template')),
  key text not null,
  hidden_at timestamptz not null default now(),
  primary key (organisation_id, kind, key)
);
alter table public.organisation_hidden_presets enable row level security;
grant select on public.organisation_hidden_presets to authenticated;
create policy read_hidden_presets on public.organisation_hidden_presets for select to authenticated using (private.is_org_member(organisation_id));

-- the owner's DEFAULT built-in of each kind: it can be neither hidden nor retired
create table public.platform_default_presets (
  kind text primary key check (kind in ('scoring_model', 'format_template')),
  key text not null,
  set_at timestamptz not null default now()
);
alter table public.platform_default_presets enable row level security;
grant select on public.platform_default_presets to authenticated;
create policy read_default_presets on public.platform_default_presets for select to authenticated using (true);
insert into public.platform_default_presets (kind, key)
  select 'scoring_model', 'kota-best3-impression' where exists (select 1 from public.scoring_models where organisation_id is null and key = 'kota-best3-impression');
insert into public.platform_default_presets (kind, key)
  select 'format_template', 'heats4-top2-single-elim' where exists (select 1 from public.format_templates where organisation_id is null and key = 'heats4-top2-single-elim');

-- ---------------------------------------------------------------- helpers
create or replace function private.preset_table2(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'scoring_model' then 'scoring_models' when 'format_template' then 'format_templates' end;
$$;

create or replace function private.preset_audit(p_action text, p_org uuid, p_table text, p_key text, p_before jsonb, p_after jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (organisation_id, actor_user_id, action, table_name, before, after)
  values (p_org, auth.uid(), p_action, p_table, p_before, p_after || jsonb_build_object('key', p_key));
$$;
revoke all on function private.preset_audit from public, anon, authenticated;

-- "Pro Men in Arrow Big Air" lines for the divisions that use any version of a preset; p_live_only = only divisions of events that are not archived
create or replace function private.preset_used_by(p_kind text, p_key text, p_org uuid, p_live_only boolean) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_col text; v_out text[];
begin
  v_col := case p_kind when 'scoring_model' then 'scoring_model_id' else 'format_template_id' end;
  execute format($q$
    select coalesce(array_agg(distinct d.name || ' in ' || e.name order by d.name || ' in ' || e.name), '{}')
      from public.divisions d join public.events e on e.id = d.event_id
     where d.%1$I in (select id from public.%2$I where key = $1 and organisation_id is not distinct from $2)
       and (not $3 or e.archived_at is null)
  $q$, v_col, v_table) into v_out using p_key, p_org, p_live_only;
  return v_out;
end $$;
revoke all on function private.preset_used_by from public, anon, authenticated;

-- ---------------------------------------------------------------- organisation: rename, delete, hide
create or replace function public.rename_org_preset(p_org uuid, p_kind text, p_key text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_name text := btrim(coalesce(p_name, '')); v_n int;
begin
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if not private.is_org_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'PRESET_NAME'; end if;
  execute format('update public.%I set name = $1, json = jsonb_set(json, ''{name}'', to_jsonb($1::text)) where organisation_id = $2 and key = $3 and retired_at is null', v_table) using v_name, p_org, p_key;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'NOT_FOUND'; end if;
  perform private.preset_audit('preset_renamed', p_org, v_table, p_key, null, jsonb_build_object('name', v_name));
end $$;

-- Deleting: refused (usedBy lists the divisions) while a division of a non-archived event uses ANY version. A preset that only archived
-- events still point at is retired (kept so those divisions still read it, gone from every menu); an unused one is removed outright.
create or replace function public.delete_org_preset(p_org uuid, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_live text[]; v_any text[]; v_n int;
begin
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if not private.is_org_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  execute format('select count(*) from public.%I where organisation_id = $1 and key = $2 and retired_at is null', v_table) into v_n using p_org, p_key;
  if v_n = 0 then raise exception 'NOT_FOUND'; end if;
  v_live := private.preset_used_by(p_kind, p_key, p_org, true);
  if cardinality(v_live) > 0 then return jsonb_build_object('ok', false, 'usedBy', to_jsonb(v_live)); end if;
  v_any := private.preset_used_by(p_kind, p_key, p_org, false);
  if cardinality(v_any) > 0 then
    execute format('update public.%I set retired_at = now() where organisation_id = $1 and key = $2', v_table) using p_org, p_key;
  else
    execute format('delete from public.%I where organisation_id = $1 and key = $2', v_table) using p_org, p_key;
  end if;
  perform private.preset_audit('preset_deleted', p_org, v_table, p_key, null, jsonb_build_object('kept_for_archived', cardinality(v_any) > 0));
  return jsonb_build_object('ok', true, 'usedBy', '[]'::jsonb);
end $$;

create or replace function public.hide_builtin_preset(p_org uuid, p_kind text, p_key text, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_n int;
begin
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if not private.is_org_member(p_org) then raise exception 'NOT_ALLOWED'; end if;
  if p_hidden then
    execute format('select count(*) from public.%I where organisation_id is null and key = $1', v_table) into v_n using p_key;
    if v_n = 0 then raise exception 'NOT_FOUND'; end if;
    if exists (select 1 from public.platform_default_presets x where x.kind = p_kind and x.key = p_key) then raise exception 'PRESET_IS_DEFAULT'; end if;
    insert into public.organisation_hidden_presets (organisation_id, kind, key) values (p_org, p_kind, p_key) on conflict do nothing;
  else
    delete from public.organisation_hidden_presets where organisation_id = p_org and kind = p_kind and key = p_key;
  end if;
  perform private.preset_audit(case when p_hidden then 'preset_hidden' else 'preset_shown' end, p_org, v_table, p_key, null, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- owner: rename, retire / restore, DEFAULT, delete (built-ins)
create or replace function public.admin_rename_preset(p_kind text, p_key text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_name text := btrim(coalesce(p_name, '')); v_n int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'PRESET_NAME'; end if;
  execute format('update public.%I set name = $1, json = jsonb_set(json, ''{name}'', to_jsonb($1::text)) where organisation_id is null and key = $2', v_table) using v_name, p_key;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit('preset_renamed', null, v_table, null, null, jsonb_build_object('kind', p_kind, 'key', p_key, 'name', v_name), null);
end $$;

create or replace function public.admin_set_preset_retired(p_kind text, p_key text, p_retired boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_n int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if p_retired and exists (select 1 from public.platform_default_presets x where x.kind = p_kind and x.key = p_key) then raise exception 'PRESET_IS_DEFAULT'; end if;
  execute format('update public.%I set retired_at = case when $1 then coalesce(retired_at, now()) else null end where organisation_id is null and key = $2', v_table) using p_retired, p_key;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit(case when p_retired then 'preset_retired' else 'preset_restored' end, null, v_table, null, null, jsonb_build_object('kind', p_kind, 'key', p_key), null);
end $$;

create or replace function public.admin_set_default_preset(p_kind text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_ok boolean;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  execute format('select exists (select 1 from public.%I where organisation_id is null and key = $1 and published_at is not null and retired_at is null)', v_table) into v_ok using p_key;
  if not v_ok then raise exception 'NOT_FOUND'; end if;
  insert into public.platform_default_presets (kind, key) values (p_kind, p_key)
    on conflict (kind) do update set key = excluded.key, set_at = now();
  delete from public.organisation_hidden_presets where kind = p_kind and key = p_key; -- the DEFAULT is never hidden
  perform private.platform_audit('preset_default_set', null, v_table, null, null, jsonb_build_object('kind', p_kind, 'key', p_key), null);
end $$;

-- refused while ANY division (any event, archived or not: the link is a foreign key) points at any version
create or replace function public.admin_delete_preset(p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table2(p_kind); v_used text[]; v_n int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if exists (select 1 from public.platform_default_presets x where x.kind = p_kind and x.key = p_key) then raise exception 'PRESET_IS_DEFAULT'; end if;
  v_used := private.preset_used_by(p_kind, p_key, null, false);
  if cardinality(v_used) > 0 then return jsonb_build_object('ok', false, 'usedBy', to_jsonb(v_used)); end if;
  execute format('delete from public.%I where organisation_id is null and key = $1', v_table) using p_key;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit('preset_deleted', null, v_table, null, null, jsonb_build_object('kind', p_kind, 'key', p_key), null);
  return jsonb_build_object('ok', true, 'usedBy', '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- who may call what
revoke all on function public.rename_org_preset, public.delete_org_preset, public.hide_builtin_preset,
  public.admin_rename_preset, public.admin_set_preset_retired, public.admin_set_default_preset, public.admin_delete_preset from public, anon;
grant execute on function public.rename_org_preset, public.delete_org_preset, public.hide_builtin_preset,
  public.admin_rename_preset, public.admin_set_preset_retired, public.admin_set_default_preset, public.admin_delete_preset to authenticated;
