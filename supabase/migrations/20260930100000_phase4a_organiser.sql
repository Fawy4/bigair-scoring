-- Phase 4a-1: organiser console additions.
--   1. organisation settings (default time zone) + editable slug
--   2. storage bucket `branding` (logos), writable only under <organisation_id>/ by that organisation's members
--   3. generic `presets` table (identification schemes, schedules, ...)
--   4. divisions: stored draw, draw-locked timestamp, rules lock (scoring + format lock once a heat has started)
--   5. public registration and official self-add: service-only, rate-limited functions
-- Every function states who may call it. Nothing here is readable or writable by anyone it is not meant for.

-- ---------------------------------------------------------------- 1. organisation settings
alter table public.organisations add column settings jsonb not null default '{"defaultTimezone":"Africa/Cairo"}';
grant update (slug, settings) on public.organisations to authenticated; -- name and branding were granted in Phase 3; the org_update policy limits it to owners and admins

create or replace function private.organisations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.settings) is distinct from 'object' then raise exception 'INVALID_SETTINGS'; end if;
  if new.settings ? 'defaultTimezone'
     and not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.settings ->> 'defaultTimezone') then
    raise exception 'INVALID_TIMEZONE';
  end if;
  return new;
end $$;
create trigger a_org_guard before insert or update of settings on public.organisations for each row execute function private.organisations_guard();

-- ---------------------------------------------------------------- 2. branding bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A path is writable only as "<organisation id>/<file>" by a member of that organisation.
create or replace function private.can_write_branding(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+' then private.is_org_member(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;
grant execute on function private.can_write_branding to anon, authenticated, service_role;

-- Files are public to read through the bucket's public URLs; these policies decide who may list, add, replace and remove.
create policy branding_select on storage.objects for select to authenticated using (bucket_id = 'branding' and private.can_write_branding(name));
create policy branding_insert on storage.objects for insert to authenticated with check (bucket_id = 'branding' and private.can_write_branding(name));
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and private.can_write_branding(name)) with check (bucket_id = 'branding' and private.can_write_branding(name));
create policy branding_delete on storage.objects for delete to authenticated using (bucket_id = 'branding' and private.can_write_branding(name));

-- ---------------------------------------------------------------- 3. generic presets (docs/06 §12 decision 3)
-- organisation_id null = system preset. Scoring models and format templates keep their own tables.
create table public.presets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]*$'),   -- identification | schedule | ...
  key text not null,
  name text not null,
  version int not null default 1 check (version >= 1),
  json jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presets_key_unique unique nulls not distinct (organisation_id, kind, key, version)
);
create index on public.presets (organisation_id);
create trigger z_updated_at before update on public.presets for each row execute function private.set_updated_at();

alter table public.presets enable row level security;
grant select, insert, update, delete on public.presets to authenticated;
create policy read_presets on public.presets for select to authenticated using (organisation_id is null or private.is_org_member(organisation_id));
create policy org_write_presets on public.presets for all to authenticated
  using (organisation_id is not null and private.is_org_member(organisation_id))
  with check (organisation_id is not null and private.is_org_member(organisation_id));

-- ---------------------------------------------------------------- 4. divisions: stored draw and the rules lock
alter table public.divisions
  add column draw jsonb,                          -- the engine's full DivisionDraw (used by Phase 4b)
  add column draw_locked_at timestamptz,          -- set when the organiser confirms the draw (lockDraw)
  add column rules_unlocked_at timestamptz;       -- set by unlock_division_rules(); the reason lives in the audit log

-- The full draw is large; the audit line records that the draw changed, not the draw itself.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_event uuid; v_seat uuid; v_action text;
begin
  v_old := v_old - 'pin_hash' - 'qr_token_hash' - 'draw';
  v_new := v_new - 'pin_hash' - 'qr_token_hash' - 'draw';
  v_event := (coalesce(v_new, v_old) ->> 'event_id')::uuid;
  select s.id into v_seat from public.judge_seats s where s.event_id = v_event and s.auth_user_id = auth.uid() and s.active limit 1;
  v_action := coalesce(nullif(current_setting('app.audit_action', true), ''), lower(tg_op));
  insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (v_event, auth.uid(), v_seat, v_action, tg_table_name, (coalesce(v_new, v_old) ->> 'id')::uuid, v_old, v_new,
          nullif(current_setting('app.reason', true), ''));
  return null;
end $$;

