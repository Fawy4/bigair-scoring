-- Polish 2, item 1 — what blocks Publish, and the head judge's Absent.
--
-- 1. An Impression / Variety score can be marked Absent by the head judge (as a trick score already can): impression_scores.missed, value null.
--    An Absent mark is not counted and is not missing (the scoring engine reads it as "missed").
-- 2. Decision P2-1: a panel judge whose sheet was never submitted (or was re-opened) counts as submitted for Publish when nothing of theirs is missing any
--    more AND the head judge has marked at least one of their scores Absent (a trick score with reason "Absent", or an Impression / Variety score).
--    A judge who simply has not pressed Submit still holds Publish back; the head judge can publish past it with a reason, as before.
--    "Missing" is what the scoring engine calls missing: landed attempts within the attempt limit of riders who are not DNS / DSQ (when the model requires
--    every judge), and Impression / Variety scores of riders who are not DNS / DSQ (when the model requires them). src/lib/live/sheet-rule.ts is the same rule.

-- ---------------------------------------------------------------- 1. Absent on an Impression / Variety score
-- `missed` may be null in rows restored from a copy made before this change (jsonb_populate_recordset); null reads as false.
alter table public.impression_scores add column if not exists missed boolean default false;
alter table public.impression_scores alter column value drop not null;
alter table public.impression_scores drop constraint if exists impression_scores_value_or_missed;
alter table public.impression_scores add constraint impression_scores_value_or_missed
  check ((coalesce(missed, false) and value is null) or (not coalesce(missed, false) and value is not null));

-- A judge's own Impression / Variety score: a number, never Absent. A newer score from the judge replaces an older one, but never the head judge's mark.
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

-- The head judge types in a judge's Impression / Variety score (paper sheets) or marks the judge Absent for that rider (p_missed; the value is then ignored).
drop function if exists public.head_set_impression(uuid, uuid, uuid, numeric, text);
create function public.head_set_impression(p_heat uuid, p_entry uuid, p_seat uuid, p_value numeric, p_reason text, p_missed boolean default false)
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
  perform private.audit_ctx('impression_set', p_reason);
  insert into public.impression_scores as i (event_id, heat_id, entry_id, judge_seat_id, value, missed, client_key, client_rev)
  values (h.event_id, p_heat, p_entry, p_seat, case when v_missed then null else p_value end, v_missed, gen_random_uuid(), 9000000000000000)
  on conflict (heat_id, entry_id, judge_seat_id) do update
    set value = excluded.value, missed = excluded.missed, client_key = excluded.client_key, client_rev = 9000000000000000
  returning * into r;
  perform private.audit_ctx('', '');
  return r;
end $$;
revoke all on function public.head_set_impression(uuid, uuid, uuid, numeric, text, boolean) from public, anon;
grant execute on function public.head_set_impression(uuid, uuid, uuid, numeric, text, boolean) to authenticated, service_role;

