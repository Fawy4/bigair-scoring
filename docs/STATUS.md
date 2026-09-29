# STATUS — running progress log

## Phase 0 – scaffold

### Done
- Next.js 15 app (App Router, TypeScript strict, Tailwind 3, ESLint) at the repository root.
- shadcn/ui-style components: button, card, input, dialog, tabs, badge, table, toast (`src/components/ui`).
- Zod, Vitest (1 placeholder test), Playwright (1 smoke test in `e2e/`), Supabase JS + SSR helpers (`src/lib/supabase`: browser, server, service).
- Folder layout from CLAUDE.md, empty `src/lib/engine` (scoring/, ladder/, schedule/ with index files), `src/lib/schemas`, `supabase/migrations`.
- Home page shows `NEXT_PUBLIC_PRODUCT_NAME` (default `[PRODUCT_NAME]`) and "Build OK".
- Scripts: dev, build, typecheck, test, test:e2e, lint, seed:presets (stub).
- `.env.example` with all six variables; `.env*` is git-ignored (except `.env.example`).

### Not done / next (Phase 1)
- Zod schemas for ScoringModel / FormatTemplate / Schedule and loading of `presets/`.
- Scoring engine, written test-first from `docs/08-TEST-SCENARIOS.md`.
- Database migrations, RLS, real `seed:presets`.
- `<Toaster />` is not yet mounted (toast component only, no `useToast` wiring); to be wired in Phase 4.

### Pinned choices
- Zod 4, TypeScript 6, Tailwind 3 (not 4), Next.js 15, React 19. Write Phase 1 schemas for Zod 4.
- Extra packages beyond the original stack are shadcn/ui helpers only, now pre-approved in CLAUDE.md rule 8.

### How to test
- Locally: `npm install && npm run dev`, open http://localhost:3000 — you should see the product name and "Build OK".
- On a phone: open `http://<laptop-IP>:3000` on the same Wi-Fi.
- Vercel preview: open the preview link from the pull request; same page should appear. No environment variables are required for Phase 0 (name falls back to `[PRODUCT_NAME]`).

## Phase 1 – scoring engine

### Done
- Zod 4 schema `src/lib/schemas/scoring-model.ts` (`ScoringModelSchema`, `parseScoringModel`, types). New field `heat.duplicateWindowSec` (default 20). All 7 presets in `presets/scoring/` parse.
- Pure scoring engine `src/lib/engine/scoring/`: `judgeTrickScore`, `panelScore` (mean / trimmed mean / median, Missed vs missing, outliers), `selectCounted` (best N, best N with distinct names, best per category, single best, all, none), `computeHeat` (impression, height bonus/criterion, interference, DNS/DNF/DSQ, attempt cap, `repeatIndex` (landed only) + `priorCrashesSameTrick`, duplicates, publish blockers, `ignoredMarksFrom` for off-panel judges), `rankHeat` (tie-breakers), `explain`, `maxRawFor`, `checkCanAddAttempt`.
- 100 tests covering every value in `docs/08-TEST-SCENARIOS.md` §1 (1A–1F) plus a dedicated "best N of M" suite for the owner's default model. No expected value in doc 08 needed changing.
- `docs/03` §4.2 wording fixed (Missed ≠ incomplete) and a **Decisions log** (§10) added.
- Legacy preset description now says the 0.5 step is editable per event.

### Not done / next
- Speech/text trick parser (doc 08 §1F "Speech/text parsing") → Phase 5, `src/lib/engine/tricks/`.
- Database migrations, RLS, real `seed:presets`, and the server-side use of `checkCanAddAttempt`.

### How to test
- Nothing new to see on a phone yet (engine only).
- On a laptop: `npm install && npm test` → "Test Files 8 passed, Tests 100 passed"; `npm run typecheck` → no errors.

## Phase 2 – ladder and timetable engine

