-- Console v2 (head judge console redesign): Re-run heat also works on a cancelled heat.
-- Before: rerun_heat refused a cancelled heat (HEAT_CANCELLED). Now a cancelled heat that had started can be re-run, once: the same one transaction,
-- the same riders, seats and Lycra colours, the same "3R" naming and run-order rules. cancel_heat on an already-cancelled heat is a no-op, so the
-- cancel step inside the function does nothing and the one audit line ("heat_rerun") still names the reason. Who may: head seat or organiser, as before.
-- Nothing else changes; no data is touched.
create or replace function public.rerun_heat(
  p_heat uuid, p_new_heat uuid, p_suffix text, p_name text, p_reason text, p_leave_out jsonb, p_plan uuid, p_plan_items jsonb, p_plan_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; n public.heats; v_eff text; s public.heat_slots; v_mod text; plan public.schedule_plans;
  v_old jsonb; v_new jsonb; v_left jsonb := '[]'::jsonb; k text;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  v_eff := private.heat_effective_status(p_heat);
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  -- Console v2: a cancelled heat that ran can be re-run, once (the re-run takes its place in the draw). A cancelled heat that already has its re-run cannot.
  if h.status = 'cancelled' then
    if h.started_at is null then raise exception 'HEAT_NOT_STARTED'; end if;
    if exists (select 1 from public.heats r where r.rerun_of = p_heat) then raise exception 'HEAT_ALREADY_RERUN'; end if;
  elsif v_eff = 'scheduled' then raise exception 'HEAT_NOT_STARTED'; end if;
  if p_suffix is null or p_suffix !~ '^R[0-9]*$' or p_name is null or btrim(p_name) = '' or char_length(p_name) > 40 then raise exception 'BAD_RERUN_NAME'; end if;
  if p_leave_out is not null and jsonb_typeof(p_leave_out) <> 'object' then raise exception 'BAD_LEAVE_OUT'; end if;
  for k, v_mod in select key, value #>> '{}' from jsonb_each(coalesce(p_leave_out, '{}'::jsonb)) loop
    if v_mod not in ('DSQ', 'DNS') then raise exception 'BAD_LEAVE_OUT'; end if;
    if not exists (select 1 from public.heat_slots x where x.heat_id = p_heat and x.entry_id = k::uuid) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  end loop;

  -- the run order: the plan must be as the server saw it, and exactly one item (the re-run's) may have been added
  if p_plan is not null then
    select * into plan from public.schedule_plans where id = p_plan for update;
    if not found or plan.event_id <> h.event_id then raise exception 'PLAN_NOT_FOUND'; end if;
    if p_plan_updated_at is not null and plan.updated_at is distinct from p_plan_updated_at then raise exception 'PLAN_CHANGED'; end if;
    if p_plan_items is null or jsonb_typeof(p_plan_items) <> 'array'
       or jsonb_array_length(p_plan_items) <> jsonb_array_length(plan.items) + 1
       or (select count(*) from jsonb_array_elements(p_plan_items) i where i ->> 'heatId' = p_new_heat::text) <> 1
       or (select coalesce(jsonb_agg(i order by ord), '[]'::jsonb) from jsonb_array_elements(p_plan_items) with ordinality t(i, ord) where i ->> 'heatId' is distinct from p_new_heat::text) <> plan.items then
      raise exception 'BAD_PLAN_ITEMS';
    end if;
  end if;

  -- 1. cancel the original (a started heat keeps started_at and gets an end)
  perform public.cancel_heat(p_heat, p_reason);

  -- 2. the re-run takes the heat's place in the draw: the draw id moves to it (the stored draw is not edited)
  perform set_config('app.draw_bypass', '1', true);
  update public.heats set draw_uid = null where id = p_heat;
  insert into public.heats (id, round_id, division_id, event_id, number, number_suffix, name, status, duration_sec, warm_up_sec, draw_uid, rerun_of, manual_override)
  values (p_new_heat, h.round_id, h.division_id, h.event_id, h.number, p_suffix, btrim(p_name), 'scheduled', h.duration_sec, h.warm_up_sec, h.draw_uid, p_heat, h.manual_override)
  returning * into n;
  for s in select * from public.heat_slots where heat_id = p_heat order by position loop
    v_mod := coalesce(p_leave_out ->> s.entry_id::text, case when s.modifier in ('DNS', 'DSQ') then s.modifier end);
    insert into public.heat_slots (heat_id, position, entry_id, vest_colour, source, modifier) values (n.id, s.position, s.entry_id, s.vest_colour, s.source, v_mod);
    if p_leave_out ? s.entry_id::text then v_left := v_left || jsonb_build_array(jsonb_build_object('entry_id', s.entry_id, 'as', p_leave_out ->> s.entry_id::text)); end if;
  end loop;
  perform set_config('app.draw_bypass', '', true);

  -- 3. the run order
  if p_plan is not null then update public.schedule_plans set items = p_plan_items where id = p_plan; end if;

  -- 4. one audit line
  v_old := jsonb_build_object('heat', p_heat, 'status', h.status);
  v_new := jsonb_build_object('heat', n.id, 'suffix', p_suffix, 'name', btrim(p_name), 'left_out', v_left, 'plan', p_plan);
  perform private.head_audit(h.event_id, 'heats', n.id, 'heat_rerun', v_old, v_new, p_reason);
  return jsonb_build_object('new_heat', n.id, 'suffix', p_suffix, 'name', btrim(p_name));
end $$;

revoke all on function public.rerun_heat from public, anon;
grant execute on function public.rerun_heat to authenticated;
