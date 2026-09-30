-- Phase 4b: the draw (generate, hands-on editing, lock / unlock) and the run order (plans, activate).
--
--   1. heats: a stable draw id (survives renumbering), an optional name, the warm-up before the heat
--   2. the draw is hidden from the public role (names of every seat); organisers and the event's officials read it
--   3. guards: a locked draw refuses seat and heat changes; a heat that has started is never rearranged (names may change)
--   4. save_division_draw: generate / edit in ONE transaction (draw JSON + rounds + heats + seats), audited
--   5. lock_division_draw / unlock_division_draw (a written reason) / set_draw_walkover
--   6. schedule plans: activate one per day in one transaction; plan changes are audited

-- ---------------------------------------------------------------- 1. heats
alter table public.heats
  add column draw_uid text,                                  -- the heat's identity in the draw; "R1-H4" may become "R1-H3" when a heat before it is taken out
  add column name text check (name is null or char_length(name) between 1 and 40),
  add column warm_up_sec int not null default 0 check (warm_up_sec >= 0);
create unique index heats_division_draw_uid on public.heats (division_id, draw_uid) where draw_uid is not null;

-- ---------------------------------------------------------------- 2. the stored draw is not public
-- Seats name riders; the public pages read heats and seats through the rows that are meant to be public.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'divisions' and column_name <> 'draw';
  execute 'revoke select on public.divisions from anon';
  execute format('grant select (%s) on public.divisions to anon', cols);
end $$;

-- ---------------------------------------------------------------- 3. guards
-- Only the privileged functions below set app.draw_bypass (inside their own transaction); the tables' own grants stay as they were.
-- The guards protect the draw from signed-in people (organisers, officials). Server code with the service key, migrations and
-- cascades from deleting a heat, round, division or event are not "people editing the draw".
create or replace function private.draw_bypass() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.draw_bypass', true), '') = '1'
      or pg_trigger_depth() > 1
      or auth.role() is distinct from 'authenticated'
$$;

-- Seats: entry, position, source and colour cannot change while the draw is locked or once the heat has started.
create or replace function private.slot_arrangement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_heat public.heats; v_locked timestamptz;
begin
  if private.draw_bypass() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (new.entry_id, new.position, new.source, new.vest_colour) is not distinct from (old.entry_id, old.position, old.source, old.vest_colour) then
    return new;
  end if;
  select * into v_heat from public.heats where id = coalesce(new.heat_id, old.heat_id);
  if not found then return coalesce(new, old); end if;        -- the heat is being deleted along with its division or event
  select d.draw_locked_at into v_locked from public.divisions d where d.id = v_heat.division_id;
  if v_locked is not null then raise exception 'DRAW_LOCKED'; end if;
  if v_heat.status <> 'scheduled' or v_heat.started_at is not null then raise exception 'HEAT_STARTED'; end if;
  return coalesce(new, old);
end $$;
create trigger b_slot_guard before insert or update or delete on public.heat_slots for each row execute function private.slot_arrangement_guard();

-- Heats: which round, which number, which draw id; adding and taking out heats.
create or replace function private.heat_arrangement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_div uuid := coalesce(new.division_id, old.division_id); v_locked timestamptz; v_found boolean;
begin
  if private.draw_bypass() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (new.round_id, new.number, new.number_suffix, new.draw_uid) is not distinct from (old.round_id, old.number, old.number_suffix, old.draw_uid) then
    return new;
  end if;
  select d.draw_locked_at, true into v_locked, v_found from public.divisions d where d.id = v_div;
  if not coalesce(v_found, false) then return coalesce(new, old); end if;  -- the division is being deleted
  if v_locked is not null then raise exception 'DRAW_LOCKED'; end if;
  if tg_op <> 'INSERT' and (old.status <> 'scheduled' or old.started_at is not null) then raise exception 'HEAT_STARTED'; end if;
  return coalesce(new, old);
end $$;
create trigger b_heat_guard before insert or update or delete on public.heats for each row execute function private.heat_arrangement_guard();

-- Rounds: adding, taking out and restructuring are refused while locked (a rename is always fine).
create or replace function private.round_arrangement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_locked timestamptz; v_found boolean;
begin
  if private.draw_bypass() then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and (new.sort_order, new.spec) is not distinct from (old.sort_order, old.spec) then return new; end if;
  select d.draw_locked_at, true into v_locked, v_found from public.divisions d where d.id = coalesce(new.division_id, old.division_id);
  if not coalesce(v_found, false) then return coalesce(new, old); end if;
  if v_locked is not null then raise exception 'DRAW_LOCKED'; end if;
  return coalesce(new, old);
end $$;
create trigger b_round_guard before insert or update or delete on public.rounds for each row execute function private.round_arrangement_guard();

-- The stored draw itself changes only through the functions below.
create or replace function private.division_draw_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.draw_bypass() then return new; end if;
  if (new.draw, new.draw_locked_at) is distinct from (old.draw, old.draw_locked_at) then raise exception 'DRAW_FUNCTION_ONLY'; end if;
  return new;
