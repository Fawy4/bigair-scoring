-- Rider sheet (judge screen, a second view beside the Queue).
--
-- A judge who sees a jump writes the score at once, on a numbered line of that rider's sheet, before the spotter has logged the attempt. Until an attempt exists on
-- that line the score is the judge's private "pending" note, saved on the server the moment it is typed. When the spotter logs the attempt it takes the rider's
-- lowest-numbered line with no attempt, and every pending note on that line becomes that judge's score on the attempt, at once: by order of logging, never by the time
-- the note was typed. A crash discards the notes on its line (judges never score crashes).
--
--   public.pending_scores        one row per judge, rider and attempt number-to-be. Read: the judge's own rows, the head judge, an observer, an organiser of the event.
--                                Written ONLY through set_line_score / clear_line_score. Never read by a public function; never counted; never published.
--   set_line_score(...)          the judge types a score on line n. A line that has an attempt gets the score as today (submit_trick_score); an empty line keeps it as a note.
--   clear_line_score(...)        the judge clears their own note on an empty line.
--   a trigger on trick_attempts  hands the notes of a new attempt's number to the judges as scores (landed), or discards them (crashed).
--   Publish is refused while a note remains (PENDING_SCORES); Submit is refused while the judge holds one (PENDING_NOTES).
--
-- A note is kept under the ATTEMPT NUMBER it waits for (its slot), not under its line. Attempt numbers are never reused (the next one is the highest number ever logged + 1),
-- so when the head judge deletes or merges an attempt, every note behind it falls one line by itself.
-- Everything here is additive: the Queue, the spotter and the head judge's functions behave exactly as before.

create table public.pending_scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  heat_id uuid not null references public.heats on delete cascade,
  entry_id uuid not null references public.entries on delete cascade,
  judge_seat_id uuid not null references public.judge_seats on delete cascade,
  slot int not null check (slot >= 1),           -- the attempt number this note waits for
  score numeric(5,2) not null check (score >= 0),
  client_key uuid not null,
  client_rev bigint not null default 0,          -- newer edits win; a late retry of an older edit is ignored
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (heat_id, entry_id, judge_seat_id, slot)
);
create index pending_scores_rider on public.pending_scores (heat_id, entry_id);
create trigger z_updated_at before update on public.pending_scores for each row execute function private.set_updated_at();

alter table public.pending_scores enable row level security;
grant select on public.pending_scores to authenticated;
create policy own_read on public.pending_scores for select to authenticated using (judge_seat_id = private.seat_id(event_id));
create policy head_read on public.pending_scores for select to authenticated using (coalesce(private.seat_role(event_id), '') = 'head');
create policy observer_read on public.pending_scores for select to authenticated using (private.is_observer(event_id));
create policy org_read on public.pending_scores for select to authenticated using (private.is_event_organiser(event_id));

alter publication supabase_realtime add table public.pending_scores;
alter table public.pending_scores replica identity full;

-- ---------------------------------------------------------------- helpers
-- The line a note waits on now: the attempts logged (not deleted) plus how far its attempt number is beyond the highest number ever logged.
create or replace function private.pending_line(p_heat uuid, p_entry uuid, p_slot int) returns int
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null)::int
       + (p_slot - coalesce((select max(a.seq) from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry), 0));
$$;

-- The matching rule for one rider: every attempt takes the notes kept under its number. Landed: each note becomes that judge's score (unless the judge already has one
-- there). Crashed, or an attempt number that no longer exists: the notes are discarded. Notes for numbers not logged yet stay.
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
      values (a.id, n.judge_seat_id, '{}', n.score, false, gen_random_uuid(), n.client_rev, n.event_id, n.heat_id)
      on conflict (attempt_id, judge_seat_id) do nothing;
      perform set_config('app.audit_action', '', true);
    end if;
    delete from public.pending_scores where id = n.id;
  end loop;
end $$;

create or replace function private.attempt_settles_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.entry_id is distinct from new.entry_id then perform private.settle_pending(old.heat_id, old.entry_id); end if;
  perform private.settle_pending(new.heat_id, new.entry_id);
  return null;
end $$;
create trigger y_settle_notes after insert or update of status, seq, entry_id on public.trick_attempts for each row execute function private.attempt_settles_notes();

-- A reset deletes the attempts (and a heat sent back to "scheduled" starts again): the notes go with them.
create or replace function private.attempt_gone_clears_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pending_scores where heat_id = old.heat_id and entry_id = old.entry_id;
  return null;
end $$;
create trigger y_clear_notes after delete on public.trick_attempts for each row execute function private.attempt_gone_clears_notes();

create or replace function private.heat_restart_clears_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pending_scores where heat_id = new.id;
  return null;
end $$;
create trigger y_clear_notes after update of status on public.heats for each row
  when (new.status = 'scheduled' and old.status is distinct from 'scheduled') execute function private.heat_restart_clears_notes();

