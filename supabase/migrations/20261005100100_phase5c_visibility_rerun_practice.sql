-- Phase 5c, steps 4 (Re-run heat, Practice heat) and 6 (visibility):
--
--   1. columns: heats.public_live (the head judge's per-heat live switch), heats.rerun_of, events.is_simulation
--   2. simulation events are never public (every public door checks it)
--   3. the two leaks: heat_slots place / total / breakdown for anon and non-members, divisions.draw for any signed-in user (held finals leak nowhere)
--   4. get_public_live_heat respects the switches and the hold; get_public_results (Phase 6 renders it)
--   5. rerun_heat: cancel a heat and create its re-run in one transaction
--   6. practice_add_attempt (organiser only, simulation events only)
--   7. Demo Cup is flagged as a simulation

-- ---------------------------------------------------------------- 1. columns
alter table public.heats add column public_live boolean;               -- null = follow the division's / event's setting
alter table public.heats add column rerun_of uuid references public.heats on delete set null;
create index on public.heats (rerun_of);
alter table public.events add column is_simulation boolean not null default false;
grant select (is_simulation) on public.events to anon, authenticated;  -- policies read it; it is not a secret
grant update (is_simulation) on public.events to authenticated;

-- A simulation flag can be set only while no heat of the event has started, and never switched off after one has (people editing it; the server keeps its own way in).
create or replace function private.events_simulation_guard() returns trigger
language plpgsql as $$
begin
  if new.is_simulation is not distinct from old.is_simulation then return new; end if;
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if exists (select 1 from public.heats h where h.event_id = new.id and (h.status <> 'scheduled' or h.started_at is not null)) then raise exception 'SIMULATION_LOCKED'; end if;
  return new;
end $$;
create trigger b_simulation_guard before update of is_simulation on public.events for each row execute function private.events_simulation_guard();

-- the per-heat switch and the re-run link are changed only by the functions below (a head seat may update its heats otherwise)
create or replace function private.heats_guard() returns trigger
language plpgsql as $$
declare
  priv boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  v_end timestamptz;
  v_started timestamptz := new.started_at; v_paused_at timestamptz := new.paused_at;
  v_paused_total int := new.paused_total_sec; v_ended timestamptz := new.ended_at; v_published timestamptz := new.published_at;
begin
  if not priv then
    if new.status is distinct from old.status then raise exception 'USE_HEAT_FUNCTIONS'; end if;
    -- server-owned columns cannot be edited by hand
    new.started_at := old.started_at; new.paused_at := old.paused_at; new.paused_total_sec := old.paused_total_sec;
    new.ended_at := old.ended_at; new.published_at := old.published_at; new.live_rev := old.live_rev;
    new.reopened_at := old.reopened_at;
    new.event_id := old.event_id; new.division_id := old.division_id; new.round_id := old.round_id;
    new.publish_hold := old.publish_hold; new.public_live := old.public_live; new.rerun_of := old.rerun_of;
    v_started := old.started_at; v_paused_at := old.paused_at; v_paused_total := old.paused_total_sec; v_ended := old.ended_at; v_published := old.published_at;
  end if;

  if new.status is distinct from old.status then
    if not priv and not (
      (old.status = 'scheduled' and new.status in ('running', 'cancelled')) or
      (old.status = 'running' and new.status in ('paused', 'ended', 'cancelled')) or
      (old.status = 'paused' and new.status in ('running', 'ended', 'cancelled')) or
      (old.status = 'ended' and new.status in ('under_review', 'cancelled')) or
      (old.status = 'under_review' and new.status in ('cancelled')) or
      (old.status = 'published' and new.status = 'under_review')
    ) then
      raise exception 'ILLEGAL_HEAT_TRANSITION: % -> %', old.status, new.status;
    end if;

    if old.status = 'scheduled' and new.status = 'running' then
      v_started := now();
    elsif old.status = 'running' and new.status = 'paused' then
      v_paused_at := now();
    elsif old.status = 'paused' and new.status = 'running' then
      v_paused_total := old.paused_total_sec + greatest(0, ceil(extract(epoch from (now() - coalesce(old.paused_at, now()))))::int);
      v_paused_at := null;
    elsif new.status = 'ended' and old.status in ('running', 'paused') then
      if old.status = 'paused' then
        v_ended := coalesce(old.paused_at, now());
      else
        v_end := old.started_at + make_interval(secs => old.duration_sec + old.paused_total_sec);
        v_ended := least(now(), coalesce(v_end, now()));
      end if;
    elsif new.status = 'published' then
      v_published := now();
    end if;

    -- privileged callers (publish, seeds, tests) may set a column explicitly; everyone else gets the computed value
    if not priv or new.started_at is not distinct from old.started_at then new.started_at := v_started; end if;
    if not priv or new.paused_at is not distinct from old.paused_at then new.paused_at := v_paused_at; end if;
    if not priv or new.paused_total_sec is not distinct from old.paused_total_sec then new.paused_total_sec := v_paused_total; end if;
    if not priv or new.ended_at is not distinct from old.ended_at then new.ended_at := v_ended; end if;
    if not priv or new.published_at is not distinct from old.published_at then new.published_at := v_published; end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2. simulation events are never public
create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.organisations o on o.id = e.organisation_id
    where e.id = p_event and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null and not e.is_simulation);
