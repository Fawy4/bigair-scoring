-- The public functions' fallback for the ready call is 15 minutes (the Event step's default), not the old 10. A fresh database gets 15 from the earlier migration
-- file; this brings a database that already ran it up to date, and does nothing where the text is already right.
do $$
declare d text;
begin
  for d in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_public_site', 'get_public_timetable')
  loop
    execute replace(d, $s$'readyCallMin')::int, 10)$s$, $s$'readyCallMin')::int, 15)$s$);
  end loop;
end $$;