### Done
- Zod 4 schemas: `src/lib/schemas/format-template.ts` (rounds, generators with typed defaulted params, refinements) and `src/lib/schemas/schedule.ts` (run items, plans, anchors, hold, one active plan). All 5 files in `presets/formats/` and `presets/schedule/kitemania-day2.json` parse.
- Ladder engine `src/lib/engine/ladder/`: capacity-aware snake seeding (`seeding.ts`), the three generators (`generators.ts`), `expandFormat` (heats, division-wide numbers, byes, placeholders, vest colours, identifier-clash and "eliminates nobody" warnings), progression (`applyHeatResult`, `unpublishHeat`, `seedNow`, `withdrawEntrant`, `manualMove`, correction conflict) and `divisionPlacings` ("13=" style).
- Timetable engine `src/lib/engine/schedule/`: `computeTimetable` (anchors as "not before", actual times from heats, breaks, running over / pause, hold, plan switch, every row explains itself), `startHold` / `resumeHold` / `shift` / `activatePlan`, `resolveHeatRefs`, Cairo-safe time zone maths with built-in `Intl` only. No new dependencies.
- Tests written in doc 08 §2 and §3 terms (one file per section). No expected value in doc 08 needed changing.

### Choices I made where the spec was silent (all accepted by the owner; now decisions 13–22 in docs/04 §9, except item 11)
1. **"Before the draw" / "after the draw"** (doc 08 §2F): a draw is `draft` until `lockDraw()`; a withdrawal from a draft re-seeds, from a locked draw becomes a DNS walkover. The UI must call `lockDraw` when the organiser confirms the draw.
2. **Seed now**: missing places become DNS walkovers dealt **last**, so they meet the top seeds.
3. **Pools** use a new optional round field `crossHeat { advanceTop, to, combine }` ("rank everybody across heats"). Round ids are `P1`, `P2`, `F`.
4. **Cross-pool tie** (Decision 7): tie-break keys of the deciding heat (higher total; for `sum` the better single heat), then original seed. The scoring engine hands the keys over as `tieKeys` on each ranked rider.
5. **`seeding: "manual"`** deals in entry order and marks every heat hand-arranged; the engine then never re-deals it.
6. **Semi-final name**: the round before the Final is called "SF" only when it has exactly 2 heats and is not the first round.
7. **A plan's last item has a break of 0** (e.g. Women Final in "Good wind"). After a plan switch that heat is no longer last, so its 0 is ignored and the round/default break applies (5 min). Doc 08 §3F gives no numbers for this.
8. **3E fixture**: doc 08's 16:00 restart only works if Heat 3 has already ended (a paused Heat 3 would end later, Decision 11), so the test has Heat 3 finish at 15:35 before the resume.
9. `computeTimetable` returns `{ rows, finish, finishUtc, warnings }` (not just rows) so "finish 16:53" is a real value.
10. Mixing the seed list and earlier rounds in one round is refused (no preset needs it).
11. Process note: the timetable code was drafted before its tests were written down; expected values were taken from doc 08 and the tests were then run against them. The ladder tests were written first.

### Not done / next
- Database tables, RLS, server actions and UI for draws and the timetable (Phase 4).
- Flag-out is only carried in the template (`flagOut`); the head-judge button and scoring hook come in Phase 5.
- Points tables for series rankings (later phase).

### How to test
- Nothing to see on a phone yet (engine only).
- On a laptop: `npm install && npm test` → "Test Files 22 passed, Tests 282 passed"; `npm run typecheck` and `npm run lint` clean.
- To see a ladder: `npx vitest run src/lib/engine/ladder/2c-dingle.test.ts` (the KOTA 18-rider bracket, 22 heats).

## Phase 3 – database, security and logins

