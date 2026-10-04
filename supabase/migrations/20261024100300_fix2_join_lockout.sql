-- Fix 2, item 2: A1b-7 — strangers' wrong PINs must never lock the officials out.
--   Before: 10 wrong tries from one address, OR 100 wrong tries per event from anywhere, refused even the RIGHT PIN for 10 minutes (anyone with the join address could
--   lock every official out, a replacement judge included).
--   Now:
--     * the limit counts wrong tries per DEVICE AND ADDRESS (the phone's anonymous login on that connection): 10 wrong tries in 10 minutes from the same phone on the same
--       connection are refused, even with the right PIN, until they age out. Any other phone, or the same phone on another connection, is not affected.
--     * a right PIN from a device that has not failed ten times always works.
--     * the only per-event brake left is slow: after 20 wrong tries at the event in 10 minutes a wrong guess waits one second and only one wrong guess at a time is
--       weighed per event (a second one answers "too many tries" at once, holding no connection). A right PIN never waits and never meets the brake.
--     * officials who are already joined are not touched by any of this (it only runs when somebody joins).

alter table public.join_attempts add column if not exists user_id uuid;
create index if not exists join_attempts_pair_idx on public.join_attempts (event_id, user_id, ip, at desc) where not ok;

drop function if exists private.join_rate_limited(uuid, text);
create or replace function private.join_rate_limited(p_event uuid, p_ip text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.join_attempts j
           where j.event_id = p_event and j.ip = p_ip and j.user_id is not distinct from p_user and not j.ok and j.at > now() - interval '10 minutes') >= 10;
$$;
revoke all on function private.join_rate_limited(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.bind_seat_by_pin(p_event uuid, p_pin text, p_user uuid, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; v_wrong int;
begin
  if private.join_rate_limited(p_event, p_ip, p_user) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  select * into s from public.judge_seats x
   where x.event_id = p_event and x.active and x.status = 'active' and x.pin_hash is not null and x.pin_hash = extensions.crypt(p_pin, x.pin_hash) limit 1;
  if not found then
    select count(*) into v_wrong from public.join_attempts j where j.event_id = p_event and not j.ok and j.at > now() - interval '10 minutes';
    if v_wrong >= 20 then
      -- the slow per-event brake against sustained guessing: one wrong guess per second at most, and nobody queues behind it
      if not pg_try_advisory_xact_lock(hashtextextended(p_event::text, 0)) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
      perform pg_sleep(1);
    end if;
    insert into public.join_attempts (event_id, ip, user_id, ok) values (p_event, p_ip, p_user, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_PIN');
  end if;
  return private.bind_seat(s, p_user, p_ip, 'PIN');
end $$;

create or replace function public.bind_seat_by_token(p_event uuid, p_token text, p_user uuid, p_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.judge_seats; v jsonb;
begin
  if private.join_rate_limited(p_event, p_ip, p_user) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  select * into s from public.judge_seats x
   where x.event_id = p_event and x.active and x.status = 'active' and x.qr_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and (x.qr_token_expires_at is null or x.qr_token_expires_at > now()) limit 1;
  if not found then
    insert into public.join_attempts (event_id, ip, user_id, ok) values (p_event, p_ip, p_user, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;
  v := private.bind_seat(s, p_user, p_ip, 'QR code');
  if (v ->> 'ok')::boolean then -- single use
    update public.judge_seats set qr_token_hash = null, qr_token_expires_at = null where id = s.id;
  end if;
  return v;
end $$;
revoke all on function public.bind_seat_by_pin, public.bind_seat_by_token from public, anon, authenticated;
grant execute on function public.bind_seat_by_pin, public.bind_seat_by_token to service_role;
