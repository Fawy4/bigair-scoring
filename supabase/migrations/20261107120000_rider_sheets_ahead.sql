-- Rider sheets, last round: a judge never waits for the spotter, also in a division with no attempt limit.
-- Everything here only ALLOWS more, so the live site (0.19.0) is unaffected; nothing is dropped or renamed and none of #44's functions is touched.
--
--   1. set_line_score / set_line_missed  restated with ONE check relaxed: with no attempt limit a judge may score (or set Missed) up to 10 lines past the attempts the
--                                        spotter has logged for the rider (the 10 lines the sheet starts with), instead of 1. Divisions with a limit are unchanged.
--   2. clear_line_missed (new)           "Missed is a switch": a judge turns their own Missed off on a line that already has its attempt (a judge cannot delete a score
--                                        row, and a Missed note on an empty line is cleared by clear_line_score as before). Only a Missed score is removed, never a number.
--   3. trick_scores replica identity     full, so the removal reaches the other phones and the console through the filtered realtime channel (as pending_scores does).

-- ---------------------------------------------------------------- 1. the relaxed check
create or replace function public.set_line_score(p_heat uuid, p_entry uuid, p_line int, p_score numeric, p_client_key uuid, p_client_rev bigint)
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
  if (private.division_model_setting(h.division_id, array['trick', 'entry']) #>> '{}') is distinct from 'single' then raise exception 'LINE_SCORE_NOT_AVAILABLE'; end if;
  if p_score is null then raise exception 'SCORE_REQUIRED'; end if;
  if p_line is null or p_line < 1 then raise exception 'LINE_PAST_CAP'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select count(*) filter (where deleted_at is null), coalesce(max(seq), 0) into v_live, v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;

  if p_line <= v_live then
    select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and deleted_at is null order by seq offset (p_line - 1) limit 1;
    if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
    ts := public.submit_trick_score(a.id, '{}'::jsonb, p_score, false, null, p_client_key, p_client_rev);
    return jsonb_build_object('kind', 'score', 'attempt_id', a.id, 'row', to_jsonb(ts));
  end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 10) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 10); end if;
  perform private.check_score_value(p_heat, false, p_score, null);
  insert into public.pending_scores as p (event_id, heat_id, entry_id, judge_seat_id, slot, score, missed, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, v_seat, v_max + (p_line - v_live), p_score, false, p_client_key, p_client_rev)
  on conflict (heat_id, entry_id, judge_seat_id, slot) do update
    set score = excluded.score, missed = false, client_key = excluded.client_key, client_rev = excluded.client_rev where excluded.client_rev > p.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  end if;
  return jsonb_build_object('kind', 'pending', 'row', to_jsonb(r));
end $$;

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
  if (private.division_model_setting(h.division_id, array['trick', 'entry']) #>> '{}') is distinct from 'single' then raise exception 'LINE_SCORE_NOT_AVAILABLE'; end if;
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
  insert into public.pending_scores as p (event_id, heat_id, entry_id, judge_seat_id, slot, score, missed, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, v_seat, v_max + (p_line - v_live), 0, true, p_client_key, p_client_rev)
  on conflict (heat_id, entry_id, judge_seat_id, slot) do update
    set score = 0, missed = true, client_key = excluded.client_key, client_rev = excluded.client_rev where excluded.client_rev > p.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  end if;
  return jsonb_build_object('kind', 'pending', 'row', to_jsonb(r));
end $$;


-- ---------------------------------------------------------------- 2. Missed off, on a line that has its attempt
create or replace function public.clear_line_missed(p_heat uuid, p_entry uuid, p_line int) returns int
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_seat uuid; v_block text; a public.trick_attempts; v_n int;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null or not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = v_seat) then
    raise exception 'NOT_ALLOWED'; -- only a judge of the heat's panel
  end if;
  v_block := private.judge_write_block(p_heat, false); -- a locked sheet, a heat that is not open
  if v_block is not null then raise exception '%', v_block; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  if p_line is null or p_line < 1 then return 0; end if;
  select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and deleted_at is null order by seq offset (p_line - 1) limit 1;
  if not found then return 0; end if; -- an empty line: its Missed note is cleared by clear_line_score
  perform set_config('app.audit_action', 'missed_cleared', true);
  delete from public.trick_scores where attempt_id = a.id and judge_seat_id = v_seat and missed;
  get diagnostics v_n = row_count;
  perform set_config('app.audit_action', '', true);
  return v_n;
end $$;

-- ---------------------------------------------------------------- 3. the removal reaches the other phones
alter table public.trick_scores replica identity full;

-- ---------------------------------------------------------------- grants
revoke all on function public.set_line_score, public.set_line_missed, public.clear_line_missed from public, anon;
grant execute on function public.set_line_score, public.set_line_missed, public.clear_line_missed to authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
