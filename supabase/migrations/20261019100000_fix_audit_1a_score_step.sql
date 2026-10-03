-- Fix session 1 (audit 1a, finding A1a-3) — the database refuses a score that is not on the division's scale.
--
-- Before this, a judge's score was checked only by the pad on the phone (and, for the head judge, by a server action). The database accepted any
-- number (numeric(5,2)), so a stale app, a hand-built request or a direct table write could store 7.25 on a 0.1 step. The scoring engine no longer
-- blanks a heat for such a value (it rounds it and says so), but the value should never be stored. Now every write path checks it:
--   submit_trick_score, submit_impression      (a judge; the simulator's virtual judges call these)
--   head_set_trick_score, head_set_impression  (the head judge: a correction or a sheet typed in)
--   a trigger on trick_scores and impression_scores for anyone writing the tables directly as a signed-in user
-- The scale is the division's own (the model with the division's overrides), read with private.division_model_setting.
-- Refusals use the live screens' error pattern: 'CODE: detail', the sentence and its "Learn more" link come from the code.
--   SCORE_OFF_STEP: <step>|<nearest value below>|<nearest value above>      e.g. SCORE_OFF_STEP: 0.1|7.2|7.3
--   SCORE_OUT_OF_RANGE: <lowest>|<highest>                                   e.g. SCORE_OUT_OF_RANGE: 0|10
-- The check is skipped for missed / Absent marks (they carry no value), for a null value (other rules handle "no score"), and when the division's model has no
-- scale to check against (no Impression scale, an entry type with no trick scale): the database then behaves as it did before.

