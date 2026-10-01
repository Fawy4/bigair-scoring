-- Phase 5c, steps 4 and 5: the head judge's tools (edit a score, merge, edit an attempt, rider status, tie decision, flag-out, review, re-open)
-- and Publish as ONE transaction that is safe to press twice.
--
--   1. helpers: who is "head", the shared guard of every head function, the audit helpers
--   2. heat_decisions: tie decisions and publish overrides (append-only)
--   3. the head functions (each checks the caller itself, asks for a reason where the plan says so, and writes an audit line)
--   4. add_attempt: past the cap only for the head judge, or an organiser when the event has no active head judge
--   5. review_heat, reopen_heat
--   6. publish_heat_commit (service role only: the server computes the result, the database writes it atomically)
--   7. realtime

-- ---------------------------------------------------------------- 1. helpers
create or replace function public.am_i_head(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.can_run_heat(p_event) $$;

create or replace function private.event_has_active_head(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.judge_seats s where s.event_id = p_event and s.role = 'head' and s.active and s.status = 'active');
$$;

-- What the audit trigger of a table records for the next write: the action word and the reason (reset after the write).
create or replace function private.audit_ctx(p_action text, p_reason text) returns void
language plpgsql as $$
begin
  perform set_config('app.audit_action', coalesce(p_action, ''), true);
  perform set_config('app.reason', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), ''), true);
end $$;

