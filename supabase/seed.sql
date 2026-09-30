-- Demo data: "Demo Cup" (fictional riders). Idempotent: fixed ids, ON CONFLICT DO NOTHING. The data itself lives in the database
-- function private.seed_demo_data() (migration 20261001100300), which the platform owner's "Create demo organisation" button also calls.
-- Run AFTER `npm run seed:presets` (divisions point at the system presets):
--   npm run seed:presets && node scripts/apply-sql.mjs --file supabase/seed.sql && npm run seed:demo
-- Demo PINs (work only inside the Demo Cup event): judges 100001-100003, head judge 200001, spotter 300001.
select private.seed_demo_data();
