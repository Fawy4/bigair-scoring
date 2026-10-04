-- Export 1 (results export and event backup): two small functions, nothing else. The export itself only READS; the one thing it writes is its audit line.
--   export_role(event)           who the caller is for exports: 'organiser' (an organiser of the event or the platform owner), 'head' (the event's head judge seat) or null.
--   log_export(event, kind, ...) writes "results exported" / "backup downloaded" into the audit log (who, when, which file). The caller's right is checked here, in the
--                                database, so a route that forgets to check still cannot write the line for somebody who may not export.
-- Judges, spotters, announcers and observers get null / NOT_ALLOWED. The backup is organiser-only; the draft box (heats under review) is organiser-only.

create or replace function public.export_role(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when private.is_event_organiser(p_event) then 'organiser'
    when coalesce(private.seat_role(p_event), '') = 'head' then 'head'
    else null end;
$$;

create or replace function public.log_export(p_event uuid, p_kind text, p_include_draft boolean default false, p_heats int default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.export_role(p_event);
  ev public.events;
  v_who text;
begin
  if v_role is null then raise exception 'NOT_ALLOWED'; end if;
  if p_kind not in ('results_csv', 'results_print', 'backup') then raise exception 'NOT_ALLOWED'; end if;
  if p_kind = 'backup' and v_role <> 'organiser' then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_include_draft, false) and v_role <> 'organiser' then raise exception 'NOT_ALLOWED'; end if;
  select * into ev from public.events where id = p_event;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_role = 'organiser' then
    select u.email into v_who from auth.users u where u.id = auth.uid();
  else
    select s.name into v_who from public.judge_seats s where s.event_id = p_event and s.auth_user_id = auth.uid() and s.active and s.status = 'active' limit 1;
  end if;
  insert into public.audit_log (event_id, organisation_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (p_event, ev.organisation_id, auth.uid(), private.seat_id(p_event),
          case when p_kind = 'backup' then 'backup_downloaded' else 'results_exported' end,
          'events', p_event, null,
          jsonb_build_object('kind', p_kind, 'role', v_role, 'by', coalesce(v_who, v_role), 'include_draft', coalesce(p_include_draft, false), 'heats', p_heats),
          null);
end $$;

revoke all on function public.export_role(uuid), public.log_export(uuid, text, boolean, int) from public, anon;
grant execute on function public.export_role(uuid), public.log_export(uuid, text, boolean, int) to authenticated;