create or replace function private.check_on_scale(p_value numeric, p_scale jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_min numeric := coalesce((p_scale->>'min')::numeric, 0);
  v_max numeric := (p_scale->>'max')::numeric;
  v_step numeric := (p_scale->>'step')::numeric;
  v_steps numeric; v_top numeric; v_lo numeric; v_hi numeric;
begin
  if p_value is null or p_scale is null then return; end if;
  if p_value = 'NaN'::numeric or p_value < v_min or (v_max is not null and p_value > v_max) then
    raise exception 'SCORE_OUT_OF_RANGE: %|%', trim_scale(v_min), trim_scale(coalesce(v_max, v_min));
  end if;
  if v_step is null or v_step <= 0 then return; end if;
  v_steps := (p_value - v_min) / v_step;
  if abs(v_steps - round(v_steps)) > 0.000001 then
    v_top := case when v_max is null then null else v_min + floor((v_max - v_min) / v_step + 0.000001) * v_step end;
    v_lo := v_min + floor(v_steps) * v_step;
    v_hi := v_min + ceil(v_steps) * v_step;
    if v_top is not null then v_hi := least(v_hi, v_top); v_lo := least(v_lo, v_top); end if;
    raise exception 'SCORE_OFF_STEP: %|%|%', trim_scale(v_step), trim_scale(v_lo), trim_scale(v_hi);
  end if;
end $$;

-- One judge's trick score (a single mark or the criteria values) or Impression / Variety score, against the heat's division scale.
create or replace function private.check_score_value(p_heat uuid, p_impression boolean, p_score numeric, p_criteria jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_division uuid; v_entry text; v_trick_scale jsonb; v_scale jsonb; c jsonb; v_key text; v_val numeric;
begin
  select division_id into v_division from public.heats where id = p_heat;
  if v_division is null then return; end if;
  if p_impression then
    v_scale := private.division_model_setting(v_division, array['heat', 'impression', 'scale']);
    if v_scale is null then return; end if; -- a model with no Impression scale: nothing to check against (as before)
    perform private.check_on_scale(p_score, v_scale);
    return;
  end if;
  v_entry := private.division_model_setting(v_division, array['trick', 'entry']) #>> '{}';
  v_trick_scale := private.division_model_setting(v_division, array['trick', 'scale']);
  if v_entry = 'criteria' then
    for c in select jsonb_array_elements(coalesce(private.division_model_setting(v_division, array['trick', 'criteria']), '[]'::jsonb)) loop
      v_key := c->>'key';
      if p_criteria is null or not (p_criteria ? v_key) or jsonb_typeof(p_criteria->v_key) = 'null' then continue; end if;
      if jsonb_typeof(p_criteria->v_key) <> 'number' then raise exception 'SCORE_OUT_OF_RANGE: %|%', trim_scale(coalesce((v_trick_scale->>'min')::numeric, 0)), trim_scale(coalesce((v_trick_scale->>'max')::numeric, 0)); end if;
      v_val := (p_criteria->>v_key)::numeric;
      perform private.check_on_scale(v_val, coalesce(c->'scale', v_trick_scale));
    end loop;
  elsif v_entry = 'single' then
    perform private.check_on_scale(p_score, v_trick_scale);
  end if;
end $$;

revoke all on function private.check_on_scale(numeric, jsonb), private.check_score_value(uuid, boolean, numeric, jsonb) from public;
grant execute on function private.check_on_scale(numeric, jsonb), private.check_score_value(uuid, boolean, numeric, jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- the four write functions (each: the same function as before + one check)
create or replace function public.submit_trick_score(
  p_attempt uuid, p_criteria jsonb, p_score numeric, p_missed boolean, p_flag text, p_client_key uuid, p_client_rev bigint
) returns public.trick_scores
language plpgsql security invoker set search_path = '' as $$
declare a public.trick_attempts; r public.trick_scores; v_seat uuid; v_block text;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  v_seat := private.seat_id(a.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  -- judges never score a crash (owner, 1 Oct 2026); a judge who saw a landing flags it and the head judge switches it
  if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
  v_block := private.judge_write_block(a.heat_id, false);
  if v_block is not null then raise exception '%', v_block; end if;
  if not coalesce(p_missed, false) then perform private.check_score_value(a.heat_id, false, p_score, p_criteria); end if; -- A1a-3
  insert into public.trick_scores as ts (attempt_id, judge_seat_id, criteria, score, missed, flag, client_key, client_rev, edited_by, event_id, heat_id)
  values (p_attempt, v_seat, coalesce(p_criteria, '{}'), case when p_missed then null else p_score end, coalesce(p_missed, false), p_flag,
          p_client_key, p_client_rev, auth.uid(), a.event_id, a.heat_id)
  on conflict (attempt_id, judge_seat_id) do update
    set criteria = excluded.criteria, score = excluded.score, missed = excluded.missed, flag = excluded.flag,
        client_key = excluded.client_key, client_rev = excluded.client_rev, version = ts.version + 1, edited_by = auth.uid()
    where excluded.client_rev > ts.client_rev
  returning * into r;
  if r.id is null then -- an older queued edit arrived late: keep the newer mark
    select * into r from public.trick_scores where attempt_id = p_attempt and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

create or replace function public.submit_impression(p_heat uuid, p_entry uuid, p_value numeric, p_client_key uuid, p_client_rev bigint)
returns public.impression_scores
language plpgsql security invoker set search_path = '' as $$
declare h public.heats; r public.impression_scores; v_seat uuid; v_block text;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  v_block := private.judge_write_block(p_heat, true);
  if v_block is not null then raise exception '%', v_block; end if;
  if not exists (select 1 from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if p_value is null then raise exception 'SCORE_REQUIRED'; end if;
  perform private.check_score_value(p_heat, true, p_value, null); -- A1a-3
  insert into public.impression_scores as i (heat_id, entry_id, judge_seat_id, value, missed, client_key, client_rev, event_id)
  values (p_heat, p_entry, v_seat, p_value, false, p_client_key, p_client_rev, h.event_id)
  on conflict (heat_id, entry_id, judge_seat_id) do update
    set value = excluded.value, missed = false, client_key = excluded.client_key, client_rev = excluded.client_rev
    where excluded.client_rev > i.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.impression_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat;
  end if;
  return r;
end $$;

create or replace function public.head_set_trick_score(p_attempt uuid, p_seat uuid, p_score numeric, p_criteria jsonb, p_missed boolean, p_reason text)
returns public.trick_scores
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; h public.heats; r public.trick_scores; v_missed boolean := coalesce(p_missed, false);
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  h := private.head_heat(a.heat_id, array['running', 'paused', 'ended', 'under_review'], p_reason);
  if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
  if not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = p_seat) then
    raise exception 'NOT_ON_PANEL';
  end if;
  if not v_missed and p_score is null then raise exception 'SCORE_REQUIRED'; end if;
  if not v_missed then perform private.check_score_value(a.heat_id, false, p_score, p_criteria); end if; -- A1a-3
  perform private.audit_ctx('score_edited', p_reason);
  insert into public.trick_scores as ts (event_id, heat_id, attempt_id, judge_seat_id, criteria, score, missed, client_key, client_rev, edited_by, edit_reason)
  values (a.event_id, a.heat_id, a.id, p_seat, coalesce(p_criteria, '{}'), case when v_missed then null else p_score end, v_missed,
          gen_random_uuid(), 9000000000000000, auth.uid(), btrim(p_reason))
  on conflict (attempt_id, judge_seat_id) do update
    set criteria = excluded.criteria, score = excluded.score, missed = excluded.missed, client_key = excluded.client_key, client_rev = 9000000000000000,
        version = ts.version + 1, edited_by = auth.uid(), edit_reason = excluded.edit_reason
  returning * into r;
  perform private.audit_ctx('', '');
  return r;
end $$;

create or replace function public.head_set_impression(p_heat uuid, p_entry uuid, p_seat uuid, p_value numeric, p_reason text, p_missed boolean default false)
returns public.impression_scores
language plpgsql security definer set search_path = '' as $$
declare h public.heats; r public.impression_scores; v_missed boolean := coalesce(p_missed, false);
begin
  h := private.head_heat(p_heat, array['ended', 'under_review'], p_reason);
  if not exists (select 1 from public.heat_slots s where s.heat_id = p_heat and s.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = p_seat) then
    raise exception 'NOT_ON_PANEL';
  end if;
  if not v_missed and (p_value is null or p_value < 0) then raise exception 'SCORE_REQUIRED'; end if;
  if not v_missed then perform private.check_score_value(p_heat, true, p_value, null); end if; -- A1a-3
  perform private.audit_ctx('impression_set', p_reason);
  insert into public.impression_scores as i (event_id, heat_id, entry_id, judge_seat_id, value, missed, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, p_seat, case when v_missed then null else p_value end, v_missed, gen_random_uuid(), 9000000000000000)
  on conflict (heat_id, entry_id, judge_seat_id) do update
    set value = excluded.value, missed = excluded.missed, client_key = excluded.client_key, client_rev = 9000000000000000
  returning * into r;
  perform private.audit_ctx('', '');
  return r;
end $$;

-- ---------------------------------------------------------------- direct writes to the tables
-- The row policies let a seat write trick_scores / impression_scores itself. A write by a signed-in user (role authenticated or anon) passes the same check;
-- the functions above run as the database owner, which is why they carry their own check, and so do restores of a reset (they run as the owner too).
create or replace function private.scores_on_scale_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_table_name = 'impression_scores' then
    if not coalesce(new.missed, false) then perform private.check_score_value(new.heat_id, true, new.value, null); end if;
  elsif not coalesce(new.missed, false) then
    perform private.check_score_value(new.heat_id, false, new.score, new.criteria);
  end if;
  return new;
end $$;

drop trigger if exists b_scores_on_scale on public.trick_scores;
create trigger b_scores_on_scale before insert or update of score, criteria, missed on public.trick_scores for each row execute function private.scores_on_scale_guard();
drop trigger if exists b_scores_on_scale on public.impression_scores;
create trigger b_scores_on_scale before insert or update of value, missed on public.impression_scores for each row execute function private.scores_on_scale_guard();
