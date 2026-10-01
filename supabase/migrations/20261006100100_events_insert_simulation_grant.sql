-- Fix for a Phase 5c slip found while testing Phase 6: the Event step sends `is_simulation` when it creates an event, but only UPDATE had been granted on that column,
-- so "Create event" failed with "permission denied for table events" (saving an existing event worked). Organisers may set it when they create the event; the
-- existing guard (SIMULATION_LOCKED) still refuses to change it once a heat has started.
grant insert (is_simulation) on public.events to authenticated;
