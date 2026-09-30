-- Security fix (found while testing the publish hold): permission checks that compared a possibly-null seat role.
-- `not (false or null)` is null, and an IF on null does not raise, so a signed-in user WITHOUT a seat or membership in the
-- event (a judge of another event, another organisation's organiser) could add and delete attempts in any event whose heat
-- or attempt id they knew. The role is now never null. Regression tests are in tests/rls/rls.test.ts.

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

create or replace function public.delete_attempt(p_attempt uuid, p_reason text) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; h public.heats; v_row public.trick_attempts;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(a.event_id) or coalesce(private.seat_role(a.event_id), '') = 'head') then raise exception 'NOT_ALLOWED'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'REASON_REQUIRED'; end if;
  select * into h from public.heats where id = a.heat_id;
  if h.status = 'published' then raise exception 'HEAT_PUBLISHED'; end if;
  if a.deleted_at is not null then return a; end if;
  perform set_config('app.audit_action', 'attempt_deleted', true);
  perform set_config('app.reason', p_reason, true);
  update public.trick_attempts set deleted_at = now(), deleted_by = auth.uid() where id = p_attempt returning * into v_row;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
  return v_row;
end $$;

-- same fix inside set_publish_hold (added in the previous migration)
create or replace function public.set_publish_hold(p_heat uuid, p_hold boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or coalesce(private.seat_role(h.event_id), '') = 'head') then raise exception 'NOT_ALLOWED'; end if;
  if p_hold and (p_reason is null or char_length(btrim(p_reason)) < 3) then raise exception 'REASON_REQUIRED'; end if;
  if h.publish_hold is not distinct from p_hold then return; end if;
  perform set_config('app.audit_action', case when p_hold then 'publish_hold' else 'publish_release' end, true);
  perform set_config('app.reason', coalesce(nullif(btrim(p_reason), ''), ''), true);
  update public.heats set publish_hold = p_hold where id = p_heat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
end $$;

revoke all on function public.add_attempt, public.delete_attempt, public.set_publish_hold from public, anon;
grant execute on function public.add_attempt, public.delete_attempt, public.set_publish_hold to authenticated;