-- The server-side live view (public totals) carries the Absent mark so a visitor's total is the console's total.
create or replace function public.get_live_heat_for_server(p_heat uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $$
declare h public.heats; ev public.events; d public.divisions; v_live boolean;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  select * into ev from public.events where id = h.event_id;
  select * into d from public.divisions where id = h.division_id;
  v_live := case when h.public_live is not null then h.public_live
                 else coalesce(nullif(d.live_settings ->> 'publicLiveScores', ''), nullif(ev.settings ->> 'publicLiveScores', ''), 'after_publish') = 'live' end;
  if not private.event_is_public(ev.id) or not v_live or h.publish_hold or h.status in ('scheduled', 'cancelled') then
    return jsonb_build_object('allowed', false);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'poll_sec', coalesce((ev.settings ->> 'livePollSec')::int, 7),
    'heat', jsonb_build_object('id', h.id, 'status', h.status, 'effective_status', private.heat_effective_status(h.id), 'started_at', h.started_at,
             'duration_sec', h.duration_sec, 'paused_at', h.paused_at, 'paused_total_sec', h.paused_total_sec, 'ended_at', h.ended_at,
             'live_rev', h.live_rev, 'server_now', now()),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('position', s.position, 'entry_id', s.entry_id, 'vest_colour', s.vest_colour,
             'modifier', s.modifier, 'flagged_out', s.flagged_out) order by s.position) from public.heat_slots s where s.heat_id = h.id), '[]'),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'entry_id', a.entry_id, 'seq', a.seq, 'direction', a.direction,
             'category_key', a.category_key, 'trick_name', a.trick_name, 'status', a.status, 'height_m', a.height_m,
             'possible_duplicate_of', a.possible_duplicate_of, 'created_at', a.created_at) order by a.created_at)
             from public.trick_attempts a where a.heat_id = h.id and a.deleted_at is null), '[]'),
    'scores', coalesce((select jsonb_agg(jsonb_build_object('attempt_id', t.attempt_id, 'seat_no', pm.seat_no, 'criteria', t.criteria,
             'score', t.score, 'missed', t.missed))
             from public.trick_scores t
             join public.trick_attempts a on a.id = t.attempt_id and a.deleted_at is null
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = t.judge_seat_id
             where t.heat_id = h.id), '[]'),
    'impressions', coalesce((select jsonb_agg(jsonb_build_object('entry_id', i.entry_id, 'seat_no', pm.seat_no, 'value', i.value, 'missed', coalesce(i.missed, false)))
             from public.impression_scores i
             join public.panel_members pm on pm.panel_id = d.panel_id and pm.judge_seat_id = i.judge_seat_id
             where i.heat_id = h.id), '[]'),
    'penalties', coalesce((select jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'type', p.type, 'value', p.value))
             from public.penalties p where p.heat_id = h.id), '[]')
  );
end $$;

-- ---------------------------------------------------------------- 2. decision P2-1: which judges still hold Publish back for their sheet
-- How many of this judge's scores are still missing (what the scoring engine calls missing; see the header).
create or replace function private.judge_missing_count(p_heat uuid, p_seat uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare h public.heats; v_cap int; v_all boolean; v_imp jsonb; v_tricks int := 0; v_imps int := 0;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return 0; end if;
  v_cap := (private.division_heat_setting(h.division_id, 'maxAttemptsPerRider') #>> '{}')::int;
  v_all := coalesce((private.division_model_setting(h.division_id, array['panel', 'requireAllJudges']) #>> '{}')::boolean, true);
  if v_all then
    select count(*) into v_tricks
    from (select a.id, a.status, row_number() over (partition by a.entry_id order by a.seq) as n
          from public.trick_attempts a
          join public.heat_slots s on s.heat_id = a.heat_id and s.entry_id = a.entry_id and coalesce(s.modifier, '') not in ('DNS', 'DSQ')
          where a.heat_id = p_heat and a.deleted_at is null) x
    where x.status = 'landed' and (v_cap is null or x.n <= v_cap)
      and not exists (select 1 from public.trick_scores t where t.attempt_id = x.id and t.judge_seat_id = p_seat
                        and (t.missed or t.score is not null or (t.criteria is not null and t.criteria <> '{}'::jsonb)));
  end if;
  v_imp := private.division_model_setting(h.division_id, array['heat', 'impression']);
  if v_imp is not null and jsonb_typeof(v_imp) = 'object' and coalesce((v_imp ->> 'required')::boolean, true) then
    select count(*) into v_imps from public.heat_slots s
     where s.heat_id = p_heat and s.entry_id is not null and coalesce(s.modifier, '') not in ('DNS', 'DSQ')
       and not exists (select 1 from public.impression_scores i where i.heat_id = p_heat and i.entry_id = s.entry_id and i.judge_seat_id = p_seat);
  end if;
  return v_tricks + v_imps;
end $$;

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
                      and (s.reopened_at is null or s.submitted_at > s.reopened_at))
    and not (
      (exists (select 1 from public.trick_scores t where t.heat_id = p_heat and t.judge_seat_id = pm.judge_seat_id and t.missed and t.edit_reason = 'Absent')
       or exists (select 1 from public.impression_scores i where i.heat_id = p_heat and i.judge_seat_id = pm.judge_seat_id and coalesce(i.missed, false)))
      and private.judge_missing_count(p_heat, pm.judge_seat_id) = 0
    );
$$;
