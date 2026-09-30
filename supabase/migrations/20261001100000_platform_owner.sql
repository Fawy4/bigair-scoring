-- Phase 4a-1c: the platform-owner layer.
--   1. platform_admins (owner | staff), platform_settings (key/value), platform_impersonations ("Open as this organiser")
--   2. organisations can be archived; archived organisations disappear from the public site but keep their data
--   3. organiser rights extend to an admin who is inside an organisation through an active, audited impersonation session
--   4. platform audit lines (audit_log.organisation_id) readable by admins only
--   5. admin functions (every one checks the caller is a platform admin; the dangerous ones need the owner role)
--   6. master presets: system presets get versions that are drafts until an owner publishes them
--   7. public functions: settings, event list, organisation page
-- Nothing here is readable or writable by anyone it is not meant for. Organisers' own rights are unchanged.

-- ---------------------------------------------------------------- 1. tables
create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only these five keys can exist. product_name overrides NEXT_PUBLIC_PRODUCT_NAME wherever it is displayed once set.
create table public.platform_settings (
  key text primary key check (key in ('product_name', 'logo_url', 'tagline', 'legal_texts', 'default_timezone')),
  value jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values ('tagline', to_jsonb('Live scoring and results for kite competitions'::text));

create table public.platform_impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users on delete cascade,
  organisation_id uuid not null references public.organisations on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 hours',
  ended_at timestamptz
);
create index on public.platform_impersonations (admin_user_id);
create index on public.platform_impersonations (organisation_id);
create unique index platform_impersonations_one_active on public.platform_impersonations (admin_user_id) where ended_at is null;

create trigger z_updated_at before update on public.platform_admins for each row execute function private.set_updated_at();
create trigger z_updated_at before update on public.platform_settings for each row execute function private.set_updated_at();

alter table public.organisations add column archived_at timestamptz; -- archived: hidden from the public site, data kept

-- ---------------------------------------------------------------- helpers (security definer, so policies never recurse)
create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create or replace function private.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid() and a.role = 'owner');
$$;

-- True only while: the caller is still an admin, and has an open, unexpired session for exactly this organisation.
create or replace function private.impersonating(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() and exists (
    select 1 from public.platform_impersonations i
    where i.admin_user_id = auth.uid() and i.organisation_id = p_org and i.ended_at is null and i.expires_at > now());
$$;

create or replace function private.org_is_active(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organisations o where o.id = p_org and o.archived_at is null);
$$;

grant execute on function private.is_platform_admin, private.is_platform_owner, private.impersonating, private.org_is_active to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 3. organiser rights extend through an impersonation session
create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organisation_id = p_org and m.user_id = auth.uid())
      or private.impersonating(p_org);
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organisation_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
      or private.impersonating(p_org);
$$;

create or replace function private.is_event_organiser(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and private.is_org_member(e.organisation_id));
$$;

-- An event is public only while its organisation is active.
create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.organisations o on o.id = e.organisation_id
    where e.id = p_event and e.status in ('published', 'live', 'complete') and o.archived_at is null);
$$;

drop policy public_read on public.events;
create policy public_read on public.events for select to anon, authenticated
  using (status in ('published', 'live', 'complete') and private.org_is_active(organisation_id));

-- Platform admins may read every organisation (organisers keep org_read: only their own).
create policy admin_read on public.organisations for select to authenticated using (private.is_platform_admin());

