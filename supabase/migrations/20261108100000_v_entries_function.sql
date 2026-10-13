-- Security clean-up: the rider list public.v_entries (a security-definer view, flagged CRITICAL by Supabase's Security Advisor) becomes a function.
--   1. public.visible_entries(p_event, p_entry): returns exactly what v_entries returns (same columns, same rows, same caller filter), security definer with a fixed
--      search_path. Executable by signed-in users only (officials, organisers, simulator) - never anon.
--   2. get_public_results (a security-definer function run as its owner) reads the function instead of the view; the public page shows the same riders.
--   3. anon loses its SELECT on v_entries (nothing on the live site reads it as anon). The view itself is dropped by the next migration, after the code is merged.
-- Personal data: no e-mail, phone or date of birth is in the result - the same eleven columns as the view.

create or replace function public.visible_entries(p_event uuid default null, p_entry uuid default null)
returns table (id uuid, event_id uuid, division_id uuid, seed int, status text, identifiers jsonb,
               first_name text, last_name text, nationality text, sponsor text, photo_url text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.event_id, e.division_id, e.seed, e.status, e.identifiers,
         r.first_name, r.last_name, r.nationality, r.sponsor, r.photo_url
  from public.entries e join public.riders r on r.id = e.rider_id
  where (p_event is null or e.event_id = p_event)
    and (p_entry is null or e.id = p_entry)
    and (private.is_event_organiser(e.event_id) or private.has_seat(e.event_id)
         or (private.event_is_public(e.event_id) and e.status in ('confirmed', 'withdrawn', 'no_show')))
$$;
comment on function public.visible_entries(uuid, uuid) is
  'The rider list (names and identifiers, never contact details) for the caller: organisers and seats of the event, or everybody for a public event''s confirmed/withdrawn/no-show riders. Replaces the view v_entries.';
revoke all on function public.visible_entries(uuid, uuid) from public, anon;
grant execute on function public.visible_entries(uuid, uuid) to authenticated, service_role;

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
        from public.visible_entries(p_event) e join public.divisions d on d.id = e.division_id
        where e.event_id = p_event and d.draw_locked_at is not null
          and (e.status = 'confirmed' or exists (select 1 from public.heat_slots hs where hs.entry_id = e.id))), '[]'::jsonb));
end $$;

revoke all on function public.get_public_results(uuid) from public;
grant execute on function public.get_public_results(uuid) to anon, authenticated;

revoke select on public.v_entries from anon;
