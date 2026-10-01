-- Phase 7a-1: expired Reset snapshots are removed when /admin/health loads (and by every Reset and Restore call), so no scheduled job is needed.
-- (A snapshot that is refused as expired cannot delete itself: the refusal rolls the transaction back.)
create or replace function public.purge_expired_reset_snapshots() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_platform_admin() then raise exception 'NOT_ALLOWED'; end if;
  delete from public.event_reset_snapshots where expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_reset_snapshots from public, anon, authenticated;
grant execute on function public.purge_expired_reset_snapshots to authenticated;