### Done
- **Database**: 7 migrations in `supabase/migrations` create all 24 tables (docs/05 §5 + approved additions), indexes on every foreign key, `updated_at` triggers, the audit trigger, Realtime publication and the functions below. Applied to the hosted **development** project (`npm run db:status` lists them). `supabase/combined.sql` holds the same SQL for the SQL Editor.
- **Security**: Row Level Security on every table, least-privilege grants (nothing is readable or writable unless granted), safe view `v_entries` (names and identifiers, never email/phone), PIN/QR hashes unreadable by anyone but the server, published results and the audit log are append-only.
- **Server-time heat state machine**: start/pause/resume/end timestamps come from the database clock; only the server can publish.
- **Attempt cap**: `add_attempt` rejects the extra attempt with `ATTEMPT_CAP_REACHED` (two racing phones: exactly one wins); head judge (or organiser) overrides with a written reason, audited. `delete_attempt`, `attempt_counts` for the "5 / 7" counters.
- **Marks**: `submit_trick_score` / `submit_impression` are safe to retry and ignore stale (older) queued edits; judges see only their own marks.
- **Public live view**: `get_public_live_heat` (polled every 5–10 s, configurable) shows panel positions, never judge names.
- **Logins**: organiser magic link (`/org/login`, invite-only, `/auth/confirm`, `/org`); officials join at `/join` or `/e/<slug>/join` (PIN or single-use QR link), phone stays bound; `/seat` shows the connected seat. PIN/QR generation and rebinding are server functions with rate limiting.
- **Scripts**: `db:apply` (HTTPS migration runner), `db:status`, `db:combine`, `seed:presets` (versioned, idempotent, Zod-validated), `seed:demo` (draw via `expandFormat`), `bootstrap:organiser`, `scripts/configure-auth.mjs`. `tsx` added as a dev dependency (approved).
- **Demo data** ("Demo Cup", fictional riders): 3 divisions (Pro Men 10 / Pro Women 6 / Youth U16 4), 20 riders, 3 judges + head judge + spotter, one 3-judge panel, and the full draw (Pro Men 12 heats, Women 4, U16 1).
- **Live auth settings changed** on the hosted project: anonymous sign-ins on; redirect allow-list `http://localhost:3000/**`, `https://*.vercel.app/**` and `https://bigair-scoring.vercel.app/**`; site URL `https://bigair-scoring.vercel.app`.
- **Organiser login created**: an `@outlook.com` address is owner of "Arrow Big Air" and of the Demo organisation (`npm run bootstrap:organiser`). **Production site**: https://bigair-scoring.vercel.app/ (Supabase URL, publishable key and secret key are set on Vercel for Production and Preview).

### Not done / needs the owner
- Custom email template (token-hash magic link) is blocked by Supabase's free plan until custom SMTP exists (decision 17): open the sign-in link in the **same browser** that asked for it.
- "Not on the list? Add your name" self-add from the join page, PIN/QR card printing UI, head-judge mark edits and publish (Phase 4/5).
- Generic `presets` table for identification schemes/schedules (Phase 4). Engine dials `perCategoryMax` and `countedWeights` (Phase 4).

### How to test
- Laptop: `npm install && npm run typecheck && npm test && npm run lint`; with keys set, `npm run test:rls` (52 tests, about 45 s, creates and deletes its own throwaway data) and `npm run test:e2e` (5 browser tests).
- Phone (same Wi-Fi as the laptop, `npm run dev`, keys in `.env.local`): open `http://<laptop-IP>:3000/join`, event code `demo-cup`, PIN `100001` → "Connected · Judge 1". Close and reopen the page: still connected. Head judge PIN `200001`, spotter `300001`, judges `100002`, `100003`.
- Try the phone swap: join with PIN `100001` on a second phone; the first phone's `/seat` now says "Not connected".
- iPhone: add the page to the Home Screen first, then join inside the home-screen app (Safari and the home-screen app keep separate logins).
- Organiser sign-in: `https://bigair-scoring.vercel.app/org/login` (once this branch is deployed) or `http://localhost:3000/org/login`, enter your email, open the email link in the same browser.

## Phase 5 requirements
- **Out of attempts (hard stop)** (docs/06 §5): when a rider has used the division's attempt cap, their chip turns grey with 'Out of attempts · 7 / 7' on the spotter AND judge screens and Log is disabled for that rider; if the head judge deletes one of that rider's attempts the chip re-enables live ('6 / 7'); the server refuses any attempt beyond the cap (ATTEMPT_CAP_REACHED) even from a stale phone; only the head judge may add an attempt beyond the cap, with a written reason, which is audited.
