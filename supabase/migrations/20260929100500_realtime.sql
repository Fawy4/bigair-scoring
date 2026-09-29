-- Phase 3 / step 5: Realtime for official screens (public pages poll instead, docs/05 §12 decision 4).
-- Full replica identity so filtered UPDATE/DELETE events (filter heat_id=eq.…) carry the old row too.
alter publication supabase_realtime add table public.heats, public.heat_slots, public.trick_attempts, public.trick_scores,
  public.impression_scores, public.penalties, public.heat_results, public.schedule_plans, public.wind_calls;
alter table public.heats replica identity full;
alter table public.heat_slots replica identity full;
alter table public.trick_attempts replica identity full;
alter table public.trick_scores replica identity full;
alter table public.impression_scores replica identity full;
alter table public.penalties replica identity full;
