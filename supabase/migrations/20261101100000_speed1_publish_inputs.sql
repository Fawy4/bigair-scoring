-- Speed 1, part 1: Publish read its whole input with 19 requests, most of them waiting for the one before. This is the same reading as ONE database function:
--   publish_heat_inputs(heat)  everything Publish needs to score the heat and move the ladder, in one answer. It checks the caller itself (the head judge of the event or
--                              an organiser: the same door as every other head function), so the server no longer asks "am I the head?" separately.
-- Nothing about the rules changes: the server still scores the heat with the same engine and writes it with publish_heat_commit (one transaction). The riders' names are
-- read for the riders in THIS heat only (the old reading fetched every rider of the event and used only these).

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
              from public.judge_seats js where js.id in (select pm.judge_seat_id from public.panel_members pm where pm.panel_id = d.panel_id))
  );
end $$;

revoke all on function public.publish_heat_inputs(uuid) from public, anon;
grant execute on function public.publish_heat_inputs(uuid) to authenticated;
