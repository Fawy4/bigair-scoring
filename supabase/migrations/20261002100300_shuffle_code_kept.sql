-- Phase 4a-2: the code of the last "Shuffle randomly" is kept when the organiser then moves a rider by hand, so "Repeat this shuffle"
-- can always put everybody back in exactly that order. Only a new shuffle replaces the code.
create or replace function public.set_entry_order(p_division uuid, p_entry_ids uuid[], p_shuffle_seed bigint default null) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_len int := coalesce(array_length(p_entry_ids, 1), 0); v_rows int;
begin
  if p_entry_ids is null then raise exception 'INVALID_ORDER'; end if;
  if (select count(distinct x) from unnest(p_entry_ids) x) <> v_len then raise exception 'INVALID_ORDER'; end if;
  if (select count(*) from public.entries e where e.division_id = p_division and e.id = any (p_entry_ids)) <> v_len then raise exception 'ENTRY_NOT_IN_DIVISION'; end if;
  with listed as (
    select t.id, t.ord from unnest(p_entry_ids) with ordinality as t(id, ord)
  ), rest as (
    select e.id, v_len + row_number() over (order by e.seed nulls last, e.created_at, e.id) as ord
      from public.entries e where e.division_id = p_division and not (e.id = any (p_entry_ids))
  ), everyone as (
    select id, ord from listed union all select id, ord from rest
  )
  update public.entries e set seed = everyone.ord::int from everyone where e.id = everyone.id;
  update public.divisions set seed_shuffle_seed = coalesce(p_shuffle_seed, seed_shuffle_seed) where id = p_division;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'NOT_ALLOWED'; end if;
end $$;
