-- The ready call (minutes before a heat that riders are called) is set in one place only: the Event step. It used to exist twice: on every run order (default 15, the one
-- the timetables showed) and on the event (default 10, which nothing read). The run order's copy goes away; existing values are carried over like this:
--
--   1. an event that holds a value somebody chose (anything but the old unused default of 10) keeps it
--   2. an event holding 10 or nothing takes the value its run order stored (the first run order by day), so the times people saw do not change
--   3. an event with neither simply gets the new default of 15
--   4. the run orders no longer store it
update public.events e
set settings = jsonb_set(coalesce(e.settings, '{}'::jsonb), '{readyCallMin}', to_jsonb(p.value))
from (
  select distinct on (event_id) event_id, (defaults ->> 'readyCallMin')::numeric as value
  from public.schedule_plans
  where defaults ? 'readyCallMin' and (defaults ->> 'readyCallMin') ~ '^[0-9]+(\.[0-9]+)?$'
  order by event_id, day, created_at
) p
where p.event_id = e.id and (not (e.settings ? 'readyCallMin') or e.settings -> 'readyCallMin' = '10'::jsonb);

update public.events set settings = settings - 'readyCallMin' where settings -> 'readyCallMin' = '10'::jsonb;

update public.schedule_plans set defaults = defaults - 'readyCallMin' where defaults ? 'readyCallMin';
