-- The event simulator (owner brief of 1 Oct 2026): run any event as a rehearsal, play it automatically, press scenario buttons, look at each role's screen, reset.
--
--   1. columns and tables: events.simulation_of, sim_control (speed, state, settings), sim_seats (virtual or real), sim_log (what happened), sim_clock (fast clock),
--      sim_baseline (the locked draw a Reset returns to)
--   2. a simulation event is visible to its own organiser through the public functions (the "preview"), and to nobody else
--   3. clone_event_as_simulation: divisions, rules, riders, officials, locked draws and run order copied into a new event flagged is_simulation
--   4. the control functions (speed, state, settings, ticks, log, stats, officials virtual or real)
--   5. play-as-seat functions: a virtual spotter or judge acts through add_attempt, submit_trick_score, submit_impression and submit_sheet, exactly like a phone
--   6. the fast clock: a simulated heat's length is divided by the speed when it starts, so every phone and the public page see the same shorter clock
--   7. View as: give one seat to the organiser's own sign-in; the preview of a heat's live view
--   8. baseline, Reset (simulation events only) and delete (clones only)
--
-- Everything here is refused unless the event is a simulation (NOT_A_SIMULATION) and the caller is an organiser of it (NOT_ALLOWED).
-- Reset here is the simulation-only version; the general Reset of Phase 7a-1 is not on main yet (docs/STATUS.md has the note to unify them).

-- ---------------------------------------------------------------- 1. columns and tables
alter table public.events add column simulation_of uuid references public.events on delete set null;
create index on public.events (simulation_of);
grant select (simulation_of) on public.events to authenticated;

create table public.sim_control (
  event_id uuid primary key references public.events on delete cascade,
  speed int not null default 1 check (speed in (1, 5, 10, 20)),
  state text not null default 'stopped' check (state in ('stopped', 'playing', 'paused')),
  config jsonb not null default '{}',     -- how the virtual people behave; validated by the app (src/lib/simulator/config.ts)
  stats jsonb not null default '{}',
  blocker text,                           -- the sentence the virtual head judge stopped at, if any
  run_no int not null default 1,          -- bumped by Reset, so "the last run's numbers" start again
  tick_lock_until timestamptz,            -- one tick at a time, whichever tab sends it
  last_tick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sim_seats (
  seat_id uuid primary key references public.judge_seats on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  mode text not null default 'virtual' check (mode in ('virtual', 'real')),
  virtual_user uuid references auth.users on delete set null,   -- the login the simulator plays this seat with
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sim_seats (event_id);
create index on public.sim_seats (virtual_user);

create table public.sim_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  run_no int not null default 1,
  at timestamptz not null default now(),
  kind text not null check (kind in ('info', 'scenario', 'scenario_failed', 'blocker', 'heat', 'reset')),
  scenario text,
  text text not null,
  data jsonb not null default '{}'
);
create index on public.sim_log (event_id, at desc);
create index on public.sim_log (event_id, scenario);

-- the original length of each heat that started at a speed above ×1 (Reset puts it back)
create table public.sim_clock (
  heat_id uuid primary key references public.heats on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  original_sec int not null,
  speed int not null,
  started_at timestamptz not null default now()
);
create index on public.sim_clock (event_id);

-- the locked draw as it was before anything was played: heats, seats, run order
create table public.sim_baseline (
  event_id uuid primary key references public.events on delete cascade,
  taken_at timestamptz not null default now(),
  divisions jsonb not null,
  heats jsonb not null,
  slots jsonb not null,
  plans jsonb not null
);

alter table public.sim_control enable row level security;
alter table public.sim_seats enable row level security;
alter table public.sim_log enable row level security;
alter table public.sim_clock enable row level security;
alter table public.sim_baseline enable row level security;
revoke all on public.sim_control, public.sim_seats, public.sim_log, public.sim_clock, public.sim_baseline from anon, authenticated;
grant select on public.sim_control, public.sim_seats, public.sim_log to authenticated;
-- written only by the functions below; read by the event's organisers
create policy org_read on public.sim_control for select to authenticated using (private.is_event_organiser(event_id));
create policy org_read on public.sim_seats for select to authenticated using (private.is_event_organiser(event_id));
create policy org_read on public.sim_log for select to authenticated using (private.is_event_organiser(event_id));

create trigger z_updated_at before update on public.sim_control for each row execute function private.set_updated_at();
create trigger z_updated_at before update on public.sim_seats for each row execute function private.set_updated_at();

-- The one door of every simulator function: the caller is an organiser of the event, and the event is a simulation.
create or replace function private.sim_guard(p_event uuid) returns public.events
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or not private.is_event_organiser(p_event) then raise exception 'NOT_ALLOWED'; end if;
  if not ev.is_simulation then raise exception 'NOT_A_SIMULATION'; end if;
  return ev;
end $$;

-- ---------------------------------------------------------------- 2. the preview: a simulation event is public to its own organiser only
-- (the public pages read as that organiser while the preview is on; a visitor and every other organiser still get "not found")
create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.organisations o on o.id = e.organisation_id
    where e.id = p_event and e.status in ('published', 'live', 'complete') and e.archived_at is null and o.archived_at is null
      and (not e.is_simulation or private.is_event_organiser(e.id) or current_setting('app.sim_preview', true) = e.id::text));