$$;
drop policy public_read on public.events;
create policy public_read on public.events for select to anon, authenticated
  using (status in ('published', 'live', 'complete') and archived_at is null and not is_simulation and private.org_is_active(organisation_id));

create or replace function public.get_public_events(p_limit int default 30) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, organisation_name text, organisation_slug text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, o.name, o.slug
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null and not e.is_simulation
  order by e.start_date desc nulls last, e.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.get_public_organisation(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', o.name, 'slug', o.slug, 'logo_url', o.branding ->> 'logoUrl', 'timezone', o.settings ->> 'defaultTimezone',
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'location', e.location,
                        'start_date', e.start_date, 'end_date', e.end_date, 'status', e.status) order by e.start_date desc nulls last), '[]'::jsonb)
               from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete') and e.archived_at is null and not e.is_simulation))
  from public.organisations o
  where o.slug = lower(coalesce(p_slug, '')) and o.archived_at is null
    and exists (select 1 from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete') and e.archived_at is null and not e.is_simulation);
$$;

create or replace function public.get_public_event(p_slug text) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, timezone text,
  organisation_name text, organisation_slug text, organisation_logo_url text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, e.timezone,
         o.name, o.slug, o.branding ->> 'logoUrl'
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.slug = lower(coalesce(p_slug, '')) and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null and not e.is_simulation;
$$;

create or replace function private.registration_open(ev public.events) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_closes date := nullif(ev.settings ->> 'registrationClosesOn', '')::date;
  v_time text := nullif(ev.settings ->> 'registrationClosesTime', '');
  v_deadline timestamptz;
begin
  if ev.is_simulation then return false; end if;
  if ev.status not in ('published', 'live') or coalesce((ev.settings ->> 'registrationOpen')::boolean, false) is not true then return false; end if;
  if v_closes is not null then
    v_deadline := ((v_closes::text || ' ' || case when v_time ~ '^[0-9]{2}:[0-9]{2}$' then v_time || ':00' else '23:59:59.999999' end)::timestamp) at time zone ev.timezone;
    if now() > v_deadline then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.registration_open from public, anon, authenticated;

create or replace function public.public_registration_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; v_max int; v_divs jsonb;
begin
  select * into ev from public.events where slug = lower(coalesce(p_slug, ''));
  if not found or ev.archived_at is not null or ev.is_simulation or ev.status not in ('published', 'live', 'complete') then return jsonb_build_object('found', false); end if;
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
revoke all on function public.public_registration_info from public, anon, authenticated;
grant execute on function public.public_registration_info to service_role;

-- ---------------------------------------------------------------- 3. the two leaks
-- Both are closed so that everything already deployed keeps working: organisers and the event's officials read through their own row policies (org_all, seat_read),
-- exactly as before; what changes is what a visitor and a signed-in stranger can read.
-- (a) A heat's places, totals and breakdown are written at publish and reach the public only through get_public_results (which skips held heats). A visitor can
--     read the seat (who sits where), never its place, total or breakdown.
revoke select on public.heat_slots from anon;
grant select (id, event_id, heat_id, position, entry_id, vest_colour, source, modifier, flagged_out, created_at, updated_at) on public.heat_slots to anon;
-- (b) The stored draw holds every published result of the division (and every seat's name). A signed-in stranger (another organisation's organiser, an official of
--     another event) used to read it through the public policy; now only a visitor-level (anon) policy is public, and organisers and seat holders have their own.
drop policy public_read on public.heat_slots;
create policy public_read on public.heat_slots for select to anon using (private.event_is_public(event_id));
drop policy public_read on public.divisions;
create policy public_read on public.divisions for select to anon using (private.event_is_public(event_id));

-- (c) Direct reads of results show only the latest version of a heat (an older version is history, not what the public sees), and never a held heat.
create or replace function private.latest_result_version(p_heat uuid) returns int
language sql stable security definer set search_path = '' as $$ select coalesce(max(version), 0) from public.heat_results where heat_id = p_heat $$;
grant execute on function private.latest_result_version to anon, authenticated, service_role;
drop policy public_read on public.heat_results;
create policy public_read on public.heat_results for select to anon, authenticated
  using (private.event_is_public(event_id) and not private.heat_is_held(heat_id) and version = private.latest_result_version(heat_id));

-- ---------------------------------------------------------------- 4. the public functions
-- The head judge's per-heat switch: true = show this heat live, false = do not, null = follow the setting.
create or replace function public.set_heat_public_live(p_heat uuid, p_value boolean) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.public_live is not distinct from p_value then return h; end if;
  perform set_config('app.audit_action', 'public_live_set', true);
  perform set_config('app.reason', coalesce(case when p_value is null then 'follow the setting' when p_value then 'live on' else 'live off' end, ''), true);
  update public.heats set public_live = p_value where id = p_heat returning * into h;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return h;
end $$;
-- heats are audited on a status change only; this change is worth a line of its own
create or replace function private.heats_live_audit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.public_live is distinct from old.public_live then
    insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
    values (new.event_id, auth.uid(), private.seat_id(new.event_id), 'public_live_set', 'heats', new.id,
            jsonb_build_object('public_live', old.public_live), jsonb_build_object('public_live', new.public_live), nullif(current_setting('app.reason', true), ''));
  end if;
  return null;
end $$;
create trigger z_live_audit after update of public_live on public.heats for each row execute function private.heats_live_audit();

-- Live scores follow the heat's switch, then the division's setting, then the event's; a held heat shows nothing; a simulation event is not public.
create or replace function public.get_public_live_heat(p_heat uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; ev public.events; d public.divisions; v_live boolean;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into ev from public.events where id = h.event_id;
  select * into d from public.divisions where id = h.division_id;
  v_live := case when h.public_live is not null then h.public_live
                 else coalesce(nullif(d.live_settings ->> 'publicLiveScores', ''), nullif(ev.settings ->> 'publicLiveScores', ''), 'after_publish') = 'live' end;
  if not private.event_is_public(ev.id) or not v_live or h.publish_hold or h.status in ('scheduled', 'cancelled') then
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
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = t.judge_seat_id
             where t.heat_id = h.id), '[]'),
    'impressions', coalesce((select jsonb_agg(jsonb_build_object('entry_id', i.entry_id, 'seat_no', pm.seat_no, 'value', i.value))
             from public.impression_scores i
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = i.judge_seat_id
             where i.heat_id = h.id), '[]'),
    'penalties', coalesce((select jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'type', p.type, 'value', p.value))
             from public.penalties p where p.heat_id = h.id), '[]')
  );
