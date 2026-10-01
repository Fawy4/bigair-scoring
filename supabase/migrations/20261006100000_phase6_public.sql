-- Phase 6: the public event site. Everything a visitor reads goes through these functions (docs/06 §7, §8; docs/PLAN-phase-5 §8).
--
--   1. Wind calls: `set_wind_call` (head judge or organiser, audited) and the value "clear"
--   2. get_public_site      the event page: event, organisation, branding, the settings a visitor needs, the wind banner, the divisions
--   3. get_public_timetable the active run orders and the heats of drawn divisions, with what the timetable engine needs to estimate times
--   4. get_public_results   (replaces the Phase 5c version) results of released heats only, WITHOUT judge-level marks, seats fed from a held heat masked,
--                           the highest jump of a division
--   5. get_public_draw      the stored draw, cleaned: no result and no rider that comes from a heat that is not released
--   6. get_public_rules     scoring model and format of each division, for the generated rules page
--   7. a visitor can no longer read heat_slots from the table (the functions above are the door)
--
-- A draft draw (division not locked) is never public: its heats, seats and ladder do not appear.

-- ---------------------------------------------------------------- 1. wind calls
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.wind_calls'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table public.wind_calls drop constraint %I', c);
  end loop;
end $$;
alter table public.wind_calls add constraint wind_calls_status_check check (status in ('red', 'amber', 'green', 'clear'));

create or replace function public.set_wind_call(p_event uuid, p_status text, p_message text) returns public.wind_calls
language plpgsql security definer set search_path = '' as $$
declare w public.wind_calls; v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not private.can_run_heat(p_event) then raise exception 'NOT_ALLOWED'; end if;
  if p_status is null or p_status not in ('red', 'amber', 'green', 'clear') then raise exception 'BAD_WIND_STATUS'; end if;
  if v_msg is not null and char_length(v_msg) > 140 then raise exception 'MESSAGE_TOO_LONG'; end if;
  insert into public.wind_calls (event_id, status, message) values (p_event, p_status, v_msg) returning * into w;
  perform private.head_audit(p_event, 'wind_calls', w.id, 'wind_call_set', null, jsonb_build_object('status', p_status, 'message', v_msg), null);
  return w;
end $$;
revoke all on function public.set_wind_call from public, anon;
grant execute on function public.set_wind_call to authenticated;

-- ---------------------------------------------------------------- helpers
-- The heat of a stored draw by its stable id (uid, or id when it has none).
create or replace function private.draw_heat(p_draw jsonb, p_uid text) returns jsonb
language sql immutable set search_path = '' as $$
  select h || jsonb_build_object('_round', r ->> 'id')
  from jsonb_array_elements(coalesce(p_draw -> 'rounds', '[]'::jsonb)) r, jsonb_array_elements(coalesce(r -> 'heats', '[]'::jsonb)) h
  where coalesce(h ->> 'uid', h ->> 'id') = p_uid
  limit 1;
$$;

-- Is a heat released: published and not held back.
create or replace function private.heat_released(p_division uuid, p_uid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.heats x where x.division_id = p_division and x.draw_uid = p_uid and x.status = 'published' and not x.publish_hold);
$$;