end $$;
create trigger b_draw_guard before update on public.divisions for each row execute function private.division_draw_guard();

-- ---------------------------------------------------------------- 4. save_division_draw
create or replace function private.draw_audit(p_event uuid, p_division uuid, p_action text, p_audit jsonb, p_reason text default null, p_table text default 'divisions') returns void
language plpgsql security definer set search_path = '' as $$
declare v_seat uuid;
begin
  select s.id into v_seat from public.judge_seats s where s.event_id = p_event and s.auth_user_id = auth.uid() and s.active limit 1;
  insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (p_event, auth.uid(), v_seat, p_action, p_table, p_division, p_audit -> 'before', p_audit -> 'after', nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

-- p_projection = { rounds: [{key, sort_order, name, short_name, spec}], heats: [{uid, round_key, number, name, duration_sec, warm_up_sec, manual_override, slots: [{position, entry_id, vest_colour, source, modifier}]}] }
-- p_action: 'generate' (a new draw; refused once a heat has started) or 'edit'. A locked draw refuses both: unlock it first, with a reason.
create or replace function public.save_division_draw(p_division uuid, p_draw jsonb, p_projection jsonb, p_action text, p_audit jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.divisions; r jsonb; h jsonb; s jsonb;
  v_round uuid; v_heat public.heats; v_id uuid; v_keys text[] := '{}'; v_kept uuid[] := '{}'; v_entry uuid;
  v_started boolean; v_old_slots jsonb; v_new_slots jsonb; v_exists boolean;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_action not in ('generate', 'edit') then raise exception 'BAD_ACTION'; end if;
  if d.draw_locked_at is not null then raise exception 'DRAW_LOCKED'; end if;
  if p_action = 'generate' and exists (select 1 from public.heats x where x.division_id = p_division and (x.status <> 'scheduled' or x.started_at is not null)) then
    raise exception 'HEAT_STARTED';
  end if;

  perform set_config('app.draw_bypass', '1', true);

  -- rounds (matched by the key stored in spec)
  for r in select * from jsonb_array_elements(p_projection -> 'rounds') loop
    v_keys := v_keys || (r ->> 'key');
    select id into v_round from public.rounds where division_id = p_division and spec ->> 'key' = r ->> 'key';
    if v_round is null then
      insert into public.rounds (division_id, event_id, sort_order, name, short_name, spec)
      values (p_division, d.event_id, (r ->> 'sort_order')::int, r ->> 'name', r ->> 'short_name', r -> 'spec');
    else
      update public.rounds set sort_order = (r ->> 'sort_order')::int, name = r ->> 'name', short_name = r ->> 'short_name', spec = r -> 'spec' where id = v_round;
    end if;
  end loop;

  -- heats: move the numbers of not-yet-started heats out of the way, then set them
  update public.heats set number = -number - 1000000 where division_id = p_division and status = 'scheduled' and started_at is null and number > 0;

  for h in select * from jsonb_array_elements(p_projection -> 'heats') loop
    select id into v_round from public.rounds where division_id = p_division and spec ->> 'key' = h ->> 'round_key';
    if v_round is null then raise exception 'BAD_PROJECTION'; end if;
    select * into v_heat from public.heats where division_id = p_division and draw_uid = h ->> 'uid';
    if not found then
      -- a heat stored before draw ids existed: match by round and number, once
      select * into v_heat from public.heats where division_id = p_division and draw_uid is null and round_id = v_round and (number = (h ->> 'number')::int or number = -(h ->> 'number')::int - 1000000);
    end if;
    v_exists := found;
    v_new_slots := coalesce(h -> 'slots', '[]'::jsonb);
    if v_exists then
      v_started := v_heat.status <> 'scheduled' or v_heat.started_at is not null;
      if v_started then
        -- a started heat may be renamed, nothing else
        select coalesce(jsonb_agg(jsonb_build_object('position', position, 'entry_id', entry_id) order by position), '[]'::jsonb) into v_old_slots from public.heat_slots where heat_id = v_heat.id;
        select coalesce(jsonb_agg(jsonb_build_object('position', (x ->> 'position')::int, 'entry_id', nullif(x ->> 'entry_id', '')::uuid) order by (x ->> 'position')::int), '[]'::jsonb) into v_new_slots from jsonb_array_elements(v_new_slots) x;
        if v_old_slots is distinct from v_new_slots or v_heat.number <> (h ->> 'number')::int or v_heat.round_id <> v_round then raise exception 'HEAT_STARTED'; end if;
        update public.heats set name = nullif(h ->> 'name', ''), draw_uid = h ->> 'uid' where id = v_heat.id;
        v_kept := v_kept || v_heat.id;
        continue;
      end if;
      update public.heats set round_id = v_round, number = (h ->> 'number')::int, draw_uid = h ->> 'uid', name = nullif(h ->> 'name', ''),
        duration_sec = (h ->> 'duration_sec')::int, warm_up_sec = coalesce((h ->> 'warm_up_sec')::int, 0), manual_override = coalesce((h ->> 'manual_override')::boolean, false)
      where id = v_heat.id;
      v_id := v_heat.id;
      delete from public.heat_slots where heat_id = v_id;
    else
      insert into public.heats (round_id, division_id, event_id, number, draw_uid, name, duration_sec, warm_up_sec, manual_override, status)
      values (v_round, p_division, d.event_id, (h ->> 'number')::int, h ->> 'uid', nullif(h ->> 'name', ''), (h ->> 'duration_sec')::int, coalesce((h ->> 'warm_up_sec')::int, 0), coalesce((h ->> 'manual_override')::boolean, false), 'scheduled')
      returning id into v_id;
    end if;
    v_kept := v_kept || v_id;
    for s in select * from jsonb_array_elements(v_new_slots) loop
      v_entry := nullif(s ->> 'entry_id', '')::uuid;
      if v_entry is not null and not exists (select 1 from public.entries e where e.id = v_entry and e.division_id = p_division) then raise exception 'BAD_ENTRY'; end if;
      insert into public.heat_slots (heat_id, event_id, position, entry_id, vest_colour, source, modifier)
      values (v_id, d.event_id, (s ->> 'position')::int, v_entry, nullif(s ->> 'vest_colour', ''), s -> 'source', case when s ->> 'modifier' = 'DNS' then 'DNS' end);
    end loop;
  end loop;

  -- heats and rounds that are no longer in the draw
  if exists (select 1 from public.heats x where x.division_id = p_division and x.id <> all (v_kept) and (x.status <> 'scheduled' or x.started_at is not null)) then raise exception 'HEAT_STARTED'; end if;
  delete from public.heats where division_id = p_division and id <> all (v_kept);
  delete from public.rounds where division_id = p_division and (spec ->> 'key') <> all (v_keys);

  update public.divisions set draw = p_draw, status = case when status = 'draft' then 'ready' else status end,
    draw_locked_at = case when p_action = 'generate' then null else draw_locked_at end where id = p_division;
  perform private.draw_audit(d.event_id, p_division, case p_action when 'generate' then 'draw_generated' else 'draw_edited' end, p_audit, p_audit ->> 'reason');
  perform set_config('app.draw_bypass', '', true);
end $$;
revoke all on function public.save_division_draw from public, anon, authenticated;
grant execute on function public.save_division_draw to authenticated;

-- ---------------------------------------------------------------- 5. lock, unlock, walkover
create or replace function public.lock_division_draw(p_division uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if d.draw is null then raise exception 'NO_DRAW'; end if;
  if d.draw_locked_at is not null then return; end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.divisions set draw_locked_at = now(), draw = jsonb_set(draw, '{status}', '"locked"') where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_locked', jsonb_build_object('after', jsonb_build_object('locked', true)));
end $$;

create or replace function public.unlock_division_draw(p_division uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if d.draw_locked_at is null then return; end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.divisions set draw_locked_at = null, draw = jsonb_set(draw, '{status}', '"draft"') where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_unlocked', jsonb_build_object('before', jsonb_build_object('locked', true), 'after', jsonb_build_object('locked', false)), p_reason);
end $$;

-- A rider who withdraws after the draw is locked keeps the seat as a walkover (DNS); the stored draw comes from the engine.
create or replace function public.set_draw_walkover(p_division uuid, p_entry uuid, p_draw jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.entries e where e.id = p_entry and e.division_id = p_division) then raise exception 'BAD_ENTRY'; end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.heat_slots hs set modifier = 'DNS'
  from public.heats h where hs.heat_id = h.id and h.division_id = p_division and hs.entry_id = p_entry and h.status = 'scheduled' and h.started_at is null;
  update public.divisions set draw = p_draw where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_walkover', jsonb_build_object('after', jsonb_build_object('entry', p_entry)));
end $$;

revoke all on function public.lock_division_draw, public.unlock_division_draw, public.set_draw_walkover from public, anon, authenticated;
grant execute on function public.lock_division_draw, public.unlock_division_draw, public.set_draw_walkover to authenticated;

-- ---------------------------------------------------------------- 6. schedule plans
-- One active plan per event day; switching is one transaction, so there is never a moment with two (or none).
create or replace function public.activate_schedule_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.schedule_plans;
begin
  select * into p from public.schedule_plans where id = p_plan for update;
  if not found or not private.is_event_organiser(p.event_id) then raise exception 'NOT_ALLOWED'; end if;
  update public.schedule_plans set active = false where event_id = p.event_id and day = p.day and active and id <> p_plan;
  update public.schedule_plans set active = true where id = p_plan;
  perform private.draw_audit(p.event_id, p_plan, 'plan_activated', jsonb_build_object('after', jsonb_build_object('plan', p.name, 'day', p.day)), null, 'schedule_plans');
end $$;
revoke all on function public.activate_schedule_plan from public, anon, authenticated;
grant execute on function public.activate_schedule_plan to authenticated;

-- Creating and deleting a plan leaves a line (the list of items is in the line, so a deleted plan can be read back).
create trigger z_audit after insert or delete on public.schedule_plans for each row execute function private.audit_row();