$$;

-- ---------------------------------------------------------------- baseline: the locked draw before anything was played
create or replace function private.sim_capture_baseline(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sim_baseline (event_id, divisions, heats, slots, plans)
  values (
    p_event,
    (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'draw', d.draw, 'draw_locked_at', d.draw_locked_at, 'status', d.status)), '[]'::jsonb)
       from public.divisions d where d.event_id = p_event),
    (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'division_id', h.division_id, 'round_id', h.round_id, 'number', h.number, 'number_suffix', h.number_suffix,
                                                  'name', h.name, 'draw_uid', h.draw_uid, 'duration_sec', h.duration_sec, 'warm_up_sec', h.warm_up_sec,
                                                  'manual_override', h.manual_override, 'public_live', h.public_live)), '[]'::jsonb)
       from public.heats h where h.event_id = p_event),
    (select coalesce(jsonb_agg(jsonb_build_object('heat_id', s.heat_id, 'position', s.position, 'entry_id', s.entry_id, 'vest_colour', s.vest_colour,
                                                  'source', s.source, 'modifier', s.modifier)), '[]'::jsonb)
       from public.heat_slots s where s.event_id = p_event),
    (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'day', p.day, 'name', p.name, 'items', p.items, 'anchors', p.anchors, 'defaults', p.defaults, 'active', p.active)), '[]'::jsonb)
       from public.schedule_plans p where p.event_id = p_event))
  on conflict (event_id) do update
    set taken_at = now(), divisions = excluded.divisions, heats = excluded.heats, slots = excluded.slots, plans = excluded.plans;
end $$;

-- ---------------------------------------------------------------- 3. clone
-- Replaces every id of one kind in a document with its copy's id (the map lives in the temp table of the clone call).
create or replace function private.sim_remap(p_doc jsonb, p_kind text) returns jsonb
language plpgsql set search_path = '' as $$
declare t text := p_doc::text; m record;
begin
  if p_doc is null then return null; end if;
  for m in select x.old, x.new from pg_temp._sim_map x where x.kind = p_kind loop
    t := replace(t, m.old::text, m.new::text);
  end loop;
  return t::jsonb;
end $$;

