-- Demo data: "Demo Cup" (fictional riders). Idempotent: fixed ids, ON CONFLICT DO NOTHING.
-- Run AFTER `npm run seed:presets` (divisions point at the system presets):
--   npm run seed:presets && node scripts/apply-sql.mjs --file supabase/seed.sql && npm run seed:demo
-- Demo PINs (work only inside the Demo Cup event): judges 100001-100003, head judge 200001, spotter 300001.

do $$ begin
  if (select count(*) from public.scoring_models where organisation_id is null) < 7 or (select count(*) from public.format_templates where organisation_id is null) < 5 then
    raise exception 'Presets are missing: run `npm run seed:presets` first.';
  end if;
end $$;

insert into public.organisations (id, name, slug) values ('00000000-0000-4000-8000-000000000001', 'Demo organisation', 'demo-org') on conflict (id) do nothing;
insert into public.events (id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Demo Cup', 'demo-cup', 'El Gouna, Egypt', 'Africa/Cairo', '2026-10-16', '2026-10-17', 'published',
  '{"publicLiveScores":"live","readyCallMin":10,"judgeGraceSec":180,"judgesMayLogAttempts":false,"livePollSec":7,"identification":{"scheme":"vests-per-heat"}}')
on conflict (id) do nothing;

insert into public.judge_seats (id, event_id, name, role, scores, pin_hash) values
  ('00000000-0000-4000-8000-000000000300', '00000000-0000-4000-8000-000000000002', 'Judge 1', 'judge', true, extensions.crypt('100001', extensions.gen_salt('bf'))),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000002', 'Judge 2', 'judge', true, extensions.crypt('100002', extensions.gen_salt('bf'))),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000002', 'Judge 3', 'judge', true, extensions.crypt('100003', extensions.gen_salt('bf'))),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000002', 'Head judge', 'head', false, extensions.crypt('200001', extensions.gen_salt('bf'))),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000002', 'Spotter 1', 'spotter', false, extensions.crypt('300001', extensions.gen_salt('bf')))
on conflict (id) do nothing;

insert into public.panels (id, event_id, name) values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Demo panel') on conflict (id) do nothing;
insert into public.panel_members (id, panel_id, judge_seat_id, seat_no) values
  ('00000000-0000-4000-8000-000000000320', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000300', 1),
  ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000301', 2),
  ('00000000-0000-4000-8000-000000000322', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000302', 3)
on conflict (id) do nothing;

insert into public.divisions (id, event_id, name, sort_order, scoring_model_id, format_template_id, panel_id, status) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'Pro Men', 1, (select id from public.scoring_models where organisation_id is null and key = 'kota-best3-impression' order by version desc limit 1), (select id from public.format_templates where organisation_id is null and key = 'kota-dingle' order by version desc limit 1), '00000000-0000-4000-8000-000000000003', 'draft'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', 'Pro Women', 2, (select id from public.scoring_models where organisation_id is null and key = 'megaloop-single-best' order by version desc limit 1), (select id from public.format_templates where organisation_id is null and key = 'megaloop-women-6' order by version desc limit 1), '00000000-0000-4000-8000-000000000003', 'draft'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'Youth U16', 3, (select id from public.scoring_models where organisation_id is null and key = 'legacy-kol-best3-variety' order by version desc limit 1), (select id from public.format_templates where organisation_id is null and key = 'pools-to-final' order by version desc limit 1), '00000000-0000-4000-8000-000000000003', 'draft')
on conflict (id) do nothing;

insert into public.riders (id, organisation_id, first_name, last_name, nationality) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Karim', 'Farid', 'EG'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Omar', 'Nassar', 'EG'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Luca', 'Bianchi', 'IT'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Tom', 'Weber', 'DE'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Sami', 'Haddad', 'LB'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Jonas', 'Berg', 'SE'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Mateo', 'Ruiz', 'ES'),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000001', 'Yusuf', 'Demir', 'TR'),
  ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000001', 'Nico', 'Laurent', 'FR'),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000001', 'Adam', 'Wright', 'GB'),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', 'Lina', 'Sherif', 'EG'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', 'Sofia', 'Rossi', 'IT'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000001', 'Maja', 'Nilsson', 'SE'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000001', 'Clara', 'Dubois', 'FR'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000001', 'Emma', 'Clarke', 'GB'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000001', 'Nour', 'Adel', 'EG'),
  ('00000000-0000-4000-8000-000000000117', '00000000-0000-4000-8000-000000000001', 'Ali', 'Hassan', 'EG'),
  ('00000000-0000-4000-8000-000000000118', '00000000-0000-4000-8000-000000000001', 'Leo', 'Martin', 'FR'),
  ('00000000-0000-4000-8000-000000000119', '00000000-0000-4000-8000-000000000001', 'Finn', 'Becker', 'DE'),
  ('00000000-0000-4000-8000-000000000120', '00000000-0000-4000-8000-000000000001', 'Zaid', 'Amin', 'EG')
on conflict (id) do nothing;

insert into public.entries (id, division_id, rider_id, seed, status, source, identifiers) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000101', 1, 'confirmed', 'manual', '{"bib":1}'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000102', 2, 'confirmed', 'manual', '{"bib":2}'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000103', 3, 'confirmed', 'manual', '{"bib":3}'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000104', 4, 'confirmed', 'manual', '{"bib":4}'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000105', 5, 'confirmed', 'manual', '{"bib":5}'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000106', 6, 'confirmed', 'manual', '{"bib":6}'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000107', 7, 'confirmed', 'manual', '{"bib":7}'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000108', 8, 'confirmed', 'manual', '{"bib":8}'),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000109', 9, 'confirmed', 'manual', '{"bib":9}'),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000110', 10, 'confirmed', 'manual', '{"bib":10}'),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000111', 1, 'confirmed', 'manual', '{"bib":11}'),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000112', 2, 'confirmed', 'manual', '{"bib":12}'),
  ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000113', 3, 'confirmed', 'manual', '{"bib":13}'),
  ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000114', 4, 'confirmed', 'manual', '{"bib":14}'),
  ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000115', 5, 'confirmed', 'manual', '{"bib":15}'),
  ('00000000-0000-4000-8000-000000000216', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000116', 6, 'confirmed', 'manual', '{"bib":16}'),
  ('00000000-0000-4000-8000-000000000217', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000117', 1, 'confirmed', 'manual', '{"bib":17}'),
  ('00000000-0000-4000-8000-000000000218', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000118', 2, 'confirmed', 'manual', '{"bib":18}'),
  ('00000000-0000-4000-8000-000000000219', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000119', 3, 'confirmed', 'manual', '{"bib":19}'),
  ('00000000-0000-4000-8000-000000000220', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000120', 4, 'confirmed', 'manual', '{"bib":20}')
on conflict (id) do nothing;
