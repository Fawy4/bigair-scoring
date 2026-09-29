-- Phase 3 / step 6: the only doors into protected data. Every function states who may call it.
-- Errors are plain codes the app can show: ATTEMPT_CAP_REACHED, HEAT_NOT_RUNNING, RIDER_NOT_IN_HEAT, ...

-- ---------------------------------------------------------------- attempts
create or replace function public.add_attempt(
  p_heat uuid, p_entry uuid, p_client_key uuid, p_status text,
  p_direction text default null, p_category_key text default null, p_trick_name text default null,
  p_trick_parts jsonb default '{}', p_height_m numeric default null,
  p_input_method text default 'builder', p_raw_text text default null, p_override_reason text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; ev public.events; slot public.heat_slots; v_row public.trick_attempts;
  v_role text; v_seat uuid; v_org boolean; v_privileged boolean; v_eff text;
  v_cap int; v_used int; v_seq int; v_dup uuid; v_window int; v_over boolean := false;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  select * into ev from public.events where id = h.event_id;
  v_org := private.is_event_organiser(h.event_id);
  v_seat := private.seat_id(h.event_id);
  v_role := private.seat_role(h.event_id);
  if not v_org and not (v_role in ('spotter', 'head') or (v_role = 'judge' and coalesce((ev.settings ->> 'judgesMayLogAttempts')::boolean, false))) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_privileged := v_org or v_role = 'head';

  -- safe retry: the same client_key returns the attempt that already exists
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then
    if v_row.heat_id <> p_heat then raise exception 'CLIENT_KEY_REUSED'; end if;
    return v_row;
  end if;

  v_eff := private.heat_effective_status(p_heat);
  if not (v_eff = 'running' or (v_privileged and v_eff in ('paused', 'ended', 'under_review'))) then
    raise exception 'HEAT_NOT_RUNNING';
  end if;

  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if slot.modifier is not null or slot.flagged_out then raise exception 'RIDER_NOT_RIDING'; end if;

  -- one rider, one lock: two phones cannot both take the last place
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then return v_row; end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  select count(*) into v_used from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null;
  if v_cap is not null and v_used >= v_cap then
    if p_override_reason is null or not v_privileged then raise exception 'ATTEMPT_CAP_REACHED'; end if;
    if btrim(p_override_reason) = '' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
    v_over := true;
  end if;

  select coalesce(max(a.seq), 0) + 1 into v_seq from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry;

  -- two different spotters logging the same rider within the window: flag it for the head judge, never drop it
  v_window := coalesce((private.division_heat_setting(h.division_id, 'duplicateWindowSec') #>> '{}')::int, 20);
  select a.id into v_dup from public.trick_attempts a
   where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null
     and a.created_by_seat is distinct from v_seat and a.created_at > now() - make_interval(secs => v_window)
   order by a.created_at desc limit 1;

  if v_over then
    perform set_config('app.audit_action', 'attempt_cap_override', true);
    perform set_config('app.reason', p_override_reason, true);
  end if;
  insert into public.trick_attempts (heat_id, entry_id, seq, client_key, status, direction, category_key, trick_name, trick_parts,
                                     height_m, created_by_seat, input_method, raw_text, possible_duplicate_of, event_id)
  values (p_heat, p_entry, v_seq, p_client_key, p_status, p_direction, p_category_key, p_trick_name, coalesce(p_trick_parts, '{}'),
          p_height_m, v_seat, coalesce(p_input_method, 'builder'), p_raw_text, v_dup, h.event_id)
  returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

create or replace function public.delete_attempt(p_attempt uuid, p_reason text) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; h public.heats; v_row public.trick_attempts;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(a.event_id) or private.seat_role(a.event_id) = 'head') then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into h from public.heats where id = a.heat_id;
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if a.deleted_at is not null then return a; end if;
  perform set_config('app.audit_action', 'attempt_deleted', true);
  perform set_config('app.reason', p_reason, true);
  update public.trick_attempts set deleted_at = now(), deleted_by = auth.uid() where id = p_attempt returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- "5 / 7" counters for the phones (same count the cap uses)
create or replace function public.attempt_counts(p_heat uuid) returns table (entry_id uuid, used int, cap int)
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; v_cap int;
begin
  select * into h from public.heats where id = p_heat;
  if not found or not (private.has_seat(h.event_id) or private.is_event_organiser(h.event_id)) then raise exception 'NOT_ALLOWED'; end if;
  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  return query
    select s.entry_id, (select count(*)::int from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = s.entry_id and a.deleted_at is null), v_cap
    from public.heat_slots s where s.heat_id = p_heat and s.entry_id is not null;
end $$;

-- ---------------------------------------------------------------- marks (run as the caller: Row Level Security decides)
create or replace function public.submit_trick_score(
  p_attempt uuid, p_criteria jsonb, p_score numeric, p_missed boolean, p_flag text, p_client_key uuid, p_client_rev bigint
) returns public.trick_scores
language plpgsql security invoker set search_path = '' as $$
declare a public.trick_attempts; r public.trick_scores; v_seat uuid;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  v_seat := private.seat_id(a.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  insert into public.trick_scores as ts (attempt_id, judge_seat_id, criteria, score, missed, flag, client_key, client_rev, edited_by, event_id, heat_id)
  values (p_attempt, v_seat, coalesce(p_criteria, '{}'), case when p_missed then null else p_score end, coalesce(p_missed, false), p_flag,
          p_client_key, p_client_rev, auth.uid(), a.event_id, a.heat_id)
  on conflict (attempt_id, judge_seat_id) do update
    set criteria = excluded.criteria, score = excluded.score, missed = excluded.missed, flag = excluded.flag,
        client_key = excluded.client_key, client_rev = excluded.client_rev, version = ts.version + 1, edited_by = auth.uid()
    where excluded.client_rev > ts.client_rev
  returning * into r;
  if r.id is null then -- an older queued edit arrived late: keep the newer mark
    select * into r from public.trick_scores where attempt_id = p_attempt and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

create or replace function public.submit_impression(p_heat uuid, p_entry uuid, p_value numeric, p_client_key uuid, p_client_rev bigint)
returns public.impression_scores
language plpgsql security invoker set search_path = '' as $$
declare h public.heats; r public.impression_scores; v_seat uuid;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  insert into public.impression_scores as i (heat_id, entry_id, judge_seat_id, value, client_key, client_rev, event_id)
  values (p_heat, p_entry, v_seat, p_value, p_client_key, p_client_rev, h.event_id)
  on conflict (heat_id, entry_id, judge_seat_id) do update
    set value = excluded.value, client_key = excluded.client_key, client_rev = excluded.client_rev
    where excluded.client_rev > i.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.impression_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------- public live view (polled every 5-10 s; no judge identities)
create or replace function public.get_public_live_heat(p_heat uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; ev public.events;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into ev from public.events where id = h.event_id;
  if ev.status not in ('published', 'live', 'complete') or coalesce(ev.settings ->> 'publicLiveScores', 'after_publish') <> 'live'
     or h.status in ('scheduled', 'cancelled') then
    return jsonb_build_object('allowed', false);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'heat', jsonb_build_object('id', h.id, 'status', h.status, 'effective_status', private.heat_effective_status(h.id), 'started_at', h.started_at,
             'duration_sec', h.duration_sec, 'paused_at', h.paused_at, 'paused_total_sec', h.paused_total_sec, 'ended_at', h.ended_at,
             'live_rev', h.live_rev, 'server_now', now()),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('position', s.position, 'entry_id', s.entry_id, 'vest_colour', s.vest_colour,
             'modifier', s.modifier, 'flagged_out', s.flagged_out) order by s.position) from public.heat_slots s where s.heat_id = h.id), '[]'),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'entry_id', a.entry_id, 'seq', a.seq, 'direction', a.direction,
             'category_key', a.category_key, 'trick_name', a.trick_name, 'status', a.status, 'height_m', a.height_m,
             'possible_duplicate_of', a.possible_duplicate_of, 'created_at', a.created_at) order by a.created_at)
             from public.trick_attempts a where a.heat_id = h.id and a.deleted_at is null), '[]'),
    'scores', coalesce((select jsonb_agg(jsonb_build_object('attempt_id', t.attempt_id, 'seat_no', pm.seat_no, 'criteria', t.criteria,
             'score', t.score, 'missed', t.missed))
             from public.trick_scores t
             join public.trick_attempts a on a.id = t.attempt_id and a.deleted_at is null
             join public.divisions d on d.id = h.division_id
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = t.judge_seat_id
             where t.heat_id = h.id), '[]'),
    'impressions', coalesce((select jsonb_agg(jsonb_build_object('entry_id', i.entry_id, 'seat_no', pm.seat_no, 'value', i.value))
             from public.impression_scores i
             join public.divisions d on d.id = h.division_id
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = i.judge_seat_id
             where i.heat_id = h.id), '[]'),
    'penalties', coalesce((select jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'type', p.type, 'value', p.value))
             from public.penalties p where p.heat_id = h.id), '[]')
  );