-- A new simulation event with the same divisions, rules, riders, officials (no PINs yet: the server issues fresh ones), locked draws and run order.
-- Refused when the source has already been run: a played ladder is not a starting point.
create or replace function public.clone_event_as_simulation(p_event uuid, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  src public.events; v_new uuid := gen_random_uuid(); v_slug text; v_name text; r record; v_locked int := 0;
begin
  select * into src from public.events where id = p_event for share;
  if not found or not private.is_event_organiser(p_event) then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.rerun_of is not null)) then
    raise exception 'SOURCE_ALREADY_RUN';
  end if;

  loop
    v_slug := left(src.slug, 38) || '-sim-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    exit when not exists (select 1 from public.events where slug = v_slug);
  end loop;
  v_name := left(coalesce(nullif(btrim(coalesce(p_name, '')), ''), src.name || ' (simulation)'), 120);

  perform set_config('app.draw_bypass', '1', true);

  insert into public.events (id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding, is_simulation, simulation_of)
  values (v_new, src.organisation_id, v_name, v_slug, src.location, src.timezone, src.start_date, src.end_date, 'published', src.settings, src.branding, true, src.id);

  -- the id maps (old -> new), dropped at the end of the transaction
  create temp table if not exists _sim_map (kind text not null, old uuid not null, new uuid not null) on commit drop;
  delete from pg_temp._sim_map where true; -- (the database refuses a delete without a where)
  insert into pg_temp._sim_map select 'division', d.id, gen_random_uuid() from public.divisions d where d.event_id = p_event;
  insert into pg_temp._sim_map select 'entry', e.id, gen_random_uuid() from public.entries e where e.event_id = p_event;
  insert into pg_temp._sim_map select 'round', x.id, gen_random_uuid() from public.rounds x where x.event_id = p_event;
  insert into pg_temp._sim_map select 'heat', h.id, gen_random_uuid() from public.heats h where h.event_id = p_event;
  insert into pg_temp._sim_map select 'panel', p.id, gen_random_uuid() from public.panels p where p.event_id = p_event;
  insert into pg_temp._sim_map select 'seat', s.id, gen_random_uuid() from public.judge_seats s where s.event_id = p_event and s.status = 'active' and s.active;

  -- local trick blocks of the event
  insert into public.trick_vocabularies (organisation_id, event_id, key, json, content_hash, version, published_at)
  select t.organisation_id, v_new, t.key, t.json, t.content_hash, t.version, t.published_at from public.trick_vocabularies t where t.event_id = p_event;

  insert into public.divisions (id, event_id, name, sort_order, scoring_model_id, scoring_overrides, format_template_id, format_params, status, description,
                                identification, trick_base, seed_shuffle_seed, live_settings)
  select m.new, v_new, d.name, d.sort_order, d.scoring_model_id, d.scoring_overrides, d.format_template_id, d.format_params,
         case when d.status in ('running', 'complete') then 'ready' else d.status end, d.description, d.identification, d.trick_base, d.seed_shuffle_seed, d.live_settings
  from public.divisions d join pg_temp._sim_map m on m.kind = 'division' and m.old = d.id where d.event_id = p_event;

  insert into public.panels (id, event_id, name) select m.new, v_new, p.name from public.panels p join pg_temp._sim_map m on m.kind = 'panel' and m.old = p.id;
  insert into public.judge_seats (id, event_id, name, role, scores, spotter_assignment, status, active)
  select m.new, v_new, s.name, s.role, s.scores, s.spotter_assignment, 'active', true
  from public.judge_seats s join pg_temp._sim_map m on m.kind = 'seat' and m.old = s.id;
  insert into public.panel_members (panel_id, judge_seat_id, seat_no, event_id)
  select pm.new, sm.new, x.seat_no, v_new
  from public.panel_members x join pg_temp._sim_map pm on pm.kind = 'panel' and pm.old = x.panel_id join pg_temp._sim_map sm on sm.kind = 'seat' and sm.old = x.judge_seat_id;
  update public.divisions d set panel_id = pm.new
  from public.divisions o join pg_temp._sim_map dm on dm.kind = 'division' and dm.old = o.id join pg_temp._sim_map pm on pm.kind = 'panel' and pm.old = o.panel_id
  where d.id = dm.new;

  insert into public.entries (id, event_id, division_id, rider_id, seed, status, source, paid, consent_at, identifiers, decline_reason)
  select m.new, v_new, dm.new, e.rider_id, e.seed, e.status, 'manual', e.paid, e.consent_at, e.identifiers, e.decline_reason
  from public.entries e join pg_temp._sim_map m on m.kind = 'entry' and m.old = e.id join pg_temp._sim_map dm on dm.kind = 'division' and dm.old = e.division_id;

  insert into public.rounds (id, event_id, division_id, sort_order, name, short_name, spec)
  select m.new, v_new, dm.new, x.sort_order, x.name, x.short_name, x.spec
  from public.rounds x join pg_temp._sim_map m on m.kind = 'round' and m.old = x.id join pg_temp._sim_map dm on dm.kind = 'division' and dm.old = x.division_id;

  insert into public.heats (id, event_id, division_id, round_id, number, number_suffix, status, duration_sec, manual_override, draw_uid, name, warm_up_sec, public_live)
  select m.new, v_new, dm.new, rm.new, h.number, h.number_suffix, 'scheduled', h.duration_sec, h.manual_override, h.draw_uid, h.name, h.warm_up_sec, h.public_live
  from public.heats h join pg_temp._sim_map m on m.kind = 'heat' and m.old = h.id join pg_temp._sim_map dm on dm.kind = 'division' and dm.old = h.division_id
  join pg_temp._sim_map rm on rm.kind = 'round' and rm.old = h.round_id;

  insert into public.heat_slots (event_id, heat_id, position, entry_id, vest_colour, source, modifier)
  select v_new, hm.new, s.position, em.new, s.vest_colour, s.source, case when s.modifier = 'DNS' then 'DNS' end
  from public.heat_slots s join pg_temp._sim_map hm on hm.kind = 'heat' and hm.old = s.heat_id left join pg_temp._sim_map em on em.kind = 'entry' and em.old = s.entry_id;

  -- the stored draw names the riders by entry id: point it at the copies, and lock it when the source was locked
  for r in select dm.new as new_id, d.draw, d.draw_locked_at from public.divisions d join pg_temp._sim_map dm on dm.kind = 'division' and dm.old = d.id where d.event_id = p_event loop
    -- draw_at_lock is the copy the general Reset (Phase 7a-1) returns a division to: a copy is a clean start, so it is taken here
    update public.divisions set draw = private.sim_remap(r.draw, 'entry'), draw_locked_at = case when r.draw_locked_at is not null then now() end,
      draw_at_lock = case when r.draw_locked_at is not null and r.draw is not null then private.sim_remap(r.draw, 'entry') end where id = r.new_id;
    if r.draw_locked_at is not null then v_locked := v_locked + 1; end if;
  end loop;

  -- a spotter's assigned riders are named by entry id too
  update public.judge_seats set spotter_assignment = private.sim_remap(spotter_assignment, 'entry') where event_id = v_new and spotter_assignment is not null;

  -- the run order: the same items, pointing at the copied heats; nothing started, no hold
  for r in select p.day, p.name, p.items, p.anchors, p.defaults, p.active from public.schedule_plans p where p.event_id = p_event loop
    insert into public.schedule_plans (event_id, day, name, items, anchors, actual_starts, hold, defaults, active)
    values (v_new, r.day, r.name, private.sim_remap(r.items, 'heat'), private.sim_remap(r.anchors, 'heat'), '{}'::jsonb, null, r.defaults, r.active);
  end loop;

  insert into public.sim_control (event_id) values (v_new);
  insert into public.sim_seats (seat_id, event_id, mode) select m.new, v_new, 'virtual' from pg_temp._sim_map m where m.kind = 'seat';
  perform private.sim_capture_baseline(v_new);
  insert into public.sim_log (event_id, kind, text, data) values (v_new, 'info', 'Copied from ' || src.name, jsonb_build_object('source', src.id));
  perform private.head_audit(v_new, 'events', v_new, 'simulation_cloned', null, jsonb_build_object('source', src.id, 'slug', v_slug), null);
  perform set_config('app.draw_bypass', '', true);

  return jsonb_build_object(
    'event_id', v_new, 'slug', v_slug, 'name', v_name,
    'divisions', (select count(*) from public.divisions where event_id = v_new),
    'locked', v_locked,
    'heats', (select count(*) from public.heats where event_id = v_new),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('seat_id', s.id, 'name', s.name, 'role', s.role) order by s.role, s.name) from public.judge_seats s where s.event_id = v_new), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- 4. control
