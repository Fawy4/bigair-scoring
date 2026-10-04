-- Fix 2, item 1(d): less disk churn. The free database machine ran out of disk capacity on 3 Oct (docs/AUDIT.md, A1b-0); every write that happens "because someone
-- looked" is a row version the disk has to keep and clean up again.
--   * touch_seat ("last seen") wrote every 30 s per official phone with a 15 s guard; now at most once a minute (guard 55 s; the phone still asks every 30 s, so the
--     stored time is never more than about 90 s old, and the head judge's "connected" window is 90 s, see SEEN_WITHIN_MS).
--   * sim_view_beat (the simulator's View-as tab, every 5 s) wrote every time; now at most every 20 s (the simulator gives a silent seat back after 90 s) unless the tab
--     is coming back from a "leaving" beacon, which it must clear at once.
-- Reads write nothing: every get_public_* function, server_now and get_live_heat_for_server are STABLE (checked in tests/rls/fix2-churn.test.ts).

create or replace function public.touch_seat() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  update public.judge_seats set last_seen_at = now()
   where auth_user_id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '55 seconds');
end $$;

create or replace function public.sim_view_beat(p_event uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare held boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists (select 1 from public.sim_seats ss join public.judge_seats js on js.id = ss.seat_id
                  where ss.event_id = p_event and ss.viewed_by = auth.uid() and js.auth_user_id = auth.uid()) into held;
  if not held then return false; end if;
  update public.sim_seats ss set view_seen_at = now(), view_release_at = null
    from public.judge_seats js
   where ss.event_id = p_event and ss.viewed_by = auth.uid() and js.id = ss.seat_id and js.auth_user_id = auth.uid()
     and (ss.view_seen_at is null or ss.view_seen_at < now() - interval '20 seconds' or ss.view_release_at is not null);
  return true;
end $$;