end $$;

-- What the public pages show (Phase 6 only renders it): the heats of every division with their seats, and for each published heat that is not held its latest
-- result. A held heat is listed (so the timetable can say "result to be announced") but carries no seats' places, totals or breakdown. A cancelled heat names its re-run.
create or replace function public.get_public_results(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object(
    'allowed', true,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'timezone', ev.timezone),
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'sort_order', d.sort_order,
        'attempt_display', coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score'),
        'rounds', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.name, 'short_name', r.short_name, 'sort_order', r.sort_order,
            'heats', coalesce((select jsonb_agg(jsonb_build_object(
                'id', h.id, 'number', h.number, 'suffix', h.number_suffix, 'name', h.name, 'status', h.status, 'held', h.publish_hold,
                'rerun_of', h.rerun_of, 'rerun_id', (select x.id from public.heats x where x.rerun_of = h.id and x.status <> 'cancelled' order by x.created_at desc limit 1),
                'published_at', h.published_at,
                'slots', coalesce((select jsonb_agg(jsonb_build_object('position', s.position, 'entry_id', s.entry_id, 'vest_colour', s.vest_colour,
                         'modifier', s.modifier, 'source', s.source) order by s.position) from public.heat_slots s where s.heat_id = h.id), '[]'),
                'results', case when h.status = 'published' and not h.publish_hold then coalesce((
                    select jsonb_agg(jsonb_build_object('entry_id', x.entry_id, 'place', x.place, 'total', x.total, 'percent', x.percent, 'breakdown', x.breakdown, 'version', x.version)
                                     order by x.place nulls last)
                      from public.heat_results x where x.heat_id = h.id and x.version = (select max(y.version) from public.heat_results y where y.heat_id = h.id)), '[]'::jsonb)
                  else '[]'::jsonb end
              ) order by h.number, coalesce(h.number_suffix, '')) from public.heats h where h.round_id = r.id), '[]'::jsonb)
          ) order by r.sort_order) from public.rounds r where r.division_id = d.id), '[]'::jsonb)
      ) order by d.sort_order) from public.divisions d where d.event_id = p_event), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'first_name', e.first_name, 'last_name', e.last_name,
        'nationality', e.nationality, 'identifiers', e.identifiers)) from public.v_entries e where e.event_id = p_event and e.status = 'confirmed'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 5. Re-run heat: one transaction