-- Where a seat's rider comes from ({round, heat, place}) is public only when that heat is released (a heat that advances without riding is always known;
-- "heat 0" is a place across every heat of a round, known when all of them are released). A source that cannot be read is treated as not released.
create or replace function private.source_visible(p_division uuid, p_draw jsonb, p_source jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_round text; v_idx int; v_uid text; v_bye boolean;
begin
  if p_source is null or jsonb_typeof(p_source) <> 'object' then return true; end if;
  if not (p_source ? 'round') or not (p_source ? 'heat') or jsonb_typeof(p_source -> 'heat') <> 'number' then return false; end if;
  v_round := p_source ->> 'round';
  v_idx := (p_source ->> 'heat')::int;
  if v_idx = 0 then
    return not exists (
      select 1 from jsonb_array_elements(coalesce(p_draw -> 'rounds', '[]'::jsonb)) r, jsonb_array_elements(coalesce(r -> 'heats', '[]'::jsonb)) h
      where r ->> 'id' = v_round and coalesce((h ->> 'bye')::boolean, false) = false
        and not private.heat_released(p_division, coalesce(h ->> 'uid', h ->> 'id')));
  end if;
  select coalesce(h ->> 'uid', h ->> 'id'), coalesce((h ->> 'bye')::boolean, false) into v_uid, v_bye
  from jsonb_array_elements(coalesce(p_draw -> 'rounds', '[]'::jsonb)) r, jsonb_array_elements(coalesce(r -> 'heats', '[]'::jsonb)) h
  where r ->> 'id' = v_round and (h ->> 'index')::int = v_idx
  limit 1;
  if v_uid is null then return false; end if;
  if v_bye then return true; end if;
  return private.heat_released(p_division, v_uid);
end $$;

-- A result's breakdown for the public: the panel's scores and the counting, never an individual judge's mark, who missed, or who was an outlier.
create or replace function private.public_breakdown(b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'status', b -> 'status', 'total', b -> 'total', 'totalLabel', b -> 'totalLabel', 'components', b -> 'components',
    'counted', coalesce((select jsonb_agg(jsonb_build_object('attemptSeq', c -> 'attemptSeq', 'score', c -> 'score')) from jsonb_array_elements(coalesce(b -> 'counted', '[]'::jsonb)) c), '[]'::jsonb),
    'allAttempts', coalesce((select jsonb_agg(jsonb_build_object(
        'seq', a -> 'seq', 'status', a -> 'status', 'trickName', a -> 'trickName', 'categoryKey', a -> 'categoryKey', 'score', a -> 'score',
        'counted', a -> 'counted', 'panelScore', a #> '{panel,score}', 'ignored', a -> 'ignored', 'repeatIndex', a -> 'repeatIndex')
        order by (a ->> 'seq')::int) from jsonb_array_elements(coalesce(b -> 'allAttempts', '[]'::jsonb)) a), '[]'::jsonb),
    'impression', case when jsonb_typeof(b -> 'impression') = 'object' then jsonb_build_object('score', b #> '{impression,score}') else null end,
    'landedCount', b -> 'landedCount', 'attemptCount', b -> 'attemptCount', 'attemptCap', b -> 'attemptCap', 'modifiers', coalesce(b -> 'modifiers', '[]'::jsonb));
$$;

-- ---------------------------------------------------------------- 2. the event page
create or replace function public.get_public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; w public.wind_calls; v_banner boolean;
begin
  select e.* into ev from public.events e where e.slug = lower(coalesce(p_slug, '')) and private.event_is_public(e.id);
  if not found then return jsonb_build_object('found', false); end if;
  select * into org from public.organisations where id = ev.organisation_id;
  v_banner := coalesce((ev.settings ->> 'windCallBanner')::boolean, true);
  select * into w from public.wind_calls where event_id = ev.id order by created_at desc, id desc limit 1;
  return jsonb_build_object(
    'found', true,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'location', ev.location, 'start_date', ev.start_date, 'end_date', ev.end_date,
                                'status', ev.status, 'timezone', ev.timezone),
    'organisation', jsonb_build_object('name', org.name, 'slug', org.slug, 'logo_url', org.branding ->> 'logoUrl'),
    'branding', jsonb_build_object('logoUrl', ev.branding ->> 'logoUrl', 'sponsors', coalesce(ev.branding -> 'sponsors', '[]'::jsonb)),
    'settings', jsonb_build_object(
      'windCallBanner', v_banner,
      'readyCallMin', coalesce((ev.settings ->> 'readyCallMin')::int, 15),
      'livePollSec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
      'screenRotateSec', coalesce((ev.settings ->> 'screenRotateSec')::int, 20),
      'externalLeaderboards', coalesce(ev.settings -> 'externalLeaderboards', '[]'::jsonb),
      'identification', ev.settings -> 'identification',
      'publicLiveScores', coalesce(ev.settings ->> 'publicLiveScores', 'after_publish')),
    'wind', case when w.id is null or w.status = 'clear' or not v_banner then null
                 else jsonb_build_object('status', w.status, 'message', w.message, 'at', w.created_at) end,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'sort_order', d.sort_order, 'identification', d.identification,
        'attempt_display', coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score'),
        'show_percent', coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false),
        'drawn', d.draw_locked_at is not null) order by d.sort_order, d.created_at)
      from public.divisions d where d.event_id = ev.id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 3. the timetable