end $$;

-- ---------------------------------------------------------------- PINs, QR tokens and joining (server only: service role)
create or replace function public.set_seat_pin(p_seat uuid, p_pin text) returns void
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
  update public.judge_seats set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where id = p_seat;
  perform set_config('app.audit_action', '', true);
end $$;

create or replace function public.set_seat_qr(p_seat uuid, p_token text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.audit_action', 'qr_set', true);
  update public.judge_seats set qr_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex'), qr_token_expires_at = p_expires where id = p_seat;
  perform set_config('app.audit_action', '', true);
end $$;

-- Failures are returned (not raised) so that the failure log survives the call and rate limiting works.
create or replace function private.join_rate_limited(p_event uuid, p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.join_attempts j where j.event_id = p_event and j.ip = p_ip and not j.ok and j.at > now() - interval '10 minutes') >= 10
      or (select count(*) from public.join_attempts j where j.event_id = p_event and not j.ok and j.at > now() - interval '10 minutes') >= 100;
$$;

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
  update public.judge_seats set auth_user_id = p_user, bound_at = now() where id = p_seat.id;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  insert into public.join_attempts (event_id, ip, seat_id, ok) values (p_seat.event_id, p_ip, p_seat.id, true);
  return jsonb_build_object('ok', true, 'seat_id', p_seat.id, 'event_id', p_seat.event_id, 'role', p_seat.role, 'name', p_seat.name, 'rebound', v_rebound);
end $$;

create or replace function public.bind_seat_by_pin(p_event uuid, p_pin text, p_user uuid, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats;
begin
  if private.join_rate_limited(p_event, p_ip) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  select * into s from public.judge_seats x
   where x.event_id = p_event and x.active and x.status = 'active' and x.pin_hash is not null and x.pin_hash = extensions.crypt(p_pin, x.pin_hash) limit 1;
  if not found then
    insert into public.join_attempts (event_id, ip, ok) values (p_event, p_ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_PIN');
  end if;
  return private.bind_seat(s, p_user, p_ip, 'PIN');
end $$;

create or replace function public.bind_seat_by_token(p_event uuid, p_token text, p_user uuid, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; v jsonb;
begin
  if private.join_rate_limited(p_event, p_ip) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  select * into s from public.judge_seats x
   where x.event_id = p_event and x.active and x.status = 'active' and x.qr_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and (x.qr_token_expires_at is null or x.qr_token_expires_at > now()) limit 1;
  if not found then
    insert into public.join_attempts (event_id, ip, ok) values (p_event, p_ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;
  v := private.bind_seat(s, p_user, p_ip, 'QR code');
  if (v ->> 'ok')::boolean then -- single use
    update public.judge_seats set qr_token_hash = null, qr_token_expires_at = null where id = s.id;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------- maintenance (service role only)
-- Deleting an organisation with published results is otherwise impossible (results and audit are append-only).
create or replace function public.purge_organisation(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_events uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_events from public.events where organisation_id = p_org;
  perform set_config('app.allow_purge', 'on', true);
  delete from public.organisations where id = p_org;
  delete from public.audit_log where event_id = any (v_events);
  perform set_config('app.allow_purge', 'off', true);
end $$;

create or replace function public.rls_coverage()
returns table (table_name text, rls_enabled boolean, policy_count int, anon_can_select boolean, anon_can_write boolean, authenticated_can_write boolean)
language sql stable security definer set search_path = '' as $$
  select c.relname::text, c.relrowsecurity,
         (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname),
         has_any_column_privilege('anon', c.oid, 'select'),
         has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'),
         has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
$$;

-- ---------------------------------------------------------------- who may call what
revoke all on function
  public.add_attempt, public.delete_attempt, public.attempt_counts, public.submit_trick_score, public.submit_impression,
  public.get_public_live_heat, public.set_seat_pin, public.set_seat_qr, public.bind_seat_by_pin, public.bind_seat_by_token,
  public.purge_organisation, public.rls_coverage from public, anon, authenticated;
grant execute on function public.add_attempt, public.delete_attempt, public.attempt_counts, public.submit_trick_score, public.submit_impression to authenticated;
grant execute on function public.get_public_live_heat to anon, authenticated;
grant execute on function public.set_seat_pin, public.set_seat_qr, public.bind_seat_by_pin, public.bind_seat_by_token,
  public.purge_organisation, public.rls_coverage to service_role;
revoke all on function private.join_rate_limited, private.bind_seat from public, anon, authenticated;