-- Logos: an admin may also write anywhere in the branding bucket (the platform logo lives in the all-zero folder).
create or replace function private.can_write_branding(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+'
      then private.is_org_member(split_part(p_name, '/', 1)::uuid) or private.is_platform_admin()
    else false
  end;
$$;

-- ---------------------------------------------------------------- 4. platform audit lines
alter table public.audit_log add column organisation_id uuid; -- platform actions; no foreign key: the trail outlives the organisation
create index on public.audit_log (organisation_id, at desc);
create index on public.audit_log (event_id, at desc);
create policy platform_read on public.audit_log for select to authenticated using (private.is_platform_admin());

-- One place writes platform audit lines. Callable only from the admin functions below (they run as the owner).
create or replace function private.platform_audit(
  p_action text, p_org uuid, p_table text, p_row uuid, p_before jsonb, p_after jsonb, p_reason text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (organisation_id, actor_user_id, action, table_name, row_id, before, after, reason)
  values (p_org, auth.uid(), p_action, p_table, p_row, p_before, p_after, nullif(btrim(coalesce(p_reason, '')), ''));
$$;
revoke all on function private.platform_audit from public, anon, authenticated;

-- ---------------------------------------------------------------- platform tables: row level security
alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_impersonations enable row level security;

grant select, insert, update, delete on public.platform_admins, public.platform_settings to authenticated;
grant select on public.platform_impersonations to authenticated; -- written only by the admin functions

create policy admin_read on public.platform_admins for select to authenticated using (private.is_platform_admin());
create policy owner_write on public.platform_admins for all to authenticated using (private.is_platform_owner()) with check (private.is_platform_owner());
create policy admin_read on public.platform_settings for select to authenticated using (private.is_platform_admin());
create policy owner_write on public.platform_settings for all to authenticated using (private.is_platform_owner()) with check (private.is_platform_owner());
create policy own_read on public.platform_impersonations for select to authenticated using (admin_user_id = auth.uid() and private.is_platform_admin());

-- ---------------------------------------------------------------- 6. master presets: drafts until an owner publishes
alter table public.scoring_models add column published_at timestamptz;
alter table public.format_templates add column published_at timestamptz;
alter table public.presets add column published_at timestamptz;
alter table public.trick_vocabularies add column version int not null default 1 check (version >= 1), add column published_at timestamptz;
update public.scoring_models set published_at = created_at where organisation_id is null;
update public.format_templates set published_at = created_at where organisation_id is null;
update public.presets set published_at = created_at where organisation_id is null;
update public.trick_vocabularies set published_at = created_at where organisation_id is null and event_id is null;
alter table public.trick_vocabularies drop constraint trick_vocabularies_key_unique;
alter table public.trick_vocabularies add constraint trick_vocabularies_key_unique unique nulls not distinct (organisation_id, event_id, key, version);

-- Customers see published system presets only (plus the exact row a division already uses). Admins also see drafts, to preview them.
drop policy read_models on public.scoring_models;
create policy read_models on public.scoring_models for select to anon, authenticated
  using ((organisation_id is null and (published_at is not null or private.is_platform_admin()))
         or private.is_org_member(organisation_id)
         or exists (select 1 from public.divisions d where d.scoring_model_id = scoring_models.id));
drop policy read_formats on public.format_templates;
create policy read_formats on public.format_templates for select to anon, authenticated
  using ((organisation_id is null and (published_at is not null or private.is_platform_admin()))
         or private.is_org_member(organisation_id)
         or exists (select 1 from public.divisions d where d.format_template_id = format_templates.id));
drop policy read_vocab on public.trick_vocabularies;
create policy read_vocab on public.trick_vocabularies for select to anon, authenticated
  using ((organisation_id is null and event_id is null and (published_at is not null or private.is_platform_admin()))
         or (event_id is not null and (private.event_is_public(event_id) or private.has_seat(event_id) or private.is_event_organiser(event_id)))
         or (organisation_id is not null and private.is_org_member(organisation_id)));
drop policy read_presets on public.presets;
create policy read_presets on public.presets for select to authenticated
  using ((organisation_id is null and (published_at is not null or private.is_platform_admin())) or private.is_org_member(organisation_id));

create or replace function private.preset_table(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'scoring_model' then 'scoring_models' when 'format_template' then 'format_templates'
                     when 'trick_vocabulary' then 'trick_vocabularies' when 'identification' then 'presets' end;
$$;

-- ---------------------------------------------------------------- 5. admin functions
-- Every function raises NOT_ALLOWED unless the caller is a platform admin (or owner where stated).

create or replace function public.platform_session() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_imp jsonb;
begin
  select a.role into v_role from public.platform_admins a where a.user_id = auth.uid();
  if v_role is not null then
    select jsonb_build_object('organisation_id', o.id, 'name', o.name, 'slug', o.slug, 'started_at', i.started_at, 'expires_at', i.expires_at)
      into v_imp
      from public.platform_impersonations i join public.organisations o on o.id = i.organisation_id
      where i.admin_user_id = auth.uid() and i.ended_at is null and i.expires_at > now();
  end if;
  return jsonb_build_object('role', v_role, 'impersonating', v_imp);
end $$;

create or replace function public.admin_organisation_overview() returns table (
  id uuid, name text, slug text, plan text, archived_at timestamptz, created_at timestamptz, logo_url text, timezone text,
  events_count int, published_events_count int, members_count int, published_results_count int, last_activity timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select o.id, o.name, o.slug, o.plan, o.archived_at, o.created_at, o.branding ->> 'logoUrl', o.settings ->> 'defaultTimezone',
         (select count(*)::int from public.events e where e.organisation_id = o.id),
         (select count(*)::int from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete')),
         (select count(*)::int from public.memberships m where m.organisation_id = o.id),
         (select count(*)::int from public.heat_results r join public.events e on e.id = r.event_id where e.organisation_id = o.id),
         greatest(o.updated_at,
                  (select max(e.updated_at) from public.events e where e.organisation_id = o.id),
                  (select max(a.at) from public.audit_log a where a.organisation_id = o.id
                                                          or a.event_id in (select e.id from public.events e where e.organisation_id = o.id)))
  from public.organisations o
  order by o.name;
end $$;

create or replace function public.admin_organisation_members(p_org uuid) returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.organisation_id = p_org order by m.created_at;
end $$;

create or replace function public.admin_create_organisation(p_name text, p_slug text, p_timezone text, p_logo_url text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_slug text := lower(btrim(coalesce(p_slug, ''))); v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  if char_length(v_slug) not between 2 and 40 or v_slug !~ '^[a-z0-9][a-z0-9-]*$' then raise exception 'INVALID_SLUG'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_timezone) then raise exception 'INVALID_TIMEZONE'; end if;
  begin
    insert into public.organisations (name, slug, settings, branding)
    values (v_name, v_slug, jsonb_build_object('defaultTimezone', p_timezone),
            case when p_logo_url is null then '{}'::jsonb else jsonb_build_object('logoUrl', p_logo_url) end)
    returning id into v_id;
  exception when unique_violation then raise exception 'SLUG_TAKEN';
  end;
  perform private.platform_audit('organisation_created', v_id, 'organisations', v_id, null,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'timezone', p_timezone), null);
  return v_id;
end $$;

create or replace function public.admin_rename_organisation(p_org uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_old text;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception 'INVALID_NAME'; end if;
  select name into v_old from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.organisations set name = v_name where id = p_org;
  perform private.platform_audit('organisation_renamed', p_org, 'organisations', p_org, jsonb_build_object('name', v_old), jsonb_build_object('name', v_name), null);
end $$;

create or replace function public.admin_set_organisation_logo(p_org uuid, p_logo_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  select branding ->> 'logoUrl' into v_old from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_logo_url is not null and p_logo_url !~ '^https?://' then raise exception 'INVALID_URL'; end if;
  update public.organisations
     set branding = case when p_logo_url is null then branding - 'logoUrl' else branding || jsonb_build_object('logoUrl', p_logo_url) end
   where id = p_org;
  perform private.platform_audit('organisation_logo_changed', p_org, 'organisations', p_org, jsonb_build_object('logoUrl', v_old), jsonb_build_object('logoUrl', p_logo_url), null);
end $$;

create or replace function public.admin_set_organisation_archived(p_org uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.organisations set archived_at = case when p_archived then coalesce(archived_at, now()) else null end where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit(case when p_archived then 'organisation_archived' else 'organisation_unarchived' end, p_org, 'organisations', p_org, null, null, null);
end $$;

-- Owner only. Refused while any result has been published (results and their audit trail are permanent).
create or replace function public.admin_delete_organisation(p_org uuid, p_slug_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.organisations; v_results int; v_events int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  select * into o from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  if lower(btrim(coalesce(p_slug_confirm, ''))) <> o.slug then raise exception 'SLUG_MISMATCH'; end if;
  select count(*)::int into v_results from public.heat_results r join public.events e on e.id = r.event_id where e.organisation_id = p_org;
  if v_results = 0 then
    select count(*)::int into v_results from public.heats h join public.events e on e.id = h.event_id where e.organisation_id = p_org and h.status = 'published';
  end if;
  if v_results > 0 then raise exception 'PUBLISHED_RESULTS'; end if;
  select count(*)::int into v_events from public.events where organisation_id = p_org;
  perform private.platform_audit('organisation_deleted', p_org, 'organisations', p_org,
    jsonb_build_object('name', o.name, 'slug', o.slug, 'plan', o.plan, 'events', v_events), null, null);
  delete from public.organisations where id = p_org;
end $$;

create or replace function public.admin_add_organiser(p_org uuid, p_user uuid, p_role text default 'owner') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_role is null or p_role not in ('owner', 'admin', 'staff') then raise exception 'INVALID_ROLE'; end if;
  if not exists (select 1 from public.organisations where id = p_org) then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.memberships (organisation_id, user_id, role) values (p_org, p_user, p_role)
    on conflict (organisation_id, user_id) do update set role = excluded.role;
  perform private.platform_audit('organiser_added', p_org, 'memberships', null, null, jsonb_build_object('user_id', p_user, 'role', p_role), null);
end $$;

create or replace function public.admin_start_impersonation(p_org uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.organisations; prev record;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  select * into o from public.organisations where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  for prev in update public.platform_impersonations set ended_at = now() where admin_user_id = auth.uid() and ended_at is null returning organisation_id loop
    perform private.platform_audit('impersonation_ended', prev.organisation_id, 'organisations', prev.organisation_id, null, null, 'replaced by another session');
  end loop;
  insert into public.platform_impersonations (admin_user_id, organisation_id) values (auth.uid(), p_org);
  perform private.platform_audit('impersonation_started', p_org, 'organisations', p_org, null, jsonb_build_object('slug', o.slug, 'name', o.name), p_reason);
end $$;

create or replace function public.admin_stop_impersonation() returns void
language plpgsql security definer set search_path = '' as $$
declare prev record;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  for prev in update public.platform_impersonations set ended_at = now() where admin_user_id = auth.uid() and ended_at is null returning organisation_id loop
    perform private.platform_audit('impersonation_ended', prev.organisation_id, 'organisations', prev.organisation_id, null, null, null);
  end loop;
end $$;

create or replace function public.admin_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'database', true,
    'checked_at', now(),
    'last_publish', (select max(r.published_at) from public.heat_results r),
    'organisations', (select count(*) from public.organisations),
    'events', (select count(*) from public.events),
    'live_events', (select count(*) from public.events e where e.status = 'live'));
end $$;

create or replace function public.admin_audit_log(p_limit int default 200, p_org uuid default null, p_only_platform boolean default false) returns table (
  id uuid, at timestamptz, action text, table_name text, reason text, before jsonb, after jsonb,
  actor_user_id uuid, actor_email text, organisation_id uuid, organisation_name text, event_id uuid, event_name text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select a.id, a.at, a.action, a.table_name, a.reason, a.before, a.after, a.actor_user_id, u.email::text,
         coalesce(a.organisation_id, e.organisation_id),
         coalesce(o.name, a.before ->> 'name', a.after ->> 'name'),
         a.event_id, e.name
  from public.audit_log a
  left join public.events e on e.id = a.event_id
  left join public.organisations o on o.id = coalesce(a.organisation_id, e.organisation_id)
  left join auth.users u on u.id = a.actor_user_id
  where (p_org is null or coalesce(a.organisation_id, e.organisation_id) = p_org)
    and (not p_only_platform or a.organisation_id is not null)
  order by a.at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- Master presets. Anyone on the platform team may write a new draft version; only an owner publishes.
create or replace function public.admin_create_preset_version(p_kind text, p_key text, p_name text, p_json jsonb, p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table(p_kind); v_extra text; v_version int; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9_-]{0,79}$' then raise exception 'INVALID_KEY'; end if;
  if jsonb_typeof(p_json) is distinct from 'object' or p_hash is null or char_length(v_name) = 0 then raise exception 'INVALID_JSON'; end if;
  v_extra := case p_kind when 'trick_vocabulary' then ' and event_id is null' when 'identification' then ' and kind = ''identification''' else '' end;
  execute format('select coalesce(max(version), 0) + 1 from public.%I where organisation_id is null and key = $1%s', v_table, v_extra) into v_version using p_key;
  if p_kind = 'scoring_model' then
    insert into public.scoring_models (organisation_id, key, name, version, json, content_hash) values (null, p_key, v_name, v_version, p_json, p_hash) returning id into v_id;
  elsif p_kind = 'format_template' then
    insert into public.format_templates (organisation_id, key, name, version, json, content_hash) values (null, p_key, v_name, v_version, p_json, p_hash) returning id into v_id;
  elsif p_kind = 'trick_vocabulary' then
    insert into public.trick_vocabularies (organisation_id, event_id, key, version, json, content_hash) values (null, null, p_key, v_version, p_json, p_hash) returning id into v_id;
  else
    insert into public.presets (organisation_id, kind, key, name, version, json, content_hash) values (null, 'identification', p_key, v_name, v_version, p_json, p_hash) returning id into v_id;
  end if;
  perform private.platform_audit('preset_version_created', null, v_table, v_id, null, jsonb_build_object('kind', p_kind, 'key', p_key, 'version', v_version, 'name', v_name), null);
  return v_id;
end $$;

create or replace function public.admin_publish_preset(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table(p_kind); v_extra text; v_key text; v_version int; v_top int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if v_table is null then raise exception 'INVALID_KIND'; end if;
  v_extra := case p_kind when 'trick_vocabulary' then ' and event_id is null' when 'identification' then ' and kind = ''identification''' else '' end;
  execute format('select key, version from public.%I where id = $1 and organisation_id is null%s', v_table, v_extra) into v_key, v_version using p_id;
  if v_key is null then raise exception 'NOT_FOUND'; end if;
  execute format('select max(version) from public.%I where organisation_id is null and key = $1 and published_at is not null%s', v_table, v_extra) into v_top using v_key;
  if v_top is not null and v_version < v_top then raise exception 'NOT_NEWER'; end if;
  execute format('update public.%I set published_at = coalesce(published_at, now()) where id = $1', v_table) using p_id;
  perform private.platform_audit('preset_published', null, v_table, p_id, null, jsonb_build_object('kind', p_kind, 'key', v_key, 'version', v_version), null);
end $$;

-- ---------------------------------------------------------------- 7. public functions
create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'product_name', (select s.value from public.platform_settings s where s.key = 'product_name'),
    'logo_url', (select s.value from public.platform_settings s where s.key = 'logo_url'),
    'tagline', coalesce((select s.value from public.platform_settings s where s.key = 'tagline'), to_jsonb('Live scoring and results for kite competitions'::text)),
    'default_timezone', (select s.value from public.platform_settings s where s.key = 'default_timezone'),
    'legal_texts', (select s.value from public.platform_settings s where s.key = 'legal_texts'));
$$;

create or replace function public.get_public_events(p_limit int default 30) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, organisation_name text, organisation_slug text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, o.name, o.slug
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.status in ('published', 'live', 'complete') and o.archived_at is null
  order by e.start_date desc nulls last, e.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Null unless the organisation is active and has at least one published event (a customer appears on the public site with its first event).
create or replace function public.get_public_organisation(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', o.name, 'slug', o.slug, 'logo_url', o.branding ->> 'logoUrl', 'timezone', o.settings ->> 'defaultTimezone',
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'location', e.location,
                        'start_date', e.start_date, 'end_date', e.end_date, 'status', e.status) order by e.start_date desc nulls last), '[]'::jsonb)
               from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete')))
  from public.organisations o
  where o.slug = lower(coalesce(p_slug, '')) and o.archived_at is null
    and exists (select 1 from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete'));
$$;

-- ---------------------------------------------------------------- clean-up helper also removes platform audit lines (service role only, used for test data)
create or replace function public.purge_organisation(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_events uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_events from public.events where organisation_id = p_org;
  perform set_config('app.allow_purge', 'on', true);
  delete from public.organisations where id = p_org;
  delete from public.audit_log where event_id = any (v_events) or organisation_id = p_org;
  perform set_config('app.allow_purge', 'off', true);
end $$;

-- ---------------------------------------------------------------- who may call what
revoke all on function
  public.platform_session, public.admin_organisation_overview, public.admin_organisation_members, public.admin_create_organisation,
  public.admin_rename_organisation, public.admin_set_organisation_logo, public.admin_set_organisation_archived, public.admin_delete_organisation,
  public.admin_add_organiser, public.admin_start_impersonation, public.admin_stop_impersonation, public.admin_health, public.admin_audit_log,
  public.admin_create_preset_version, public.admin_publish_preset from public, anon, authenticated;
grant execute on function
  public.platform_session, public.admin_organisation_overview, public.admin_organisation_members, public.admin_create_organisation,
  public.admin_rename_organisation, public.admin_set_organisation_logo, public.admin_set_organisation_archived, public.admin_delete_organisation,
  public.admin_add_organiser, public.admin_start_impersonation, public.admin_stop_impersonation, public.admin_health, public.admin_audit_log,
  public.admin_create_preset_version, public.admin_publish_preset to authenticated;
revoke all on function public.public_platform_settings, public.get_public_events, public.get_public_organisation from public;
grant execute on function public.public_platform_settings, public.get_public_events, public.get_public_organisation to anon, authenticated, service_role;
revoke all on function public.purge_organisation from public, anon, authenticated;
grant execute on function public.purge_organisation to service_role;
