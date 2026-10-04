-- Polish 3, item 5: "Clear this plan" on the Run order step. The pure engine works out which rows stay (heats that have started, ended or been published, and breaks that
-- already happened); this function checks that nothing that ran leaves the plan, writes the plan and one audit line. A reason is optional.
create or replace function public.clear_schedule_plan(p_plan uuid, p_items jsonb, p_anchors jsonb, p_actual jsonb, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_bad int; v_removed int;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found or not (private.is_event_organiser(p.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  -- a heat that has started, is in its yellow, ended or was published never leaves the plan
  select count(*) into v_bad
  from jsonb_array_elements(p.items) i
  join public.heats h on h.id = (i ->> 'heatId')::uuid
  where i ->> 'kind' = 'heat'
    and (h.status <> 'scheduled' or h.started_at is not null or h.armed_at is not null)
    and not exists (select 1 from jsonb_array_elements(p_items) k where k ->> 'id' = i ->> 'id');
  if v_bad > 0 then raise exception 'HEAT_ALREADY_STARTED'; end if;
  v_removed := jsonb_array_length(p.items) - jsonb_array_length(p_items);
  update public.schedule_plans set items = p_items, anchors = p_anchors, actual_starts = p_actual where id = p_plan;
  perform private.draw_audit(p.event_id, p_plan, 'plan_cleared',
    jsonb_build_object('before', jsonb_build_object('rows', jsonb_array_length(p.items), 'anchors', p.anchors), 'after', jsonb_build_object('rows', jsonb_array_length(p_items), 'anchors', p_anchors)),
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'no reason given'), 'schedule_plans');
  return jsonb_build_object('removed', v_removed, 'kept', jsonb_array_length(p_items));
end $$;
revoke all on function public.clear_schedule_plan(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.clear_schedule_plan(uuid, jsonb, jsonb, jsonb, text) to authenticated;