-- Scoring model and format are read-only once any heat of the division has started, unless someone unlocked them with a reason.
create or replace function private.divisions_rules_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.scoring_model_id, new.scoring_overrides, new.format_template_id, new.format_params)
       is distinct from (old.scoring_model_id, old.scoring_overrides, old.format_template_id, old.format_params)
     and new.rules_unlocked_at is null
     and exists (select 1 from public.heats h where h.division_id = old.id and h.started_at is not null) then
    raise exception 'RULES_LOCKED';
  end if;
  return new;
end $$;
create trigger b_rules_guard before update on public.divisions for each row execute function private.divisions_rules_guard();

-- A division that has heats cannot be deleted directly (deleting its whole event still cascades).
create or replace function private.divisions_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 1 and exists (select 1 from public.heats h where h.division_id = old.id) then
    raise exception 'DIVISION_HAS_HEATS';
  end if;
  return old;
end $$;
create trigger b_delete_guard before delete on public.divisions for each row execute function private.divisions_delete_guard();

-- Edits after an unlock (and the unlock itself) are audited.
create trigger z_audit after update on public.divisions for each row
  when (old.rules_unlocked_at is distinct from new.rules_unlocked_at
        or (new.rules_unlocked_at is not null
            and (old.scoring_model_id is distinct from new.scoring_model_id or old.scoring_overrides is distinct from new.scoring_overrides
                 or old.format_template_id is distinct from new.format_template_id or old.format_params is distinct from new.format_params)))
  execute function private.audit_row();

create or replace function public.unlock_division_rules(p_division uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  select * into d from public.divisions where id = p_division;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  perform set_config('app.audit_action', 'rules_unlocked', true);
  perform set_config('app.reason', btrim(p_reason), true);
  update public.divisions set rules_unlocked_at = now() where id = p_division;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
end $$;
revoke all on function public.unlock_division_rules from public, anon, authenticated;
grant execute on function public.unlock_division_rules to authenticated;

-- ---------------------------------------------------------------- 5. public registration and official self-add
-- One rider record per person per organisation, matched by email (docs/06 §12 decision 11).
create unique index riders_org_email_key on public.riders (organisation_id, lower(email)) where email is not null;

-- Service-only log for rate limiting the public forms (like join_attempts): RLS on, no policies, no grants.
create table public.form_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  kind text not null check (kind in ('register', 'self_add')),
  ip text not null,
  at timestamptz not null default now()
);
create index on public.form_attempts (event_id, kind, at desc);
create index on public.form_attempts (event_id, kind, ip, at desc);
alter table public.form_attempts enable row level security;