create or replace function public.get_public_timetable(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object(
    'allowed', true, 'server_now', now(), 'timezone', ev.timezone,
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'ready_call_min', coalesce((ev.settings ->> 'readyCallMin')::int, 15),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'day', p.day, 'name', p.name, 'items', p.items, 'anchors', p.anchors,
                'actual_starts', p.actual_starts, 'hold', p.hold, 'defaults', p.defaults) order by p.day, p.created_at)
              from public.schedule_plans p where p.event_id = p_event and p.active), '[]'::jsonb),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'sort_order', d.sort_order) order by d.sort_order, d.created_at)
              from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'division_id', r.division_id, 'name', r.name, 'short_name', r.short_name, 'sort_order', r.sort_order) order by r.sort_order)
              from public.rounds r join public.divisions d on d.id = r.division_id where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'heats', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'division_id', h.division_id, 'round_id', h.round_id, 'number', h.number, 'suffix', h.number_suffix, 'name', h.name,
          'status', h.status, 'effective_status', private.heat_effective_status(h.id), 'held', h.publish_hold,
          'started_at', h.started_at, 'ended_at', h.ended_at, 'paused_at', h.paused_at, 'paused_total_sec', h.paused_total_sec,
          'duration_sec', h.duration_sec, 'warm_up_sec', h.warm_up_sec, 'rerun_of', h.rerun_of,
          'round_last', coalesce((dh.j ->> 'roundLast')::boolean, h.number = (select max(x.number) from public.heats x where x.round_id = h.round_id)),
          'break_after_heat_min', (dh.j ->> 'breakAfterHeatMin')::numeric, 'break_after_round_min', (dh.j ->> 'breakAfterRoundMin')::numeric)
          order by d.sort_order, r.sort_order, h.number, coalesce(h.number_suffix, ''))
        from public.heats h
        join public.divisions d on d.id = h.division_id
        join public.rounds r on r.id = h.round_id
        cross join lateral (select private.draw_heat(d.draw, h.draw_uid) as j) dh
        where h.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 4. results
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
        'show_percent', coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false),
        'highest_jump', (select jsonb_build_object('height_m', a.height_m, 'entry_id', a.entry_id, 'heat_id', a.heat_id, 'trick_name', a.trick_name)
                           from public.trick_attempts a join public.heats hh on hh.id = a.heat_id
                          where hh.division_id = d.id and hh.status = 'published' and not hh.publish_hold
                            and a.deleted_at is null and a.status = 'landed' and a.height_m is not null
                          order by a.height_m desc, a.created_at limit 1),
        'rounds', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.name, 'short_name', r.short_name, 'sort_order', r.sort_order,
            'heats', coalesce((select jsonb_agg(jsonb_build_object(
                'id', h.id, 'number', h.number, 'suffix', h.number_suffix, 'name', h.name, 'draw_uid', h.draw_uid, 'status', h.status, 'held', h.publish_hold,
                'rerun_of', h.rerun_of, 'rerun_id', (select x.id from public.heats x where x.rerun_of = h.id and x.status <> 'cancelled' order by x.created_at desc limit 1),
                'published_at', h.published_at,
                'draw_round', private.draw_heat(d.draw, h.draw_uid) ->> '_round', 'draw_index', (private.draw_heat(d.draw, h.draw_uid) ->> 'index')::int,
                'slots', coalesce((select jsonb_agg(jsonb_build_object('position', s.position,
                           'entry_id', case when s.source is not null and not private.source_visible(d.id, d.draw, s.source) then null else s.entry_id end,
                           'vest_colour', s.vest_colour, 'modifier', s.modifier, 'source', s.source) order by s.position)
                           from public.heat_slots s where s.heat_id = h.id), '[]'::jsonb),
                'results', case when h.status = 'published' and not h.publish_hold then coalesce((
                    select jsonb_agg(jsonb_build_object('entry_id', x.entry_id, 'place', x.place, 'total', x.total,
                                                        'percent', case when coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false) then x.percent else null end,
                                                        'breakdown', private.public_breakdown(x.breakdown), 'version', x.version)
                                     order by x.place nulls last)
                      from public.heat_results x where x.heat_id = h.id and x.version = (select max(y.version) from public.heat_results y where y.heat_id = h.id)), '[]'::jsonb)
                  else '[]'::jsonb end
              ) order by h.number, coalesce(h.number_suffix, '')) from public.heats h where h.round_id = r.id), '[]'::jsonb)
          ) order by r.sort_order) from public.rounds r where r.division_id = d.id), '[]'::jsonb)
      ) order by d.sort_order, d.created_at) from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'first_name', e.first_name, 'last_name', e.last_name,
        'nationality', e.nationality, 'identifiers', e.identifiers))
        from public.v_entries e join public.divisions d on d.id = e.division_id
        where e.event_id = p_event and e.status = 'confirmed' and d.draw_locked_at is not null), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 5. the stored draw, cleaned for the public
