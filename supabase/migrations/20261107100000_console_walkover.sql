-- Console – Walkover and absent riders (0.19.0). Only adds: no table, column or function is dropped or renamed.
--
--   * set_rider_status also works on a heat that has not started (Did not start before the start; "Back in the heat" until the heat is published).
--   * head_out_of_event: the head judge's (or an organiser's) "Out of the event": the same thing "Withdrawn" on the Riders step does (the entry is withdrawn, every seat
--     he would fill in a heat that has not started is a walkover, the stored draw follows), plus this heat's seat, whatever state the heat is in.
--   * walkover_heat_commit: a heat with one rider who can ride is finished and published without being ridden (service role only, like publish_heat_commit: the server
--     works out the places and the next seats with the ladder engine). The heat gets started_at = ended_at = published_at = the moment it was given, which is how a
--     walkover is told from a heat that was ridden: it takes no time in the run order.
--   * walkover_reopen: Re-open on a walkover heat puts it back to Not started with its riders; refused once a heat it fed has started.
--   * get_public_results also names the riders who hold a seat but are no longer confirmed (Out of the event), so the public pages can say so by name.

-- ---------------------------------------------------------------- 1. Did not start before the heat starts
create or replace function public.set_rider_status(p_heat uuid, p_entry uuid, p_modifier text, p_reason text) returns public.heat_slots
language plpgsql security definer set search_path = '' as $$
declare h public.heats; slot public.heat_slots; v_before text;
begin
  h := private.head_heat(p_heat, array['scheduled', 'running', 'paused', 'ended', 'under_review'], p_reason);
  if p_modifier is not null and p_modifier not in ('DNS', 'DNF', 'DSQ') then raise exception 'BAD_MODIFIER'; end if;
  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  v_before := slot.modifier;
  update public.heat_slots set modifier = p_modifier where id = slot.id returning * into slot;
  perform private.head_audit(h.event_id, 'heat_slots', slot.id, 'rider_status_set',
    jsonb_build_object('modifier', v_before), jsonb_build_object('modifier', p_modifier, 'heat_id', p_heat, 'entry_id', p_entry), p_reason);
  return slot;
end $$;

-- ---------------------------------------------------------------- 2. Out of the event
create or replace function public.head_out_of_event(p_heat uuid, p_entry uuid, p_reason text, p_words text, p_draw jsonb default null, p_projection jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats; slot public.heat_slots; v_before text; p jsonb; s jsonb; v_target public.heats;
begin
  h := private.head_heat(p_heat, array['scheduled', 'running', 'paused', 'ended', 'under_review'], p_reason, false);
  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  select e.status into v_before from public.entries e where e.id = p_entry;
  perform set_config('app.draw_bypass', '1', true);
  update public.entries set status = 'withdrawn' where id = p_entry and status <> 'withdrawn';
  update public.heat_slots set modifier = 'DNS' where id = slot.id;
  update public.heat_slots hs set modifier = 'DNS'
    from public.heats x where hs.heat_id = x.id and x.division_id = h.division_id and hs.entry_id = p_entry and x.status = 'scheduled' and x.started_at is null;
  if p_draw is not null then
    update public.divisions set draw = p_draw where id = h.division_id;
    for p in select * from jsonb_array_elements(coalesce(p_projection, '[]'::jsonb)) loop
      select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
      if not found or v_target.status <> 'scheduled' or v_target.started_at is not null then continue; end if;
      for s in select * from jsonb_array_elements(p -> 'slots') loop
        update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
         where heat_id = v_target.id and position = (s ->> 'position')::int;
      end loop;
    end loop;
  end if;
  perform set_config('app.draw_bypass', '', true);
  perform private.head_audit(h.event_id, 'heat_slots', slot.id, 'rider_out_of_event',
    jsonb_build_object('entry_status', v_before), jsonb_build_object('entry_status', 'withdrawn', 'heat_id', p_heat, 'entry_id', p_entry), nullif(btrim(coalesce(p_words, '')), ''));
end $$;

-- ---------------------------------------------------------------- 3. Walkover
-- p_results: [{ entry_id, place, breakdown }] for every rider of the heat (place null for a rider who goes nowhere).
-- p_draw / p_projection: the division's new stored draw and the later heats' seats, worked out by the server with the ladder engine (as publish_heat_commit takes them).
create or replace function public.walkover_heat_commit(
  p_heat uuid, p_results jsonb, p_draw jsonb, p_projection jsonb, p_hold boolean, p_words text, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; v_latest int; r jsonb; p jsonb; s jsonb; v_target public.heats; v_now timestamptz := now(); v_able int; v_waiting int;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_actor::text, ''), true);

  select coalesce(max(version), 0) into v_latest from public.heat_results where heat_id = p_heat;
  -- pressing the button twice, even together, gives one walkover
  if h.status = 'published' and h.started_at is not null and h.started_at = h.ended_at then
    return jsonb_build_object('version', v_latest, 'already', true, 'published_at', h.published_at);
  end if;
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if h.status = 'cancelled' then raise exception 'HEAT_CANCELLED'; end if;
  if h.status <> 'scheduled' or h.started_at is not null or h.armed_at is not null then raise exception 'WALKOVER_NOT_POSSIBLE'; end if;
  select count(*) filter (where entry_id is not null and coalesce(modifier, '') not in ('DNS', 'DSQ')),
         count(*) filter (where entry_id is null and coalesce(modifier, '') <> 'DNS')
    into v_able, v_waiting from public.heat_slots where heat_id = p_heat;
  if v_able >= 2 or v_waiting > 0 then raise exception 'WALKOVER_NOT_POSSIBLE'; end if;

  for r in select * from jsonb_array_elements(p_results) loop
    if not exists (select 1 from public.heat_slots x where x.heat_id = p_heat and x.entry_id = (r ->> 'entry_id')::uuid) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
    insert into public.heat_results (event_id, heat_id, entry_id, place, total, percent, breakdown, version, published_at)
    values (h.event_id, p_heat, (r ->> 'entry_id')::uuid, nullif(r ->> 'place', '')::int, null, null, r -> 'breakdown', v_latest + 1, v_now);
    update public.heat_slots set place = nullif(r ->> 'place', '')::int, total = null, breakdown = r -> 'breakdown'
     where heat_id = p_heat and entry_id = (r ->> 'entry_id')::uuid;
  end loop;

  perform set_config('app.draw_bypass', '1', true);
  if p_draw is not null then update public.divisions set draw = p_draw where id = h.division_id; end if;
  for p in select * from jsonb_array_elements(coalesce(p_projection, '[]'::jsonb)) loop
    select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
    if not found then continue; end if;
    if v_target.status <> 'scheduled' or v_target.started_at is not null then raise exception 'DOWNSTREAM_STARTED: %', p ->> 'uid'; end if;
    for s in select * from jsonb_array_elements(p -> 'slots') loop
      update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
       where heat_id = v_target.id and position = (s ->> 'position')::int;
    end loop;
  end loop;
  perform set_config('app.draw_bypass', '', true);

  perform private.audit_ctx('heat_walkover', p_words);
  update public.heats set status = 'published', started_at = v_now, ended_at = v_now, published_at = v_now, publish_hold = coalesce(p_hold, false), reopened_at = null where id = p_heat;
  perform private.audit_ctx('', '');
  return jsonb_build_object('version', v_latest + 1, 'already', false, 'published_at', v_now);
