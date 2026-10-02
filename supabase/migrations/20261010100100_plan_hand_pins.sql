-- Clear actual times keeps the pins the organiser set by hand (fix-reset-visibility, owner's change 1).
-- A pin is "hand-set" when the organiser wrote it (the Run order step, a copied or generated plan); the pins the head console writes while the day runs
-- (Shift, Resume at, +1 min, Pause break) are not. schedule_plans.hand_pins lists the item ids whose pin is hand-set.
--   null  = a plan made before this change: nobody can tell, so every pin counts as hand-set and Clear actual times keeps them all (and says so);
--   array = known. The first organiser save of an older plan turns it into a known one with every pin it has then marked hand-set.
-- A pin the console moves stays hand-set if it was (the organiser's time is moved, never dropped). It changes no pins and no existing plan's behaviour.
alter table public.schedule_plans add column hand_pins jsonb;

create or replace function private.plan_hand_pins() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.anchors is not distinct from old.anchors then return new; end if;
  if current_setting('app.pin_source', true) = 'console' then
    if tg_op = 'UPDATE' then new.hand_pins := old.hand_pins; end if;
    return new;
  end if;
  new.hand_pins := (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
      select h as x from jsonb_array_elements_text(case when tg_op = 'UPDATE' and old.hand_pins is not null then old.hand_pins else '[]'::jsonb end) h where new.anchors ? h
      union all
      select e.key from jsonb_each(new.anchors) e where tg_op = 'INSERT' or old.hand_pins is null or (old.anchors -> e.key) is distinct from e.value) s);
  return new;
end $$;
create trigger plan_hand_pins before insert or update on public.schedule_plans for each row execute function private.plan_hand_pins();

-- the head console's two plan functions, as 5b has them, marking their pins as the console's
create or replace function public.set_plan_hold(p_plan uuid, p_hold jsonb, p_reason text default null, p_expected timestamptz default null, p_anchors jsonb default null)
returns public.schedule_plans
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_new public.schedule_plans; k text; v text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not private.can_run_heat(p.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not p.active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if p_expected is not null and p.updated_at is distinct from p_expected then raise exception 'PLAN_CHANGED'; end if;
  if p_hold is not null and (jsonb_typeof(p_hold) <> 'object' or (p_hold ->> 'since')::timestamptz is null) then raise exception 'BAD_PLAN_VALUE'; end if;
  if p_anchors is not null then
    if jsonb_typeof(p_anchors) <> 'object' then raise exception 'BAD_PLAN_VALUE'; end if;
    for k, v in select * from jsonb_each_text(p_anchors) loop
      if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'BAD_PLAN_VALUE'; end if;
    end loop;
  end if;
  perform set_config('app.pin_source', 'console', true);
  update public.schedule_plans set hold = p_hold, anchors = coalesce(p_anchors, anchors) where id = p_plan returning * into v_new;
  perform set_config('app.pin_source', '', true);
  perform private.draw_audit(p.event_id, p_plan, case when p_hold is null then 'plan_hold_cleared' else 'plan_hold_set' end,
    jsonb_build_object('before', jsonb_build_object('hold', p.hold, 'anchors', p.anchors), 'after', jsonb_build_object('hold', v_new.hold, 'anchors', v_new.anchors)), p_reason, 'schedule_plans');
  return v_new;
end $$;

create or replace function public.set_plan_anchors(p_plan uuid, p_anchors jsonb, p_reason text default null, p_expected timestamptz default null)
returns public.schedule_plans
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_new public.schedule_plans; k text; v text;
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
  perform set_config('app.pin_source', 'console', true);
  update public.schedule_plans set anchors = p_anchors where id = p_plan returning * into v_new;
  perform set_config('app.pin_source', '', true);
  perform private.draw_audit(p.event_id, p_plan, 'plan_anchors_set',
    jsonb_build_object('before', jsonb_build_object('anchors', p.anchors), 'after', jsonb_build_object('anchors', v_new.anchors)), p_reason, 'schedule_plans');
  return v_new;
end $$;

-- Clear actual times: the actual starts of breaks and notes, and the pins the console wrote while the day ran. Hand-set pins stay. A plan that cannot tell
-- (hand_pins is null) keeps every pin. The heats' own real times are the heats' (Reset this heat / division wipes those); a hold is left as it is.
create or replace function public.clear_plan_actuals(p_plan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans; v_keep jsonb; v_actuals int; v_cleared int; v_run text;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found or not (private.is_event_organiser(p.event_id) or private.is_platform_owner()) then raise exception 'NOT_ALLOWED'; end if;
  v_run := private.running_heat_name(p.event_id);
  if v_run is not null then raise exception 'HEAT_RUNNING: %', v_run; end if;
  v_keep := case when p.hand_pins is null then p.anchors
                 else coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(p.anchors) e where p.hand_pins ? e.key), '{}'::jsonb) end;
  v_actuals := (select count(*) from jsonb_object_keys(p.actual_starts));
  v_cleared := (select count(*) from jsonb_object_keys(p.anchors)) - (select count(*) from jsonb_object_keys(v_keep));
  perform set_config('app.pin_source', 'console', true);
  update public.schedule_plans set anchors = v_keep, actual_starts = '{}'::jsonb where id = p_plan;
  perform set_config('app.pin_source', '', true);
  perform private.draw_audit(p.event_id, p_plan, 'plan_actuals_cleared',
    jsonb_build_object('before', jsonb_build_object('actual_starts', p.actual_starts, 'anchors', p.anchors), 'after', jsonb_build_object('actual_starts', '{}'::jsonb, 'anchors', v_keep, 'pins_known', p.hand_pins is not null)), null, 'schedule_plans');
  return jsonb_build_object('actual_starts', v_actuals, 'pins', v_cleared, 'kept', (select count(*) from jsonb_object_keys(v_keep)), 'known', p.hand_pins is not null);
end $$;

revoke all on function public.set_plan_hold, public.set_plan_anchors, public.clear_plan_actuals from public, anon;
grant execute on function public.set_plan_hold, public.set_plan_anchors, public.clear_plan_actuals to authenticated;
