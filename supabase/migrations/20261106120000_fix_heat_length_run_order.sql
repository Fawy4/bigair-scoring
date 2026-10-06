-- Fix: the heat clock ignored the run order's heat length.
--
-- The rule (docs/06 "Live timetable overrides"): the run order is the live value for every heat that has not started; Timing per round is only the starting plan.
-- Until now the run order's length (an item's `durationMin` inside schedule_plans.items) was a display only: the heat carried its own copy (heats.duration_sec, written
-- when the draw was generated) and the clock, the Flag view, the big screens and the sim read that copy.
--
-- ONE source of truth: the run order's `durationMin` of the heat's row in the ACTIVE plan. `heats.duration_sec` of a heat that has not started is kept equal to it
-- (so every reader of the heat row sees the same length before the heat), and it is read once more at the moment the start sequence begins (start_gate, shared by Start heat
-- and Start heat sequence, before the simulator scales the clock). A heat in no active plan, or whose row has no length of its own, keeps the length of its own copy.
--   * heats.draw_duration_sec: the length the draw gave the heat, remembered while a run-order length overrides it, so clearing the row's length ("back to the round's
--     length") gives it back. Anything but this function that changes duration_sec forgets it.
--   * Heats that have started, ended or been published are never touched (only status 'scheduled' and not armed); "+1 min" works on top of whatever the clock started with.
--   * In a simulation the heat's fast clock (sim_clock) is kept in step: original_sec is the run-order length, the heat's clock is that divided by the speed.

alter table public.heats add column draw_duration_sec int check (draw_duration_sec is null or draw_duration_sec > 0);

-- the run order's length of a heat, in seconds; null when the heat is in no active run order or its row has no length of its own
create or replace function private.plan_length_sec(p_heat uuid) returns int
language sql stable security definer set search_path = '' as $$
  select x.sec from (
    select p.updated_at,
           case when jsonb_typeof(i -> 'durationMin') = 'number' then round((i ->> 'durationMin')::numeric * 60)::int end as sec
      from public.heats h
      join public.schedule_plans p on p.event_id = h.event_id and p.active
      cross join lateral jsonb_array_elements(p.items) i
     where h.id = p_heat and i ->> 'kind' = 'heat' and i ->> 'heatId' = p_heat::text
  ) x
  where x.sec is not null and x.sec > 0
  order by x.updated_at desc limit 1;
$$;

-- make a heat that has not started carry the run order's length (or, when the run order has none, the length the draw gave it)
create or replace function private.sync_heat_length(p_heat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_plan int; v_speed int; v_target int;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found or h.status <> 'scheduled' or h.started_at is not null or h.armed_at is not null then return; end if;
  v_plan := private.plan_length_sec(p_heat);
  select c.speed into v_speed from public.sim_clock c where c.heat_id = p_heat;
  if v_plan is null then
    -- the row lost its own length: back to the draw's (a simulation's fast clock keeps its own copy)
    if v_speed is not null or h.draw_duration_sec is null then return; end if;
    perform set_config('app.heat_length_sync', 'on', true);
    update public.heats set duration_sec = h.draw_duration_sec, draw_duration_sec = null where id = p_heat;
    perform set_config('app.heat_length_sync', '', true);
    return;
  end if;
  if v_speed is not null then
    -- aborted start sequence in a simulation: the fast clock already scaled this heat; keep it scaled, from the new length
    v_target := greatest(3, ceil(v_plan::numeric / v_speed))::int;
    if v_target = h.duration_sec then
      update public.sim_clock set original_sec = v_plan where heat_id = p_heat and original_sec <> v_plan;
      return;
    end if;
    update public.sim_clock set original_sec = v_plan where heat_id = p_heat;
  else
    v_target := v_plan;
    if v_target = h.duration_sec then return; end if;
  end if;
  perform set_config('app.heat_length_sync', 'on', true);
  update public.heats set duration_sec = v_target, draw_duration_sec = coalesce(h.draw_duration_sec, case when v_speed is null then h.duration_sec end) where id = p_heat;
  perform set_config('app.heat_length_sync', '', true);
end $$;

-- only this function may change duration_sec without the draw's copy being forgotten
create or replace function private.heats_forget_draw_length() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.heat_length_sync', true), '') <> 'on' then new.draw_duration_sec := null; end if;
  return new;
end $$;
create trigger c_heats_forget_draw_length before update of duration_sec on public.heats for each row when (old.duration_sec is distinct from new.duration_sec) execute function private.heats_forget_draw_length();

-- a run order changes (a length typed, cleared, a row removed, the plan activated or deactivated, deleted): every heat whose length there changed follows
create or replace function private.plan_lengths(p_items jsonb, p_active boolean) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(i ->> 'heatId', i -> 'durationMin'), '{}'::jsonb)
    from jsonb_array_elements(case when p_active then p_items else '[]'::jsonb end) i
   where i ->> 'kind' = 'heat' and i ->> 'heatId' is not null and jsonb_typeof(i -> 'durationMin') = 'number';
$$;

create or replace function private.plans_sync_heat_lengths() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb; k text;
begin
  if tg_op <> 'INSERT' then v_old := private.plan_lengths(old.items, old.active); end if;
  if tg_op <> 'DELETE' then v_new := private.plan_lengths(new.items, new.active); end if;
  for k in select key from jsonb_each(v_old) union select key from jsonb_each(v_new) loop
    if v_old -> k is distinct from v_new -> k and k ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform private.sync_heat_length(k::uuid);
    end if;
  end loop;
  return null;
end $$;
create trigger z_plans_sync_heat_lengths after insert or update of items, active or delete on public.schedule_plans for each row execute function private.plans_sync_heat_lengths();

-- the rules a heat must meet before it may start: unchanged, plus the length is read from the run order at this moment (before the simulator's fast clock scales it)
create or replace function private.start_gate(p_heat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; d public.divisions; ev public.events;
  v_min int; v_panel int; v_unfilled int; v_running int; v_max int;
begin
  select * into h from public.heats where id = p_heat;
  select * into ev from public.events where id = h.event_id;
  select * into d from public.divisions where id = h.division_id;
  if d.draw_locked_at is null then raise exception 'DRAW_NOT_LOCKED: %', d.name; end if;
  v_min := coalesce((private.division_model_setting(d.id, array['panel', 'minJudges']) #>> '{}')::int, 3);
  select count(*) into v_panel from public.panel_members pm join public.judge_seats s on s.id = pm.judge_seat_id
   where pm.panel_id = d.panel_id and s.active and s.status = 'active';
  if v_panel < v_min then raise exception 'PANEL_TOO_SMALL: %|%|%', d.name, v_panel, v_min; end if;
  select count(*) into v_unfilled from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id is null and hs.modifier is distinct from 'DNS';
  if v_unfilled > 0 then raise exception 'SEATS_NOT_FILLED: %', v_unfilled; end if;
  v_max := coalesce((ev.settings ->> 'maxRunningHeats')::int, 1);
  -- a heat that is armed counts as taking the water: one heat at a time
  select count(*) into v_running from public.heats x
   where x.event_id = h.event_id and x.id <> p_heat
     and (private.heat_effective_status(x.id) in ('running', 'paused') or (x.status = 'scheduled' and x.armed_at is not null));
  if v_running >= v_max then raise exception 'HEAT_ALREADY_RUNNING: %', v_max; end if;
  perform private.sync_heat_length(p_heat);
end $$;

-- One-off: nothing is rewritten here. Heats of existing run orders pick their run-order length up the next time that run order's lengths change or the heat starts.
