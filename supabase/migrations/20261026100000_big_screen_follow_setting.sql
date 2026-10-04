-- "Big screen — Follow the heat": the new setting "Follow the heat — seconds per page" (events.settings.followRotateSec, 5 to 120, default 15) is part of what a visitor's
-- browser may know about the event, like screenRotateSec: get_public_site gains one key, nothing else changes (same function, same grants, same visibility rules).
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
      'followRotateSec', coalesce((ev.settings ->> 'followRotateSec')::int, 15),
      'screenColourMode', case when ev.settings ->> 'screenColourMode' = 'day' then 'day' else 'dark' end,
      'publicTabsOff', case when jsonb_typeof(ev.settings -> 'publicTabsOff') = 'array' then ev.settings -> 'publicTabsOff' else '[]'::jsonb end,
      'registrationOpen', coalesce(private.registration_open(ev), false),
      'externalLeaderboards', coalesce(ev.settings -> 'externalLeaderboards', '[]'::jsonb),
      'identification', ev.settings -> 'identification',
      'publicLiveScores', coalesce(ev.settings ->> 'publicLiveScores', 'after_publish'),
      'flags', coalesce(ev.settings -> 'flags', '{}'::jsonb)),
    'wind', case when w.id is null or w.status = 'clear' or not v_banner then null
                 else jsonb_build_object('status', w.status, 'message', w.message, 'at', w.created_at) end,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'sort_order', d.sort_order, 'identification', d.identification,
        'attempt_display', coalesce(d.live_settings ->> 'spectatorAttemptDisplay', 'number_score'),
        'show_percent', coalesce((d.live_settings ->> 'showPercentOfMax')::boolean, false),
        'drawn', d.draw_locked_at is not null) order by d.sort_order, d.created_at)
      from public.divisions d where d.event_id = ev.id), '[]'::jsonb));
end $$;
