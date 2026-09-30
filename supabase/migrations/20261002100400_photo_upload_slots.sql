-- Phase 4a-2: the public registration page may upload a rider photo. The server asks for a slot first: it checks that registration is
-- open, that the event is live on the public site and that the address has not asked too often, then gives back a path inside the
-- organisation's own "reg" folder of the private rider-photos bucket. Only the server can call this function.
alter table public.form_attempts drop constraint form_attempts_kind_check;
alter table public.form_attempts add constraint form_attempts_kind_check check (kind in ('register', 'self_add', 'photo'));

-- Limits per address and hour: 5 registrations, 5 self-adds, 10 photo slots (a photo may need a second try); per event: 300 / 60 / 600.
create or replace function private.form_rate_limited(p_event uuid, p_kind text, p_ip text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_limited boolean; v_per_event int; v_per_ip int;
begin
  delete from public.form_attempts where at < now() - interval '2 days';
  v_per_event := case p_kind when 'register' then 300 when 'photo' then 600 else 60 end;
  v_per_ip := case p_kind when 'photo' then 10 else 5 end;
  select (select count(*) from public.form_attempts f where f.event_id = p_event and f.kind = p_kind and f.ip = p_ip and f.at > now() - interval '1 hour') >= v_per_ip
      or (select count(*) from public.form_attempts f where f.event_id = p_event and f.kind = p_kind and f.at > now() - interval '1 hour') >= v_per_event
    into v_limited;
  if v_limited then return true; end if;
  insert into public.form_attempts (event_id, kind, ip) values (p_event, p_kind, p_ip);
  return false;
end $$;

create or replace function public.request_photo_upload(p_event_slug text, p_ext text, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events; v_ext text := lower(coalesce(p_ext, ''));
begin
  select * into ev from public.events where slug = lower(coalesce(p_event_slug, ''));
  if not found or ev.archived_at is not null or not private.org_is_active(ev.organisation_id) then
    return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_FOUND');
  end if;
  if private.form_rate_limited(ev.id, 'photo', coalesce(nullif(p_ip, ''), 'unknown')) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  if not private.registration_open(ev) then return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED'); end if;
  if v_ext not in ('jpg', 'jpeg', 'png', 'webp') then return jsonb_build_object('ok', false, 'error', 'INVALID_PHOTO'); end if;
  return jsonb_build_object('ok', true, 'path', ev.organisation_id::text || '/reg/' || gen_random_uuid()::text || '.' || v_ext);
end $$;
revoke all on function public.request_photo_upload from public, anon, authenticated;
grant execute on function public.request_photo_upload to service_role;