-- Publish waits for every note: the heat cannot become "published" while a judge still holds one (whoever asks, with or without an override).
create or replace function private.heat_publish_needs_no_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  select count(*) into v_n from public.pending_scores where heat_id = new.id;
  if v_n > 0 then raise exception 'PENDING_SCORES: %', v_n; end if;
  return new;
end $$;
create trigger a_publish_needs_no_notes before update of status on public.heats for each row
  when (new.status = 'published' and old.status is distinct from 'published') execute function private.heat_publish_needs_no_notes();

-- ---------------------------------------------------------------- the judge's two calls
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
  -- the sheet types one score per line: a division that scores by criteria stays on the Queue
  if (private.division_model_setting(h.division_id, array['trick', 'entry']) #>> '{}') is distinct from 'single' then raise exception 'LINE_SCORE_NOT_AVAILABLE'; end if;
  if p_score is null then raise exception 'SCORE_REQUIRED'; end if;
  if p_line is null or p_line < 1 then raise exception 'LINE_PAST_CAP'; end if;

  -- one rider, one lock: the same lock add_attempt takes, so a note and an attempt never pass each other
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select count(*) filter (where deleted_at is null), coalesce(max(seq), 0) into v_live, v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;

  if p_line <= v_live then
    -- the line already has its attempt: this is that judge's score on it, exactly as the Queue writes it
    select * into a from public.trick_attempts where heat_id = p_heat and entry_id = p_entry and deleted_at is null order by seq offset (p_line - 1) limit 1;
    if a.status = 'crashed' then raise exception 'NOT_SCORABLE'; end if;
    ts := public.submit_trick_score(a.id, '{}'::jsonb, p_score, false, null, p_client_key, p_client_rev);
    return jsonb_build_object('kind', 'score', 'attempt_id', a.id, 'row', to_jsonb(ts));
  end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  if (v_cap is not null and p_line > v_cap) or (v_cap is null and p_line > v_live + 1) then raise exception 'LINE_PAST_CAP: %', coalesce(v_cap, v_live + 1); end if;
  perform private.check_score_value(p_heat, false, p_score, null); -- SCORE_OFF_STEP / SCORE_OUT_OF_RANGE, the same sentences as the pad
  insert into public.pending_scores as p (event_id, heat_id, entry_id, judge_seat_id, slot, score, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, v_seat, v_max + (p_line - v_live), p_score, p_client_key, p_client_rev)
  on conflict (heat_id, entry_id, judge_seat_id, slot) do update
    set score = excluded.score, client_key = excluded.client_key, client_rev = excluded.client_rev where excluded.client_rev > p.client_rev
  returning * into r;
  if r.id is null then
    select * into r from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  end if;
  return jsonb_build_object('kind', 'pending', 'row', to_jsonb(r));
end $$;

-- Clears the judge's own note on an empty line. Always allowed to its owner (even on a locked sheet), so a note can never trap a judge.
create or replace function public.clear_line_score(p_heat uuid, p_entry uuid, p_line int) returns int
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_seat uuid; v_live int; v_max int; v_n int;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null or not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = v_seat) then
    raise exception 'NOT_ALLOWED'; -- only a judge of the heat's panel (an observer, a spotter or a visitor has no notes to clear)
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select count(*) filter (where deleted_at is null), coalesce(max(seq), 0) into v_live, v_max from public.trick_attempts where heat_id = p_heat and entry_id = p_entry;
  if p_line is null or p_line <= v_live then return 0; end if;
  delete from public.pending_scores where heat_id = p_heat and entry_id = p_entry and judge_seat_id = v_seat and slot = v_max + (p_line - v_live);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- Submit: refused while the judge still holds a note (the sentence says which lines)