-- Every call counts (also the ones that fail validation). Limits: 5 per address and 300 per event per hour for
-- registrations; 5 per address and 60 per event per hour for self-add.
create or replace function private.form_rate_limited(p_event uuid, p_kind text, p_ip text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_limited boolean; v_per_event int;
begin
  delete from public.form_attempts where at < now() - interval '2 days';
  v_per_event := case p_kind when 'register' then 300 else 60 end;
  select (select count(*) from public.form_attempts f where f.event_id = p_event and f.kind = p_kind and f.ip = p_ip and f.at > now() - interval '1 hour') >= 5
      or (select count(*) from public.form_attempts f where f.event_id = p_event and f.kind = p_kind and f.at > now() - interval '1 hour') >= v_per_event
    into v_limited;
  if v_limited then return true; end if;
  insert into public.form_attempts (event_id, kind, ip) values (p_event, p_kind, p_ip);
  return false;
end $$;

-- Rider self-registration. Called by the server (never the browser) with the caller's address.
-- Errors are returned, not raised, so the attempt log survives: REGISTRATION_CLOSED, RATE_LIMITED, INVALID_FIELDS, ...
create or replace function public.register_rider(
  p_event_slug text, p_division uuid, p_fields jsonb, p_identifiers jsonb, p_consent boolean, p_ip text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; v_rider uuid; v_ident jsonb;
  v_first text := btrim(coalesce(p_fields ->> 'first_name', ''));
  v_last text := btrim(coalesce(p_fields ->> 'last_name', ''));
  v_email text := lower(btrim(coalesce(p_fields ->> 'email', '')));
  v_phone text := nullif(btrim(coalesce(p_fields ->> 'phone', '')), '');
  v_nat text := nullif(btrim(coalesce(p_fields ->> 'nationality', '')), '');
  v_sponsor text := nullif(btrim(coalesce(p_fields ->> 'sponsor', '')), '');
  v_woo text := nullif(btrim(coalesce(p_fields ->> 'woo_id', '')), '');
  v_closes date;
begin
  select * into ev from public.events where slug = lower(coalesce(p_event_slug, ''));
  if not found then return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND'); end if;
  if private.form_rate_limited(ev.id, 'register', coalesce(nullif(p_ip, ''), 'unknown')) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;

  -- open switch and closing date (the whole closing day counts, in the event's time zone)
  v_closes := nullif(ev.settings ->> 'registrationClosesOn', '')::date;
  if ev.status not in ('published', 'live')
     or coalesce((ev.settings ->> 'registrationOpen')::boolean, false) is not true
     or (v_closes is not null and (now() at time zone ev.timezone)::date > v_closes) then
    return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED');
  end if;
  if not exists (select 1 from public.divisions d where d.id = p_division and d.event_id = ev.id) then
    return jsonb_build_object('ok', false, 'error', 'DIVISION_NOT_FOUND');
  end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'error', 'CONSENT_REQUIRED'); end if;

  if jsonb_typeof(p_fields) is distinct from 'object' or char_length(v_first) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FIELDS', 'field', 'first_name');
  end if;
  if char_length(v_last) not between 1 and 60 then return jsonb_build_object('ok', false, 'error', 'INVALID_FIELDS', 'field', 'last_name'); end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FIELDS', 'field', 'email');
  end if;
  if char_length(coalesce(v_phone, '')) > 30 or char_length(coalesce(v_nat, '')) > 60 or char_length(coalesce(v_sponsor, '')) > 100 or char_length(coalesce(v_woo, '')) > 40 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FIELDS', 'field', 'other');
  end if;

  -- only known identifier keys, kept small
  if jsonb_typeof(p_identifiers) = 'object' and char_length(p_identifiers::text) <= 1000 then
    select coalesce(jsonb_object_agg(k, v), '{}') into v_ident
      from jsonb_each(p_identifiers) as t(k, v) where k in ('vest_colour', 'bib', 'kite', 'rashguard_colour', 'helmet_colour');
  else
    v_ident := '{}';
  end if;

  -- same person, same organisation: reuse the rider. Never overwrite what an organiser or the rider already gave.
  insert into public.riders (organisation_id, first_name, last_name, nationality, email, phone, sponsor, woo_id)
  values (ev.organisation_id, v_first, v_last, v_nat, v_email, v_phone, v_sponsor, v_woo)
  on conflict (organisation_id, lower(email)) where email is not null do nothing
  returning id into v_rider;
  if v_rider is null then
    select r.id into v_rider from public.riders r where r.organisation_id = ev.organisation_id and lower(r.email) = v_email;
    update public.riders set nationality = coalesce(nationality, v_nat), phone = coalesce(phone, v_phone),
           sponsor = coalesce(sponsor, v_sponsor), woo_id = coalesce(woo_id, v_woo)
     where id = v_rider;
  end if;

  -- an existing entry looks exactly like a new one (no way to probe who is registered)
  insert into public.entries (division_id, rider_id, status, source, consent_at, identifiers)
  values (p_division, v_rider, 'registered', 'self', now(), v_ident)
  on conflict (division_id, rider_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Official self-add ("Not on the list? Add your name"): creates a PENDING seat only. It has no PIN and cannot join until
-- an organiser approves it.
create or replace function public.request_seat(p_event_slug text, p_name text, p_role text, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_name text := btrim(coalesce(p_name, ''));
begin
  select * into ev from public.events where slug = lower(coalesce(p_event_slug, ''));
  if not found or ev.status = 'complete' then return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND'); end if;
  if private.form_rate_limited(ev.id, 'self_add', coalesce(nullif(p_ip, ''), 'unknown')) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  if p_role is null or p_role not in ('judge', 'spotter', 'announcer') then return jsonb_build_object('ok', false, 'error', 'INVALID_ROLE'); end if;
  if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'INVALID_NAME'); end if;
  if exists (select 1 from public.judge_seats s where s.event_id = ev.id and s.status = 'pending' and lower(s.name) = lower(v_name) and s.role = p_role) then
    return jsonb_build_object('ok', true); -- pressing the button twice is harmless
  end if;
  if (select count(*) from public.judge_seats s where s.event_id = ev.id and s.status = 'pending') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_PENDING');
  end if;
  insert into public.judge_seats (event_id, name, role, status, active, scores) values (ev.id, v_name, p_role, 'pending', true, false);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.register_rider, public.request_seat from public, anon, authenticated;
grant execute on function public.register_rider, public.request_seat to service_role;
revoke all on function private.form_rate_limited from public, anon, authenticated;