-- An audit line for a change whose table has no audit trigger of its own.
create or replace function private.head_audit(p_event uuid, p_table text, p_row uuid, p_action text, p_before jsonb, p_after jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (p_event, auth.uid(), private.seat_id(p_event), p_action, p_table, p_row, p_before, p_after, nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

-- The shared door of the head functions: the heat exists, the caller is the head judge or an organiser, a reason is given (when asked for),
-- and the heat is in a state where the change makes sense. The heat is locked for the rest of the transaction.
create or replace function private.head_heat(p_heat uuid, p_states text[], p_reason text default null, p_need_reason boolean default true) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_eff text;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_need_reason and (p_reason is null or char_length(btrim(p_reason)) < 3) then raise exception 'REASON_REQUIRED'; end if;
  v_eff := private.heat_effective_status(p_heat);
  if not (v_eff = any (p_states)) then
    raise exception '%', case h.status when 'published' then 'HEAT_PUBLISHED' when 'cancelled' then 'HEAT_CANCELLED' else 'HEAT_NOT_EDITABLE' end;
  end if;
  return h;
end $$;

-- A judge's sheet counts as submitted when it was submitted and not re-opened since.
create or replace function private.unsubmitted_judges(p_heat uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.heats h
  join public.divisions d on d.id = h.division_id
  join public.panel_members pm on pm.panel_id = d.panel_id
  join public.judge_seats js on js.id = pm.judge_seat_id and js.active and js.status = 'active'
  where h.id = p_heat
    and not exists (select 1 from public.judge_sheets s
                    where s.heat_id = p_heat and s.judge_seat_id = pm.judge_seat_id and s.submitted_at is not null
                      and (s.reopened_at is null or s.submitted_at > s.reopened_at));
$$;

-- ---------------------------------------------------------------- 2. decisions (a tie order, a publish override): written once, never changed
create table public.heat_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  heat_id uuid not null references public.heats on delete cascade,
  kind text not null check (kind in ('tie', 'publish_override')),
  payload jsonb not null default '{}',
  reason text,
  by_user uuid,
  by_seat uuid references public.judge_seats on delete set null,
  at timestamptz not null default now()
);
create index on public.heat_decisions (event_id);
create index on public.heat_decisions (heat_id);
create index on public.heat_decisions (by_seat);

create or replace function private.decisions_append_only() returns trigger
language plpgsql as $$
begin
  -- a cascade from deleting a heat or an event is not somebody editing the record
  if tg_op = 'DELETE' and (pg_trigger_depth() > 1 or current_setting('app.allow_purge', true) = 'on') then return old; end if;
  raise exception 'APPEND_ONLY: % on % is not allowed', tg_op, tg_table_name;
end $$;
create trigger a_append_only before update or delete on public.heat_decisions for each row execute function private.decisions_append_only();

alter table public.heat_decisions enable row level security;
grant select on public.heat_decisions to authenticated;
create policy head_read on public.heat_decisions for select to authenticated using (coalesce(private.seat_role(event_id), '') = 'head');
create policy org_read on public.heat_decisions for select to authenticated using (private.is_event_organiser(event_id));

-- ---------------------------------------------------------------- 3. the head functions
-- Change one judge's score of an attempt, enter a score a judge never gave (paper sheets), or mark a judge absent for one attempt (Missed + reason "Absent").
-- The head judge's value wins over any older edit still queued on a judge's phone.
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

-- Paper sheets, typed in ("tabulator mode"): one judge's Impression / Variety score for one rider.
create or replace function public.head_set_impression(p_heat uuid, p_entry uuid, p_seat uuid, p_value numeric, p_reason text)
returns public.impression_scores
language plpgsql security definer set search_path = '' as $$
declare h public.heats; r public.impression_scores;
begin
  h := private.head_heat(p_heat, array['ended', 'under_review'], p_reason);
  if not exists (select 1 from public.heat_slots s where s.heat_id = p_heat and s.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = p_seat) then
    raise exception 'NOT_ON_PANEL';
  end if;
  if p_value is null or p_value < 0 then raise exception 'SCORE_REQUIRED'; end if;
  perform private.audit_ctx('impression_set', p_reason);
  insert into public.impression_scores as i (event_id, heat_id, entry_id, judge_seat_id, value, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, p_seat, p_value, gen_random_uuid(), 9000000000000000)
  on conflict (heat_id, entry_id, judge_seat_id) do update set value = excluded.value, client_key = excluded.client_key, client_rev = 9000000000000000
  returning * into r;
  perform private.audit_ctx('', '');
  return r;
end $$;

-- Edit an attempt: another rider (it takes that rider's next number), the trick, direction, category, landed or crashed. Null leaves a field as it is.
-- A crash switched to a landing resolves the judge's "That was a landing" flag (the pads then appear on the judge phones through realtime).
-- Moving it to a rider who is out of attempts is a cap override: the head judge, or an organiser when the event has no active head judge; the reason is the override reason.
create or replace function public.edit_attempt(
  p_attempt uuid, p_reason text, p_entry uuid default null, p_trick_name text default null, p_trick_parts jsonb default null,
  p_category text default null, p_status text default null, p_direction text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare
  a public.trick_attempts; h public.heats; slot public.heat_slots; v_row public.trick_attempts;
  v_entry uuid; v_seq int; v_cap int; v_used int; v_action text := 'attempt_edited';
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found or a.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  h := private.head_heat(a.heat_id, array['running', 'paused', 'ended', 'under_review'], p_reason);
  if p_status is not null and p_status not in ('landed', 'crashed') then raise exception 'BAD_STATUS'; end if;
  if p_direction is not null and p_direction not in ('left', 'right') then raise exception 'BAD_DIRECTION'; end if;
  v_entry := a.entry_id;
  v_seq := a.seq;
  if p_entry is not null and p_entry <> a.entry_id then
    select * into slot from public.heat_slots where heat_id = a.heat_id and entry_id = p_entry;
    if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
    if slot.modifier is not null or slot.flagged_out then raise exception 'RIDER_NOT_RIDING'; end if;
    perform pg_advisory_xact_lock(hashtextextended(a.heat_id::text || p_entry::text, 0));
    v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
    select count(*) into v_used from public.trick_attempts x where x.heat_id = a.heat_id and x.entry_id = p_entry and x.deleted_at is null;
    if v_cap is not null and v_used >= v_cap then
      if not (coalesce(private.seat_role(h.event_id), '') = 'head' or (private.is_event_organiser(h.event_id) and not private.event_has_active_head(h.event_id))) then
        raise exception 'NOT_ALLOWED';
      end if;
      v_action := 'attempt_cap_override';
    end if;
    select coalesce(max(x.seq), 0) + 1 into v_seq from public.trick_attempts x where x.heat_id = a.heat_id and x.entry_id = p_entry;
    v_entry := p_entry;
  end if;
  perform private.audit_ctx(v_action, p_reason);
  update public.trick_attempts
     set entry_id = v_entry, seq = v_seq, trick_name = coalesce(p_trick_name, trick_name), trick_parts = coalesce(p_trick_parts, trick_parts),
         category_key = coalesce(p_category, category_key), status = coalesce(p_status, status), direction = coalesce(p_direction, direction)
   where id = p_attempt returning * into v_row;
  perform private.audit_ctx('', '');
  if p_status = 'landed' and a.status = 'crashed' then
    update public.attempt_flags set resolved_at = now(), resolved_by = auth.uid(), resolution = 'Switched to landed: ' || btrim(p_reason)
     where attempt_id = a.id and resolved_at is null and kind = 'landed';
  elsif p_status = 'crashed' and a.status = 'landed' then
    update public.attempt_flags set resolved_at = now(), resolved_by = auth.uid(), resolution = 'Switched to crashed: ' || btrim(p_reason)
     where attempt_id = a.id and resolved_at is null and kind = 'crash';
  end if;
  return v_row;
end $$;

-- Two attempts that are one: keep the first-logged (the caller passes it as p_keep), move the other's scores over for judges who have none there, and for a judge who
-- answered on both keep the kept attempt's score unless p_choices says { "<judge seat id>": "drop" }. Then the dropped attempt is soft-deleted.
create or replace function public.merge_attempts(p_keep uuid, p_drop uuid, p_choices jsonb, p_reason text) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare k public.trick_attempts; d public.trick_attempts; h public.heats; s public.trick_scores; v_choice text; v_row public.trick_attempts;
begin
  select * into k from public.trick_attempts where id = p_keep;
  if not found or k.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select * into d from public.trick_attempts where id = p_drop;
  if not found or d.deleted_at is not null then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  h := private.head_heat(k.heat_id, array['running', 'paused', 'ended', 'under_review'], p_reason);
  if k.id = d.id then raise exception 'BAD_MERGE'; end if;
  if k.heat_id <> d.heat_id or k.entry_id <> d.entry_id then raise exception 'NOT_SAME_RIDER'; end if;
  for s in select * from public.trick_scores where attempt_id = d.id order by judge_seat_id loop
    if exists (select 1 from public.trick_scores x where x.attempt_id = k.id and x.judge_seat_id = s.judge_seat_id) then
      v_choice := coalesce(p_choices ->> s.judge_seat_id::text, 'keep');
      if v_choice = 'drop' then
        perform private.audit_ctx('score_merged', p_reason);
        update public.trick_scores set criteria = s.criteria, score = s.score, missed = s.missed, client_key = gen_random_uuid(),
               client_rev = greatest(client_rev, s.client_rev), version = version + 1, edited_by = auth.uid(), edit_reason = 'Merged: ' || btrim(p_reason)
         where attempt_id = k.id and judge_seat_id = s.judge_seat_id;
      end if;
    else
      perform private.audit_ctx('score_merged', p_reason);
      update public.trick_scores set attempt_id = k.id where id = s.id;
    end if;
  end loop;
  perform private.audit_ctx('attempt_merged', p_reason);
  update public.trick_attempts set deleted_at = now(), deleted_by = auth.uid() where id = d.id;
  perform private.audit_ctx('', '');
  select * into v_row from public.trick_attempts where id = k.id;
  return v_row;
end $$;

-- DNS / DNF / DSQ on a rider's seat (null clears it). Interference is a penalty row (add_penalty).
create or replace function public.set_rider_status(p_heat uuid, p_entry uuid, p_modifier text, p_reason text) returns public.heat_slots
language plpgsql security definer set search_path = '' as $$
declare h public.heats; slot public.heat_slots; v_before text;
begin
  h := private.head_heat(p_heat, array['running', 'paused', 'ended', 'under_review'], p_reason);
  if p_modifier is not null and p_modifier not in ('DNS', 'DNF', 'DSQ') then raise exception 'BAD_MODIFIER'; end if;
  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  v_before := slot.modifier;
  update public.heat_slots set modifier = p_modifier where id = slot.id returning * into slot;
  perform private.head_audit(h.event_id, 'heat_slots', slot.id, 'rider_status_set',
    jsonb_build_object('modifier', v_before), jsonb_build_object('modifier', p_modifier, 'heat_id', p_heat, 'entry_id', p_entry), p_reason);
  return slot;
end $$;

create or replace function public.add_penalty(p_heat uuid, p_entry uuid, p_type text, p_reason text) returns public.penalties
language plpgsql security definer set search_path = '' as $$
declare h public.heats; r public.penalties;
begin
  h := private.head_heat(p_heat, array['running', 'paused', 'ended', 'under_review'], p_reason);
  if p_type not in ('INT', 'other') then raise exception 'BAD_PENALTY'; end if;
  if not exists (select 1 from public.heat_slots s where s.heat_id = p_heat and s.entry_id = p_entry) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  perform private.audit_ctx('penalty_added', p_reason);
  insert into public.penalties (event_id, heat_id, entry_id, type, reason, issued_by) values (h.event_id, p_heat, p_entry, p_type, btrim(p_reason), auth.uid()) returning * into r;
  perform private.audit_ctx('', '');
  return r;
end $$;

create or replace function public.remove_penalty(p_penalty uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.penalties;
begin
  select * into r from public.penalties where id = p_penalty;
  if not found then raise exception 'PENALTY_NOT_FOUND'; end if;
  perform private.head_heat(r.heat_id, array['running', 'paused', 'ended', 'under_review'], p_reason);
  perform private.audit_ctx('penalty_removed', p_reason);
  delete from public.penalties where id = p_penalty;
  perform private.audit_ctx('', '');
end $$;

-- Flag-out: at the format's minute the lowest riders leave the heat. The format says how many (flagOut.count).
create or replace function public.flag_out(p_heat uuid, p_entries uuid[], p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_fo jsonb; v_n int := coalesce(array_length(p_entries, 1), 0); v_riding int;
begin
  h := private.head_heat(p_heat, array['running', 'paused'], p_reason);
  select coalesce(d.draw -> 'template' -> 'flagOut', ft.json -> 'flagOut') into v_fo
    from public.divisions d left join public.format_templates ft on ft.id = d.format_template_id where d.id = h.division_id;
  if v_fo is null or jsonb_typeof(v_fo) <> 'object' then raise exception 'FLAG_OUT_NOT_AVAILABLE'; end if;
  if v_n > (v_fo ->> 'count')::int then raise exception 'FLAG_OUT_TOO_MANY: %', v_fo ->> 'count'; end if;
  select count(*) into v_riding from public.heat_slots s where s.heat_id = p_heat and s.entry_id = any (p_entries) and s.modifier is null;
  if v_riding <> v_n then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  update public.heat_slots set flagged_out = (entry_id = any (p_entries)) where heat_id = p_heat and entry_id is not null;
  update public.heats set flag_out = jsonb_build_object('at', now(), 'entries', to_jsonb(p_entries), 'reason', btrim(p_reason)) where id = p_heat;
  perform private.head_audit(h.event_id, 'heats', p_heat, 'heat_flag_out', h.flag_out, jsonb_build_object('entries', to_jsonb(p_entries)), p_reason);
end $$;

-- The head judge's order for riders who are tied (best first). The scoring engine reads it as a head_judge decision.
create or replace function public.decide_tie(p_heat uuid, p_rider_ids uuid[], p_reason text) returns public.heat_decisions
language plpgsql security definer set search_path = '' as $$
declare h public.heats; r public.heat_decisions;
begin
  h := private.head_heat(p_heat, array['ended', 'under_review'], p_reason);
  if coalesce(array_length(p_rider_ids, 1), 0) < 2 then raise exception 'BAD_TIE'; end if;
  if (select count(*) from public.heat_slots s where s.heat_id = p_heat and s.entry_id = any (p_rider_ids)) <> array_length(p_rider_ids, 1) then
    raise exception 'RIDER_NOT_IN_HEAT';
  end if;
  insert into public.heat_decisions (event_id, heat_id, kind, payload, reason, by_user, by_seat)
  values (h.event_id, p_heat, 'tie', jsonb_build_object('riderIds', to_jsonb(p_rider_ids)), btrim(p_reason), auth.uid(), private.seat_id(h.event_id))
  returning * into r;
  perform private.head_audit(h.event_id, 'heat_decisions', r.id, 'tie_decided', null, r.payload, p_reason);
  return r;
end $$;

create or replace function public.resolve_flag(p_flag uuid, p_resolution text default null) returns public.attempt_flags
language plpgsql security definer set search_path = '' as $$
declare f public.attempt_flags;
begin
  select * into f from public.attempt_flags where id = p_flag;
  if not found then raise exception 'FLAG_NOT_FOUND'; end if;
  if not private.can_run_heat(f.event_id) then raise exception 'NOT_ALLOWED'; end if;
  perform private.audit_ctx('flag_resolved', p_resolution);
  update public.attempt_flags set resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, auth.uid()),
         resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), 'Resolved') where id = p_flag returning * into f;
  perform private.audit_ctx('', '');
  return f;
end $$;

-- ---------------------------------------------------------------- 4. add_attempt: past the cap only for the head judge, or an organiser when the event has no active head judge
create or replace function public.add_attempt(
  p_heat uuid, p_entry uuid, p_client_key uuid, p_status text,
  p_direction text default null, p_category_key text default null, p_trick_name text default null,
  p_trick_parts jsonb default '{}', p_height_m numeric default null,
  p_input_method text default 'builder', p_raw_text text default null, p_override_reason text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; ev public.events; slot public.heat_slots; v_row public.trick_attempts;
  v_role text; v_seat uuid; v_org boolean; v_privileged boolean; v_eff text;
  v_cap int; v_used int; v_seq int; v_dup uuid; v_window int; v_over boolean := false;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  select * into ev from public.events where id = h.event_id;
  v_org := private.is_event_organiser(h.event_id);
  v_seat := private.seat_id(h.event_id);
  v_role := coalesce(private.seat_role(h.event_id), ''); -- never null: `not (null)` would let a seatless user through
  if not v_org and not (v_role in ('spotter', 'head') or (v_role = 'judge' and coalesce((ev.settings ->> 'judgesMayLogAttempts')::boolean, false))) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_privileged := v_org or v_role = 'head';

  -- safe retry: the same client_key returns the attempt that already exists
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then
    if v_row.heat_id <> p_heat then raise exception 'CLIENT_KEY_REUSED'; end if;
    return v_row;
  end if;

  v_eff := private.heat_effective_status(p_heat);
  if not (v_eff = 'running' or (v_privileged and v_eff in ('paused', 'ended', 'under_review'))) then
    raise exception 'HEAT_NOT_RUNNING';
  end if;

  select * into slot from public.heat_slots where heat_id = p_heat and entry_id = p_entry;
  if not found then raise exception 'RIDER_NOT_IN_HEAT'; end if;
  if slot.modifier is not null or slot.flagged_out then raise exception 'RIDER_NOT_RIDING'; end if;

  -- one rider, one lock: two phones cannot both take the last place
  perform pg_advisory_xact_lock(hashtextextended(p_heat::text || p_entry::text, 0));
  select * into v_row from public.trick_attempts where client_key = p_client_key;
  if found then return v_row; end if;

  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  select count(*) into v_used from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null;
  if v_cap is not null and v_used >= v_cap then
    if p_override_reason is null or not v_privileged then raise exception 'ATTEMPT_CAP_REACHED'; end if;
    if btrim(p_override_reason) = '' then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
    -- owner's decision 8: the head judge, or an organiser when the event has no head judge (always with a reason)
    if not (v_role = 'head' or (v_org and not private.event_has_active_head(h.event_id))) then raise exception 'NOT_ALLOWED'; end if;
    v_over := true;
  end if;

  select coalesce(max(a.seq), 0) + 1 into v_seq from public.trick_attempts a where a.heat_id = p_heat and a.entry_id = p_entry;

  -- two different spotters logging the same rider within the window: flag it for the head judge, never drop it
  v_window := coalesce((private.division_heat_setting(h.division_id, 'duplicateWindowSec') #>> '{}')::int, 20);
  select a.id into v_dup from public.trick_attempts a
   where a.heat_id = p_heat and a.entry_id = p_entry and a.deleted_at is null
     and a.created_by_seat is distinct from v_seat and a.created_at > now() - make_interval(secs => v_window)
   order by a.created_at desc limit 1;

  if v_over then
    perform set_config('app.audit_action', 'attempt_cap_override', true);
    perform set_config('app.reason', p_override_reason, true);
  end if;
  insert into public.trick_attempts (heat_id, entry_id, seq, client_key, status, direction, category_key, trick_name, trick_parts,
                                     height_m, created_by_seat, input_method, raw_text, possible_duplicate_of, event_id)
  values (p_heat, p_entry, v_seq, p_client_key, p_status, p_direction, p_category_key, p_trick_name, coalesce(p_trick_parts, '{}'),
          p_height_m, v_seat, coalesce(p_input_method, 'builder'), p_raw_text, v_dup, h.event_id)
  returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- ---------------------------------------------------------------- 5. review and re-open
-- Moves an ended heat to review (the judges' sheets lock). Every panel judge must have submitted, or the head judge gives a reason.
create or replace function public.review_heat(p_heat uuid, p_override_reason text default null) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_n int;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if h.status = 'running' and private.heat_effective_status(p_heat) = 'ended' then
    h := private.move_heat(p_heat, 'ended', 'heat_ended_by_clock');
  end if;
  if h.status = 'under_review' then return h; end if;
  if h.status <> 'ended' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> under_review', h.status; end if;
  v_n := private.unsubmitted_judges(p_heat);
  if v_n > 0 and (p_override_reason is null or char_length(btrim(p_override_reason)) < 3) then raise exception 'SHEETS_NOT_SUBMITTED: %', v_n; end if;
  return private.move_heat(p_heat, 'under_review', 'heat_under_review', p_override_reason);
end $$;

-- Published → under review, stamped reopened_at. The next publish is version 2. Judges stay locked unless the head judge re-opens their sheet.
create or replace function public.reopen_heat(p_heat uuid, p_reason text) returns public.heats
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not private.can_run_heat(h.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if h.status <> 'published' then raise exception 'ILLEGAL_HEAT_TRANSITION: % -> under_review', h.status; end if;
  perform private.audit_ctx('heat_reopened', p_reason);
  update public.heats set status = 'under_review', reopened_at = now() where id = p_heat returning * into h;
  perform private.audit_ctx('', '');
  return h;
end $$;

-- ---------------------------------------------------------------- 6. Publish: one transaction, idempotent per version
-- Called only by the server (service role) after it has computed the result with the scoring engine and the ladder. It trusts nothing about the caller's rights:
-- the server checked that the person is the head judge, and p_actor is that person, so the audit lines name them.
--   p_results:    [{ entry_id, place, total, percent, breakdown }] for every rider of the heat
--   p_draw:       the division's new stored draw (null when the heat is not part of a draw)
--   p_projection: [{ uid, slots: [{ position, entry_id, modifier }] }] for the later heats whose seats changed
-- Pressing Publish twice, even together, writes one result: the second call finds the heat published at the version it asked for and returns it.
create or replace function public.publish_heat_commit(
  p_heat uuid, p_expected_version int, p_results jsonb, p_draw jsonb, p_projection jsonb, p_hold boolean,
  p_override_reason text, p_actor uuid, p_blockers jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.heats; v_latest int; r jsonb; p jsonb; s jsonb; v_target public.heats; v_now timestamptz := now(); v_override text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
  select * into h from public.heats where id = p_heat for update;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  -- the writes below are audited as the person who pressed Publish
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_actor::text, ''), true);

  select coalesce(max(version), 0) into v_latest from public.heat_results where heat_id = p_heat;
  if h.status = 'published' and v_latest = p_expected_version then
    return jsonb_build_object('version', v_latest, 'already', true, 'published_at', h.published_at);
  end if;
  if p_expected_version <> v_latest + 1 then raise exception 'VERSION_CONFLICT'; end if;
  if h.status = 'published' then raise exception 'VERSION_CONFLICT'; end if;
  if h.status not in ('ended', 'under_review') then raise exception 'HEAT_NOT_ENDED'; end if;

  if h.status = 'ended' then
    if private.unsubmitted_judges(p_heat) > 0 and v_override is null then raise exception 'SHEETS_NOT_SUBMITTED: %', private.unsubmitted_judges(p_heat); end if;
    perform private.audit_ctx('heat_under_review', v_override);
    update public.heats set status = 'under_review' where id = p_heat;
  end if;

  for r in select * from jsonb_array_elements(p_results) loop
    if not exists (select 1 from public.heat_slots x where x.heat_id = p_heat and x.entry_id = (r ->> 'entry_id')::uuid) then raise exception 'RIDER_NOT_IN_HEAT'; end if;
    insert into public.heat_results (event_id, heat_id, entry_id, place, total, percent, breakdown, version, published_at)
    values (h.event_id, p_heat, (r ->> 'entry_id')::uuid, nullif(r ->> 'place', '')::int, nullif(r ->> 'total', '')::numeric, nullif(r ->> 'percent', '')::numeric,
            r -> 'breakdown', p_expected_version, v_now);
    update public.heat_slots set place = nullif(r ->> 'place', '')::int, total = nullif(r ->> 'total', '')::numeric, breakdown = r -> 'breakdown'
     where heat_id = p_heat and entry_id = (r ->> 'entry_id')::uuid;
  end loop;

  if p_draw is not null then update public.divisions set draw = p_draw where id = h.division_id; end if;
  -- the next heats' seats: "1st H1" becomes the rider. A heat that has started is never changed (the server returns that as a conflict before it gets here).
  for p in select * from jsonb_array_elements(coalesce(p_projection, '[]'::jsonb)) loop
    select * into v_target from public.heats where division_id = h.division_id and draw_uid = p ->> 'uid';
    if not found then continue; end if;
    if v_target.status <> 'scheduled' or v_target.started_at is not null then raise exception 'DOWNSTREAM_STARTED: %', p ->> 'uid'; end if;
    for s in select * from jsonb_array_elements(p -> 'slots') loop
      update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
       where heat_id = v_target.id and position = (s ->> 'position')::int;
    end loop;
  end loop;

  perform private.audit_ctx('heat_published', v_override);
  update public.heats set status = 'published', publish_hold = coalesce(p_hold, false), reopened_at = null where id = p_heat;
  perform private.audit_ctx('', '');

  if v_override is not null and jsonb_array_length(coalesce(p_blockers, '[]'::jsonb)) > 0 then
    insert into public.heat_decisions (event_id, heat_id, kind, payload, reason, by_user, by_seat)
    values (h.event_id, p_heat, 'publish_override', jsonb_build_object('version', p_expected_version, 'blockers', p_blockers), v_override, p_actor, private.seat_id(h.event_id));
    perform private.head_audit(h.event_id, 'heats', p_heat, 'publish_override', null, jsonb_build_object('version', p_expected_version, 'blockers', p_blockers), v_override);
  end if;
  return jsonb_build_object('version', p_expected_version, 'already', false, 'published_at', v_now);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function
  public.am_i_head, public.head_set_trick_score, public.head_set_impression, public.edit_attempt, public.merge_attempts, public.set_rider_status,
  public.add_penalty, public.remove_penalty, public.flag_out, public.decide_tie, public.resolve_flag, public.add_attempt, public.review_heat, public.reopen_heat,
  public.publish_heat_commit from public, anon, authenticated;
grant execute on function
  public.am_i_head, public.head_set_trick_score, public.head_set_impression, public.edit_attempt, public.merge_attempts, public.set_rider_status,
  public.add_penalty, public.remove_penalty, public.flag_out, public.decide_tie, public.resolve_flag, public.add_attempt, public.review_heat, public.reopen_heat to authenticated;
grant execute on function public.publish_heat_commit to service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 7. realtime (officials follow decisions; results keep their old row on update)
alter publication supabase_realtime add table public.heat_decisions;
alter table public.heat_results replica identity full;
