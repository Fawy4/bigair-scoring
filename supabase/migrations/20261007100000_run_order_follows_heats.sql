-- A run-order row names its heat by id inside the plan's JSON. When a draw is made again (save_division_draw) heats that are no longer in it
-- are deleted, and the rows pointing at them stayed behind: the timetable then had no heat and no length for them (Demo Cup, rows r12 and r13).
-- From now on a deleted heat takes its row out of every run order of its event, together with the row's pin and recorded start.

create or replace function private.prune_heat_from_plans() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.schedule_plans p set
    anchors = p.anchors - coalesce((select array_agg(i ->> 'id') from jsonb_array_elements(p.items) i where i ->> 'heatId' = old.id::text), '{}'::text[]),
    actual_starts = p.actual_starts - coalesce((select array_agg(i ->> 'id') from jsonb_array_elements(p.items) i where i ->> 'heatId' = old.id::text), '{}'::text[]),
    items = coalesce((select jsonb_agg(i order by n) from jsonb_array_elements(p.items) with ordinality as t(i, n) where i ->> 'heatId' is distinct from old.id::text), '[]'::jsonb)
  where p.event_id = old.event_id and p.items @> jsonb_build_array(jsonb_build_object('heatId', old.id::text));
  return old;
end $$;

create trigger heat_leaves_plans after delete on public.heats for each row execute function private.prune_heat_from_plans();

-- One-off: rows that already point at a heat that no longer exists.
update public.schedule_plans p set
  anchors = p.anchors - coalesce((select array_agg(i ->> 'id') from jsonb_array_elements(p.items) i where i ->> 'kind' = 'heat' and i ->> 'heatId' is not null and not exists (select 1 from public.heats h where h.id::text = i ->> 'heatId')), '{}'::text[]),
  actual_starts = p.actual_starts - coalesce((select array_agg(i ->> 'id') from jsonb_array_elements(p.items) i where i ->> 'kind' = 'heat' and i ->> 'heatId' is not null and not exists (select 1 from public.heats h where h.id::text = i ->> 'heatId')), '{}'::text[]),
  items = coalesce((select jsonb_agg(i order by n) from jsonb_array_elements(p.items) with ordinality as t(i, n) where not (i ->> 'kind' = 'heat' and i ->> 'heatId' is not null and not exists (select 1 from public.heats h where h.id::text = i ->> 'heatId'))), '[]'::jsonb)
where exists (select 1 from jsonb_array_elements(p.items) i where i ->> 'kind' = 'heat' and i ->> 'heatId' is not null and not exists (select 1 from public.heats h where h.id::text = i ->> 'heatId'));
