-- Phase 4a-1c: the public page of one event needs its organisation's name and logo, which visitors cannot read from the tables.
-- Returns nothing unless the event is published (or later) and its organisation is active.
create or replace function public.get_public_event(p_slug text) returns table (
  id uuid, name text, slug text, location text, start_date date, end_date date, status text, timezone text,
  organisation_name text, organisation_slug text, organisation_logo_url text
) language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.slug, e.location, e.start_date, e.end_date, e.status, e.timezone,
         o.name, o.slug, o.branding ->> 'logoUrl'
  from public.events e join public.organisations o on o.id = e.organisation_id
  where e.slug = lower(coalesce(p_slug, '')) and e.status in ('published', 'live', 'complete') and o.archived_at is null;
$$;
revoke all on function public.get_public_event from public;
grant execute on function public.get_public_event to anon, authenticated, service_role;
