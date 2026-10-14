-- Public scores – short trick names next to each attempt. Additive: nothing is dropped or renamed, no table changes, no new writing function.
--
-- What a visitor could read before this migration, per attempt:
--   * get_public_results: every published attempt's trick name and category, in every division, for crashes too (private.public_breakdown sent them all).
--   * get_public_live_heat: every attempt's trick name, side and category, in every division, scored or not, for crashes too.
-- The division setting "What spectators see per attempt" only hid them on the page, not in what the page was sent.
--
-- From now on a visitor is sent an attempt's trick ONLY when
--   (1) the division is on "trick name + score" (live_settings.spectatorAttemptDisplay = 'trick_score'),
--   (2) the attempt is landed and its panel score is in the result (the public can already see that score), and
--   (3) it is a published, released result (get_public_results). The live-heat function for a visitor never carries a score, so it carries no trick either.
-- A crash never carries a trick. The attempt category is no longer sent at all (the pages do not use it). Nothing else from the spotter's lines is or was sent:
-- not the seat that logged it, its edits, flags or notes.
--
-- The Highest jump line (placings) follows the same rule: its trick name is sent only for a division on "trick name + score".
--
-- The organiser of the event (signed in) still reads the full names through get_public_results: the results CSV and the printable results are theirs and need them.
-- Every visitor and every other signed-in person reads the restricted answer; the public pages call this function as a visitor only.

-- 1. the breakdown for the public, with the trick rule
create or replace function private.public_breakdown(b jsonb, p_tricks boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'status', b -> 'status', 'total', b -> 'total', 'totalLabel', b -> 'totalLabel', 'components', b -> 'components',
    'counted', coalesce((select jsonb_agg(jsonb_build_object('attemptSeq', c -> 'attemptSeq', 'score', c -> 'score')) from jsonb_array_elements(coalesce(b -> 'counted', '[]'::jsonb)) c), '[]'::jsonb),
    'allAttempts', coalesce((select jsonb_agg(jsonb_build_object(
        'seq', a -> 'seq', 'status', a -> 'status',
        'trickName', case when p_tricks and a ->> 'status' = 'landed' and jsonb_typeof(a #> '{panel,score}') = 'number' then a -> 'trickName' else null end,
        'categoryKey', null, 'score', a -> 'score',
        'counted', a -> 'counted', 'panelScore', a #> '{panel,score}', 'ignored', a -> 'ignored', 'repeatIndex', a -> 'repeatIndex')
        order by (a ->> 'seq')::int) from jsonb_array_elements(coalesce(b -> 'allAttempts', '[]'::jsonb)) a), '[]'::jsonb),
    'impression', case when jsonb_typeof(b -> 'impression') = 'object' then jsonb_build_object('score', b #> '{impression,score}') else null end,
    'landedCount', b -> 'landedCount', 'attemptCount', b -> 'attemptCount', 'attemptCap', b -> 'attemptCap', 'modifiers', coalesce(b -> 'modifiers', '[]'::jsonb));
$$;

-- the one-argument form (nothing calls it any more) becomes the strict one, so a stray caller can never send a trick
create or replace function private.public_breakdown(b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select private.public_breakdown(b, false);
$$;

-- 2. get_public_results: the trick travels only for a division on "trick name + score" (the event's organiser reads the full names for the files)
create or replace function public.get_public_results(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; v_full boolean;
begin
  select * into ev from public.events where id = p_event;
  if not found or not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  -- nobody is signed in for a visitor: no lookup at all (the public pages call this as a visitor, cached for a few seconds)
  v_full := auth.uid() is not null and coalesce(private.is_event_organiser(p_event), false);
  return jsonb_build_object(
    'allowed', true,
    'event', jsonb_build_object('id', ev.id, 'name', ev.name, 'slug', ev.slug, 'timezone', ev.timezone),
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'sort_order', d.sort_order,
        'attempt_display', coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score'),
        'show_percent', coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false),
        'highest_jump', (select jsonb_build_object('height_m', a.height_m, 'entry_id', a.entry_id, 'heat_id', a.heat_id,
                                'trick_name', case when coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score') = 'trick_score' then a.trick_name else null end)
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
                                                        'breakdown', private.public_breakdown(x.breakdown, v_full or coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score') = 'trick_score'),
                                                        'version', x.version)
                                     order by x.place nulls last)
                      from public.heat_results x where x.heat_id = h.id and x.version = (select max(y.version) from public.heat_results y where y.heat_id = h.id)), '[]'::jsonb)
                  else '[]'::jsonb end
              ) order by h.number, coalesce(h.number_suffix, '')) from public.heats h where h.round_id = r.id), '[]'::jsonb)
          ) order by r.sort_order) from public.rounds r where r.division_id = d.id), '[]'::jsonb)
      ) order by d.sort_order, d.created_at) from public.divisions d where d.event_id = p_event and d.draw_locked_at is not null), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'division_id', e.division_id, 'first_name', e.first_name, 'last_name', e.last_name,
        'nationality', e.nationality, 'identifiers', e.identifiers, 'withdrawn', e.status = 'withdrawn'))
        from public.visible_entries(p_event) e join public.divisions d on d.id = e.division_id
        where e.event_id = p_event and d.draw_locked_at is not null
          and (e.status = 'confirmed' or exists (select 1 from public.heat_slots hs where hs.entry_id = e.id))), '[]'::jsonb));
end $$;

revoke all on function public.get_public_results(uuid) from public;
grant execute on function public.get_public_results(uuid) to anon, authenticated;

-- 3. get_public_live_heat (what a visitor may call): attempts without the trick, its side or its category. A visitor never gets a score from this function, so a
--    trick would show where its score does not. The pages read the live scores on the server (get_live_heat_for_server, service role only) and apply the rule there.
create or replace function public.get_public_live_heat(p_heat uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce((r ->> 'allowed')::boolean, false) then
    (r - 'scores' - 'impressions' - 'penalties')
      || jsonb_build_object('attempts', coalesce((
           select jsonb_agg(a.value || jsonb_build_object('trick_name', null::text, 'direction', null::text, 'category_key', null::text) order by a.ord)
             from jsonb_array_elements(coalesce(r -> 'attempts', '[]'::jsonb)) with ordinality as a(value, ord)), '[]'::jsonb))
    else r end
  from (select public.get_live_heat_for_server(p_heat) as r) x;
$$;
revoke all on function public.get_public_live_heat(uuid) from public;
grant execute on function public.get_public_live_heat(uuid) to anon, authenticated, service_role;
