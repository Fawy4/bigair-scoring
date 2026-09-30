-- Phase 4a-1 UX round: publish hold. The head judge or the organiser can hold a published result back from the public site and
-- release it later (for example the final's podium). Phase 5 uses it at publish time and on the head judge console.

alter table public.heats add column publish_hold boolean not null default false;

create or replace function private.heat_is_held(p_heat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select h.publish_hold from public.heats h where h.id = p_heat), false);
$$;
grant execute on function private.heat_is_held to anon, authenticated, service_role;

-- Public pages never see the results of a held heat (organisers and officials of the event still do).
drop policy public_read on public.heat_results;
create policy public_read on public.heat_results for select to anon, authenticated
  using (private.event_is_public(event_id) and not private.heat_is_held(heat_id));
create policy staff_read on public.heat_results for select to authenticated
  using (private.is_event_organiser(event_id) or private.has_seat(event_id));

-- The hold is changed only through set_publish_hold (who, when and why are audited), never by editing the column.
create or replace function private.heats_guard() returns trigger
language plpgsql as $$
declare
  priv boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  v_end timestamptz;
  v_started timestamptz := new.started_at; v_paused_at timestamptz := new.paused_at;
  v_paused_total int := new.paused_total_sec; v_ended timestamptz := new.ended_at; v_published timestamptz := new.published_at;
begin
  if not priv then
    -- server-owned columns cannot be edited by hand
    new.started_at := old.started_at; new.paused_at := old.paused_at; new.paused_total_sec := old.paused_total_sec;
    new.ended_at := old.ended_at; new.published_at := old.published_at; new.live_rev := old.live_rev;
    new.event_id := old.event_id; new.division_id := old.division_id; new.round_id := old.round_id;
    new.publish_hold := old.publish_hold;
    v_started := old.started_at; v_paused_at := old.paused_at; v_paused_total := old.paused_total_sec; v_ended := old.ended_at; v_published := old.published_at;
  end if;

  if new.status is distinct from old.status then
    if not priv and not (
      (old.status = 'scheduled' and new.status in ('running', 'cancelled')) or
      (old.status = 'running' and new.status in ('paused', 'ended', 'cancelled')) or
      (old.status = 'paused' and new.status in ('running', 'ended', 'cancelled')) or
      (old.status = 'ended' and new.status in ('under_review', 'cancelled')) or
      (old.status = 'under_review' and new.status in ('cancelled')) or
      (old.status = 'published' and new.status = 'under_review')
    ) then
      raise exception 'ILLEGAL_HEAT_TRANSITION: % -> %', old.status, new.status;
    end if;

    if old.status = 'scheduled' and new.status = 'running' then
      v_started := now();
    elsif old.status = 'running' and new.status = 'paused' then
      v_paused_at := now();
    elsif old.status = 'paused' and new.status = 'running' then
      v_paused_total := old.paused_total_sec + greatest(0, ceil(extract(epoch from (now() - coalesce(old.paused_at, now()))))::int);
      v_paused_at := null;
    elsif new.status = 'ended' and old.status in ('running', 'paused') then
      if old.status = 'paused' then
        v_ended := coalesce(old.paused_at, now());
      else
        v_end := old.started_at + make_interval(secs => old.duration_sec + old.paused_total_sec);
        v_ended := least(now(), coalesce(v_end, now()));
      end if;
    elsif new.status = 'published' then
      v_published := now();
    end if;

    -- privileged callers (publish, seeds, tests) may set a column explicitly; everyone else gets the computed value
    if not priv or new.started_at is not distinct from old.started_at then new.started_at := v_started; end if;
    if not priv or new.paused_at is not distinct from old.paused_at then new.paused_at := v_paused_at; end if;
    if not priv or new.paused_total_sec is not distinct from old.paused_total_sec then new.paused_total_sec := v_paused_total; end if;
    if not priv or new.ended_at is not distinct from old.ended_at then new.ended_at := v_ended; end if;
    if not priv or new.published_at is not distinct from old.published_at then new.published_at := v_published; end if;
  end if;
  return new;
end $$;

-- A hold or release is worth an audit line.
drop trigger z_audit on public.heats;
create trigger z_audit after update on public.heats for each row
  when (old.status is distinct from new.status or old.manual_override is distinct from new.manual_override or old.publish_hold is distinct from new.publish_hold)
  execute function private.audit_row();

create or replace function public.set_publish_hold(p_heat uuid, p_hold boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h public.heats;
begin
  select * into h from public.heats where id = p_heat;
  if not found then raise exception 'HEAT_NOT_FOUND'; end if;
  if not (private.is_event_organiser(h.event_id) or private.seat_role(h.event_id) = 'head') then raise exception 'NOT_ALLOWED'; end if;
  if p_hold and (p_reason is null or char_length(btrim(p_reason)) < 3) then raise exception 'REASON_REQUIRED'; end if;
  if h.publish_hold is not distinct from p_hold then return; end if;
  perform set_config('app.audit_action', case when p_hold then 'publish_hold' else 'publish_release' end, true);
  perform set_config('app.reason', coalesce(nullif(btrim(p_reason), ''), ''), true);
  update public.heats set publish_hold = p_hold where id = p_heat;
  perform set_config('app.audit_action', '', true);
  perform set_config('app.reason', '', true);
end $$;
revoke all on function public.set_publish_hold from public, anon, authenticated;
grant execute on function public.set_publish_hold to authenticated;
