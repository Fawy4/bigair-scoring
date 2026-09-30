-- Phase 4a-1c: moving an event copies its organisation's presets into the new organisation and repoints the divisions to the copies.
-- The rules lock ("scoring and format are read-only once a heat has started") exists to stop rule CHANGES. Pointing a division at a
-- copy with identical content changes nothing, so it is allowed; any real change is still refused with RULES_LOCKED.
create or replace function private.divisions_rules_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_same boolean;
begin
  if (new.scoring_model_id, new.scoring_overrides, new.format_template_id, new.format_params)
       is distinct from (old.scoring_model_id, old.scoring_overrides, old.format_template_id, old.format_params)
     and new.rules_unlocked_at is null
     and exists (select 1 from public.heats h where h.division_id = old.id and h.started_at is not null) then
    v_same := new.scoring_overrides is not distinct from old.scoring_overrides
      and new.format_params is not distinct from old.format_params
      and (new.scoring_model_id is not distinct from old.scoring_model_id
           or (select m.content_hash from public.scoring_models m where m.id = new.scoring_model_id)
              is not distinct from (select m.content_hash from public.scoring_models m where m.id = old.scoring_model_id))
      and (new.format_template_id is not distinct from old.format_template_id
           or (select f.content_hash from public.format_templates f where f.id = new.format_template_id)
              is not distinct from (select f.content_hash from public.format_templates f where f.id = old.format_template_id));
    if not v_same or new.scoring_model_id is null and old.scoring_model_id is not null or new.format_template_id is null and old.format_template_id is not null then
      raise exception 'RULES_LOCKED';
    end if;
  end if;
  return new;
end $$;