end $$;

-- ---------------------------------------------------------------- 4. Re-open a walkover
create or replace function public.walkover_reopen(p_heat uuid, p_reason text, p_before jsonb, p_draw jsonb, p_seats jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats; d public.divisions; p jsonb; s jsonb; v_target public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if h.status <> 'published' or h.started_at is null or h.started_at is distinct from h.ended_at then raise exception 'NOT_A_WALKOVER'; end if;
  select * into d from public.divisions where id = h.division_id for update;
  if p_draw is not null then
    if p_before is distinct from d.draw then raise exception 'DRAW_CHANGED'; end if;
    for p in select * from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) loop
      select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
      if not found then continue; end if;
      if v_target.status <> 'scheduled' or v_target.started_at is not null then raise exception 'DOWNSTREAM_STARTED: %', p ->> 'uid'; end if;
    end loop;
  end if;
  perform set_config('app.draw_bypass', '1', true);
  perform private.audit_ctx('heat_walkover_reopened', p_reason);
  update public.heats set status = 'scheduled', started_at = null, ended_at = null, published_at = null, reopened_at = null, publish_hold = false where id = p_heat;
  perform private.audit_ctx('', '');
  update public.heat_slots set place = null, total = null, breakdown = null where heat_id = p_heat;
  if p_draw is not null then
    update public.divisions set draw = p_draw where id = h.division_id;
    for p in select * from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) loop
      select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
      if not found then continue; end if;
      for s in select * from jsonb_array_elements(p -> 'slots') loop
        update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
         where heat_id = v_target.id and position = (s ->> 'position')::int;
      end loop;
    end loop;
  end if;
  perform set_config('app.draw_bypass', '', true);
end $$;

revoke all on function public.head_out_of_event(uuid, uuid, text, text, jsonb, jsonb), public.walkover_heat_commit(uuid, jsonb, jsonb, jsonb, boolean, text, uuid), public.walkover_reopen(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.head_out_of_event(uuid, uuid, text, text, jsonb, jsonb), public.walkover_reopen(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.walkover_heat_commit(uuid, jsonb, jsonb, jsonb, boolean, text, uuid) to service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 5. the public results name a rider who is out of the event
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
        'nationality', e.nationality, 'identifiers', e.identifiers, 'withdrawn', e.status = 'withdrawn'))
        from public.v_entries e join public.divisions d on d.id = e.division_id
        where e.event_id = p_event and d.draw_locked_at is not null
          and (e.status = 'confirmed' or exists (select 1 from public.heat_slots hs where hs.entry_id = e.id))), '[]'::jsonb));
end $$;