create or replace function public.submit_sheet(p_heat uuid) returns public.judge_sheets
language plpgsql security definer set search_path = '' as $$
declare h public.heats; s public.judge_sheets; v_seat uuid; v_block text; v_imp jsonb; v_missing int; v_locked boolean; v_notes text;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  v_seat := private.seat_id(h.event_id);
  if v_seat is null or not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = v_seat) then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into s from public.judge_sheets where heat_id = p_heat and judge_seat_id = v_seat;
  v_locked := found and s.submitted_at is not null and (s.reopened_at is null or s.submitted_at > s.reopened_at);
  if v_locked then return s; end if; -- pressing twice is harmless
  if private.heat_effective_status(p_heat) not in ('ended', 'under_review') then raise exception 'IMPRESSION_NOT_OPEN'; end if;
  select string_agg(x.entry_id::text || ':' || x.lines, ';' order by x.entry_id) into v_notes
    from (select pn.entry_id, string_agg(private.pending_line(p_heat, pn.entry_id, pn.slot)::text, ',' order by pn.slot) as lines
            from public.pending_scores pn where pn.heat_id = p_heat and pn.judge_seat_id = v_seat group by pn.entry_id) x;
  if v_notes is not null then raise exception 'PENDING_NOTES: %', v_notes; end if;
  v_imp := private.division_model_setting(h.division_id, array['heat', 'impression']);
  if v_imp is not null and jsonb_typeof(v_imp) = 'object' and coalesce((v_imp ->> 'required')::boolean, true) then
    select count(*) into v_missing from public.heat_slots hs
     where hs.heat_id = p_heat and hs.entry_id is not null and hs.modifier is null
       and not exists (select 1 from public.impression_scores i where i.heat_id = p_heat and i.entry_id = hs.entry_id and i.judge_seat_id = v_seat);
    if v_missing > 0 then raise exception 'IMPRESSION_MISSING: %', v_missing; end if;
  end if;
  insert into public.judge_sheets (event_id, heat_id, judge_seat_id, submitted_at) values (h.event_id, p_heat, v_seat, now())
  on conflict (heat_id, judge_seat_id) do update set submitted_at = now()
  returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------- Publish reads the notes too (the server words the blocker: rider and judge)
create or replace function public.publish_heat_inputs(p_heat uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.heats;
  d public.divisions;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  select * into d from public.divisions where id = h.division_id;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;

  return jsonb_build_object(
    'heat', jsonb_build_object('id', h.id, 'event_id', h.event_id, 'division_id', h.division_id, 'round_id', h.round_id, 'status', h.status, 'draw_uid', h.draw_uid, 'number', h.number, 'name', h.name),
    'latest', (select coalesce(max(r.version), 0) from public.heat_results r where r.heat_id = p_heat),
    'event_settings', (select e.settings from public.events e where e.id = h.event_id),
    'division', jsonb_build_object('id', d.id, 'scoring_model_id', d.scoring_model_id, 'scoring_overrides', d.scoring_overrides, 'panel_id', d.panel_id, 'live_settings', d.live_settings, 'draw', d.draw),
    'model', (select m.json from public.scoring_models m where m.id = d.scoring_model_id),
    'slots', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.heat_slots x where x.heat_id = p_heat),
    'attempts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_attempts x where x.heat_id = p_heat),
    'scores', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trick_scores x where x.heat_id = p_heat),
    'impressions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.impression_scores x where x.heat_id = p_heat),
    'penalties', (select coalesce(jsonb_agg(jsonb_build_object('heat_id', x.heat_id, 'entry_id', x.entry_id, 'type', x.type, 'reason', x.reason)), '[]'::jsonb) from public.penalties x where x.heat_id = p_heat),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object('payload', x.payload, 'reason', x.reason, 'at', x.at) order by x.at), '[]'::jsonb) from public.heat_decisions x where x.heat_id = p_heat and x.kind = 'tie'),
    'sheets', (select coalesce(jsonb_agg(jsonb_build_object('judge_seat_id', x.judge_seat_id, 'submitted_at', x.submitted_at, 'reopened_at', x.reopened_at)), '[]'::jsonb) from public.judge_sheets x where x.heat_id = p_heat),
    'division_heats', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'draw_uid', x.draw_uid, 'status', x.status, 'started_at', x.started_at)), '[]'::jsonb) from public.heats x where x.division_id = h.division_id),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'first_name', r.first_name, 'last_name', r.last_name)), '[]'::jsonb)
                from public.entries e join public.riders r on r.id = e.rider_id
                where e.id in (select s.entry_id from public.heat_slots s where s.heat_id = p_heat and s.entry_id is not null)),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('judge_seat_id', pm.judge_seat_id, 'seat_no', pm.seat_no) order by pm.seat_no), '[]'::jsonb) from public.panel_members pm where pm.panel_id = d.panel_id),
    'seats', (select coalesce(jsonb_agg(jsonb_build_object('id', js.id, 'name', js.name, 'active', js.active, 'status', js.status)), '[]'::jsonb)
              from public.judge_seats js where js.id in (select pm.judge_seat_id from public.panel_members pm where pm.panel_id = d.panel_id)),
    'pending', (select coalesce(jsonb_agg(jsonb_build_object('entry_id', x.entry_id, 'judge_seat_id', x.judge_seat_id, 'slot', x.slot, 'line', private.pending_line(x.heat_id, x.entry_id, x.slot)) order by x.entry_id, x.judge_seat_id, x.slot), '[]'::jsonb)
                from public.pending_scores x where x.heat_id = p_heat)
  );
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.set_line_score, public.clear_line_score, public.submit_sheet, public.publish_heat_inputs from public, anon;
grant execute on function public.set_line_score, public.clear_line_score, public.submit_sheet, public.publish_heat_inputs to authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