-- Cancels the heat (a heat that ran keeps its real times) and creates its re-run in the same round: same riders, seats, Lycra colours and timing, number the same
-- with suffix R (R2 …). Later seats follow the re-run because the heat's draw id moves to it; the stored draw stays locked and unchanged. Riders left out keep a
-- seat marked DSQ or DNS (so they are ranked last, DSQ below DNS, and the ladder needs no special case). The server computes the new run order with the pure
-- insertRerunItem and passes it in; the function only accepts it when the plan is as the server saw it and exactly one item was added.
create or replace function public.rerun_heat(
  p_heat uuid, p_new_heat uuid, p_suffix text, p_name text, p_reason text, p_leave_out jsonb, p_plan uuid, p_plan_items jsonb, p_plan_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; n public.heats; v_eff text; s public.heat_slots; v_mod text; plan public.schedule_plans;
  v_old jsonb; v_new jsonb; v_left jsonb := '[]'::jsonb; k text;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  v_eff := private.heat_effective_status(p_heat);
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if h.status = 'cancelled' then raise exception 'HEAT_CANCELLED'; end if;
  if v_eff = 'scheduled' then raise exception 'HEAT_NOT_STARTED'; end if;
  if p_suffix is null or p_suffix !~ '^R[0-9]*$' or p_name is null or btrim(p_name) = '' or char_length(p_name) > 40 then raise exception 'BAD_RERUN_NAME'; end if;
  if p_leave_out is not null and jsonb_typeof(p_leave_out) <> 'object' then raise exception 'BAD_LEAVE_OUT'; end if;
  for k, v_mod in select key, value #>> '{}' from jsonb_each(coalesce(p_leave_out, '{}'::jsonb)) loop
    if v_mod not in ('DSQ', 'DNS') then raise exception 'BAD_LEAVE_OUT'; end if;
    if not exists (select 1 from public.heat_slots x where x.heat_id = p_heat and x.entry_id = k::uuid) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  end loop;

  -- the run order: the plan must be as the server saw it, and exactly one item (the re-run's) may have been added
  if p_plan is not null then
    select * into plan from public.schedule_plans where id = p_plan for update;
    if not found or plan.event_id <> h.event_id then raise exception 'PLAN_NOT_FOUND'; end if;
    if p_plan_updated_at is not null and plan.updated_at is distinct from p_plan_updated_at then raise exception 'PLAN_CHANGED'; end if;
    if p_plan_items is null or jsonb_typeof(p_plan_items) <> 'array'
       or jsonb_array_length(p_plan_items) <> jsonb_array_length(plan.items) + 1
       or (select count(*) from jsonb_array_elements(p_plan_items) i where i ->> 'heatId' = p_new_heat::text) <> 1
       or (select coalesce(jsonb_agg(i order by ord), '[]'::jsonb) from jsonb_array_elements(p_plan_items) with ordinality t(i, ord) where i ->> 'heatId' is distinct from p_new_heat::text) <> plan.items then
      raise exception 'BAD_PLAN_ITEMS';
    end if;
  end if;

  -- 1. cancel the original (a started heat keeps started_at and gets an end)
  perform public.cancel_heat(p_heat, p_reason);

  -- 2. the re-run takes the heat's place in the draw: the draw id moves to it (the stored draw is not edited)
  perform set_config('app.draw_bypass', '1', true);
  update public.heats set draw_uid = null where id = p_heat;
  insert into public.heats (id, round_id, division_id, event_id, number, number_suffix, name, status, duration_sec, warm_up_sec, draw_uid, rerun_of, manual_override)
  values (p_new_heat, h.round_id, h.division_id, h.event_id, h.number, p_suffix, btrim(p_name), 'scheduled', h.duration_sec, h.warm_up_sec, h.draw_uid, p_heat, h.manual_override)
  returning * into n;
  for s in select * from public.heat_slots where heat_id = p_heat order by position loop
    v_mod := coalesce(p_leave_out ->> s.entry_id::text, case when s.modifier in ('DNS', 'DSQ') then s.modifier end);
    insert into public.heat_slots (heat_id, position, entry_id, vest_colour, source, modifier) values (n.id, s.position, s.entry_id, s.vest_colour, s.source, v_mod);
    if p_leave_out ? s.entry_id::text then v_left := v_left || jsonb_build_array(jsonb_build_object('entry_id', s.entry_id, 'as', p_leave_out ->> s.entry_id::text)); end if;
  end loop;
  perform set_config('app.draw_bypass', '', true);

  -- 3. the run order
  if p_plan is not null then update public.schedule_plans set items = p_plan_items where id = p_plan; end if;

  -- 4. one audit line
  v_old := jsonb_build_object('heat', p_heat, 'status', h.status);
  v_new := jsonb_build_object('heat', n.id, 'suffix', p_suffix, 'name', btrim(p_name), 'left_out', v_left, 'plan', p_plan);
  perform private.head_audit(h.event_id, 'heats', n.id, 'heat_rerun', v_old, v_new, p_reason);
  return jsonb_build_object('new_heat', n.id, 'suffix', p_suffix, 'name', btrim(p_name));
end $$;

-- ---------------------------------------------------------------- 6. Practice heat (the seed of the later simulator)
-- An organiser plays a made-up spotter feed on a simulation event. The same path as add_attempt, including the cap.
create or replace function public.practice_add_attempt(p_heat uuid, p_entry uuid, p_trick jsonb, p_status text) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare h public.heats; ev public.events;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.is_event_organiser(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = h.event_id;
  if not ev.is_simulation then raise exception 'NOT_A_SIMULATION'; end if;
  return public.add_attempt(p_heat, p_entry, gen_random_uuid(), p_status, p_trick ->> 'direction', p_trick ->> 'category', p_trick ->> 'name',
                            coalesce(p_trick -> 'parts', '{}'::jsonb), null, 'builder', null, null);
end $$;

-- ---------------------------------------------------------------- 7. grants, and Demo Cup is a simulation
revoke all on function public.set_heat_public_live, public.rerun_heat, public.practice_add_attempt from public, anon;
grant execute on function public.set_heat_public_live, public.rerun_heat, public.practice_add_attempt to authenticated;
revoke all on function public.get_public_results from public;
grant execute on function public.get_public_results to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- Its riders are fictional and its PINs are public, so it never appears on the public site (docs/PLAN-phase-5 §12).
update public.events set is_simulation = true where slug = 'demo-cup';
