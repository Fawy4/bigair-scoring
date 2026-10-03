-- Polish 2, item 6 — the head judge types in a judge's paper sheet and submits it for them.
--
-- The head judge's Impression / Variety sheet for one judge saves every rider at once; its main button saves and submits that judge's sheet. The sheet is
-- submitted exactly as the judge's own Submit would (the same check: every rider who needs one has an Impression / Variety score, or is set to Absent), with
-- the head judge's reason in the audit log. Allowed to the head judge (or an organiser), on an ended heat or one under review.
create or replace function public.head_submit_sheet(p_heat uuid, p_seat uuid, p_reason text) returns public.judge_sheets
language plpgsql security definer set search_path = '' as $$
declare h public.heats; s public.judge_sheets; v_imp jsonb; v_missing int;
begin
  h := private.head_heat(p_heat, array['ended', 'under_review'], p_reason);
  if not exists (select 1 from public.divisions d join public.panel_members pm on pm.panel_id = d.panel_id where d.id = h.division_id and pm.judge_seat_id = p_seat) then
    raise exception 'NOT_ON_PANEL';
  end if;
  v_imp := private.division_model_setting(h.division_id, array['heat', 'impression']);
  if v_imp is not null and jsonb_typeof(v_imp) = 'object' and coalesce((v_imp ->> 'required')::boolean, true) then
    select count(*) into v_missing from public.heat_slots hs
     where hs.heat_id = p_heat and hs.entry_id is not null and coalesce(hs.modifier, '') not in ('DNS', 'DSQ')
       and not exists (select 1 from public.impression_scores i where i.heat_id = p_heat and i.entry_id = hs.entry_id and i.judge_seat_id = p_seat);
    if v_missing > 0 then raise exception 'IMPRESSION_MISSING: %', v_missing; end if;
  end if;
  perform private.audit_ctx('sheet_submitted_by_head', p_reason);
  insert into public.judge_sheets (event_id, heat_id, judge_seat_id, submitted_at) values (h.event_id, p_heat, p_seat, now())
  on conflict (heat_id, judge_seat_id) do update set submitted_at = now()
  returning * into s;
  perform private.audit_ctx('', '');
  return s;
end $$;
revoke all on function public.head_submit_sheet(uuid, uuid, text) from public, anon;
grant execute on function public.head_submit_sheet(uuid, uuid, text) to authenticated;
