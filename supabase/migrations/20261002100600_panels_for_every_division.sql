-- Phase 4a-2: "Head judge also scores" puts the head judge on EVERY panel, including the panel of a division that has none yet.
-- ensure_division_panel gives a division its panel (if it has none) and puts the scoring head judges on it. Runs as the caller.
create or replace function public.ensure_division_panel(p_division uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare d public.divisions; v_panel uuid;
begin
  select * into d from public.divisions where id = p_division;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if d.panel_id is not null then return d.panel_id; end if;
  insert into public.panels (event_id, name) values (d.event_id, d.name) returning id into v_panel;
  update public.divisions set panel_id = v_panel where id = d.id;
  insert into public.panel_members (panel_id, judge_seat_id, seat_no)
    select v_panel, s.id, row_number() over (order by s.created_at, s.id)
      from public.judge_seats s where s.event_id = d.event_id and s.role = 'head' and s.scores and s.status = 'active';
  return v_panel;
end $$;
revoke all on function public.ensure_division_panel from public, anon;
grant execute on function public.ensure_division_panel to authenticated;

create or replace function public.set_seat_scores(p_seat uuid, p_scores boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_event uuid; v_role text; d record;
begin
  select s.event_id, s.role into v_event, v_role from public.judge_seats s where s.id = p_seat;
  if not found or not private.is_event_organiser(v_event) then raise exception 'NOT_ALLOWED'; end if;
  if v_role <> 'head' then raise exception 'INVALID_SEATS'; end if;
  update public.judge_seats set scores = p_scores where id = p_seat;
  if p_scores then
    for d in select id from public.divisions where event_id = v_event and panel_id is null loop
      perform public.ensure_division_panel(d.id);
    end loop;
    insert into public.panel_members (panel_id, judge_seat_id, seat_no)
      select p.id, p_seat, coalesce((select max(m.seat_no) from public.panel_members m where m.panel_id = p.id), 0) + 1
        from public.panels p
       where p.event_id = v_event and not exists (select 1 from public.panel_members m where m.panel_id = p.id and m.judge_seat_id = p_seat);
  else
    delete from public.panel_members where judge_seat_id = p_seat;
  end if;
end $$;
