-- Rider sheets: the spotter's sheet (lines that log themselves) and the judges' sheet line by line.
-- Everything here is additive: no table, column or function is dropped or renamed, and nothing PR "Console – Walkover" replaced is touched.
--
--   1. spotter_edit_attempt(...)  The spotter's seat may change the trick, direction and crash of the attempts IT logged, until the heat is published. Judges' scores stay
--                                 on the attempt (as when the head judge edits one). Every change leaves an audit line ("attempt_edited_by_spotter", before and after).
--                                 Refused: a judge, an observer, the head judge and organisers (they have edit_attempt), another spotter, another event's spotter, a visitor.
--   2. pending_scores.missed      A judge who did not see an attempt marks its line Missed, also on a line the spotter has not logged yet: the note is "Missed", and the
--      set_line_missed(...)       attempt that takes the line gets "no score from that judge" (a Missed score), exactly as Missed on the Queue.
--      settle_pending / set_line_score are re-stated below ONLY to carry the new column (same behaviour for a score).

-- ---------------------------------------------------------------- 1. Missed on the Rider sheet
alter table public.pending_scores add column missed boolean not null default false;  -- a Missed note keeps score 0 (the column stays not null); readers look at `missed`

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
      values (a.id, n.judge_seat_id, '{}', case when n.missed then null else n.score end, n.missed, gen_random_uuid(), n.client_rev, n.event_id, n.heat_id)
      on conflict (attempt_id, judge_seat_id) do nothing;
      perform set_config('app.audit_action', '', true);
    end if;
    delete from public.pending_scores where id = n.id;
  end loop;
end $$;

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
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 1) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 1); end if;
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

-- "I did not see this attempt": Missed on line n. A line that has its attempt gets Missed as the Queue gives it (no score from this judge); an empty line keeps a Missed
-- note, which the attempt that takes the line turns into the same thing. Same doors as a typed score: the judge's panel, a heat that accepts scores, a one-score division.
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
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 1) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 1); end if;
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

-- ---------------------------------------------------------------- 2. the spotter corrects what its own lines logged
-- Null leaves a field as it is, except with p_set_trick: then the trick fields are replaced as given (a free-text trick has no category, for instance).
create or replace function public.spotter_edit_attempt(
  p_client_key uuid, p_set_trick boolean default false, p_trick_name text default null, p_trick_parts jsonb default null, p_category text default null,
  p_raw_text text default null, p_input_method text default null, p_status text default null, p_direction text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; h public.heats; v_row public.trick_attempts; v_new public.trick_attempts;
begin
  select * into a from public.trick_attempts where client_key = p_client_key for update;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  -- only the spotter seat that logged it (an observer, a judge, another spotter, another event's seat and a visitor are all refused)
  if coalesce(private.seat_role(a.event_id), '') <> 'spotter' or a.created_by_seat is null or a.created_by_seat is distinct from private.seat_id(a.event_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into h from public.heats where id = a.heat_id;
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if h.status = 'cancelled' then raise exception 'HEAT_CANCELLED'; end if;
  if p_status is not null and p_status not in ('landed', 'crashed') then raise exception 'BAD_STATUS'; end if;
  if p_direction is not null and p_direction not in ('left', 'right') then raise exception 'BAD_DIRECTION'; end if;

  v_new := a;
  if p_set_trick then
    v_new.trick_name := p_trick_name;
    v_new.trick_parts := coalesce(p_trick_parts, '{}'::jsonb);
    v_new.category_key := p_category;
    v_new.raw_text := p_raw_text;
    v_new.input_method := coalesce(p_input_method, a.input_method);
  end if;
  v_new.status := coalesce(p_status, a.status);
  v_new.direction := coalesce(p_direction, a.direction);
  if (v_new.trick_name, v_new.trick_parts, v_new.category_key, v_new.raw_text, v_new.input_method, v_new.status, v_new.direction)
     is not distinct from (a.trick_name, a.trick_parts, a.category_key, a.raw_text, a.input_method, a.status, a.direction) then
    return a; -- nothing changed: no second write, no audit line
  end if;
  perform private.audit_ctx('attempt_edited_by_spotter', '');
  update public.trick_attempts
     set trick_name = v_new.trick_name, trick_parts = v_new.trick_parts, category_key = v_new.category_key, raw_text = v_new.raw_text,
         input_method = coalesce(nullif(v_new.input_method, ''), 'builder'), status = v_new.status, direction = v_new.direction
   where id = a.id returning * into v_row;
  perform private.audit_ctx('', '');
  return v_row;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.set_line_missed, public.spotter_edit_attempt from public, anon;
grant execute on function public.set_line_missed, public.spotter_edit_attempt to authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
