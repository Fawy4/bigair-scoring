-- Phase 4a-2: "Paste or upload a CSV" saves all valid rows in one transaction (nothing is half-saved).
-- Runs as the caller, so only an organiser of the division's organisation can use it; riders are matched by email inside the organisation.
create or replace function public.import_riders(p_division uuid, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid; r jsonb; v_rider uuid; v_email text; v_ident jsonb; v_rows int;
  v_created int := 0; v_matched int := 0; v_already int := 0;
begin
  select e.organisation_id into v_org from public.divisions d join public.events e on e.id = d.event_id where d.id = p_division;
  if v_org is null or not private.is_org_member(v_org) then raise exception 'NOT_ALLOWED'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'INVALID_ROWS'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'TOO_MANY_ROWS'; end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    if btrim(coalesce(r ->> 'first', '')) = '' or btrim(coalesce(r ->> 'last', '')) = '' then raise exception 'INVALID_ROWS'; end if;
    v_email := nullif(lower(btrim(coalesce(r ->> 'email', ''))), '');
    v_rider := null;
    if v_email is not null then
      select id into v_rider from public.riders where organisation_id = v_org and lower(email) = v_email;
    end if;
    if v_rider is null then
      insert into public.riders (organisation_id, first_name, last_name, nationality, email, phone, sponsor, photo_url)
      values (v_org, btrim(r ->> 'first'), btrim(r ->> 'last'), nullif(btrim(coalesce(r ->> 'nationality', '')), ''), v_email,
              nullif(btrim(coalesce(r ->> 'phone', '')), ''), nullif(btrim(coalesce(r ->> 'sponsor', '')), ''), nullif(btrim(coalesce(r ->> 'photoUrl', '')), ''))
      returning id into v_rider;
      v_created := v_created + 1;
    else
      v_matched := v_matched + 1;
    end if;
    if jsonb_typeof(r -> 'identifiers') = 'object' and char_length((r -> 'identifiers')::text) <= 1000 then
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_ident
        from jsonb_each(r -> 'identifiers') as t(k, v) where k in ('vest_colour', 'bib', 'kite', 'rashguard_colour', 'helmet_colour');
    else
      v_ident := '{}'::jsonb;
    end if;
    insert into public.entries (division_id, rider_id, seed, status, source, identifiers)
    values (p_division, v_rider, nullif(r ->> 'seed', '')::int, 'confirmed', 'import', v_ident)
    on conflict (division_id, rider_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then v_already := v_already + 1; end if;
  end loop;
  return jsonb_build_object('created', v_created, 'matched', v_matched, 'already', v_already);
end $$;
revoke all on function public.import_riders from public, anon;
grant execute on function public.import_riders to authenticated;
