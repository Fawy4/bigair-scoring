-- Phase 3 / step 1: shared helpers. `private` is not exposed through the API (only `public` is).
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
