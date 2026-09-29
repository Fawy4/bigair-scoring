-- Phase 3 / step 4: Row Level Security on every table, least-privilege grants, safe views.
-- Rule of thumb: the database says who may do what; the app only asks.

-- ---------------------------------------------------------------- helper functions (security definer, so policies never recurse)
create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organisation_id = p_org and m.user_id = auth.uid());
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.organisation_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

create or replace function private.is_event_organiser(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e join public.memberships m on m.organisation_id = e.organisation_id
    where e.id = p_event and m.user_id = auth.uid());
$$;

create or replace function private.seat_id(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.judge_seats s
  where s.event_id = p_event and s.auth_user_id = auth.uid() and s.active and s.status = 'active' limit 1;
$$;

create or replace function private.seat_role(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.role from public.judge_seats s
  where s.event_id = p_event and s.auth_user_id = auth.uid() and s.active and s.status = 'active' limit 1;
$$;

create or replace function private.has_seat(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.seat_id(p_event) is not null;
$$;

create or replace function private.event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.status in ('published', 'live', 'complete'));
$$;

-- "ended" also covers a running heat whose timer has run out (no server process is needed to notice)
create or replace function private.heat_effective_status(p_heat uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when h.status = 'running' and h.started_at is not null
              and now() >= h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec)
         then 'ended' else h.status end
  from public.heats h where h.id = p_heat;
$$;

-- Setting for a division: the division's own override wins (even an explicit null = "unlimited"), else the scoring model.
create or replace function private.division_heat_setting(p_division uuid, p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when d.scoring_overrides -> 'heat' ? p_key then d.scoring_overrides -> 'heat' -> p_key else m.json -> 'heat' -> p_key end
  from public.divisions d left join public.scoring_models m on m.id = d.scoring_model_id
  where d.id = p_division;
$$;

-- May the calling judge write a mark for this heat right now? Panel member + heat running/paused (trick marks) or
-- ended within the grace period (trick and impression marks).
create or replace function private.judge_can_write(p_heat uuid, p_impression boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  h public.heats; v_eff text; v_end timestamptz; v_grace int;
begin
  select * into h from public.heats where id = p_heat;
  if not found then return false; end if;
  if not exists (
    select 1 from public.divisions d
    join public.panel_members pm on pm.panel_id = d.panel_id
    join public.judge_seats s on s.id = pm.judge_seat_id
    where d.id = h.division_id and s.auth_user_id = auth.uid() and s.active and s.status = 'active'
  ) then return false; end if;
  v_eff := private.heat_effective_status(p_heat);
  if not p_impression and v_eff in ('running', 'paused') then return true; end if;
  if v_eff = 'ended' then
    v_end := coalesce(h.ended_at, h.started_at + make_interval(secs => h.duration_sec + h.paused_total_sec));
    select coalesce((e.settings ->> 'judgeGraceSec')::int, 180) into v_grace from public.events e where e.id = h.event_id;
    return v_end is not null and now() < v_end + make_interval(secs => v_grace);
  end if;
  return false;
end $$;

grant execute on all functions in schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------- privileges: start from nothing, grant only what is needed
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- public reading (row filters decide what is really visible)
grant select on public.divisions, public.rounds, public.heats, public.heat_slots, public.heat_results, public.schedule_plans,
  public.wind_calls, public.scoring_models, public.format_templates, public.trick_vocabularies to anon, authenticated;
grant select (id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding, created_at, updated_at)
  on public.events to anon, authenticated;

-- signed-in users (organisers and officials): row policies below narrow this further
grant select on public.organisations, public.memberships, public.panels, public.panel_members, public.trick_attempts,
  public.trick_scores, public.impression_scores, public.audit_log to authenticated;
grant update (name, branding) on public.organisations to authenticated;
grant insert (organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding) on public.events to authenticated;
grant update (name, slug, location, timezone, start_date, end_date, status, settings, branding) on public.events to authenticated;
grant delete on public.events to authenticated;
grant insert, update, delete on public.divisions, public.rounds, public.heats, public.heat_slots, public.entries, public.riders,
  public.panels, public.panel_members, public.schedule_plans, public.wind_calls, public.penalties,
  public.scoring_models, public.format_templates, public.trick_vocabularies to authenticated;
grant select on public.entries, public.riders, public.penalties to authenticated;
-- hashes are readable by nobody but the server
grant select (id, event_id, name, role, auth_user_id, bound_at, device_label, active, scores, spotter_assignment, status, locked, created_at, updated_at)
  on public.judge_seats to authenticated;
grant insert (event_id, name, role, device_label, active, scores, spotter_assignment, status) on public.judge_seats to authenticated;
grant update (name, role, device_label, active, scores, spotter_assignment, status, locked) on public.judge_seats to authenticated;
grant delete on public.judge_seats to authenticated;
-- marks are written through submit_* functions that run as the caller
grant insert, update on public.trick_scores, public.impression_scores to authenticated;
grant select on public.heat_results to authenticated;

-- ---------------------------------------------------------------- RLS on everything
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
-- join_attempts: RLS on, no policies, no grants = service role only.

-- ---------------------------------------------------------------- policies
-- organisations / memberships
create policy org_read on public.organisations for select to authenticated using (private.is_org_member(id));
create policy org_update on public.organisations for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy member_read on public.memberships for select to authenticated using (user_id = auth.uid() or private.is_org_admin(organisation_id));

-- events
create policy public_read on public.events for select to anon, authenticated using (status in ('published', 'live', 'complete'));
create policy org_read on public.events for select to authenticated using (private.is_org_member(organisation_id));
create policy seat_read on public.events for select to authenticated using (private.has_seat(id));
create policy org_insert on public.events for insert to authenticated with check (private.is_org_member(organisation_id));
create policy org_update on public.events for update to authenticated using (private.is_org_member(organisation_id)) with check (private.is_org_member(organisation_id));
create policy org_delete on public.events for delete to authenticated using (private.is_org_member(organisation_id));

-- riders (personal data: organisers only; everyone else uses v_entries)
create policy org_all on public.riders for all to authenticated using (private.is_org_member(organisation_id)) with check (private.is_org_member(organisation_id));

-- presets
create policy read_models on public.scoring_models for select to anon, authenticated
  using (organisation_id is null or private.is_org_member(organisation_id) or exists (select 1 from public.divisions d where d.scoring_model_id = scoring_models.id));
create policy org_write_models on public.scoring_models for all to authenticated
  using (organisation_id is not null and private.is_org_member(organisation_id)) with check (organisation_id is not null and private.is_org_member(organisation_id));
create policy read_formats on public.format_templates for select to anon, authenticated
  using (organisation_id is null or private.is_org_member(organisation_id) or exists (select 1 from public.divisions d where d.format_template_id = format_templates.id));
create policy org_write_formats on public.format_templates for all to authenticated
  using (organisation_id is not null and private.is_org_member(organisation_id)) with check (organisation_id is not null and private.is_org_member(organisation_id));
create policy read_vocab on public.trick_vocabularies for select to anon, authenticated
  using ((organisation_id is null and event_id is null) or (event_id is not null and (private.event_is_public(event_id) or private.has_seat(event_id) or private.is_event_organiser(event_id)))
         or (organisation_id is not null and private.is_org_member(organisation_id)));
create policy org_write_vocab on public.trick_vocabularies for all to authenticated
  using (organisation_id is not null and private.is_org_member(organisation_id)) with check (organisation_id is not null and private.is_org_member(organisation_id));

-- event-scoped configuration: organisers full access; officials of the event read; the public reads published events
do $$
declare t text;
begin
  foreach t in array array['divisions','rounds','heats','heat_slots','panels','panel_members','schedule_plans','wind_calls','entries','penalties'] loop
    execute format('create policy org_all on public.%I for all to authenticated using (private.is_event_organiser(event_id)) with check (private.is_event_organiser(event_id))', t);
  end loop;
  foreach t in array array['divisions','rounds','heats','heat_slots','panels','panel_members','schedule_plans','wind_calls','penalties','trick_attempts','heat_results'] loop
    execute format('create policy seat_read on public.%I for select to authenticated using (private.has_seat(event_id))', t);
  end loop;
  foreach t in array array['divisions','rounds','heats','heat_slots','heat_results','wind_calls'] loop
    execute format('create policy public_read on public.%I for select to anon, authenticated using (private.event_is_public(event_id))', t);
  end loop;
  foreach t in array array['trick_attempts','trick_scores','impression_scores','heat_results','audit_log'] loop
    execute format('create policy org_read on public.%I for select to authenticated using (private.is_event_organiser(event_id))', t);
  end loop;
end $$;
create policy public_read on public.schedule_plans for select to anon, authenticated using (active and private.event_is_public(event_id));

-- the head judge runs the heat: timer buttons, slot flags, wind calls, penalties
create policy head_update on public.heats for update to authenticated using (private.seat_role(event_id) = 'head') with check (private.seat_role(event_id) = 'head');
create policy head_update on public.heat_slots for update to authenticated using (private.seat_role(event_id) = 'head') with check (private.seat_role(event_id) = 'head');
create policy head_insert on public.wind_calls for insert to authenticated with check (private.seat_role(event_id) = 'head');
create policy head_write on public.penalties for all to authenticated using (private.seat_role(event_id) = 'head') with check (private.seat_role(event_id) = 'head');
create policy head_read on public.audit_log for select to authenticated using (private.seat_role(event_id) = 'head');

-- marks: a judge sees and writes only their own; head judge and announcer read everything
do $$
declare t text;
begin
  foreach t in array array['trick_scores','impression_scores'] loop
    execute format('create policy own_read on public.%I for select to authenticated using (judge_seat_id = private.seat_id(event_id))', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (private.seat_role(event_id) in (''head'', ''announcer''))', t);
  end loop;
end $$;
create policy own_insert on public.trick_scores for insert to authenticated
  with check (judge_seat_id = private.seat_id(event_id) and private.judge_can_write(heat_id, false));
create policy own_update on public.trick_scores for update to authenticated
  using (judge_seat_id = private.seat_id(event_id)) with check (judge_seat_id = private.seat_id(event_id) and private.judge_can_write(heat_id, false));
create policy own_insert on public.impression_scores for insert to authenticated
  with check (judge_seat_id = private.seat_id(event_id) and private.judge_can_write(heat_id, true));
create policy own_update on public.impression_scores for update to authenticated
  using (judge_seat_id = private.seat_id(event_id)) with check (judge_seat_id = private.seat_id(event_id) and private.judge_can_write(heat_id, true));

-- seats
create policy org_all on public.judge_seats for all to authenticated using (private.is_event_organiser(event_id)) with check (private.is_event_organiser(event_id));
create policy head_read on public.judge_seats for select to authenticated using (private.seat_role(event_id) = 'head');
create policy own_read on public.judge_seats for select to authenticated using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------- the rider chip view: names and identifiers, never contact details
create view public.v_entries with (security_invoker = false) as
select e.id, e.event_id, e.division_id, e.seed, e.status, e.identifiers,
       r.first_name, r.last_name, r.nationality, r.sponsor, r.photo_url
from public.entries e join public.riders r on r.id = e.rider_id
where private.is_event_organiser(e.event_id) or private.has_seat(e.event_id)
   or (private.event_is_public(e.event_id) and e.status in ('confirmed', 'withdrawn', 'no_show'));
grant select on public.v_entries to anon, authenticated;
