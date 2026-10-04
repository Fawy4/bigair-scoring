-- Speed 1, part 2: the simulator panel follows the simulator's state and speed on the realtime channel, so a Pause or Resume pressed on the head judge's console shows on the
-- panel at the moment it is written, not at the next look. The organiser could already read sim_control (the panel reads it every second as the safety net); realtime
-- delivers only the rows the reader may read, so nothing new is shown to anybody.
-- Checked while writing this: every column the organiser's pages filter by (event, division, heat, seat) already has an index, so there is no index to add here.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sim_control') then
    alter publication supabase_realtime add table public.sim_control;
  end if;
end $$;
