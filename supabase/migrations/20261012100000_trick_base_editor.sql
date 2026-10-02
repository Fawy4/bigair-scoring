-- Master trick base editor (branch trick-base-editor, owner's decisions of 2 Oct 2026).
-- 1. Each master version records who saved it, who published it and what changed, in words.
-- 2. Each event keeps the master version it uses; existing events are set to the version they use today; new events start from the newest published one.
-- 3. Only a platform owner writes the master trick base (save a draft version, publish it).
-- 4. A dismissed proposal carries the owner's reason, which the organiser sees.
-- 5. "Update to latest": an organiser moves their event to the newest published version (not while a heat is running or paused).
-- 6. A division may tick blocks the master base has off for new events (trick_base.enabled); after a heat has started that list only grows.

-- ---------------------------------------------------------------- 1. who and what
alter table public.trick_vocabularies
  add column created_by uuid references auth.users on delete set null,
  add column published_by uuid references auth.users on delete set null,
  add column change_summary text check (change_summary is null or char_length(change_summary) <= 2000);
create index on public.trick_vocabularies (created_by);
create index on public.trick_vocabularies (published_by);

-- The newest published master version (null before the presets are seeded).
create or replace function private.latest_trick_version() returns int
language sql stable security definer set search_path = '' as $$
  select max(v.version) from public.trick_vocabularies v
   where v.organisation_id is null and v.event_id is null and v.key = 'big-air-vocabulary' and v.published_at is not null;
$$;
revoke all on function private.latest_trick_version from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. the version an event uses
alter table public.events add column trick_vocabulary_version int check (trick_vocabulary_version is null or trick_vocabulary_version >= 1);
update public.events set trick_vocabulary_version = private.latest_trick_version() where trick_vocabulary_version is null;
grant select (trick_vocabulary_version) on public.events to anon, authenticated; -- not a secret; changed only by update_event_trick_base

create or replace function private.events_trick_version_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.trick_vocabulary_version is null then new.trick_vocabulary_version := private.latest_trick_version(); end if;
  return new;
end $$;
create trigger b_trick_version_default before insert on public.events for each row execute function private.events_trick_version_default();

-- ---------------------------------------------------------------- 3. owner-only master writes
-- Owner only (staff may read drafts but not write the trick base). The same rule in the generic preset function for the JSON view.
create or replace function public.admin_create_preset_version(p_kind text, p_key text, p_name text, p_json jsonb, p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_table text := private.preset_table(p_kind); v_extra text; v_version int; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_kind = 'trick_vocabulary' and not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
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
    insert into public.trick_vocabularies (organisation_id, event_id, key, version, json, content_hash, created_by) values (null, null, p_key, v_version, p_json, p_hash, auth.uid()) returning id into v_id;
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
  if p_kind = 'trick_vocabulary' then update public.trick_vocabularies set published_by = coalesce(published_by, auth.uid()) where id = p_id; end if;
  perform private.platform_audit('preset_published', null, v_table, p_id, null, jsonb_build_object('kind', p_kind, 'key', v_key, 'version', v_version), null);
end $$;

-- Save the editor's draft: a new version after every version (drafts included), unless it is identical to the newest one.
-- p_base_version is the version the editor started from: if someone saved in between, the save is refused (TRICK_BASE_STALE) rather than overwriting.
create or replace function public.admin_trick_base_save(p_json jsonb, p_hash text, p_base_version int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_top int; v_top_hash text; v_top_id uuid; v_id uuid;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if jsonb_typeof(p_json) is distinct from 'object' or jsonb_typeof(p_json -> 'baseTricks') is distinct from 'array' or jsonb_typeof(p_json -> 'modifiers') is distinct from 'array'
     or p_hash is null or char_length(p_hash) > 128 then raise exception 'INVALID_JSON'; end if;
  perform pg_advisory_xact_lock(hashtext('trick-base-master'));
  select v.version, v.content_hash, v.id into v_top, v_top_hash, v_top_id from public.trick_vocabularies v
   where v.organisation_id is null and v.event_id is null and v.key = 'big-air-vocabulary' order by v.version desc limit 1;
  if v_top is not null and p_base_version is distinct from v_top then raise exception 'TRICK_BASE_STALE'; end if;
  if v_top_hash = p_hash then return jsonb_build_object('id', v_top_id, 'version', v_top, 'created', false); end if;
  insert into public.trick_vocabularies (organisation_id, event_id, key, version, json, content_hash, created_by)
  values (null, null, 'big-air-vocabulary', coalesce(v_top, 0) + 1, p_json, p_hash, auth.uid()) returning id into v_id;
  perform private.platform_audit('trick_base_saved', null, 'trick_vocabularies', v_id, null, jsonb_build_object('version', coalesce(v_top, 0) + 1), null);
  return jsonb_build_object('id', v_id, 'version', coalesce(v_top, 0) + 1, 'created', true);
end $$;

-- "Publish to all customers": the newest version becomes the one new events start from. The diff in words is stored with it.
create or replace function public.admin_trick_base_publish(p_id uuid, p_summary text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_version int; v_published timestamptz; v_top int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  perform pg_advisory_xact_lock(hashtext('trick-base-master'));
  select v.version, v.published_at into v_version, v_published from public.trick_vocabularies v
   where v.id = p_id and v.organisation_id is null and v.event_id is null and v.key = 'big-air-vocabulary';
  if v_version is null then raise exception 'NOT_FOUND'; end if;
  if v_published is not null then raise exception 'ALREADY_DEFAULT'; end if;
  v_top := private.latest_trick_version();
  if v_top is not null and v_version <= v_top then raise exception 'NOT_NEWER'; end if;
  update public.trick_vocabularies
     set published_at = now(), published_by = auth.uid(), change_summary = nullif(left(btrim(coalesce(p_summary, '')), 2000), '')
   where id = p_id;
  perform private.platform_audit('trick_base_published', null, 'trick_vocabularies', p_id, null, jsonb_build_object('version', v_version, 'summary', p_summary), null);
  return v_version;
end $$;

-- The version history with who saved and who published (platform admins read; e-mail addresses are not readable otherwise).
create or replace function public.admin_trick_base_history() returns table (
  id uuid, version int, created_at timestamptz, created_by_email text, published_at timestamptz, published_by_email text, change_summary text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select v.id, v.version, v.created_at, cu.email::text, v.published_at, pu.email::text, v.change_summary
    from public.trick_vocabularies v
    left join auth.users cu on cu.id = v.created_by
    left join auth.users pu on pu.id = v.published_by
   where v.organisation_id is null and v.event_id is null and v.key = 'big-air-vocabulary'
   order by v.version desc;
end $$;

revoke all on function public.admin_trick_base_save, public.admin_trick_base_publish, public.admin_trick_base_history from public, anon;
grant execute on function public.admin_trick_base_save, public.admin_trick_base_publish, public.admin_trick_base_history to authenticated;

-- ---------------------------------------------------------------- 4. proposals: the owner's answer, with a reason for "dismiss"
drop function public.admin_set_proposal_status(uuid, text, text, text);
create or replace function public.admin_set_proposal_status(p_event uuid, p_family text, p_key text, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'declined' and v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  update public.trick_vocabularies v
     set json = jsonb_set(v.json, '{blocks}', (
       select coalesce(jsonb_agg(case when b ->> 'key' = p_key and b ->> 'family' = p_family
                                      then case when p_status = 'declined' then b || jsonb_build_object('status', p_status, 'reason', v_reason)
                                                else (b - 'reason') || jsonb_build_object('status', p_status) end
                                      else b end), '[]'::jsonb)
         from jsonb_array_elements(v.json -> 'blocks') b))
   where v.event_id = p_event and v.key = 'event-additions' and jsonb_typeof(v.json -> 'blocks') = 'array'
     and exists (select 1 from jsonb_array_elements(v.json -> 'blocks') b where b ->> 'key' = p_key and b ->> 'family' = p_family)
  returning v.id into v_id;
  if v_id is null then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit('trick_proposal_' || p_status, null, 'trick_vocabularies', v_id, null, jsonb_build_object('event', p_event, 'family', p_family, 'key', p_key), v_reason);
end $$;
revoke all on function public.admin_set_proposal_status from public, anon;
grant execute on function public.admin_set_proposal_status to authenticated;

-- ---------------------------------------------------------------- 5. "Update to latest" for one event
create or replace function public.update_event_trick_base(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_from int; v_to int := private.latest_trick_version();
begin
  if p_event is null or not private.is_event_organiser(p_event) then raise exception 'NOT_ALLOWED'; end if;
  if v_to is null then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.heats h where h.event_id = p_event and h.status in ('running', 'paused')) then raise exception 'HEAT_RUNNING'; end if;
  select e.trick_vocabulary_version into v_from from public.events e where e.id = p_event for update;
  if v_from is distinct from v_to then
    update public.events set trick_vocabulary_version = v_to where id = p_event; -- the audit trigger on events records before / after
  end if;
  return jsonb_build_object('from', v_from, 'to', v_to);
end $$;
revoke all on function public.update_event_trick_base from public, anon;
grant execute on function public.update_event_trick_base to authenticated;

-- ---------------------------------------------------------------- 6. the division's ticks: default-off blocks ticked on
create or replace function private.divisions_trick_base_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.trick_base is distinct from old.trick_base then
    if new.trick_base ? 'disabled' and jsonb_typeof(new.trick_base -> 'disabled') is distinct from 'array' then raise exception 'TRICK_BASE_INVALID'; end if;
    if new.trick_base ? 'enabled' and jsonb_typeof(new.trick_base -> 'enabled') is distinct from 'array' then raise exception 'TRICK_BASE_INVALID'; end if;
    if new.trick_base ? 'layout' and jsonb_typeof(new.trick_base -> 'layout') is distinct from 'object' then raise exception 'TRICK_BASE_INVALID'; end if;
    if exists (select 1 from public.heats h where h.division_id = old.id and h.started_at is not null)
       and (exists (select 1 from jsonb_array_elements_text(coalesce(new.trick_base -> 'disabled', '[]'::jsonb)) d(v)
                     where not (coalesce(old.trick_base -> 'disabled', '[]'::jsonb) ? d.v))
            or exists (select 1 from jsonb_array_elements_text(coalesce(old.trick_base -> 'enabled', '[]'::jsonb)) e(v)
                        where not (coalesce(new.trick_base -> 'enabled', '[]'::jsonb) ? e.v))) then
      raise exception 'TRICK_BASE_LOCKED';
    end if;
  end if;
  return new;
end $$;
