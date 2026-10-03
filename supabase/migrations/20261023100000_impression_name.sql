-- The Event step's "Name of the impression score" reaches the public pages: the rules function tells which name the organiser chose (empty = each division's own).
create or replace function public.get_public_rules(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_name text;
begin
  if not private.event_is_public(p_event) then return jsonb_build_object('allowed', false); end if;
  select nullif(btrim(coalesce(e.settings ->> 'impressionName', '')), '') into v_name from public.events e where e.id = p_event;
  return jsonb_build_object('allowed', true, 'impression_name', v_name,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'description', d.description, 'identification', d.identification,
        'scoring_model', sm.json, 'scoring_overrides', d.scoring_overrides,
        'format_template', coalesce(d.draw -> 'template', ft.json), 'format_params', case when d.draw -> 'template' is null then d.format_params else '{}'::jsonb end,
        'riders', (select count(*) from public.entries e where e.division_id = d.id and e.status = 'confirmed'))
        order by d.sort_order, d.created_at)
      from public.divisions d
      left join public.scoring_models sm on sm.id = d.scoring_model_id
      left join public.format_templates ft on ft.id = d.format_template_id
      where d.event_id = p_event), '[]'::jsonb));
end $$;
