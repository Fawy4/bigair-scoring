-- Phase 4a-2, corrections found by the first test run.
--   * has_password: a login created by an invitation gets a random password hash from the auth service, so "has a hash" cannot tell
--     whether a person ever chose a password. The app records the fact in the login's own metadata (set when a password is saved
--     or used to sign in), and this function reads it. It is only a label for the header button, never a security check.
--   * set_seat_scores: runs as the caller, so it may only read the seat columns the caller has been granted (not the PIN hashes).
create or replace function public.has_password() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (u.raw_user_meta_data ->> 'has_password') = 'true' from auth.users u where u.id = auth.uid()), false);
$$;

create or replace function public.set_seat_scores(p_seat uuid, p_scores boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_event uuid; v_role text;
begin
  select s.event_id, s.role into v_event, v_role from public.judge_seats s where s.id = p_seat;
  if not found or not private.is_event_organiser(v_event) then raise exception 'NOT_ALLOWED'; end if;
  if v_role <> 'head' then raise exception 'INVALID_SEATS'; end if;
  update public.judge_seats set scores = p_scores where id = p_seat;
  if p_scores then
    insert into public.panel_members (panel_id, judge_seat_id, seat_no)
      select p.id, p_seat, coalesce((select max(m.seat_no) from public.panel_members m where m.panel_id = p.id), 0) + 1
        from public.panels p
       where p.event_id = v_event and not exists (select 1 from public.panel_members m where m.panel_id = p.id and m.judge_seat_id = p_seat);
  else
    delete from public.panel_members where judge_seat_id = p_seat;
  end if;
end $$;
