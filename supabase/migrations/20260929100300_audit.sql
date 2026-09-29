-- Phase 3 / step 3: audit trigger. Who (user + seat), what, before, after, when, reason.
-- The reason and a friendlier action name arrive from the privileged functions through
-- transaction-local settings (app.reason, app.audit_action). Secrets are never copied into the log.
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_event uuid; v_seat uuid; v_action text;
begin
  v_old := v_old - 'pin_hash' - 'qr_token_hash';
  v_new := v_new - 'pin_hash' - 'qr_token_hash';
  v_event := (coalesce(v_new, v_old) ->> 'event_id')::uuid;
  select s.id into v_seat from public.judge_seats s where s.event_id = v_event and s.auth_user_id = auth.uid() and s.active limit 1;
  v_action := coalesce(nullif(current_setting('app.audit_action', true), ''), lower(tg_op));
  insert into public.audit_log (event_id, actor_user_id, actor_seat_id, action, table_name, row_id, before, after, reason)
  values (v_event, auth.uid(), v_seat, v_action, tg_table_name, (coalesce(v_new, v_old) ->> 'id')::uuid, v_old, v_new,
          nullif(current_setting('app.reason', true), ''));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['trick_attempts','trick_scores','impression_scores','penalties','heat_results','judge_seats'] loop
    execute format('create trigger z_audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t);
  end loop;
end $$;

-- Heats: only status / manual-override changes are worth a line (the live counter changes constantly).
create trigger z_audit after update on public.heats for each row
  when (old.status is distinct from new.status or old.manual_override is distinct from new.manual_override)
  execute function private.audit_row();
