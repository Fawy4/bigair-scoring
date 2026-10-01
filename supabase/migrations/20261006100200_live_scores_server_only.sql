-- Judge-level scores never reach a visitor (owner decision, 1 Oct 2026). The live-heat function used to return each judge's score by seat number so a phone could add
-- up the totals; the totals are now worked out on the server (same scoring engine as the head judge's console) and only the panel's result reaches the public page.
--
--   get_live_heat_for_server(heat)  the full live view (attempts, scores by seat number, Impression scores, penalties); service role only
--   get_public_live_heat(heat)      what a visitor may call: the heat's clock, seats and attempts, and no scores of any kind
-- Seats and organisers still read per-judge scores through their own row policies, unchanged.

alter function public.get_public_live_heat(uuid) rename to get_live_heat_for_server;
revoke all on function public.get_live_heat_for_server(uuid) from public, anon, authenticated;
grant execute on function public.get_live_heat_for_server(uuid) to service_role;

create function public.get_public_live_heat(p_heat uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce((r ->> 'allowed')::boolean, false) then r - 'scores' - 'impressions' - 'penalties' else r end
  from (select public.get_live_heat_for_server(p_heat) as r) x;
$$;
revoke all on function public.get_public_live_heat(uuid) from public;
grant execute on function public.get_public_live_heat(uuid) to anon, authenticated, service_role;
