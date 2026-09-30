-- Phase 4a-1c: the platform owner can move an event to another organisation ("Move event to another organisation" in /admin).
-- One function = one transaction: either everything moves or nothing does.
--   * the event row (with its settings and branding), its divisions, rounds, heats, slots, panels, officials, entries, results and
--     schedule keep their ids and simply follow the event (they hang off event_id)
--   * riders belong to an organisation, so each rider entered in the event is matched in the new organisation by email (reused) or copied;
--     the entries are repointed; a rider left with no entries in the old organisation is removed from it
--   * scoring models and format templates that belong to the OLD organisation and are used by the event's divisions are copied to the new one
--     (system presets need nothing); the event's identification scheme is stored inside the event, so it travels with it
-- Refused while any heat of the event is running or paused, for the same organisation, and for anybody who is not a platform owner.

-- The events of one organisation, for the /admin screen (admins cannot read other organisations' events through the tables).
create or replace function public.admin_organisation_events(p_org uuid) returns table (
  id uuid, name text, slug text, status text, start_date date, end_date date, divisions_count int, running_heats int
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select e.id, e.name, e.slug, e.status, e.start_date, e.end_date,
         (select count(*)::int from public.divisions d where d.event_id = e.id),
         (select count(*)::int from public.heats h where h.event_id = e.id and h.status in ('running', 'paused'))
  from public.events e where e.organisation_id = p_org
  order by e.start_date desc nulls last, e.name;
end $$;

create or replace function public.admin_move_event(p_event uuid, p_target_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.events; src public.organisations; dst public.organisations;
  r record; v_new uuid; v_key text; v_n int;
  v_copied int := 0; v_reused int := 0; v_removed int := 0; v_presets int := 0;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into dst from public.organisations where id = p_target_org;
  if not found then raise exception 'TARGET_NOT_FOUND'; end if;
  if ev.organisation_id = p_target_org then raise exception 'SAME_ORGANISATION'; end if;
  if exists (select 1 from public.heats h where h.event_id = p_event and h.status in ('running', 'paused')) then raise exception 'HEAT_RUNNING'; end if;
  select * into src from public.organisations where id = ev.organisation_id;

  -- 1. organisation presets used by the event's divisions (scoring models, then format templates)
  for r in select distinct m.* from public.scoring_models m join public.divisions d on d.scoring_model_id = m.id
           where d.event_id = p_event and m.organisation_id = ev.organisation_id loop
    select t.id into v_new from public.scoring_models t where t.organisation_id = p_target_org and t.key = r.key and t.version = r.version and t.content_hash = r.content_hash;
    if v_new is null then
      v_key := r.key; v_n := 1;
      while exists (select 1 from public.scoring_models t where t.organisation_id = p_target_org and t.key = v_key and t.version = r.version) loop
        v_n := v_n + 1; v_key := r.key || '-moved' || case when v_n > 2 then '-' || v_n else '' end;
      end loop;
      insert into public.scoring_models (organisation_id, key, name, version, json, content_hash) values (p_target_org, v_key, r.name, r.version, r.json, r.content_hash) returning id into v_new;
      v_presets := v_presets + 1;
    end if;
    update public.divisions set scoring_model_id = v_new where event_id = p_event and scoring_model_id = r.id;
    v_new := null;
  end loop;
  for r in select distinct f.* from public.format_templates f join public.divisions d on d.format_template_id = f.id
           where d.event_id = p_event and f.organisation_id = ev.organisation_id loop
    select t.id into v_new from public.format_templates t where t.organisation_id = p_target_org and t.key = r.key and t.version = r.version and t.content_hash = r.content_hash;
    if v_new is null then
      v_key := r.key; v_n := 1;
      while exists (select 1 from public.format_templates t where t.organisation_id = p_target_org and t.key = v_key and t.version = r.version) loop
        v_n := v_n + 1; v_key := r.key || '-moved' || case when v_n > 2 then '-' || v_n else '' end;
      end loop;
      insert into public.format_templates (organisation_id, key, name, version, json, content_hash) values (p_target_org, v_key, r.name, r.version, r.json, r.content_hash) returning id into v_new;
      v_presets := v_presets + 1;
    end if;
    update public.divisions set format_template_id = v_new where event_id = p_event and format_template_id = r.id;
    v_new := null;
  end loop;

  -- 2. riders: reuse the person in the new organisation (same email) or copy them, then repoint this event's entries
  for r in select distinct ri.* from public.riders ri join public.entries en on en.rider_id = ri.id where en.event_id = p_event loop
    v_new := null;
    if r.email is not null then
      select t.id into v_new from public.riders t where t.organisation_id = p_target_org and lower(t.email) = lower(r.email);
    end if;
    if v_new is null then
      insert into public.riders (organisation_id, first_name, last_name, nationality, dob, email, phone, sponsor, woo_id, photo_url)
      values (p_target_org, r.first_name, r.last_name, r.nationality, r.dob, r.email, r.phone, r.sponsor, r.woo_id, r.photo_url) returning id into v_new;
      v_copied := v_copied + 1;
    else
      v_reused := v_reused + 1;
    end if;
    update public.entries set rider_id = v_new where event_id = p_event and rider_id = r.id;
    if not exists (select 1 from public.entries en where en.rider_id = r.id) then
      delete from public.riders where id = r.id;
      v_removed := v_removed + 1;
    end if;
  end loop;

  -- 3. the event itself, and event-level vocabularies that carried the organisation
  update public.trick_vocabularies set organisation_id = p_target_org where event_id = p_event and organisation_id is not null;
  update public.events set organisation_id = p_target_org where id = p_event;

  perform private.platform_audit('event_moved', p_target_org, 'events', p_event,
    jsonb_build_object('organisation', src.name, 'organisation_slug', src.slug, 'organisation_id', src.id, 'event', ev.name),
    jsonb_build_object('organisation', dst.name, 'organisation_slug', dst.slug, 'organisation_id', dst.id, 'event', ev.name,
                       'riders_copied', v_copied, 'riders_reused', v_reused, 'riders_removed', v_removed, 'presets_copied', v_presets), null);
  return jsonb_build_object('riders_copied', v_copied, 'riders_reused', v_reused, 'riders_removed', v_removed, 'presets_copied', v_presets);
end $$;

revoke all on function public.admin_organisation_events, public.admin_move_event from public, anon, authenticated;
grant execute on function public.admin_organisation_events, public.admin_move_event to authenticated;
