-- Rider sheet in a division scored by criteria (0.24.0). Officials see the Rider sheet only; a criteria division gets one box per criterion on each line.
-- Everything here is additive: nothing is dropped or renamed, and the Queue's own write (submit_trick_score) is not touched.
--
--   1. pending_scores.criteria   the value of every criterion a judge typed ahead of the spotter (empty for a one-score division). The note's `score` is the trick score
--                                the phone worked out from them (exactly as the Queue sends it), so the console, Publish and Submit read the note as they always did.
--   2. settle_pending            restated ONLY to carry the criteria: the attempt that takes the note gets the judge's score with the criteria values, as the Queue writes it.
--   3. set_line_criteria (new)   the judge's whole line in a criteria division, once every criterion has a value. A line that has its attempt gets the score through
--                                submit_trick_score (the Queue's own function); an empty line keeps it as the judge's private note. A partly filled line is never sent:
--                                it waits on the phone until the last box is typed. Same doors as set_line_score: that judge's own seat, a heat that accepts scores.
--   4. set_line_missed           restated with ONE check relaxed: Missed also works in a criteria division (a Missed score has no criteria, exactly as on the Queue).

-- ---------------------------------------------------------------- 1. the column
alter table public.pending_scores add column criteria jsonb not null default '{}';

-- ---------------------------------------------------------------- 2. the matching rule carries the criteria
create or replace function private.settle_pending(p_heat uuid, p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.pending_scores; a public.trick_attempts; v_max int;
begin
  select coalesce(max(seq), 0) into v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;
  for n in select * from public.pending_scores where heat_id = p_heat and entry_id = p_entry and slot <= v_max order by slot, judge_seat_id loop
    select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and seq = n.slot and deleted_at is null;
    if found and a.status = 'landed' then
      perform set_config('app.audit_action', 'score_from_note', true);
      insert into public.trick_scores (attempt_id, judge_seat_id, criteria, score, missed, client_key, client_rev, event_id, heat_id)
      values (a.id, n.judge_seat_id, case when n.missed then '{}'::jsonb else n.criteria end, case when n.missed then null else n.score end, n.missed, gen_random_uuid(), n.client_rev, n.event_id, n.heat_id)
      on conflict (attempt_id, judge_seat_id) do nothing;
      perform set_config('app.audit_action', '', true);
    end if;
    delete from public.pending_scores where id = n.id;
  end loop;
end $$;

-- ---------------------------------------------------------------- 3. the criteria line
create or replace function public.set_line_criteria(p_heat uuid, p_entry uuid, p_line int, p_criteria jsonb, p_score numeric, p_client_key uuid, p_client_rev bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; v_seat uuid; v_block text; v_cap int; v_live int; v_max int; a public.trick_attempts; r public.pending_scores; ts public.trick_scores; c jsonb;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  v_block := private.judge_write_block(p_heat, false);
  if v_block is not null then raise exception '%', v_block; end if;
  if not exists (select 1 from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  -- only a division scored by criteria takes criteria; a one-score division has set_line_score
  if (private.division_model_setting(h.division_id, array['trick', 'entry']) #>> '{}') is distinct from 'criteria' then raise exception 'LINE_SCORE_NOT_AVAILABLE'; end if;
  if p_score is null or p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then raise exception 'SCORE_REQUIRED'; end if;
  -- every criterion of the division's model must have a number (the phone sends a line only when it is complete)
  for c in select jsonb_array_elements(coalesce(private.division_model_setting(h.division_id, array['trick', 'criteria']), '[]'::jsonb)) loop
    if not (p_criteria ? (c->>'key')) or jsonb_typeof(p_criteria->(c->>'key')) <> 'number' then raise exception 'SCORE_REQUIRED'; end if;
  end loop;
  if p_line is null or p_line < 1 then raise exception 'LINE_PAST_CAP'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select count(*) filter (where deleted_at is null), coalesce(max(seq), 0) into v_live, v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;

  if p_line <= v_live then
    -- the line already has its attempt: the judge's score on it, exactly as the Queue writes it (same function, same checks)
    select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and deleted_at is null order by seq offset (p_line - 1) limit 1;
    if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
    ts := public.submit_trick_score(a.id, p_criteria, p_score, false, null, p_client_key, p_client_rev);
    return jsonb_build_object('kind', 'score', 'attempt_id', a.id, 'row', to_jsonb(ts));
  end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 10) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 10); end if;
  perform private.check_score_value(p_heat, false, p_score, p_criteria); -- each criterion on its own range and step: SCORE_OFF_STEP / SCORE_OUT_OF_RANGE
  insert into public.pending_scores as p (event_id, heat_id, entry_id, judge_seat_id, slot, score, missed, criteria, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, v_seat, v_max + (p_line - v_live), p_score, false, p_criteria, p_client_key, p_client_rev)
  on conflict (heat_id, entry_id, judge_seat_id, slot) do update
    set score = excluded.score, missed = false, criteria = excluded.criteria, client_key = excluded.client_key, client_rev = excluded.client_rev where excluded.client_rev > p.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  end if;
  return jsonb_build_object('kind', 'pending', 'row', to_jsonb(r));
end $$;

-- ---------------------------------------------------------------- 4. Missed also in a criteria division
create or replace function public.set_line_missed(p_heat uuid, p_entry uuid, p_line int, p_client_key uuid, p_client_rev bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; v_seat uuid; v_block text; v_cap int; v_live int; v_max int; a public.trick_attempts; r public.pending_scores; ts public.trick_scores;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null then raise exception 'NOT_ALLOWED'; end if;
  v_block := private.judge_write_block(p_heat, false);
  if v_block is not null then raise exception '%', v_block; end if;
  if not exists (select 1 from public.heat_slots hs where hs.heat_id = p_heat and hs.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if (private.division_model_setting(h.division_id, array['trick', 'entry']) #>> '{}') not in ('single', 'criteria') then raise exception 'LINE_SCORE_NOT_AVAILABLE'; end if;
  if p_line is null or p_line < 1 then raise exception 'LINE_PAST_CAP'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select count(*) filter (where deleted_at is null), coalesce(max(seq), 0) into v_live, v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;

  if p_line <= v_live then
    select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and deleted_at is null order by seq offset (p_line - 1) limit 1;
    if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
    ts := public.submit_trick_score(a.id, '{}'::jsonb, null, true, null, p_client_key, p_client_rev);
    return jsonb_build_object('kind', 'score', 'attempt_id', a.id, 'row', to_jsonb(ts));
  end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 10) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 10); end if;
  insert into public.pending_scores as p (event_id, heat_id, entry_id, judge_seat_id, slot, score, missed, criteria, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, v_seat, v_max + (p_line - v_live), 0, true, '{}', p_client_key, p_client_rev)
  on conflict (heat_id, entry_id, judge_seat_id, slot) do update
    set score = 0, missed = true, criteria = '{}', client_key = excluded.client_key, client_rev = excluded.client_rev where excluded.client_rev > p.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  end if;
  return jsonb_build_object('kind', 'pending', 'row', to_jsonb(r));
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.set_line_criteria, public.set_line_missed from public, anon;
grant execute on function public.set_line_criteria, public.set_line_missed to authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
