-- Phase 4a-1c: delete and archive an event.
--   * Archive: events.archived_at. An archived event is hidden everywhere the public looks (home page, organisation page, event page,
--     live view, tables) and from officials joining; every row is kept and the organisers still see it (and can restore it).
--   * Delete: organisers of the event's organisation and platform owners, typed web address, refused once any result is published
--     (then Archive is the only option). One transaction removes divisions, entries, officials, panels, heats and schedule plans with the
--     event, keeps the riders (they belong to the organisation) and writes an audit line.
alter table public.events add column archived_at timestamptz;
grant select (archived_at) on public.events to anon, authenticated;

-- An event is public only while it is published (or later), not archived, and its organisation is active.
create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.organisations o on o.id = e.organisation_id
    where e.id = p_event and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null);
$$;
drop policy public_read on public.events;
create policy public_read on public.events for select to anon, authenticated
  using (status in ('published', 'live', 'complete') and archived_at is null and private.org_is_active(organisation_id));

-- the public functions: archived events are not listed
create or replace function public.get_public_events(p_limit int default 30) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, organisation_name text, organisation_slug text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, o.name, o.slug
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null
  order by e.start_date desc nulls last, e.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.get_public_organisation(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', o.name, 'slug', o.slug, 'logo_url', o.branding ->> 'logoUrl', 'timezone', o.settings ->> 'defaultTimezone',
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'location', e.location,
                        'start_date', e.start_date, 'end_date', e.end_date, 'status', e.status) order by e.start_date desc nulls last), '[]'::jsonb)
               from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete') and e.archived_at is null))
  from public.organisations o
  where o.slug = lower(coalesce(p_slug, '')) and o.archived_at is null
    and exists (select 1 from public.events e where e.organisation_id = o.id and e.status in ('published', 'live', 'complete') and e.archived_at is null);
$$;

create or replace function public.get_public_event(p_slug text) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, timezone text,
  organisation_name text, organisation_slug text, organisation_logo_url text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, e.timezone,
         o.name, o.slug, o.branding ->> 'logoUrl'
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.slug = lower(coalesce(p_slug, '')) and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null;
$$;

-- the live view follows the same rule (this also closes a gap: it ignored archived organisations)
create or replace function public.get_public_live_heat(p_heat uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; ev public.events;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into ev from public.events where id = h.event_id;
  if not private.event_is_public(ev.id) or coalesce(ev.settings ->> 'publicLiveScores', 'after_publish') <> 'live'
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

-- Delete: refused unless the caller is an organiser of the event's organisation (also an admin inside it) or a platform owner.
-- An unknown event and a foreign one look the same (NOT_ALLOWED), so nothing is revealed.
create or replace function public.delete_event(p_event uuid, p_slug_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; v_results int; v_summary jsonb;
begin
  select * into ev from public.events where id = p_event for update;
  if not found or not (private.is_event_organiser(p_event) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  if lower(btrim(coalesce(p_slug_confirm, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;
  select count(*)::int into v_results from public.heat_results where event_id = p_event;
  if v_results = 0 then select count(*)::int into v_results from public.heats where event_id = p_event and status = 'published'; end if;
  if v_results > 0 then raise exception 'PUBLISHED_RESULTS'; end if;
  v_summary := jsonb_build_object(
    'divisions', (select count(*) from public.divisions where event_id = p_event),
    'entries', (select count(*) from public.entries where event_id = p_event),
    'seats', (select count(*) from public.judge_seats where event_id = p_event),
    'heats', (select count(*) from public.heats where event_id = p_event),
    'plans', (select count(*) from public.schedule_plans where event_id = p_event));
  perform private.platform_audit('event_deleted', ev.organisation_id, 'events', p_event, jsonb_build_object('name', ev.name, 'slug', ev.slug) || v_summary, null, null);
  delete from public.events where id = p_event;
  return v_summary;
end $$;

create or replace function public.set_event_archived(p_event uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or not (private.is_event_organiser(p_event) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  update public.events set archived_at = case when p_archived then coalesce(archived_at, now()) else null end where id = p_event;
  perform private.platform_audit(case when p_archived then 'event_archived' else 'event_unarchived' end, ev.organisation_id, 'events', p_event,
                                 jsonb_build_object('name', ev.name, 'slug', ev.slug), null, null);
end $$;

-- the admin events table also needs the published-result count and the archive state
drop function public.admin_organisation_events(uuid);
create or replace function public.admin_organisation_events(p_org uuid) returns table (
  id uuid, name text, slug text, status text, start_date date, end_date date, divisions_count int, running_heats int, published_results int, archived_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select e.id, e.name, e.slug, e.status, e.start_date, e.end_date,
         (select count(*)::int from public.divisions d where d.event_id = e.id),
         (select count(*)::int from public.heats h where h.event_id = e.id and h.status in ('running', 'paused')),
         (select count(*)::int from public.heat_results r where r.event_id = e.id)
           + (select count(*)::int from public.heats h where h.event_id = e.id and h.status = 'published'),
         e.archived_at
  from public.events e where e.organisation_id = p_org
  order by e.start_date desc nulls last, e.name;
end $$;
revoke all on function public.admin_organisation_events from public, anon, authenticated;
grant execute on function public.admin_organisation_events to authenticated;

revoke all on function public.delete_event, public.set_event_archived from public, anon, authenticated;
grant execute on function public.delete_event, public.set_event_archived to authenticated;
