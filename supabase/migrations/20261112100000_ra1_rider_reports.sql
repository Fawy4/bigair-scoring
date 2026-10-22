-- RA1 (0.26.0): Rider reports. Additive: nothing is dropped or renamed, no table changes, no writing function.
--
-- The Event step gets a setting "Rider reports" (events.settings.riderReports): 'off' (the default, also when the key is missing), 'after_heat' or 'after_event'.
-- Two functions read what a report is made of:
--   * get_rider_report(p_event)      anon + signed-in: answers only while the setting lets it (after_heat: once a heat is published and released; after_event: once the
--                                    event is marked complete). Otherwise {allowed: false} and nothing else.
--   * preview_rider_report(p_event)  signed-in organisers of the event (the platform owner through "Open as this organiser") only: the same answer while the setting
--                                    is Off or not open yet.
-- WHAT IS IN THE ANSWER: published, released heats only (status published, not held). For each rider's result the published figures (place, total, the panel score of each
-- landed attempt, which attempts counted, the impression score) and for each attempt the spotter's line (side, trick name, trick parts, category) and the second of the
-- heat it was logged at. For each rider: name and nationality-free label only, plus 'report_withheld' (a record that says under 18 at the event's first day).
-- WHAT IS NEVER IN THE ANSWER: any single judge's mark or Missed (J1, J2…, judge names, seats), outlier warnings, the reference hints (never stored), pending rows, flags and
-- notes, the spotter's raw text, anything of a heat that is not published or is held, e-mail, phone, date of birth, photo, sponsor.

create or replace function private.rider_reports_mode(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(e.settings ->> 'riderReports', 'off') = 'after_heat'
         and exists (select 1 from public.heats h where h.event_id = e.id and h.status = 'published' and not h.publish_hold) then 'after_heat'
    when coalesce(e.settings ->> 'riderReports', 'off') = 'after_event' and e.status = 'complete' then 'after_event'
    else null end
  from public.events e where e.id = p_event;
$$;

-- one published heat, with only what the public results already show plus the spotter's line
create or replace function private.rider_report_heat(h public.heats) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', h.id, 'number', h.number, 'suffix', h.number_suffix, 'name', h.name, 'draw_uid', h.draw_uid,
    'published_at', h.published_at, 'started_at', h.started_at, 'ended_at', h.ended_at,
    'duration_sec', h.duration_sec, 'paused_total_sec', h.paused_total_sec,
    'slots', coalesce((select jsonb_agg(jsonb_build_object('position', s.position, 'entry_id', s.entry_id, 'modifier', s.modifier, 'source', s.source, 'vest_colour', s.vest_colour) order by s.position)
                         from public.heat_slots s where s.heat_id = h.id), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', x.entry_id, 'place', x.place, 'total', x.total, 'status', x.breakdown -> 'status', 'cap', x.breakdown -> 'attemptCap',
        'tricks_total', x.breakdown #> '{components,tricks}', 'impression', case when jsonb_typeof(x.breakdown -> 'impression') = 'object' then x.breakdown #> '{impression,score}' else null end,
        'counted', coalesce((select jsonb_agg(jsonb_build_object('seq', c -> 'attemptSeq', 'score', c -> 'score')) from jsonb_array_elements(coalesce(x.breakdown -> 'counted', '[]'::jsonb)) c), '[]'::jsonb),
        'modifiers', coalesce(x.breakdown -> 'modifiers', '[]'::jsonb),
        'attempts', coalesce((
          select jsonb_agg(jsonb_build_object(
              'seq', a -> 'seq', 'status', a -> 'status', 'score', a #> '{panel,score}', 'counted', a -> 'counted', 'ignored', a -> 'ignored',
              'direction', t.direction, 'trick', t.trick_name, 'category', t.category_key,
              'parts', case when t.trick_parts is null then null else jsonb_strip_nulls(jsonb_build_object('direction', t.trick_parts -> 'direction', 'items', t.trick_parts -> 'items', 'freeText', t.trick_parts -> 'freeText')) end,
              'at_sec', case when t.created_at is not null and h.started_at is not null then greatest(0, round(extract(epoch from t.created_at - h.started_at))::int) else null end)
            order by (a ->> 'seq')::int)
            from jsonb_array_elements(coalesce(x.breakdown -> 'allAttempts', '[]'::jsonb)) a
            left join public.trick_attempts t on t.heat_id = h.id and t.entry_id = x.entry_id and t.seq = (a ->> 'seq')::int and t.deleted_at is null), '[]'::jsonb)
      ) order by x.place nulls last)
      from public.heat_results x where x.heat_id = h.id and x.version = (select max(y.version) from public.heat_results y where y.heat_id = h.id)), '[]'::jsonb));
$$;

