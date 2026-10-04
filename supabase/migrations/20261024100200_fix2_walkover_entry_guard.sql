-- Fix 2, item 2: A1b-3 and A1b-16.
--   * A1b-3: set_draw_walkover also takes the seats the engine changed (a rider who now has nobody to ride against moves on; a final's seat fills as the format says),
--     in the same form publish_heat_commit takes them: [{ uid, slots: [{ position, entry_id, modifier }] }]. Only heats that have not started are touched; a heat that
--     has started keeps its seats (the Riders step refuses before it gets here).
--   * A1b-16: an organiser's Remove of a rider who has a seat in a heat, or who is named by a locked draw, is refused (ENTRY_IN_DRAW). Cascades (deleting a division, an
--     event or an organisation) and the service role are not affected.

drop function if exists public.set_draw_walkover(uuid, uuid, jsonb);
create or replace function public.set_draw_walkover(p_division uuid, p_entry uuid, p_draw jsonb, p_projection jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.divisions; p jsonb; s jsonb; v_target public.heats;
begin
  select * into d from public.divisions where id = p_division for update;
  if not found or not private.is_event_organiser(d.event_id) then raise exception 'NOT_ALLOWED'; end if;
  if not exists (select 1 from public.entries e where e.id = p_entry and e.division_id = p_division) then raise exception 'BAD_ENTRY'; end if;
  perform set_config('app.draw_bypass', '1', true);
  update public.heat_slots hs set modifier = 'DNS'
  from public.heats h where hs.heat_id = h.id and h.division_id = p_division and hs.entry_id = p_entry and h.status = 'scheduled' and h.started_at is null;
  for p in select * from jsonb_array_elements(coalesce(p_projection, '[]'::jsonb)) loop
    select * into v_target from public.heats where division_id = p_division and draw_uid = p ->> 'uid';
    if not found or v_target.status <> 'scheduled' or v_target.started_at is not null then continue; end if;
    for s in select * from jsonb_array_elements(p -> 'slots') loop
      update public.heat_slots set entry_id = nullif(s ->> 'entry_id', '')::uuid, modifier = nullif(s ->> 'modifier', '')
       where heat_id = v_target.id and position = (s ->> 'position')::int;
    end loop;
  end loop;
  update public.divisions set draw = p_draw where id = p_division;
  perform set_config('app.draw_bypass', '', true);
  perform private.draw_audit(d.event_id, p_division, 'draw_walkover', jsonb_build_object('after', jsonb_build_object('entry', p_entry)));
end $$;
revoke all on function public.set_draw_walkover(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.set_draw_walkover(uuid, uuid, jsonb, jsonb) to authenticated;

create or replace function private.entries_guard_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.divisions;
begin
  -- a cascade (pg_trigger_depth > 1) or the service role (no signed-in user) is not an organiser pressing Remove
  if auth.uid() is null or pg_trigger_depth() > 1 then return old; end if;
  select * into d from public.divisions where id = old.division_id;
  if exists (select 1 from public.heat_slots hs where hs.entry_id = old.id)
     or (d.draw_locked_at is not null and d.draw is not null and position(old.id::text in d.draw::text) > 0) then
    raise exception 'ENTRY_IN_DRAW';
  end if;
  return old;
end $$;
drop trigger if exists entries_guard_delete on public.entries;
create trigger entries_guard_delete before delete on public.entries for each row execute function private.entries_guard_delete();
