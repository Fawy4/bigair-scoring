-- Phase 4a-2: riders, officials, public registration, trick base, feedback notes.
--   0. has_password (the "Set a password" / "Change password" button)
--   1. entries: declined registrations, and a rider can only be entered in a division of their own organisation
--   2. divisions: description, own identification scheme, trick base (with its lock), seed order and the stored shuffle code
--   3. judge seats: PIN kept encrypted for "Show PIN" and "Print cards", regenerate, approve, heartbeat, contact numbers
--   4. public registration: closing time, maximum per division, photos, archived events, information for the public page
--   5. panels: which judges score which division
--   6. trick vocabulary of an event: lock, proposals for the master base
--   7. feedback notes and their screenshots
--   8. storage: rider photos (private, 2 MB) and feedback screenshots (private)
-- Every function states who may call it. The PIN encryption key never enters the database (the server holds it).

-- ---------------------------------------------------------------- 0. does this login have a password?
create or replace function public.has_password() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.encrypted_password is not null and u.encrypted_password <> '' from auth.users u where u.id = auth.uid()), false);
$$;
revoke all on function public.has_password from public, anon;
grant execute on function public.has_password to authenticated;

-- ---------------------------------------------------------------- 1. entries
alter table public.entries drop constraint entries_status_check;
alter table public.entries add constraint entries_status_check check (status in ('registered', 'confirmed', 'withdrawn', 'no_show', 'declined'));
alter table public.entries add column decline_reason text check (decline_reason is null or char_length(decline_reason) <= 300);

-- A rider belongs to an organisation, an entry to a division of an event of the same organisation. Also stops a guessed rider id of another organisation.
create or replace function private.entries_rider_org_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event_org uuid; v_rider_org uuid;
begin
  select e.organisation_id into v_event_org from public.divisions d join public.events e on e.id = d.event_id where d.id = new.division_id;
  select r.organisation_id into v_rider_org from public.riders r where r.id = new.rider_id;
  if v_event_org is distinct from v_rider_org then raise exception 'RIDER_OTHER_ORGANISATION'; end if;
  return new;
end $$;
create trigger b_rider_org_guard before insert or update of rider_id, division_id on public.entries for each row execute function private.entries_rider_org_guard();

