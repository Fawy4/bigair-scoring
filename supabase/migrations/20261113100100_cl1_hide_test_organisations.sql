-- CL1 (0.26.1), part 2: the public pages never show an organisation marked as test, even when its events are published.
-- Additive: the same functions with one more condition each; no signature, table or row changes.
--
-- The five functions every public page starts from now skip an organisation with is_test = true:
--   get_public_events (home page list), get_public_organisation (/o/<organisation>), get_public_event, get_public_site (every event page, the event code box, results,
--   ladder, timetable, big screen, join), public_registration_info (the registration page).
-- Everything else a public page reads is found through those five (an event is looked up by its address first), so a hidden event has no page, list entry or result.
--
-- The one way back in is for the automated tests: a request that carries the header  x-sendbook-test-organisations: show  (only the test servers and the test
-- helpers send it) sees test organisations as before, because the tests look at exactly those events. The live site never sends it.

create or replace function private.test_orgs_visible() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-sendbook-test-organisations') = 'show', false);
$$;
revoke all on function private.test_orgs_visible from public;
grant execute on function private.test_orgs_visible to anon, authenticated, service_role;

create or replace function public.get_public_events(p_limit int default 30) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, organisation_name text, organisation_slug text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, o.name, o.slug
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null and not e.is_simulation
    and (not o.is_test or private.test_orgs_visible())
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
  where o.slug = lower(coalesce(p_slug, '')) and o.archived_at is null and (not o.is_test or private.test_orgs_visible())
    and exists (select 1 from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete') and e.archived_at is null and not e.is_simulation);
$$;

create or replace function public.get_public_event(p_slug text) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, timezone text,
  organisation_name text, organisation_slug text, organisation_logo_url text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, e.timezone,
         o.name, o.slug, o.branding ->> 'logoUrl'
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.slug = lower(coalesce(p_slug, '')) and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null and not e.is_simulation
    and (not o.is_test or private.test_orgs_visible());
$$;

create or replace function public.get_public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; w public.wind_calls; v_banner boolean;
begin
  select e.* into ev from public.events e where e.slug = lower(coalesce(p_slug, '')) and private.event_is_public(e.id)
    and not exists (select 1 from public.organisations o where o.id = e.organisation_id and o.is_test and not private.test_orgs_visible());
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

create or replace function public.public_registration_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; org public.organisations; v_max int; v_divs jsonb;
begin
  select * into ev from public.events where slug = lower(coalesce(p_slug, ''));
  if not found or ev.archived_at is not null or ev.is_simulation or ev.status not in ('published', 'live', 'complete') then return jsonb_build_object('found', false); end if;
  select * into org from public.organisations where id = ev.organisation_id;
  if org.archived_at is not null or (org.is_test and not private.test_orgs_visible()) then return jsonb_build_object('found', false); end if;
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
