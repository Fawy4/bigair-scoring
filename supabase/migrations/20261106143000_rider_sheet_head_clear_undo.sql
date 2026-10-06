-- Rider sheet, two follow-ups.
--
-- 1. head_clear_pending(note, reason): the head judge (or an organiser) clears a judge's pending note, reason optional. This is the way out when a judge's phone
--    dies with a note on it: Publish waits for every note. The audit line says who, which judge, which rider and line, and the reason ("no reason given" when empty).
-- 2. Spotter Undo: when the Undo removes an attempt that had taken judges' notes, the notes come back as pending on that line (the judge sees the trick vanish and the
--    score stay, in the pending style). Only when the undone attempt is the rider's latest one (Undo works for 10 seconds, so it nearly always is): with a later
--    attempt already logged the lines would renumber under the note, so nothing is moved and the scores stay on the deleted attempt, as for the head judge's Delete.

create or replace function public.head_clear_pending(p_note uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare n public.pending_scores; v_line int;
begin
  select * into n from public.pending_scores where id = p_note;
  if not found then raise exception 'NOTE_NOT_FOUND'; end if;
  perform private.head_heat(n.heat_id, array['running', 'paused', 'ended', 'under_review'], p_reason, false);
  v_line := private.pending_line(n.heat_id, n.entry_id, n.slot);
  delete from public.pending_scores where id = n.id;
  perform private.head_audit(n.event_id, 'pending_scores', n.id, 'pending_cleared_by_head', to_jsonb(n) || jsonb_build_object('line', v_line), null, p_reason);
end $$;

revoke all on function public.head_clear_pending from public, anon;
grant execute on function public.head_clear_pending to authenticated;

create or replace function private.undo_returns_notes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.trick_scores; v_max int;
begin
  if coalesce(current_setting('app.audit_action', true), '') <> 'attempt_undone' then return null; end if;
  if old.deleted_at is not null or new.deleted_at is null or old.status <> 'landed' then return null; end if;
  -- a later attempt of the rider is logged: leave everything as it is
  if exists (select 1 from public.trick_attempts a where a.heat_id = new.heat_id and a.entry_id = new.entry_id and a.deleted_at is null and a.seq > new.seq) then return null; end if;
  select coalesce(max(seq), 0) into v_max from public.trick_attempts where heat_id = new.heat_id and entry_id = new.entry_id;
  for s in
    select ts.* from public.trick_scores ts
     where ts.attempt_id = new.id and ts.score is not null and not ts.missed
       and exists (select 1 from public.audit_log al where al.row_id = ts.id and al.action = 'score_from_note')
  loop
    insert into public.pending_scores (event_id, heat_id, entry_id, judge_seat_id, slot, score, client_key, client_rev)
    values (s.event_id, s.heat_id, new.entry_id, s.judge_seat_id, v_max + 1, s.score, gen_random_uuid(), s.client_rev)
    on conflict (heat_id, entry_id, judge_seat_id, slot) do nothing;
    perform set_config('app.audit_action', 'score_back_to_note', true);
    delete from public.trick_scores where id = s.id;
    perform set_config('app.audit_action', 'attempt_undone', true);
  end loop;
  return null;
end $$;
drop trigger if exists y_undo_returns_notes on public.trick_attempts;
create trigger y_undo_returns_notes after update of deleted_at on public.trick_attempts for each row execute function private.undo_returns_notes();

grant execute on all functions in schema private to anon, authenticated, service_role;