-- Moving an event changes the organisation of the event first, so that every row moved afterwards already belongs to the organisation it sits in.
create or replace function public.admin_move_event(p_event uuid, p_target_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; src public.organisations; dst public.organisations;
  r record; v_new uuid; v_key text; v_n int;
  v_copied int := 0; v_reused int := 0; v_removed int := 0; v_presets int := 0;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into dst from public.organisations where id = p_target_org;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if ev.organisation_id = p_target_org then raise exception 'SAME_ORGANISATION'; end if;
  if exists (select 1 from public.heats h where h.event_id = p_event and h.status in ('running', 'paused')) then raise exception 'HEAT_RUNNING'; end if;
  select * into src from public.organisations where id = ev.organisation_id;

  -- 1. organisation presets used by the event's divisions (scoring models, then format templates)
  for r in select distinct m.* from public.scoring_models m join public.divisions d on d.scoring_model_id = m.id
           where d.event_id = p_event and m.organisation_id = ev.organisation_id loop
    select t.id into v_new from public.scoring_models t where t.organisation_id = p_target_org and t.key = r.key and t.version = r.version and t.content_hash = r.content_hash;
    if v_new is null then
      v_key := r.key; v_n := 1;
      while exists (select 1 from public.scoring_models t where t.organisation_id = p_target_org and t.key = v_key and t.version = r.version) loop
        v_n := v_n + 1; v_key := r.key || '-moved' || case when v_n > 2 then '-' || v_n else '' end;
      end loop;
      insert into public.scoring_models (organisation_id, key, name, version, json, content_hash) values (p_target_org, v_key, r.name, r.version, r.json, r.content_hash) returning id into v_new;
      v_presets := v_presets + 1;
    end if;
    update public.divisions set scoring_model_id = v_new where event_id = p_event and scoring_model_id = r.id;
    v_new := null;
  end loop;
  for r in select distinct f.* from public.format_templates f join public.divisions d on d.format_template_id = f.id
           where d.event_id = p_event and f.organisation_id = ev.organisation_id loop
    select t.id into v_new from public.format_templates t where t.organisation_id = p_target_org and t.key = r.key and t.version = r.version and t.content_hash = r.content_hash;
    if v_new is null then
      v_key := r.key; v_n := 1;
      while exists (select 1 from public.format_templates t where t.organisation_id = p_target_org and t.key = v_key and t.version = r.version) loop
        v_n := v_n + 1; v_key := r.key || '-moved' || case when v_n > 2 then '-' || v_n else '' end;
      end loop;
      insert into public.format_templates (organisation_id, key, name, version, json, content_hash) values (p_target_org, v_key, r.name, r.version, r.json, r.content_hash) returning id into v_new;
      v_presets := v_presets + 1;
    end if;
    update public.divisions set format_template_id = v_new where event_id = p_event and format_template_id = r.id;
    v_new := null;
  end loop;

  -- the event changes organisation first, so that every later row already belongs to the organisation it sits in
  update public.events set organisation_id = p_target_org where id = p_event;

  -- 2. riders: reuse the person in the new organisation (same email) or copy them, then repoint this event's entries
  for r in select distinct ri.* from public.riders ri join public.entries en on en.rider_id = ri.id where en.event_id = p_event loop
    v_new := null;
    if r.email is not null then
      select t.id into v_new from public.riders t where t.organisation_id = p_target_org and lower(t.email) = lower(r.email);
    end if;
    if v_new is null then
      insert into public.riders (organisation_id, first_name, last_name, nationality, dob, email, phone, sponsor, woo_id, photo_url)
      values (p_target_org, r.first_name, r.last_name, r.nationality, r.dob, r.email, r.phone, r.sponsor, r.woo_id, r.photo_url) returning id into v_new;
      v_copied := v_copied + 1;
    else
      v_reused := v_reused + 1;
    end if;
    update public.entries set rider_id = v_new where event_id = p_event and rider_id = r.id;
    if not exists (select 1 from public.entries en where en.rider_id = r.id) then
      delete from public.riders where id = r.id;
      v_removed := v_removed + 1;
    end if;
  end loop;

  -- 3. the event itself, and event-level vocabularies that carried the organisation
  update public.trick_vocabularies set organisation_id = p_target_org where event_id = p_event and organisation_id is not null;

  perform private.platform_audit('event_moved', p_target_org, 'events', p_event,
    jsonb_build_object('organisation', src.name, 'organisation_slug', src.slug, 'organisation_id', src.id, 'event', ev.name),
    jsonb_build_object('organisation', dst.name, 'organisation_slug', dst.slug, 'organisation_id', dst.id, 'event', ev.name,
                       'riders_copied', v_copied, 'riders_reused', v_reused, 'riders_removed', v_removed, 'presets_copied', v_presets), null);
  return jsonb_build_object('riders_copied', v_copied, 'riders_reused', v_reused, 'riders_removed', v_removed, 'presets_copied', v_presets);
end $$;

revoke all on function public.admin_move_event from public, anon, authenticated;
grant execute on function public.admin_move_event to authenticated;

-- ---------------------------------------------------------------- 2. divisions
alter table public.divisions
  add column description text check (description is null or char_length(description) <= 300),       -- the level, shown on the registration page
  add column identification jsonb check (identification is null or jsonb_typeof(identification) = 'object'), -- null = use the event's scheme
  add column trick_base jsonb not null default '{}' check (jsonb_typeof(trick_base) = 'object'),          -- {"disabled": ["family:key", ...]}
  add column seed_shuffle_seed bigint;                                                                   -- the code of the last "Shuffle randomly"

-- Once a heat of the division has started, blocks can still be added (ticked) but never removed (unticked).
create or replace function private.divisions_trick_base_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.trick_base is distinct from old.trick_base then
    if new.trick_base ? 'disabled' and jsonb_typeof(new.trick_base -> 'disabled') is distinct from 'array' then raise exception 'TRICK_BASE_INVALID'; end if;
    if exists (select 1 from public.heats h where h.division_id = old.id and h.started_at is not null)
       and exists (select 1 from jsonb_array_elements_text(coalesce(new.trick_base -> 'disabled', '[]'::jsonb)) d(v)
                   where not (coalesce(old.trick_base -> 'disabled', '[]'::jsonb) ? d.v)) then
      raise exception 'TRICK_BASE_LOCKED';
    end if;
  end if;
  return new;
end $$;
create trigger b_trick_base_guard before update of trick_base on public.divisions for each row execute function private.divisions_trick_base_guard();

-- Seed order: the listed riders become 1, 2, 3…; everybody else follows in their old order. Runs as the caller, so only the organiser's own rows can change.
create or replace function public.set_entry_order(p_division uuid, p_entry_ids uuid[], p_shuffle_seed bigint default null) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_len int := coalesce(array_length(p_entry_ids, 1), 0); v_rows int;
begin
  if p_entry_ids is null then raise exception 'INVALID_ORDER'; end if;
  if (select count(distinct x) from unnest(p_entry_ids) x) <> v_len then raise exception 'INVALID_ORDER'; end if;
  if (select count(*) from public.entries e where e.division_id = p_division and e.id = any (p_entry_ids)) <> v_len then raise exception 'ENTRY_NOT_IN_DIVISION'; end if;
  with listed as (
    select t.id, t.ord from unnest(p_entry_ids) with ordinality as t(id, ord)
  ), rest as (
    select e.id, v_len + row_number() over (order by e.seed nulls last, e.created_at, e.id) as ord
      from public.entries e where e.division_id = p_division and not (e.id = any (p_entry_ids))
  ), everyone as (
    select id, ord from listed union all select id, ord from rest
  )
  update public.entries e set seed = everyone.ord::int from everyone where e.id = everyone.id;
  update public.divisions set seed_shuffle_seed = p_shuffle_seed where id = p_division;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'NOT_ALLOWED'; end if;
end $$;
revoke all on function public.set_entry_order from public, anon;
grant execute on function public.set_entry_order to authenticated;

-- ---------------------------------------------------------------- 3. judge seats
alter table public.judge_seats
  add column pin_enc text,                 -- the PIN, encrypted by the server with a key that is not in the database; NOT readable by any signed-in user
  add column last_seen_at timestamptz,     -- heartbeat: set when the seat joins and while its page is open
  add column phone text check (phone is null or char_length(phone) <= 30);
grant select (last_seen_at) on public.judge_seats to authenticated; -- pin_enc and phone are not granted on purpose

-- The audit log never holds the PIN, and a heartbeat is not worth a line.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_event uuid; v_seat uuid; v_action text;
begin
  if tg_table_name = 'judge_seats' and tg_op = 'UPDATE'
     and (v_new - 'last_seen_at' - 'updated_at') is not distinct from (v_old - 'last_seen_at' - 'updated_at') then
    return null;
  end if;
  v_old := v_old - 'pin_hash' - 'qr_token_hash' - 'pin_enc' - 'phone';
  v_new := v_new - 'pin_hash' - 'qr_token_hash' - 'pin_enc' - 'phone';
  v_event := (coalesce(v_new, v_old) ->> 'event_id')::uuid;
  select s.id into v_seat from public.judge_seats s where s.event_id = v_event and s.auth_user_id = auth.uid() and s.active limit 1;
  v_action := coalesce(nullif(current_setting('app.audit_action', true), ''), lower(tg_op));
  insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (v_event, auth.uid(), v_seat, v_action, tg_table_name, (coalesce(v_new, v_old) ->> 'id')::uuid, v_old, v_new,
          nullif(current_setting('app.reason', true), ''));
  return null;
end $$;

-- set_seat_pin now also stores the encrypted PIN (optional, for seats made by the old flow).
drop function public.set_seat_pin(uuid, text);
create or replace function public.set_seat_pin(p_seat uuid, p_pin text, p_enc text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
  select * into s from public.judge_seats where id = p_seat;
  if not found then raise exception 'SEAT_NOT_FOUND'; end if;
  if exists (select 1 from public.judge_seats o where o.event_id = s.event_id and o.id <> s.id and o.pin_hash is not null
             and o.pin_hash = extensions.crypt(p_pin, o.pin_hash)) then
    raise exception 'PIN_IN_USE';
  end if;
  perform set_config('app.audit_action', 'pin_set', true);
  update public.judge_seats set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_enc = p_enc where id = p_seat;
  perform set_config('app.audit_action', '', true);
end $$;

-- Regenerate: the old PIN stops working, the seat's phones are signed out (the seat is unbound), its QR code dies.
-- Refused while a connected seat is in a heat that is running or paused: nobody is dropped to the join page mid-heat.
-- Judges count when they sit on the panel of the heat's division; the head judge and spotters work every heat.
create or replace function public.regenerate_seat_pin(p_seat uuid, p_pin text, p_enc text, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; h record;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
  select * into s from public.judge_seats where id = p_seat;
  if not found then return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND'); end if;
  if s.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'NOT_ACTIVE'); end if;
  if s.auth_user_id is not null then
    select x.number, d.name as division into h
      from public.heats x join public.divisions d on d.id = x.division_id
     where x.event_id = s.event_id and x.status in ('running', 'paused')
       and (s.role in ('head', 'spotter')
            or (s.role = 'judge' and exists (select 1 from public.panel_members pm where pm.panel_id = d.panel_id and pm.judge_seat_id = s.id)))
     order by x.number limit 1;
    if found then return jsonb_build_object('ok', false, 'error', 'SEAT_IN_HEAT', 'heat_number', h.number, 'division', h.division); end if;
  end if;
  if exists (select 1 from public.judge_seats o where o.event_id = s.event_id and o.id <> s.id and o.pin_hash is not null
             and o.pin_hash = extensions.crypt(p_pin, o.pin_hash)) then
    return jsonb_build_object('ok', false, 'error', 'PIN_IN_USE');
  end if;
  perform set_config('app.audit_action', 'pin_regenerated', true);
  perform set_config('app.reason', 'regenerated by organiser ' || coalesce(p_actor::text, 'unknown'), true);
  update public.judge_seats
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_enc = p_enc,
         auth_user_id = null, bound_at = null, qr_token_hash = null, qr_token_expires_at = null, last_seen_at = null
   where id = p_seat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Approve a self-added seat: it becomes active and gets its PIN.
create or replace function public.approve_seat(p_seat uuid, p_pin text, p_enc text, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN_MUST_BE_6_DIGITS'; end if;
  select * into s from public.judge_seats where id = p_seat;
  if not found then return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND'); end if;
  if s.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'NOT_PENDING'); end if;
  if exists (select 1 from public.judge_seats o where o.event_id = s.event_id and o.id <> s.id and o.pin_hash is not null
             and o.pin_hash = extensions.crypt(p_pin, o.pin_hash)) then
    return jsonb_build_object('ok', false, 'error', 'PIN_IN_USE');
  end if;
  perform set_config('app.audit_action', 'seat_approved', true);
  perform set_config('app.reason', 'approved by organiser ' || coalesce(p_actor::text, 'unknown'), true);
  update public.judge_seats set status = 'active', active = true, pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), pin_enc = p_enc where id = p_seat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Heartbeat: a signed-in phone that holds a seat says "I am here" (at most every 15 seconds per seat).
create or replace function public.touch_seat() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update public.judge_seats set last_seen_at = now()
   where auth_user_id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '15 seconds');