-- Switches an existing simulation event (the Demo) on for the simulator: its settings row, a row per official, and the starting point when nothing has started.
create or replace function public.sim_enable(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_started boolean;
begin
  perform private.sim_guard(p_event);
  insert into public.sim_control (event_id) values (p_event) on conflict (event_id) do nothing;
  insert into public.sim_seats (seat_id, event_id, mode)
  select s.id, p_event, 'virtual' from public.judge_seats s where s.event_id = p_event and s.status = 'active' and s.active on conflict (seat_id) do nothing;
  select exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.rerun_of is not null)) into v_started;
  if not v_started and not exists (select 1 from public.sim_baseline b where b.event_id = p_event) then
    perform private.sim_capture_baseline(p_event);
  end if;
  return jsonb_build_object('has_baseline', exists (select 1 from public.sim_baseline b where b.event_id = p_event), 'played', v_started);
end $$;

-- Saves the starting point again (only before any heat has started): after the draw was changed, or for an event made before the simulator existed.
create or replace function public.sim_capture_baseline(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sim_guard(p_event);
  if exists (select 1 from public.heats h where h.event_id = p_event and (h.status <> 'scheduled' or h.started_at is not null or h.rerun_of is not null)) then raise exception 'HEAT_STARTED'; end if;
  perform private.sim_capture_baseline(p_event);
  insert into public.sim_log (event_id, run_no, kind, text) select p_event, c.run_no, 'info', 'Starting point saved' from public.sim_control c where c.event_id = p_event;
end $$;

-- p_patch keys: speed (1, 5, 10, 20), state (stopped, playing, paused), config, stats, blocker (null clears), tick (stamps the time)
create or replace function public.sim_set(p_event uuid, p_patch jsonb) returns public.sim_control
language plpgsql security definer set search_path = '' as $$
declare c public.sim_control;
begin
  perform private.sim_guard(p_event);
  select * into c from public.sim_control where event_id = p_event for update;
  if not found then raise exception 'SIM_NOT_ENABLED'; end if;
  if p_patch ? 'speed' and (p_patch ->> 'speed')::int not in (1, 5, 10, 20) then raise exception 'BAD_SPEED'; end if;
  if p_patch ? 'state' and (p_patch ->> 'state') not in ('stopped', 'playing', 'paused') then raise exception 'BAD_STATE'; end if;
  update public.sim_control set
    speed = coalesce((p_patch ->> 'speed')::int, speed),
    state = coalesce(p_patch ->> 'state', state),
    config = case when p_patch ? 'config' then p_patch -> 'config' else config end,
    stats = case when p_patch ? 'stats' then p_patch -> 'stats' else stats end,
    blocker = case when p_patch ? 'blocker' then nullif(p_patch ->> 'blocker', '') else blocker end,
    last_tick_at = case when p_patch ? 'tick' then now() else last_tick_at end
  where event_id = p_event returning * into c;
  return c;
end $$;

-- One official is played by the simulator (virtual) or left to a real person on a phone (real). Real lets go of the seat so a PIN can take it.
create or replace function public.sim_set_mode(p_seat uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; ss public.sim_seats;
begin
  select * into s from public.judge_seats where id = p_seat;
  if not found then raise exception 'SEAT_NOT_FOUND'; end if;
  perform private.sim_guard(s.event_id);
  if p_mode not in ('virtual', 'real') then raise exception 'BAD_MODE'; end if;
  select * into ss from public.sim_seats where seat_id = p_seat;
  if not found then raise exception 'SIM_NOT_ENABLED'; end if;
  if p_mode = 'real' and ss.virtual_user is not null and s.auth_user_id = ss.virtual_user then
    update public.judge_seats set auth_user_id = null where id = p_seat;
  end if;
  update public.sim_seats set mode = p_mode where seat_id = p_seat;
end $$;

-- One tick at a time: true when this call holds the lock for p_ms milliseconds. Also adds a row for any official added since the last tick.
create or replace function public.sim_tick_lock(p_event uuid, p_ms int default 4000) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  perform private.sim_guard(p_event);
  insert into public.sim_seats (seat_id, event_id, mode)
  select s.id, p_event, 'virtual' from public.judge_seats s where s.event_id = p_event and s.status = 'active' and s.active on conflict (seat_id) do nothing;
  update public.sim_control set tick_lock_until = now() + make_interval(secs => greatest(p_ms, 500) / 1000.0)
   where event_id = p_event and (tick_lock_until is null or tick_lock_until < now()) returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.sim_log_add(p_event uuid, p_kind text, p_scenario text, p_text text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_run int;
begin
  perform private.sim_guard(p_event);
  select run_no into v_run from public.sim_control where event_id = p_event;
  insert into public.sim_log (event_id, run_no, kind, scenario, text, data) values (p_event, coalesce(v_run, 1), p_kind, p_scenario, left(p_text, 400), coalesce(p_data, '{}'::jsonb));
  -- the running commentary is trimmed; scenario lines are the checklist and stay
  delete from public.sim_log where event_id = p_event and kind in ('info', 'heat', 'blocker')
    and id in (select id from public.sim_log where event_id = p_event and kind in ('info', 'heat', 'blocker') order by at desc offset 300);
end $$;

-- The numbers of the current run, for the checklist and the panel.
create or replace function public.sim_stats(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_run int;
begin
  perform private.sim_guard(p_event);
  select run_no into v_run from public.sim_control where event_id = p_event;
  return jsonb_build_object(
    'run', coalesce(v_run, 1),
    'heats_total', (select count(*) from public.heats h where h.event_id = p_event and h.status <> 'cancelled'),
    'heats_published', (select count(*) from public.heats h where h.event_id = p_event and h.status = 'published'),
    'heats_running', (select count(*) from public.heats h where h.event_id = p_event and h.status in ('running', 'paused')),
    'attempts', (select count(*) from public.trick_attempts a where a.event_id = p_event and a.deleted_at is null),
    'scores', (select count(*) from public.trick_scores t where t.event_id = p_event),
    'impressions', (select count(*) from public.impression_scores i where i.event_id = p_event),
    'blockers', (select count(*) from public.sim_log l where l.event_id = p_event and l.kind = 'blocker' and l.run_no = coalesce(v_run, 1)),
    'flagged_duplicates', (select count(*) from public.trick_attempts a where a.event_id = p_event and a.possible_duplicate_of is not null and a.deleted_at is null));
end $$;

-- Binds the simulator's own login to a virtual seat (service role only: the server makes the login and hands it over).
create or replace function public.sim_bind_virtual(p_seat uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; ss public.sim_seats;
begin
  select * into s from public.judge_seats where id = p_seat;
  select * into ss from public.sim_seats where seat_id = p_seat;
  if s.id is null or ss.seat_id is null or ss.mode <> 'virtual' then return jsonb_build_object('ok', false, 'error', 'NOT_VIRTUAL'); end if;
  if not exists (select 1 from public.events e where e.id = s.event_id and e.is_simulation) then return jsonb_build_object('ok', false, 'error', 'NOT_A_SIMULATION'); end if;
  -- a person who has the seat keeps it
  if s.auth_user_id is not null and s.auth_user_id is distinct from ss.virtual_user and s.auth_user_id <> p_user then return jsonb_build_object('ok', false, 'error', 'SEAT_TAKEN'); end if;
  update public.sim_seats set virtual_user = p_user where seat_id = p_seat;
  return private.bind_seat(s, p_user, 'simulator', 'the simulator');
end $$;

-- ---------------------------------------------------------------- 5. play as a seat
-- The caller is an organiser of a simulation event and the seat is a virtual one the simulator holds right now (not a person's phone).
create or replace function private.sim_seat_user(p_event uuid, p_seat uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid; v_virtual uuid; v_mode text; v_event uuid;
begin
  select s.auth_user_id, ss.virtual_user, ss.mode, s.event_id into v_user, v_virtual, v_mode, v_event
    from public.judge_seats s join public.sim_seats ss on ss.seat_id = s.id where s.id = p_seat;
  if not found or v_event <> p_event then raise exception 'SEAT_NOT_FOUND'; end if;
  if v_mode <> 'virtual' or v_virtual is null or v_user is distinct from v_virtual then raise exception 'SEAT_IS_REAL'; end if;
  return v_virtual;
end $$;

-- For the rest of this transaction the database sees this login (the same trick publish_heat_commit uses to audit as the person who pressed Publish).
create or replace function private.sim_act_as(p_user uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

create or replace function public.sim_add_attempt(
  p_seat uuid, p_heat uuid, p_entry uuid, p_trick jsonb, p_status text, p_client_key uuid default null, p_override_reason text default null
) returns public.trick_attempts
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_user uuid; v_claims text; v_sub text; v_row public.trick_attempts;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  perform private.sim_guard(h.event_id);
  v_user := private.sim_seat_user(h.event_id, p_seat);
  v_claims := current_setting('request.jwt.claims', true); v_sub := current_setting('request.jwt.claim.sub', true);
  perform private.sim_act_as(v_user);
  v_row := public.add_attempt(p_heat, p_entry, coalesce(p_client_key, gen_random_uuid()), p_status, p_trick ->> 'direction', p_trick ->> 'category', p_trick ->> 'name',
                              coalesce(p_trick -> 'parts', '{}'::jsonb), null, 'builder', null, p_override_reason);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return v_row;
end $$;

create or replace function public.sim_submit_score(
  p_seat uuid, p_attempt uuid, p_criteria jsonb, p_score numeric, p_missed boolean, p_client_key uuid, p_client_rev bigint
) returns public.trick_scores
language plpgsql security definer set search_path = '' as $$
declare a public.trick_attempts; v_user uuid; v_claims text; v_sub text; v_row public.trick_scores;
begin
  select * into a from public.trick_attempts where id = p_attempt;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  perform private.sim_guard(a.event_id);
  v_user := private.sim_seat_user(a.event_id, p_seat);
  v_claims := current_setting('request.jwt.claims', true); v_sub := current_setting('request.jwt.claim.sub', true);
  perform private.sim_act_as(v_user);
  v_row := public.submit_trick_score(p_attempt, coalesce(p_criteria, '{}'::jsonb), p_score, coalesce(p_missed, false), null, p_client_key, p_client_rev);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return v_row;
end $$;

create or replace function public.sim_submit_impression(p_seat uuid, p_heat uuid, p_entry uuid, p_value numeric, p_client_key uuid, p_client_rev bigint)
returns public.impression_scores
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_user uuid; v_claims text; v_sub text; v_row public.impression_scores;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  perform private.sim_guard(h.event_id);
  v_user := private.sim_seat_user(h.event_id, p_seat);
  v_claims := current_setting('request.jwt.claims', true); v_sub := current_setting('request.jwt.claim.sub', true);
  perform private.sim_act_as(v_user);
  v_row := public.submit_impression(p_heat, p_entry, p_value, p_client_key, p_client_rev);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return v_row;
end $$;

create or replace function public.sim_submit_sheet(p_seat uuid, p_heat uuid) returns public.judge_sheets
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v_user uuid; v_claims text; v_sub text; v_row public.judge_sheets;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  perform private.sim_guard(h.event_id);
  v_user := private.sim_seat_user(h.event_id, p_seat);
  v_claims := current_setting('request.jwt.claims', true); v_sub := current_setting('request.jwt.claim.sub', true);
  perform private.sim_act_as(v_user);
  v_row := public.submit_sheet(p_heat);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  return v_row;
end $$;

-- ---------------------------------------------------------------- 6. the fast clock
-- A heat of a simulation event that starts while the speed is above ×1 gets a shorter length (the original is kept for Reset). Every phone, the head console, the
-- timetable and the public page read heats.duration_sec, so all of them see the fast clock through the normal paths.
create or replace function private.sim_fast_clock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_speed int;
begin
  if old.status = 'scheduled' and new.status = 'running' then
    select c.speed into v_speed from public.sim_control c join public.events e on e.id = c.event_id where c.event_id = new.event_id and e.is_simulation;
    if coalesce(v_speed, 1) > 1 then
      insert into public.sim_clock (heat_id, event_id, original_sec, speed) values (new.id, new.event_id, old.duration_sec, v_speed) on conflict (heat_id) do nothing;
      new.duration_sec := greatest(3, ceil(old.duration_sec::numeric / v_speed))::int;
    end if;
  end if;
  return new;
end $$;
create trigger b_sim_clock before update of status on public.heats for each row execute function private.sim_fast_clock();

-- ---------------------------------------------------------------- 7. View as, and the live view for the preview
-- Gives one seat to the organiser's own sign-in (one seat at a time: the seat held before is let go; the simulator takes a released virtual seat back).
-- p_seat null lets go of whichever seat the organiser holds.
create or replace function public.sim_view_as(p_event uuid, p_seat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats;
begin
  perform private.sim_guard(p_event);
  if p_seat is null then
    update public.judge_seats set auth_user_id = null where event_id = p_event and auth_user_id = auth.uid();
    return jsonb_build_object('ok', true, 'released', true);
  end if;
  select * into s from public.judge_seats where id = p_seat and event_id = p_event and active and status = 'active';
  if not found then raise exception 'SEAT_NOT_FOUND'; end if;
  return private.bind_seat(s, auth.uid(), 'simulator', 'View as');
end $$;

-- What get_live_heat_for_server says, for the preview of a simulation event (the server reads the live view as a service; here the organiser asks for it).
create or replace function public.sim_live_heat(p_heat uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.heats; v jsonb;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return jsonb_build_object('allowed', false); end if;
  perform private.sim_guard(h.event_id);
  perform set_config('app.sim_preview', h.event_id::text, true);
  v := public.get_live_heat_for_server(p_heat);
  perform set_config('app.sim_preview', '', true);
  return v;
end $$;

-- ---------------------------------------------------------------- 8. Reset (simulation events) and delete (copies only)
-- Back to the locked draw: attempts, scores, results, decisions, wind calls and actual times are wiped; re-run heats go; the draw, seats and run order return to the saved
-- starting point; fast clocks are put back. Refused while a heat is running or paused. Officials, riders, rules and settings stay.
-- An event with no saved starting point (the Demo, played before the simulator existed) can be rebuilt instead (p_rebuild): everything played is wiped and every draw is
-- unlocked and emptied of results, and the server then draws and locks it again from the riders and saves the new starting point.
create or replace function public.sim_reset(p_event uuid, p_slug_confirm text, p_rebuild boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; b public.sim_baseline; v_counts jsonb; v_running record; it jsonb; v_run int; v_has boolean;
begin
  ev := private.sim_guard(p_event);
  if lower(btrim(coalesce(p_slug_confirm, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;
  select h.number, h.name into v_running from public.heats h where h.event_id = p_event and h.status in ('running', 'paused') order by h.number limit 1;
  if found then raise exception 'HEAT_RUNNING: %', coalesce(v_running.name, 'Heat ' || v_running.number); end if;
  select * into b from public.sim_baseline where event_id = p_event;
  v_has := found;
  if not v_has and not p_rebuild then raise exception 'NO_BASELINE'; end if;

  v_counts := jsonb_build_object(
    'heats', (select count(*) from public.heats where event_id = p_event and status <> 'scheduled'),
    'attempts', (select count(*) from public.trick_attempts where event_id = p_event),
    'scores', (select count(*) from public.trick_scores where event_id = p_event),
    'impressions', (select count(*) from public.impression_scores where event_id = p_event),
    'results', (select count(*) from public.heat_results where event_id = p_event),
    'decisions', (select count(*) from public.heat_decisions where event_id = p_event),
    'rebuild', not v_has);

  perform set_config('app.allow_purge', 'on', true);
  perform set_config('app.draw_bypass', '1', true);

  delete from public.heat_decisions where event_id = p_event;
  delete from public.heat_results where event_id = p_event;
  delete from public.judge_sheets where event_id = p_event;
  delete from public.attempt_flags where event_id = p_event;
  delete from public.penalties where event_id = p_event;
  delete from public.impression_scores where event_id = p_event;
  delete from public.trick_scores where event_id = p_event;
  delete from public.trick_attempts where event_id = p_event;
  delete from public.wind_calls where event_id = p_event;

  if v_has then
    -- heats made since (re-runs) go; every saved heat goes back to a scheduled heat with its own length, number and draw id
    delete from public.heats h where h.event_id = p_event and not exists (select 1 from jsonb_array_elements(b.heats) x where (x ->> 'id')::uuid = h.id);
    for it in select * from jsonb_array_elements(b.heats) loop
      update public.heats set
        round_id = (it ->> 'round_id')::uuid, number = (it ->> 'number')::int, number_suffix = it ->> 'number_suffix', name = it ->> 'name', draw_uid = it ->> 'draw_uid',
        duration_sec = (it ->> 'duration_sec')::int, warm_up_sec = (it ->> 'warm_up_sec')::int, manual_override = (it ->> 'manual_override')::boolean,
        public_live = nullif(it ->> 'public_live', '')::boolean, rerun_of = null, flag_out = null, publish_hold = false,
        status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null
       where id = (it ->> 'id')::uuid;
    end loop;

    delete from public.heat_slots where event_id = p_event;
    insert into public.heat_slots (event_id, heat_id, position, entry_id, vest_colour, source, modifier)
    select p_event, (s ->> 'heat_id')::uuid, (s ->> 'position')::int, nullif(s ->> 'entry_id', '')::uuid, nullif(s ->> 'vest_colour', ''), s -> 'source', nullif(s ->> 'modifier', '')
    from jsonb_array_elements(b.slots) s where exists (select 1 from public.heats h where h.id = (s ->> 'heat_id')::uuid);

    for it in select * from jsonb_array_elements(b.divisions) loop
      update public.divisions set draw = it -> 'draw', draw_locked_at = nullif(it ->> 'draw_locked_at', '')::timestamptz, status = it ->> 'status' where id = (it ->> 'id')::uuid;
    end loop;

    -- the run order: plans made since go (Plan B of the scenario); saved plans return with their items and pins, no actual times, no hold
    delete from public.schedule_plans p where p.event_id = p_event and not exists (select 1 from jsonb_array_elements(b.plans) x where (x ->> 'id')::uuid = p.id);
    for it in select * from jsonb_array_elements(b.plans) loop
      update public.schedule_plans set items = it -> 'items', anchors = it -> 'anchors', defaults = it -> 'defaults', active = (it ->> 'active')::boolean, actual_starts = '{}'::jsonb, hold = null
       where id = (it ->> 'id')::uuid;
    end loop;
  else
    -- rebuild: nothing is known about the first draw; heats that ran go back to scheduled, re-runs go, every draw is unlocked and drawn again by the server
    delete from public.heats where event_id = p_event and rerun_of is not null;
    update public.heats set status = 'scheduled', started_at = null, paused_at = null, paused_total_sec = 0, ended_at = null, published_at = null, reopened_at = null,
      publish_hold = false, flag_out = null where event_id = p_event;
    update public.divisions set draw_locked_at = null, draw = case when draw is not null then jsonb_set(draw, '{status}', '"draft"') end,
      status = case when status in ('running', 'complete') then 'ready' else status end where event_id = p_event;
    update public.schedule_plans set actual_starts = '{}'::jsonb, hold = null where event_id = p_event;
    delete from public.sim_baseline where event_id = p_event;
  end if;

  -- heats that started at a faster clock get their own length back
  update public.heats h set duration_sec = c.original_sec from public.sim_clock c where c.heat_id = h.id and c.event_id = p_event;
  delete from public.sim_clock where event_id = p_event;
  update public.sim_control set state = 'stopped', stats = '{}'::jsonb, blocker = null, run_no = run_no + 1,
    config = coalesce(config, '{}'::jsonb) - 'armed' - 'tie' - 'dead' - 'hold_final' where event_id = p_event returning run_no into v_run;
  insert into public.sim_log (event_id, run_no, kind, text, data) values (p_event, coalesce(v_run, 1), 'reset', case when v_has then 'Reset to the locked draw' else 'Wiped; the draw is being rebuilt' end, v_counts);
  perform private.head_audit(p_event, 'events', p_event, 'simulation_reset', null, v_counts, null);

  perform set_config('app.allow_purge', 'off', true);
  perform set_config('app.draw_bypass', '', true);
  return v_counts;
end $$;

-- Deletes a simulation that was made by Run as simulation (never the Demo or an event of its own), with everything that hangs off it, including published results and
-- its audit lines. Returns the simulator's logins so the server can remove them.
create or replace function public.sim_delete(p_event uuid, p_slug_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_users uuid[]; v_name text;
begin
  ev := private.sim_guard(p_event);
  if ev.simulation_of is null then raise exception 'NOT_A_COPY'; end if;
  if lower(btrim(coalesce(p_slug_confirm, ''))) <> ev.slug then raise exception 'SLUG_MISMATCH'; end if;
  select coalesce(array_agg(virtual_user) filter (where virtual_user is not null), '{}') into v_users from public.sim_seats where event_id = p_event;
  v_name := ev.name;
  perform set_config('app.allow_purge', 'on', true);
  perform set_config('app.draw_bypass', '1', true);
  delete from public.events where id = p_event;
  delete from public.audit_log where event_id = p_event;
  perform set_config('app.allow_purge', 'off', true);
  perform set_config('app.draw_bypass', '', true);
  return jsonb_build_object('users', to_jsonb(v_users), 'name', v_name);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function
  public.clone_event_as_simulation, public.sim_enable, public.sim_capture_baseline, public.sim_set, public.sim_set_mode, public.sim_tick_lock, public.sim_log_add,
  public.sim_stats, public.sim_bind_virtual, public.sim_add_attempt, public.sim_submit_score, public.sim_submit_impression, public.sim_submit_sheet,
  public.sim_view_as, public.sim_live_heat, public.sim_reset(uuid, text, boolean), public.sim_delete from public, anon, authenticated;
grant execute on function
  public.clone_event_as_simulation, public.sim_enable, public.sim_capture_baseline, public.sim_set, public.sim_set_mode, public.sim_tick_lock, public.sim_log_add,
  public.sim_stats, public.sim_add_attempt, public.sim_submit_score, public.sim_submit_impression, public.sim_submit_sheet,
  public.sim_view_as, public.sim_live_heat, public.sim_reset(uuid, text, boolean), public.sim_delete to authenticated;
grant execute on function public.sim_bind_virtual to service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;