-- Same shape the engine reads, so the public ladder and placings use the engine the organiser's Draw step uses. Removed: results of heats that are not released,
-- the rider of any seat fed from a heat that is not released (the seat keeps its source, so it reads "1st H1"), seat histories (they carry earlier totals), seat
-- arrivals, warnings and the shuffle seed. A heat that is not released reads "pending".
create or replace function private.public_draw(p_division uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.divisions; rr record; hh record; ss record;
  v_rounds jsonb := '[]'::jsonb; v_heats jsonb; v_slots jsonb; v_results jsonb := '{}'::jsonb;
  v_round jsonb; v_heat jsonb; v_slot jsonb; v_uid text; v_rel boolean; k text;
begin
  select * into d from public.divisions where id = p_division;
  if not found or d.draw is null or d.draw_locked_at is null then return null; end if;
  for rr in select value from jsonb_array_elements(coalesce(d.draw -> 'rounds', '[]'::jsonb)) loop
    v_round := rr.value;
    v_heats := '[]'::jsonb;
    for hh in select value from jsonb_array_elements(coalesce(v_round -> 'heats', '[]'::jsonb)) loop
      v_heat := hh.value;
      v_uid := coalesce(v_heat ->> 'uid', v_heat ->> 'id');
      v_rel := coalesce((v_heat ->> 'bye')::boolean, false) or private.heat_released(p_division, v_uid);
      v_slots := '[]'::jsonb;
      for ss in select value from jsonb_array_elements(coalesce(v_heat -> 'slots', '[]'::jsonb)) loop
        v_slot := ss.value - 'history';
        if v_slot ? 'from' and not private.source_visible(p_division, d.draw, v_slot -> 'from') then v_slot := v_slot - 'entrantId' - 'seed'; end if;
        v_slots := v_slots || jsonb_build_array(v_slot);
      end loop;
      v_heat := jsonb_set(v_heat, '{slots}', v_slots);
      if not v_rel then v_heat := jsonb_set(v_heat, '{status}', '"pending"'::jsonb); end if;
      if v_rel and not coalesce((v_heat ->> 'bye')::boolean, false) and d.draw -> 'results' ? (v_heat ->> 'id') then
        v_results := v_results || jsonb_build_object(v_heat ->> 'id', d.draw -> 'results' -> (v_heat ->> 'id'));
      end if;
      v_heats := v_heats || jsonb_build_array(v_heat);
    end loop;
    v_round := jsonb_set(jsonb_set(v_round, '{heats}', v_heats), '{arrivals}', '[]'::jsonb);
    v_rounds := v_rounds || jsonb_build_array(v_round);
  end loop;
  return jsonb_build_object('templateId', d.draw -> 'templateId', 'template', d.draw -> 'template', 'overrides', '{}'::jsonb, 'status', d.draw -> 'status',
                            'entrants', coalesce(d.draw -> 'entrants', '[]'::jsonb), 'seedOrder', coalesce(d.draw -> 'seedOrder', '[]'::jsonb),
                            'rounds', v_rounds, 'results', v_results, 'warnings', '[]'::jsonb);
end $$;

create or replace function public.get_public_draw(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object('allowed', true,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'draw', private.public_draw(d.id)) order by d.sort_order, d.created_at)
                           from public.divisions d where d.event_id = p_event), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 6. the rules page
create or replace function public.get_public_rules(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  return jsonb_build_object('allowed', true,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'identification', d.identification,
        'scoring_model', sm.json, 'scoring_overrides', d.scoring_overrides,
        'format_template', coalesce(d.draw -> 'template', ft.json), 'format_params', case when d.draw -> 'template' is null then d.format_params else '{}'::jsonb end,
        'riders', (select count(*) from public.entries e where e.division_id = d.id and e.status = 'confirmed'))
        order by d.sort_order, d.created_at)
      from public.divisions d
      left join public.scoring_models sm on sm.id = d.scoring_model_id
      left join public.format_templates ft on ft.id = d.format_template_id
      where d.event_id = p_event), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 7. grants
revoke all on function public.get_public_site, public.get_public_timetable, public.get_public_results, public.get_public_draw, public.get_public_rules from public;
grant execute on function public.get_public_site, public.get_public_timetable, public.get_public_results, public.get_public_draw, public.get_public_rules to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- Seats name riders, and a seat fed from a held heat names the winner: a visitor reads them only through get_public_results and get_public_draw.
revoke select on public.heat_slots from anon;
drop policy if exists public_read on public.heat_slots;