end $$;

-- Joining counts as the first sighting.
create or replace function private.bind_seat(p_seat public.judge_seats, p_user uuid, p_ip text, p_how text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rebound boolean;
begin
  if p_seat.locked and p_seat.auth_user_id is not null and p_seat.auth_user_id <> p_user then
    return jsonb_build_object('ok', false, 'error', 'SEAT_LOCKED');
  end if;
  v_rebound := p_seat.auth_user_id is not null and p_seat.auth_user_id <> p_user;
  perform set_config('app.audit_action', 'seat_bound', true);
  perform set_config('app.reason', 'joined by ' || p_how, true);
  -- one login holds one seat per event: free any seat this login held before
  update public.judge_seats set auth_user_id = null where event_id = p_seat.event_id and auth_user_id = p_user and id <> p_seat.id;
  update public.judge_seats set auth_user_id = p_user, bound_at = now(), last_seen_at = now() where id = p_seat.id;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  insert into public.join_attempts (event_id, ip, seat_id, ok) values (p_seat.event_id, p_ip, p_seat.id, true);
  return jsonb_build_object('ok', true, 'seat_id', p_seat.id, 'event_id', p_seat.event_id, 'role', p_seat.role, 'name', p_seat.name, 'rebound', v_rebound);
end $$;

-- Phone numbers of self-added officials are for the organiser only (the head judge can read the seat list, but not these).
create or replace function public.get_seat_contacts(p_event uuid) returns table (seat_id uuid, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_event_organiser(p_event) then raise exception 'NOT_ALLOWED'; end if;
  return query select s.id, s.phone from public.judge_seats s where s.event_id = p_event and s.phone is not null;
end $$;

-- Self-add now takes an optional phone number and refuses archived events like unknown ones.
drop function public.request_seat(text, text, text, text);
create or replace function public.request_seat(p_event_slug text, p_name text, p_role text, p_ip text, p_phone text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_name text := btrim(coalesce(p_name, '')); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into ev from public.events where slug = lower(coalesce(p_event_slug, ''));
  if not found or ev.status = 'complete' or ev.archived_at is not null or not private.org_is_active(ev.organisation_id) then
    return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND');
  end if;
  if private.form_rate_limited(ev.id, 'self_add', coalesce(nullif(p_ip, ''), 'unknown')) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  if p_role is null or p_role not in ('judge', 'spotter', 'announcer') then return jsonb_build_object('ok', false, 'error', 'INVALID_ROLE'); end if;
  if char_length(v_name) not between 2 and 60 then return jsonb_build_object('ok', false, 'error', 'INVALID_NAME'); end if;
  if char_length(coalesce(v_phone, '')) > 30 then return jsonb_build_object('ok', false, 'error', 'INVALID_PHONE'); end if;
  if exists (select 1 from public.judge_seats s where s.event_id = ev.id and s.status = 'pending' and lower(s.name) = lower(v_name) and s.role = p_role) then
    return jsonb_build_object('ok', true); -- pressing the button twice is harmless
  end if;
  if (select count(*) from public.judge_seats s where s.event_id = ev.id and s.status = 'pending') >= 50 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_PENDING');
  end if;
  insert into public.judge_seats (event_id, name, role, status, active, scores, phone) values (ev.id, v_name, p_role, 'pending', true, false, v_phone);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_seat_pin, public.regenerate_seat_pin, public.approve_seat, public.request_seat from public, anon, authenticated;
grant execute on function public.set_seat_pin, public.regenerate_seat_pin, public.approve_seat, public.request_seat to service_role;
revoke all on function public.touch_seat, public.get_seat_contacts from public, anon;
grant execute on function public.touch_seat, public.get_seat_contacts to authenticated;

-- ---------------------------------------------------------------- 4. public registration
-- Open = published or live, switched on, and the closing date (and optional time, in the event's time zone) not yet passed.
create or replace function private.registration_open(ev public.events) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_closes date := nullif(ev.settings ->> 'registrationClosesOn', '')::date;
  v_time text := nullif(ev.settings ->> 'registrationClosesTime', '');
  v_deadline timestamptz;
begin
  if ev.status not in ('published', 'live') or coalesce((ev.settings ->> 'registrationOpen')::boolean, false) is not true then return false; end if;
  if v_closes is not null then
    v_deadline := ((v_closes::text || ' ' || case when v_time ~ '^[0-9]{2}:[0-9]{2}$' then v_time || ':00' else '23:59:59.999999' end)::timestamp) at time zone ev.timezone;
    if now() > v_deadline then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.registration_open from public, anon, authenticated;

drop function public.register_rider(text, uuid, jsonb, jsonb, boolean, text);
create or replace function public.register_rider(
  p_event_slug text, p_division uuid, p_fields jsonb, p_identifiers jsonb, p_consent boolean, p_ip text, p_photo_path text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; v_rider uuid; v_ident jsonb; v_max int; v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_first text := btrim(coalesce(p_fields ->> 'first_name', ''));
  v_last text := btrim(coalesce(p_fields ->> 'last_name', ''));
  v_email text := lower(btrim(coalesce(p_fields ->> 'email', '')));
  v_phone text := nullif(btrim(coalesce(p_fields ->> 'phone', '')), '');
  v_nat text := nullif(btrim(coalesce(p_fields ->> 'nationality', '')), '');
  v_sponsor text := nullif(btrim(coalesce(p_fields ->> 'sponsor', '')), '');
  v_woo text := nullif(btrim(coalesce(p_fields ->> 'woo_id', '')), '');
begin
  select * into ev from public.events where slug = lower(coalesce(p_event_slug, ''));
  if not found or ev.archived_at is not null or not private.org_is_active(ev.organisation_id) then
    return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND');
  end if;
  if private.form_rate_limited(ev.id, 'register', coalesce(nullif(p_ip, ''), 'unknown')) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  if not private.registration_open(ev) then return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED'); end if;
  if not exists (select 1 from public.divisions d where d.id = p_division and d.event_id = ev.id) then
    return jsonb_build_object('ok', false, 'error', 'DIVISION_NOT_FOUND');
  end if;
  v_max := nullif(ev.settings ->> 'registrationMaxPerDivision', '')::int;
  if v_max is not null and (select count(*) from public.entries e where e.division_id = p_division and e.status in ('registered', 'confirmed')) >= v_max then
    return jsonb_build_object('ok', false, 'error', 'DIVISION_FULL');
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

  -- a photo must sit in this organisation's own registration folder and really have been uploaded
  if v_photo is not null and not (
       v_photo ~ ('^' || ev.organisation_id::text || '/reg/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$')
       and exists (select 1 from storage.objects o where o.bucket_id = 'rider-photos' and o.name = v_photo)) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PHOTO');
  end if;

  -- only known identifier keys, kept small
  if jsonb_typeof(p_identifiers) = 'object' and char_length(p_identifiers::text) <= 1000 then
    select coalesce(jsonb_object_agg(k, v), '{}') into v_ident
      from jsonb_each(p_identifiers) as t(k, v) where k in ('vest_colour', 'bib', 'kite', 'rashguard_colour', 'helmet_colour');
  else
    v_ident := '{}';
  end if;

  -- same person, same organisation: reuse the rider. Never overwrite what an organiser or the rider already gave.
  insert into public.riders (organisation_id, first_name, last_name, nationality, email, phone, sponsor, woo_id, photo_url)
  values (ev.organisation_id, v_first, v_last, v_nat, v_email, v_phone, v_sponsor, v_woo, v_photo)
  on conflict (organisation_id, lower(email)) where email is not null do nothing
  returning id into v_rider;
  if v_rider is null then
    select r.id into v_rider from public.riders r where r.organisation_id = ev.organisation_id and lower(r.email) = v_email;
    update public.riders set nationality = coalesce(nationality, v_nat), phone = coalesce(phone, v_phone),
           sponsor = coalesce(sponsor, v_sponsor), woo_id = coalesce(woo_id, v_woo), photo_url = coalesce(photo_url, v_photo)
     where id = v_rider;
  end if;

  -- an existing entry looks exactly like a new one (no way to probe who is registered)
  insert into public.entries (division_id, rider_id, status, source, consent_at, identifiers)
  values (p_division, v_rider, 'registered', 'self', now(), v_ident)
  on conflict (division_id, rider_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Everything the public registration page needs, for the server to read (visitors never touch the tables).
create or replace function public.public_registration_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; v_max int; v_divs jsonb;
begin
  select * into ev from public.events where slug = lower(coalesce(p_slug, ''));
  if not found or ev.archived_at is not null or ev.status not in ('published', 'live', 'complete') then return jsonb_build_object('found', false); end if;
  select * into org from public.organisations where id = ev.organisation_id;
  if org.archived_at is not null then return jsonb_build_object('found', false); end if;
  v_max := nullif(ev.settings ->> 'registrationMaxPerDivision', '')::int;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'name', d.name, 'description', d.description, 'identification', d.identification,
           'full', v_max is not null and (select count(*) from public.entries e where e.division_id = d.id and e.status in ('registered', 'confirmed')) >= v_max
         ) order by d.sort_order, d.created_at), '[]'::jsonb)
    into v_divs from public.divisions d where d.event_id = ev.id;
  return jsonb_build_object(
    'found', true,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'timezone', ev.timezone, 'status', ev.status, 'branding', ev.branding,
                                'location', ev.location, 'startDate', ev.start_date, 'endDate', ev.end_date),
    'organisation', jsonb_build_object('id', org.id, 'name', org.name),
    'open', private.registration_open(ev),
    'closedMessage', ev.settings ->> 'registrationClosedMessage',
    'closesOn', ev.settings ->> 'registrationClosesOn',
    'closesTime', ev.settings ->> 'registrationClosesTime',
    'identification', ev.settings -> 'identification',
    'divisions', v_divs);
end $$;

revoke all on function public.register_rider, public.public_registration_info from public, anon, authenticated;
grant execute on function public.register_rider, public.public_registration_info to service_role;

-- ---------------------------------------------------------------- 5. panels
-- The judges of a division (head judge included when ticked). Runs as the caller, and says no to anyone who is not the event's organiser.
create or replace function public.set_division_panel(p_division uuid, p_seat_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare d public.divisions; v_panel uuid; v_len int := coalesce(array_length(p_seat_ids, 1), 0);
begin
  select * into d from public.divisions where id = p_division;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if (select count(distinct x) from unnest(coalesce(p_seat_ids, '{}'::uuid[])) x) <> v_len then raise exception 'INVALID_SEATS'; end if;
  if (select count(*) from public.judge_seats s where s.id = any (coalesce(p_seat_ids, '{}'::uuid[])) and s.event_id = d.event_id and s.role in ('judge', 'head') and s.status = 'active') <> v_len then
    raise exception 'INVALID_SEATS';
  end if;
  v_panel := d.panel_id;
  if v_panel is null then
    insert into public.panels (event_id, name) values (d.event_id, d.name) returning id into v_panel;
    update public.divisions set panel_id = v_panel where id = d.id;
  end if;
  delete from public.panel_members where panel_id = v_panel;
  insert into public.panel_members (panel_id, judge_seat_id, seat_no)
    select v_panel, t.id, t.ord::int from unnest(coalesce(p_seat_ids, '{}'::uuid[])) with ordinality as t(id, ord);
end $$;

-- "Head judge also scores": on puts the head judge on every panel of the event, off takes them out of all.
create or replace function public.set_seat_scores(p_seat uuid, p_scores boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare s public.judge_seats;
begin
  select * into s from public.judge_seats where id = p_seat;
  if not found or not private.is_event_organiser(s.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if s.role <> 'head' then raise exception 'INVALID_SEATS'; end if;
  update public.judge_seats set scores = p_scores where id = p_seat;
  if p_scores then
    insert into public.panel_members (panel_id, judge_seat_id, seat_no)
      select p.id, p_seat, coalesce((select max(m.seat_no) from public.panel_members m where m.panel_id = p.id), 0) + 1
        from public.panels p
       where p.event_id = s.event_id and not exists (select 1 from public.panel_members m where m.panel_id = p.id and m.judge_seat_id = p_seat);
  else
    delete from public.panel_members where judge_seat_id = p_seat;
  end if;
end $$;
revoke all on function public.set_division_panel, public.set_seat_scores from public, anon;
grant execute on function public.set_division_panel, public.set_seat_scores to authenticated;

-- ---------------------------------------------------------------- 6. the event's own trick blocks
-- An event's vocabulary must belong to the event's organisation; once a heat has started its blocks cannot be removed.
create or replace function private.vocab_event_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if tg_op = 'DELETE' then
    if old.event_id is not null and exists (select 1 from public.heats h where h.event_id = old.event_id and h.started_at is not null)
       and jsonb_typeof(old.json -> 'blocks') = 'array' and jsonb_array_length(old.json -> 'blocks') > 0 and pg_trigger_depth() = 1 then
      raise exception 'TRICK_BASE_LOCKED';
    end if;
    return old;
  end if;
  if new.event_id is not null then
    select e.organisation_id into v_org from public.events e where e.id = new.event_id;
    if v_org is distinct from new.organisation_id then raise exception 'VOCABULARY_OTHER_ORGANISATION'; end if;
  end if;
  if tg_op = 'UPDATE' and new.event_id is not null and jsonb_typeof(old.json -> 'blocks') = 'array'
     and exists (select 1 from public.heats h where h.event_id = new.event_id and h.started_at is not null)
     and exists (
       select 1 from jsonb_array_elements(old.json -> 'blocks') b
        where not exists (select 1 from jsonb_array_elements(coalesce(new.json -> 'blocks', '[]'::jsonb)) n
                           where n ->> 'key' = b ->> 'key' and n ->> 'family' = b ->> 'family')) then
    raise exception 'TRICK_BASE_LOCKED';
  end if;
  return new;
end $$;
create trigger b_vocab_guard before insert or update or delete on public.trick_vocabularies for each row execute function private.vocab_event_guard();

-- Proposals for the master base: every event block still marked "proposed", for platform admins to read.
create or replace function public.admin_trick_proposals() returns table (
  event_id uuid, event_name text, organisation_id uuid, organisation_name text, family text, key text, label text, category text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select v.event_id, e.name, o.id, o.name, b ->> 'family', b ->> 'key', b ->> 'label', b ->> 'category'
    from public.trick_vocabularies v
    join public.events e on e.id = v.event_id
    join public.organisations o on o.id = e.organisation_id
    cross join lateral jsonb_array_elements(coalesce(v.json -> 'blocks', '[]'::jsonb)) b
   where v.event_id is not null and v.key = 'event-additions' and b ->> 'status' = 'proposed'
   order by o.name, e.name, b ->> 'family', b ->> 'label';
end $$;

-- The owner's answer to a proposal: accepted (now in the master base) or declined (stays in that event only).
create or replace function public.admin_set_proposal_status(p_event uuid, p_family text, p_key text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS'; end if;
  update public.trick_vocabularies v
     set json = jsonb_set(v.json, '{blocks}', (
       select coalesce(jsonb_agg(case when b ->> 'key' = p_key and b ->> 'family' = p_family then jsonb_set(b, '{status}', to_jsonb(p_status)) else b end), '[]'::jsonb)
         from jsonb_array_elements(v.json -> 'blocks') b))
   where v.event_id = p_event and v.key = 'event-additions' and jsonb_typeof(v.json -> 'blocks') = 'array'
  returning v.id into v_id;
  if v_id is null then raise exception 'NOT_FOUND'; end if;
  perform private.platform_audit('trick_proposal_' || p_status, null, 'trick_vocabularies', v_id, null, jsonb_build_object('event', p_event, 'family', p_family, 'key', p_key), null);
end $$;
revoke all on function public.admin_trick_proposals, public.admin_set_proposal_status from public, anon;
grant execute on function public.admin_trick_proposals, public.admin_set_proposal_status to authenticated;

-- ---------------------------------------------------------------- 7. feedback notes
create table public.feedback_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations on delete cascade, -- null = an owner's note from the admin screens
  author_user_id uuid references auth.users on delete set null,
  author_role text not null check (author_role in ('owner', 'staff', 'organiser')),
  event_id uuid references public.events on delete set null,
  division_id uuid references public.divisions on delete set null,
  heat_id uuid references public.heats on delete set null,
  page text not null check (char_length(page) between 1 and 300),
  page_label text not null check (char_length(page_label) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  tag text not null default 'idea' check (tag in ('bug', 'wording', 'layout', 'new_rule', 'idea')),
  status text not null default 'open' check (status in ('open', 'done')),
  screenshot_path text check (screenshot_path is null or char_length(screenshot_path) <= 300),
  exported_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.feedback_notes (organisation_id, status);
create index on public.feedback_notes (status, tag);
create index on public.feedback_notes (author_user_id);
create index on public.feedback_notes (event_id);
create index on public.feedback_notes (division_id);
create index on public.feedback_notes (heat_id);
create trigger z_updated_at before update on public.feedback_notes for each row execute function private.set_updated_at();

create or replace function private.feedback_done_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then new.done_at := now();
  elsif new.status = 'open' then new.done_at := null;
  end if;
  return new;
end $$;
create trigger b_done_at before update of status on public.feedback_notes for each row execute function private.feedback_done_at();

alter table public.feedback_notes enable row level security;
grant select on public.feedback_notes to authenticated;
grant insert (organisation_id, author_user_id, author_role, event_id, division_id, heat_id, page, page_label, body, tag, screenshot_path) on public.feedback_notes to authenticated;
grant update (tag, status, exported_at, done_at) on public.feedback_notes to authenticated; -- the text of a note can never be edited

create policy insert_own on public.feedback_notes for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and ((organisation_id is not null and private.is_org_member(organisation_id)) or (organisation_id is null and private.is_platform_admin()))
    and (author_role <> 'owner' or private.is_platform_owner())
    and (author_role <> 'staff' or private.is_platform_admin()));
create policy read_visible on public.feedback_notes for select to authenticated
  using (private.is_platform_owner() or author_user_id = auth.uid() or (organisation_id is not null and private.is_org_member(organisation_id)));
create policy owner_update on public.feedback_notes for update to authenticated
  using (private.is_platform_owner()) with check (private.is_platform_owner());

-- ---------------------------------------------------------------- 8. storage
-- A path is usable only as "<organisation id>/<file>" by a member of that organisation (no platform-admin shortcut: rider photos are personal).
create or replace function private.org_folder_member(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+' then private.is_org_member(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;
grant execute on function private.org_folder_member to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-photos', 'rider-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
       ('feedback', 'feedback', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy rider_photos_select on storage.objects for select to authenticated using (bucket_id = 'rider-photos' and private.org_folder_member(name));
create policy rider_photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'rider-photos' and private.org_folder_member(name));
create policy rider_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'rider-photos' and private.org_folder_member(name)) with check (bucket_id = 'rider-photos' and private.org_folder_member(name));
create policy rider_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'rider-photos' and private.org_folder_member(name));

-- Screenshots: an organisation's own folder, or "platform/" for the owner's notes; the platform owner may read everything.
create policy feedback_select on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and (private.org_folder_member(name) or private.is_platform_owner()));
create policy feedback_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (private.org_folder_member(name) or (name like 'platform/%' and private.is_platform_admin())));
