-- CL1 (0.26.1), part 1: a "test" label on organisations. Additive: no table is rebuilt, no row is changed or removed, no function is dropped.
--
--   * organisations.is_test  (default false). A label only: an organisation marked as test keeps every row, login and file it has.
--     Part 2 (20261113100100) uses it to keep test organisations off the public pages. Switching it back is one update (npm run orgs:test -- unmark <slug>).
--   * A trigger marks an organisation as test the moment it is created when its web address starts with one the tests and scripts use
--     (e2e-, rls-, plat-, evdel-, p4-, reset-). The tests also set the label themselves; this is the safety net for organisations made through the screens.
--   * purge_organisation (the test clean-up helper that deletes an organisation and everything in it) now refuses any organisation that is not marked as test.
--     Arrow, Redbull and EKL are not, so no script or test can ever remove them with it.
--   * public.purge_refusal_probe: asks purge_organisation about one organisation and ALWAYS rolls everything back, so a test can prove the refusal on a real organisation
--     without any risk to it.

alter table public.organisations add column is_test boolean not null default false;
comment on column public.organisations.is_test is 'Marks an automated-test or demo organisation. Hidden from the public pages and from the default Organisations list. A label only: nothing inside is changed.';

-- the web addresses tests and scripts create organisations with (the TypeScript twin is TEST_SLUG_PATTERN in src/lib/platform/organisation.ts; a unit test keeps the two equal)
create or replace function private.is_test_slug(p_slug text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_slug, '') ~ '^(e2e|rls|plat|evdel|p4|reset)-';
$$;
revoke all on function private.is_test_slug from public, anon, authenticated;

create or replace function private.label_test_organisation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_test_slug(new.slug) then new.is_test := true; end if;
  return new;
end $$;
revoke all on function private.label_test_organisation from public, anon, authenticated;

create trigger b_label_test before insert on public.organisations for each row execute function private.label_test_organisation();

-- organisers can edit their own organisation's name and branding, never this label
revoke update (is_test) on public.organisations from anon, authenticated;

-- ---------------------------------------------------------------- purge only ever touches organisations marked as test
create or replace function public.purge_organisation(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_events uuid[];
begin
  if not exists (select 1 from public.organisations where id = p_org and is_test) then
    raise exception 'NOT_A_TEST_ORGANISATION: only an organisation marked as test can be purged';
  end if;
  select coalesce(array_agg(id), '{}') into v_events from public.events where organisation_id = p_org;
  perform set_config('app.allow_purge', 'on', true);
  delete from public.organisations where id = p_org;
  delete from public.audit_log where event_id = any (v_events) or organisation_id = p_org;
  perform set_config('app.allow_purge', 'off', true);
end $$;
revoke all on function public.purge_organisation from public, anon, authenticated;
grant execute on function public.purge_organisation to service_role;

-- Returns what purge_organisation says about this organisation. Whatever it does is undone before returning (the inner block always ends in an error, which rolls it back),
-- so asking about Arrow, Redbull or EKL cannot change them: a refusal returns its message, and a (wrong) acceptance returns 'NOT_REFUSED' with nothing deleted.
create or replace function public.purge_refusal_probe(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.purge_organisation(p_org);
    raise exception 'PROBE_NOT_REFUSED';
  exception when others then
    if sqlerrm = 'PROBE_NOT_REFUSED' then return 'NOT_REFUSED'; end if;
    return sqlerrm;
  end;
end $$;
revoke all on function public.purge_refusal_probe from public, anon, authenticated;
grant execute on function public.purge_refusal_probe to service_role;
