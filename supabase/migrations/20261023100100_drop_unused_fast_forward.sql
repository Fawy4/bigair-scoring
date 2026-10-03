-- "Skip to end of heat" no longer moves the heat clock (it fast-forwards the virtual officials and leaves the heat running), so the function that did is not used.
drop function if exists public.sim_fast_forward(uuid, uuid);