-- the event's trick base as a list of blocks (id, family, label, category, retired), master vocabulary (pinned or published) plus the event's own additions
create or replace function private.rider_report_blocks(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pin int; v_vocab jsonb; v_local jsonb;
begin
  select e.trick_vocabulary_version into v_pin from public.events e where e.id = p_event;
  select v.json into v_vocab from public.trick_vocabularies v
   where v.organisation_id is null and v.event_id is null and v.key = 'big-air-vocabulary' and (v.published_at is not null or v.version = v_pin)
   order by (v.version is not distinct from v_pin) desc, v.version desc limit 1;
  select v.json -> 'blocks' into v_local from public.trick_vocabularies v where v.event_id = p_event and v.key = 'event-additions' order by v.version desc limit 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.fam || ':' || b.key, 'family', b.fam, 'key', b.key, 'label', b.label, 'category', b.category, 'retired', b.retired))
    from (
      select 'direction' as fam, x ->> 'key' as key, x ->> 'label' as label, x ->> 'category' as category, coalesce((x ->> 'retired')::boolean, false) as retired
        from jsonb_array_elements(coalesce(v_vocab -> 'directions', '[]'::jsonb)) x
      union all select 'multiplier', x ->> 'key', x ->> 'label', x ->> 'category', coalesce((x ->> 'retired')::boolean, false) from jsonb_array_elements(coalesce(v_vocab -> 'multipliers', '[]'::jsonb)) x
      union all select 'base', x ->> 'key', x ->> 'label', x ->> 'category', coalesce((x ->> 'retired')::boolean, false) from jsonb_array_elements(coalesce(v_vocab -> 'baseTricks', '[]'::jsonb)) x
      union all select case when x ->> 'family' = 'grab_landing' then 'grab_landing' else 'addon' end, x ->> 'key', x ->> 'label', x ->> 'category', coalesce((x ->> 'retired')::boolean, false)
        from jsonb_array_elements(coalesce(v_vocab -> 'modifiers', '[]'::jsonb)) x
      union all select x ->> 'family', x ->> 'key', x ->> 'label', x ->> 'category', false
        from jsonb_array_elements(case when jsonb_typeof(v_local) = 'array' then v_local else '[]'::jsonb end) x
    ) b where b.label is not null and b.key is not null), '[]'::jsonb);
end $$;

create or replace function private.rider_report_payload(p_event uuid, p_how text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  return jsonb_build_object(
    'allowed', true, 'how', p_how,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'location', ev.location, 'timezone', ev.timezone, 'status', ev.status, 'start_date', ev.start_date, 'end_date', ev.end_date),
    'impression_name', nullif(btrim(coalesce(ev.settings ->> 'impressionName', '')), ''),
    'blocks', private.rider_report_blocks(p_event),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'sort_order', d.sort_order,
        -- how many heats of the division are not published yet (or are held back): while there is one, the report says "so far". Only the number, never which heat.
        'open_heats', (select count(*) from public.heats oh where oh.division_id = d.id and not (oh.status = 'published' and not oh.publish_hold)),
        'rounds', coalesce((select jsonb_agg(jsonb_build_object(
            'id', r.id, 'name', r.name, 'short_name', r.short_name, 'sort_order', r.sort_order, 'draw_round', r.spec ->> 'id', 'advance', r.spec -> 'advance',
            'heats', coalesce((select jsonb_agg(private.rider_report_heat(h) order by h.number, coalesce(h.number_suffix, ''))
                                 from public.heats h where h.round_id = r.id and h.status = 'published' and not h.publish_hold), '[]'::jsonb)
          ) order by r.sort_order) from public.rounds r where r.division_id = d.id), '[]'::jsonb)
      ) order by d.sort_order, d.created_at) from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'division_id', e.division_id, 'first_name', r.first_name, 'last_name', r.last_name, 'nationality', r.nationality,
        'withdrawn', e.status = 'withdrawn',
        'report_withheld', (r.dob is not null and r.dob > (ev.start_date - interval '18 years')::date)))
        from public.entries e join public.riders r on r.id = e.rider_id join public.divisions d on d.id = e.division_id
        where e.event_id = p_event and d.draw_locked_at is not null and e.status in ('confirmed', 'withdrawn', 'no_show')
          and (e.status = 'confirmed' or exists (select 1 from public.heat_slots hs where hs.entry_id = e.id))), '[]'::jsonb));
end $$;

create or replace function public.get_rider_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_mode text;
begin
  if not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  v_mode := private.rider_reports_mode(p_event);
  if v_mode is null then return jsonb_build_object('allowed', false); end if;
  return private.rider_report_payload(p_event, v_mode);
end $$;

create or replace function public.preview_rider_report(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.is_event_organiser(p_event), false) then return jsonb_build_object('allowed', false); end if;
  if not exists (select 1 from public.events e where e.id = p_event) then return jsonb_build_object('allowed', false); end if;
  return private.rider_report_payload(p_event, 'preview');
end $$;

revoke all on function public.get_rider_report(uuid) from public;
revoke all on function public.preview_rider_report(uuid) from public, anon;
grant execute on function public.get_rider_report(uuid) to anon, authenticated;
grant execute on function public.preview_rider_report(uuid) to authenticated;
revoke all on function private.rider_report_blocks(uuid), private.rider_reports_mode(uuid), private.rider_report_heat(public.heats), private.rider_report_payload(uuid, text) from public, anon, authenticated;
grant execute on function private.rider_report_blocks(uuid), private.rider_reports_mode(uuid), private.rider_report_heat(public.heats), private.rider_report_payload(uuid, text) to service_role;
