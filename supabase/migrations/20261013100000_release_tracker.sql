-- Release tracker (branch release-tracker, owner's brief of 3 Oct 2026).
-- docs/RELEASES.md lists every version with its "What to test" checks. The platform owner ticks those checks on the live address;
-- each tick is stored per version with who and when, and "Confirm version tested" records who signed the version off.
-- 1. release_check_ticks: one row per ticked check (version + a key made from the check's words, so a reworded check needs a new tick).
-- 2. release_signoffs: one row per version confirmed as tested.
-- 3. Platform admins (owner and staff) read them; only the platform owner ticks and signs off, through the functions below. Organisers, officials and visitors see nothing.

-- ---------------------------------------------------------------- 1, 2. tables
create table public.release_check_ticks (
  version text not null check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  check_key text not null check (check_key ~ '^[a-z0-9]{1,16}$'),
  check_text text not null check (char_length(check_text) between 1 and 500),
  ticked_by uuid references auth.users on delete set null,
  ticked_at timestamptz not null default now(),
  primary key (version, check_key)
);
create index on public.release_check_ticks (ticked_by);

create table public.release_signoffs (
  version text primary key check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  checks_total int not null check (checks_total >= 0),
  tested_by uuid references auth.users on delete set null,
  tested_at timestamptz not null default now()
);
create index on public.release_signoffs (tested_by);

alter table public.release_check_ticks enable row level security;
alter table public.release_signoffs enable row level security;
-- no direct writes: the functions below check who is asking and write the audit line
grant select on public.release_check_ticks, public.release_signoffs to authenticated;
create policy admin_read on public.release_check_ticks for select to authenticated using (private.is_platform_admin());
create policy admin_read on public.release_signoffs for select to authenticated using (private.is_platform_admin());

-- ---------------------------------------------------------------- 3. functions
-- Tick or untick one check. Unticking a check of a version confirmed as tested takes the "tested" status away (it is no longer fully checked).
create or replace function public.admin_release_tick(p_version text, p_key text, p_text text, p_ticked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_text text := left(btrim(coalesce(p_text, '')), 500);
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_version is null or p_version !~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$' then raise exception 'INVALID_VERSION'; end if;
  if p_key is null or p_key !~ '^[a-z0-9]{1,16}$' or char_length(v_text) = 0 then raise exception 'INVALID_CHECK'; end if;
  if p_ticked then
    insert into public.release_check_ticks (version, check_key, check_text, ticked_by)
    values (p_version, p_key, v_text, auth.uid())
    on conflict (version, check_key) do nothing;
    if found then
      perform private.platform_audit('release_check_ticked', null, 'release_check_ticks', null, null, jsonb_build_object('version', p_version, 'check', v_text), null);
    end if;
  else
    delete from public.release_check_ticks where version = p_version and check_key = p_key;
    if found then
      perform private.platform_audit('release_check_unticked', null, 'release_check_ticks', null, jsonb_build_object('version', p_version, 'check', v_text), null, null);
      delete from public.release_signoffs where version = p_version;
    end if;
  end if;
end $$;

-- "Confirm version tested": refused while one of the version's checks (p_keys, from docs/RELEASES.md) is not ticked.
create or replace function public.admin_release_mark_tested(p_version text, p_keys text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_open int;
begin
  if not private.is_platform_owner() then raise exception 'NOT_ALLOWED'; end if;
  if p_version is null or p_version !~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$' then raise exception 'INVALID_VERSION'; end if;
  if p_keys is null or cardinality(p_keys) = 0 or cardinality(p_keys) > 50 then raise exception 'INVALID_CHECK'; end if;
  select count(*) into v_open from unnest(p_keys) k
   where not exists (select 1 from public.release_check_ticks t where t.version = p_version and t.check_key = k);
  if v_open > 0 then raise exception 'RELEASE_CHECKS_OPEN'; end if;
  insert into public.release_signoffs (version, checks_total, tested_by) values (p_version, cardinality(p_keys), auth.uid())
  on conflict (version) do nothing;
  if found then
    perform private.platform_audit('release_marked_tested', null, 'release_signoffs', null, null, jsonb_build_object('version', p_version, 'checks', cardinality(p_keys)), null);
  end if;
end $$;

-- Every tick and sign-off with the e-mail address of who did it (e-mail addresses are not readable otherwise).
create or replace function public.admin_release_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'ticks', coalesce((select jsonb_agg(jsonb_build_object('version', t.version, 'key', t.check_key, 'at', t.ticked_at, 'by', u.email) order by t.ticked_at)
                         from public.release_check_ticks t left join auth.users u on u.id = t.ticked_by), '[]'::jsonb),
    'signoffs', coalesce((select jsonb_agg(jsonb_build_object('version', s.version, 'at', s.tested_at, 'by', u.email, 'total', s.checks_total))
                            from public.release_signoffs s left join auth.users u on u.id = s.tested_by), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_release_tick, public.admin_release_mark_tested, public.admin_release_status from public, anon;
grant execute on function public.admin_release_tick, public.admin_release_mark_tested, public.admin_release_status to authenticated;
