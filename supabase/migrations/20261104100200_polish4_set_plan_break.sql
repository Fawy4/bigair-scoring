-- Polish 4, I: the head console's break controls ("+1 min", "Other…") change the REAL break of a gap: the run order's own `breakAfterMin` of the heat that has just ended
-- (minutes, with decimals, so to the second), and drop a pin on the next heat that would hide the change. One function, one audit line; the plan's other rows are untouched.
-- Whoever may press Start heat may call it (a head seat or the organiser), on the active run order only. The next heat's planned start, the run order step, the public
-- timetable and every countdown read the plan, so they all move together.
create or replace function public.set_plan_break(p_plan uuid, p_item text, p_break_min numeric, p_anchors jsonb, p_reason text default null, p_expected timestamptz default null)
returns public.schedule_plans
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_new public.schedule_plans; k text; v text; v_items jsonb;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not private.can_run_heat(p.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not p.active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if p_expected is not null and p.updated_at is distinct from p_expected then raise exception 'PLAN_CHANGED'; end if;
  if p_anchors is null or jsonb_typeof(p_anchors) <> 'object' then raise exception 'BAD_PLAN_VALUE'; end if;
  for k, v in select * from jsonb_each_text(p_anchors) loop
    if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'BAD_PLAN_VALUE'; end if;
  end loop;
  if p_break_min is null or p_break_min < 0 or p_break_min > 240 then raise exception 'BAD_PLAN_VALUE'; end if;
  if not exists (select 1 from jsonb_array_elements(p.items) x where x ->> 'id' = p_item and x ->> 'kind' = 'heat') then raise exception 'BAD_PLAN_VALUE'; end if;
  select jsonb_agg(case when x ->> 'id' = p_item then jsonb_set(x, '{breakAfterMin}', to_jsonb(p_break_min)) else x end order by ord) into v_items
    from jsonb_array_elements(p.items) with ordinality as t(x, ord);
  perform set_config('app.pin_source', 'console', true);
  update public.schedule_plans set items = v_items, anchors = p_anchors where id = p_plan returning * into v_new;
  perform set_config('app.pin_source', '', true);
  perform private.draw_audit(p.event_id, p_plan, 'plan_break_set',
    jsonb_build_object('before', jsonb_build_object('item', p_item, 'items', p.items, 'anchors', p.anchors), 'after', jsonb_build_object('item', p_item, 'breakAfterMin', p_break_min, 'anchors', v_new.anchors)),
    p_reason, 'schedule_plans');
  return v_new;
end $$;
revoke all on function public.set_plan_break(uuid, text, numeric, jsonb, text, timestamptz) from public, anon;
grant execute on function public.set_plan_break(uuid, text, numeric, jsonb, text, timestamptz) to authenticated;
