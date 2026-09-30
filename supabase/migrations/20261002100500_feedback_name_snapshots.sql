-- Phase 4a-2: a feedback note keeps the names of where it was written (organisation, event, division, heat) as words, because the owner
-- cannot read other organisations' events through the tables, and an event may be deleted later. The text of a note still cannot be edited.
alter table public.feedback_notes
  add column organisation_name text check (organisation_name is null or char_length(organisation_name) <= 200),
  add column event_name text check (event_name is null or char_length(event_name) <= 200),
  add column division_name text check (division_name is null or char_length(division_name) <= 200),
  add column heat_label text check (heat_label is null or char_length(heat_label) <= 200);
grant insert (organisation_name, event_name, division_name, heat_label) on public.feedback_notes to authenticated;
