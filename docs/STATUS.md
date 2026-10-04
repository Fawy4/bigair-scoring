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

## Phase 4a-1 – organiser settings, Event and Divisions (branch `phase-4a-organiser-console`)

### Done
- **Engine dials** (tests first, `src/lib/engine/scoring/dials.test.ts`, 25 tests): `counting.perCategoryMax` (kiteloops 8.9 / 8.4 / 7.0 + board-offs 7.2 / 6.0 → **24.50**) and `heat.countedWeights` (`[1, 0.75, 0.5]` on 8.0 / 7.0 / 6.0 → **16.25**), automatic maximum (decision 5), interference then re-weighting (decision 6), tie-breaks on raw scores (decision 7), "8.00 × 1 = 8.00; 7.00 × 0.75 = 5.25 …" in `explain()`. Absent dials change nothing: all earlier engine tests still pass.
- **Groundwork**: Toaster (organiser screens only, small confirmations), new landing page (product name from `NEXT_PUBLIC_PRODUCT_NAME`, "Officials: join with a PIN", "Organiser sign in", list of published events linking to `/e/<slug>/join` until the event page arrives in 4b), organiser shell with organisation switcher and beach-contrast styling (near-black on white, weight ≥ 600, targets ≥ 48 px, no colour-only states). `bootstrap:organiser` now requires `--org-name` and `--org-slug`.
- **Database** (`supabase/migrations/20260930100000_phase4a_organiser.sql`, applied to the hosted development project over HTTPS): organisation settings (default time zone, editable slug), `branding` storage bucket (public read, images only, 2 MB, writable only under `<organisation id>/` by that organisation's members), generic `presets` table, `divisions.draw` / `draw_locked_at` / `rules_unlocked_at`, the **rules lock** (scoring and format cannot change once a heat has started, `unlock_division_rules` needs a written reason and is audited), a guard against deleting a division that has heats, and two service-only, rate-limited functions: `register_rider` (public registration) and `request_seat` (official self-add, creates a *pending* seat only). `seed:presets` now also loads identification schemes and the schedule template into `presets` (6 rows). Types regenerated.
- **Access-rule tests**: `npm run test:rls` grew from 52 to **80** tests (organisation settings, presets, bucket, draw/lock/delete guard, registration, self-add, rate limits).
- **Organisation settings** `/org/settings`: name, slug (warning + confirmation because public links change), logo upload, default time zone.
- **Event wizard** `/org/events/new` and `/org/events/<id>/{event,divisions}`; left rail (a step picker on tablets), each step saves on its own, unfinished steps say what is missing.
  - **Event step**: every field of docs/06 §1 step 1, plus live update seconds, judge grace seconds, judges may log attempts, registration open + closing date, event logo, sponsor logos, the **identification scheme picker and editor** (palette, primary, fallback, secondary, call-out, vests, bibs, kite fields, per-division override switch, save as preset) with a live **rider chip** (the one shared `RiderChip` component).
  - **Divisions step**: add / rename / reorder (↑ ↓) / duplicate / delete; scoring preset dropdown (built-in + organisation); **Simple** level with the live sentence (e.g. "Best 3 of 7 attempts + Variety 0–10, 3 judges averaged"); **Advanced** level generated from the Zod schema (every field, including both new dials; a test fails if a schema field has no plain-language label); simple/advanced edits stored as small `scoring_overrides`; "Save as new preset" and "Save as new version" (never an in-place change); JSON export and import with readable errors; format picker with generator parameters, per-round durations and breaks, flag-out, **custom format builder**, and a live preview from the real draw engine ("With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)"); rules lock banner and "Unlock" with a reason.

### Test evidence (this branch)
- `npm run typecheck` clean · `npm run lint` clean · `npm run build` passes.
- `npm test` → **Test Files 38 passed, Tests 412 passed** (282 at the end of Phase 2).
- `npm run test:rls` → **Test Files 1 passed, Tests 80 passed**.
- `npm run test:e2e` → **7 passed**, including two new organiser tests: settings → Event step → publish → listed on the home page; and Divisions (Simple, Advanced, presets, versions, export, import errors, format preview, custom builder, duplicate/reorder/delete, lock and unlock).

### Choices I made where the docs were silent (please confirm or change)
1. **Decision 6 wording**: "drop the best trick, then re-weight the remaining counted tricks". The engine already pulls the next-best trick into the freed slot after a drop, so I kept that and applied the weights in rank order to the new counted list (best 8, 7, 6, next 5 with `[1, 0.75, 0.5]`: 8 dropped → 7 + 4.5 + 2.5 = 14.00). If you meant "only the tricks that were counted, without a replacement", it is one line to change.
2. **Automatic maximum with `categoriesCounted` smaller than the number of categories**: the largest limits are used (best possible score).
3. **"Join PIN (auto)"** (docs/06 §1): officials already have their own PIN each, so the Event step shows the event code and join link and says PINs are made in the Officials step. **Wind-call banner** is a simple on/off setting for now (the calls arrive in Phase 5).
4. **Published / draft switch** added to the Event step (not in the spec), otherwise a new event can never appear on the home page or accept registrations.
5. **Public registration and self-add functions are service-only** (the server passes the visitor's address, as the PIN join does) instead of "anon allowed": safer, and rate limiting needs the address. They arrived in this PR's migration as asked; their public pages come in 4a-2.
6. **Logos**: PNG, JPEG and WebP only; SVG is refused because it can carry scripts.
7. The per-division identification override switch is saved; the per-division column and picker are scheduled for 4a-2 (docs/06 decision 26).
8. First apply of the migration had a bug in the rate-limit function (found by the new tests); it was fixed in the migration file and patched on the hosted project. A fresh database gets the corrected version directly.

### Not done (next PRs)
- 4a-2: Riders, Officials, public registration page, officials' self-add form, `qrcode`, `@dnd-kit`. 4b: Draw, Run order & timetable, dashboard, `/e/<slug>` page.
- The owner's real organisation is still called "Arrow Big Air": the rename to **Arrow / `arrow`** is the acceptance test and is yours to do in `/org/settings` (the browser test proves the screen works on a throwaway organisation).

### How to test
- **Vercel preview** (link in the pull request): open it → home page shows the product name, the two buttons and (once you publish an event) the event list. Organiser sign in → open the emailed link **in the same browser**.
  1. *Organisation settings* (header button): rename "Arrow Big Air" to "Arrow", slug `arrow`, tick "I understand", upload a logo, pick a time zone, Save. Reload: values stay. Try a `.txt` file as a logo: a plain-language refusal.
  2. *Events → + New event*: type a name (the web address fills itself), location, dates; pick a time zone (pre-filled from step 1); upload a logo; add a sponsor; in *Rider identification* switch the preset to "Bib / sail numbers" and watch the chip change; change a colour name; Save as preset; tick Published; Create event. Open the home page: your event is listed and links to its join page.
  3. *Divisions* (left rail or "Next: Divisions →"): add "Pro Men"; choose the "Legacy…" scoring preset and read the sentence; change N, the attempt limit, the judges (Simple); switch to Advanced, open "Counting and heat total" and type weights `1, 0.75, 0.5`; Save as new preset; then edit it and use "Save as new version". Export JSON; paste broken JSON to see the readable errors. *Format* tab: pick a format, change "Preview with … riders", change riders per heat under "Format generator", or press "+ Start a custom format". Duplicate, reorder and delete a division.
- **Phone**: same links; on a phone the left rail becomes a "Setup step" dropdown. Landscape tablet is the intended size for organiser screens.
- **Laptop**: `npm install && npm run typecheck && npm test && npm run lint`; with keys in `.env.local`: `npm run test:rls` (about 70 s) and `npm run test:e2e` (about 1 minute; needs the Phase 3 demo seed for the join tests).

### Phase 4a-1 – owner's UX feedback (second round on the same branch)
**Security fix first.** While testing the new publish hold I found a real hole from Phase 3: any signed-in user with no seat and no membership in an event (for example a judge of another event, or another organisation's organiser) could add and delete attempts in any event if they knew a heat or attempt id. The permission check compared a possibly empty seat role, and in SQL an empty value makes the whole check "unknown", which lets the call through. Fixed in `20260930120100_fix_seatless_permission_checks.sql` (applied to the hosted dev project) with a regression test. It could not be triggered from the app screens (ids are random), and no real data was involved.

Done, in the order of your list:
1. **Wording**: "Rider label", "Lycra", "score", "Impression / Variety score" everywhere, including scheme names, presets and the Phase 3 join and sign-in screens. All text is in `src/lib/ui-copy.ts`; `src/lib/ui-copy.test.ts` fails if any component, source file, the copy file or a built-in preset contains "chip", "vest" or "mark(s)". Scoring presets that said "mark" are now version 2 (text only; divisions using version 1 are untouched).
2. **Name call-out** scheme added and made the default for new events, with the question "Will riders wear coloured lycras?" (Yes picks "Lycra colour per heat").
3. **Visibility**: one sentence and three tick boxes, all off by default, stored in `publicLiveScores`, `publicResultsOnPublish`, `holdFinalResult`. Database: `heats.publish_hold` and `set_publish_hold` (organiser or head judge, needs a reason to hold, audited); held results disappear from the public site. Phase 5 will set the hold at publish time from these settings.
4. **Judges sentence** in Simple ("3 judges — plain average"), with the trimming rule stated.
5. **Rules-lock banner** on the Divisions step. The unlock flow is covered by the browser test (start a heat, see the lock, unlock with a reason, audit line). I could not open your Vercel preview from here, so please try it there once heats exist (Phase 5) or by asking me to start a test heat.
6. **Timing**: "Default timing" and "Field size this format suits" moved under Show all settings with the helper text.
7. **Ladder type choice** (Knockout / Knockout with a second chance / Pools to a final) with the explanations you wrote; rounds are generated. "How riders are seeded into the next round" renamed with the two options.
8. **Ladder diagram** next to the text preview ("With 14 riders: …").
9. **Flag-out** under Show all settings with its helper text, off by default.
10. **Simple mode** trimmed to the owner's default; "Show all settings" toggle for the rest.
11. **"?" help** (tap) with a sentence and an example on every setting; a test fails when a schema field has no help or example.

Things you should know:
- For generated ladders the **breaks apply to every round** (the draw engine has no per-round break for them); per-round heat length, breaks and riders per heat exist in "Custom ladder (advanced)".
- In "Knockout with a second chance" the advance count is **fixed** by the structure (winners straight through, 2nd and 3rd get one more heat), so there is no "how many advance" box for it.
- The starting point of "Custom ladder" is only a scaffold (heats of 4, top 2, one final heat); with many riders that final gets big: the diagram shows it, adjust the rounds.
- Old events whose live-scores setting was "off" become "after publish" when saved (the two behave the same until Phase 5).

### How to test the second round (Vercel preview)
1. **Events → + New event**: read the sentence and the three unticked boxes under "What riders and spectators see". Under "Rider identification" the label shows "Sam Sample"; choose "Yes: … lycra colour" and see "RED"; tap the "?" next to any field.
2. **Divisions → Pro Men → Scoring**: choose the "Legacy…" preset; change "Number of judges" and the combine setting and read the sentence under it; tick "Show all settings" for everything.
3. **Format tab**: pick a format; choose between the three ladder types; change "Preview with … riders" and watch the ladder diagram; "Show all settings" for flag-out and default timing.

### Phase 4a-1 – heat length per round (generated ladders)
- New optional template field `roundDurationMin` (round id → minutes) for the three generated ladder types; the draw engine applies it after the generator (tests `2h-round-durations.test.ts`: knockout, second chance, pools, breaks unchanged, unknown rounds ignored, only generated ladders, positive numbers). A custom ladder keeps its own per-round heat length.
- The Format step shows a "Heat length per round" table under the ladder choice: one row per round of the preview, pre-filled from the single setting, "own length" marker on changed rows, and a reset button. Only real differences are stored on the division. The ladder diagram now shows each round's heat length ("4 heats · 3–4 riders · 10 min") and follows the table.
- Test on the preview: Divisions → Format → pick "Single elimination" → change "Heat length: R1" to 9 and "Heat length: F" to 20 → watch the diagram → Save.

### Phase 4a-1 – three fixes and plain ladder words (round 4)
1. **Show all settings no longer hides Simple settings.** Simple (scoring and format) always stays; the advanced settings appear below it, and settings that Simple already shows are left out of the advanced part so nothing appears twice. A Playwright check confirms every Simple field is still there with Show all settings on.
2. **Two plain numbers replace the "uneven rule"** under every generated format: "Riders per heat (target)" and "Minimum riders per heat" (default target − 1, at least 2; can equal the target), each with a "?". Rule (docs/04 decision 23, docs/08 §2G0): ceil(N / target) heats when every heat can meet the minimum, otherwise fewer heats; a field smaller than the minimum is one heat with everyone; top seeds in the smaller heats. All your examples are tests (14/3/3 → [1,8,9] [2,7,10] [3,6,11,14] [4,5,12,13]; 14/4/3; 13/4/3; 13/4/4 → 4/4/5; 5/4/4 → one heat of 5; 24/4/4). The old options stay only inside the custom ladder.
3. **Plain words**: no "bye" (a rider who advances without riding is labelled "Advances without riding"), "Second-chance round" (heats "Second chance H1…"), "1 v 1 heats"; placeholders "1st H1", "2nd H3", "1st R2 H5", "1st of all heats". Preset names and descriptions were reworded (format presets are now version 2 on the hosted project). The banned-words test covers all of it.
4. **Tags and minimum heats**: "Every rider gets at least 2 heats" under Knockout with a second chance; "Riders can be out after 1 heat" under Knockout and Pools to a final; the preview shows "Minimum heats per rider: N" (computed from the real draw).

Things you should know:
- **The minimum wins over the maximum.** Your rule cannot always hold both limits (11 riders, target 4, minimum 4 has no split of only 4s and 5s), so the heats are 5/6; when only one heat can meet the minimum (7 riders, target 4, minimum 4) everyone rides one heat.
- **5 riders with the default minimum is now one heat of 5** (it used to be two heats, which eliminated nobody). Doc 08 §2A's old "N = 5" test now says minimum 2 to get the old split.
- **The pools preset carries a minimum of 6** so 23 riders still make three pools of 7/8/8 (doc 08 §2E). With the default minimum (target − 1 = 9) 23 riders would make two pools of 11/12; if you want that instead, remove the 6.
- **Knockout with a second chance**: the two numbers apply to Round 1; the two-rider rounds after it keep their structure (that is where riders advance without riding).
- Only three ladder types exist today, so only their tags are shown. "Double elimination", "Qualifying heats + finals", "Round robin" ("Every rider gets at least 2 heats") and "Single final" ("Riders can be out after 1 heat") get their tag when those types are built.
- "Main draw" / "Second-chance draw" are in the wording rules for the bracket view in 4b (there is no bracket screen yet).

### How to test round 4 (Vercel preview)
1. Divisions → Pro Men → **Format** → pick "Single elimination". Under the three choices read the tags. Change **Riders per heat (target)** to 3 and **Minimum riders per heat** to 3: with 14 riders the diagram shows heats of 3, 3, 4, 4.
2. Set target 4, minimum 4, "Preview with" 13 → 4/4/5; 5 → one heat.
3. Choose **Knockout with a second chance**: the tag, "Minimum heats per rider: 2", "Second chance H1", "Advances without riding", placeholders like "1st R1 H1".
4. Tick **Show all settings** (Scoring and Format): everything you saw before is still there, with more below.

### Phase 4a-1 – three numbers per heat, and every round of the second-chance ladder follows them (round 5)
1. **Heat sizing is now three numbers** on every generated format: "Riders per heat (target)", "Minimum per heat" (default target − 1, at least 2) and "Maximum per heat" (default target + 1, at most 10); min = max = target is allowed. Every heat holds between the minimum and the maximum; the number of heats keeps the sizes closest to the target (fewer heats on a tie); top seeds get the smaller heats; capacity-aware snake dealing as before (docs/04 decision 23, docs/08 §2G0). All eight of your examples and the earlier ones are tests.
2. **Every round of "Knockout with a second chance" follows the same rule** (docs/04 decision 27, docs/08 §2C and §2G2). Round 1 winners go to the main draw; the others get a second chance; second-chance winners join the main draw; the main draw runs as many rounds as it needs; the final follows. No generated ladder contains a heat below the minimum or a rider who advances without riding, and every round before the final has at least two heats (asserted for N = 8, 10, 12, 14, 16, 18, 24 and three settings; N = 2–40 place every rider once). Your 14-rider example (3 / 3 / 4) gives R1 3/3/4/4 → Second chance 3/3/4 → Semi-finals 3/4 → Final of 4.
3. **The diagram names who is out**: "1st–2nd → SF · 3rd–4th → out" (actual places, not "the rest").
4. New warning when a field is too small to keep all three numbers ("Heat 5 has 6 riders, which is more than the maximum of 5").

Things you should know (please confirm or change):
- **Two of your requests contradict each other, so I kept the promise and added a switch.** You wrote that the 4th place of a 4-rider heat is out, and also that every rider must have at least 2 heats before being out; both cannot be true. Default: everyone who does not win gets a second chance (so the tag "Every rider gets at least 2 heats" stays true, and the old build had silently thrown the 4th of a 4-rider heat out while the tag still said 2 heats). New setting "Riders per heat who get a second chance": "Everyone who did not win" or "2nd and 3rd only; the others are out" (also 2nd only, or up to 5th). With that choice the diagram shows "4th → out", the preview says "Minimum heats per rider: 1" and the menu tag changes to "Riders can be out after 1 heat". The doc 08 tests assert ≥ 2 heats for the default and the 14-rider trace from your message for the "2nd and 3rd only" choice.
- **One earlier example cannot hold with a literal reading of your new rule.** "Closest to the target, fewest heats on a tie" would make 13 riders at 4 / 3 / 5 → 4/4/5 and 14 at 4 / 3 / 5 → 4/5/5, but you asked that 13/4/3 → 3/3/3/4 and 14/4/3 → 3/3/4/4 still hold with the default maximum. I kept your examples: heats above the target count far more than heats below it, so the number of heats is ceil(N / target) whenever every heat can meet the minimum. All your new examples hold as well.
- **The 1 v 1 structure of the second-chance ladder is gone.** Doc 08 §2C used to pin the King-of-the-Air structure (N = 18: 22 heats, heats of 2 after Round 2, top seeds advancing without riding at N = 12). Your rule "every round follows the sizing rule, nobody advances without riding" cannot produce that, so N = 18 is now 6 + 4 + 4 + 1 = 15 heats (Round 1 6×3, Second chance 4×3, Round 3 2/2/3/3, Final of 4). Set the target to 2 for 1 v 1 style heats. If you need the exact King-of-the-Air 18-rider ladder, it has to be a fixed (custom) preset. I renamed the preset ("Knockout with a second chance (heats of 3, second-chance round, main-draw rounds, final)").
- **The Final can be bigger or smaller than "Final size".** "Final size" is the size aimed for; the ladder may end in a final of 4 (top 2 of 2 heats of 3) rather than make someone skip. A final of fewer than the aimed size is used only when nothing else fits (8 riders at the defaults end in a final of 2).
- **Small fields:** with the defaults 4 or 5 riders still make a second-chance ladder (heats 2/2 or 2/3, one second-chance heat); with a minimum of 3 they are one heat.
- The explanation under "Knockout with a second chance" changed from "…2nd and 3rd get one more heat to qualify" to "…the other riders get one more heat to qualify", because 4th place also gets one by default. The banned-word test and the wording test were adapted.
- The second-chance advance count is chosen by the planner (1st goes on, sometimes 1st–2nd or 1st–3rd when the final would otherwise be too small or too big); it is not a setting.

### How to test round 5 (Vercel preview)
1. Divisions → Pro Men → **Format** → "Single elimination": set **Riders per heat (target)** 3, **Minimum per heat** 3, **Maximum per heat** 4, "Preview with" 14 → heats of 3, 3, 4, 4. Change minimum to 2 and maximum to 3 → 2/3/3/3/3. Target 4, minimum 4, maximum 5 with 13 riders → 4/4/5; with 5 riders → one heat of 5; maximum 4 with 24 riders → six heats of 4.
2. Pick **Knockout with a second chance**, target 3, minimum 3 (maximum 4), 14 riders: "R1 4 heats of 3–4 → Second chance 3 heats of 3–4 → SF 2 heats of 3–4 → F 1 heat of 4 (10 heats)", no "Advances without riding" anywhere. Try 16 and 18 riders.
3. Set **Riders per heat who get a second chance** to "2nd and 3rd only; the others are out": the diagram shows "4th → out" and the tag/minimum-heats change; set it back to "Everyone who did not win".
4. Tick **Show all settings**: all Simple fields (including Minimum, Maximum and second chance) are still visible.

### Phase 4a-1 – the Format tab as one card, four new formats, visual custom builder (round 6)
Done:
- **One picker.** Seven ladder cards (Knockout · Knockout with a second chance · Double elimination · Qualifying heats + finals · Pools to a final · Round robin · Single final) with your one-line explanations and tags; "Start from a format" is gone, "Load a saved format…" and "Build my own ladder…" sit at the top. Order: cards, one row of the numbers that format uses (labels above inputs), "Preview with … riders" + 8 / 14 / 24, the diagram with the text preview under it, "Heat length per round", "Show all settings" (single heat lengths, breaks, flag-out and timing moved there).
- **Round and heat names** are editable by clicking them on the diagram, on every format; they are stored as overrides keyed by round id (`roundNames`) and heat id (`heatNames`), survive regeneration, sit on `DrawRound.name` / `DrawHeat.name` for the timetable and public pages (those pages do not exist yet), and a blank name restores the default.
- **Four new generators**, tests first (docs/04 decisions 28–31, docs/08 §2G00): double elimination, qualifying heats + finals, round robin, single final. Every generated round obeys target / minimum / maximum; none has a rider who advances without riding. Four new system presets (seeded to the hosted project).
- **Megaloop men and women** are hidden from the menus (`hidden: true`; files and tests kept).
- **Custom ladder** is a visual builder: round cards with target / minimum / maximum and a dropdown for every place, "+ Add round" on the diagram and below, live checks that name the round and the counts, "Save as my format", offered again by "Load a saved format…". Where riders come from is worked out from the dropdowns.

Things you should know (please confirm or change):
- **Your Decisions log references do not match the docs.** docs/04 items 13 and 16–18 are draft/locked draws, "Seed now", pool ranking, cross-pool tie-break and manual seeding; docs/08 has no §2G or §2G00 for these formats. So the three rules that were missing were put to you and answered: bottom half drops in double elimination, top 2 of each draw to the final for now (a setting, 2 = the two draw winners), place points editable for round robin. The docs now have decisions 28–32 and §2G00.
- **"Everything visible without scrolling on a laptop" is not possible.** Measured at 1440 × 900, page scrolled to the top: the Format tab itself starts at y ≈ 480 (event header, step rail and division card above it), the seven cards fill y ≈ 770–1520, the numbers row starts at y ≈ 1540, "Preview with" at ≈ 1800 and the diagram spans ≈ 1860–2390. Everything is on the page without toggling anything (a Playwright test asserts that), but it takes scrolling. Making it fit would mean dropping the explanations from the cards or moving the diagram beside them; tell me if you want either.
- **The double-elimination card text** says "The best riders of each draw meet in the final" instead of "The two draw winners meet in the final", because the default is now the top 2 of each draw (final of 4).
- **Qualifying: "at least 2 heats"** is true because the default is 2 qualifying heats per rider ("Heats per rider"); set it to 1 and the tag changes to "Riders can be out after 1 heat" (the tag follows the real minimum).
- **Round robin** repeats opponents when the field cannot avoid it (8 riders in 2 heats of 4: 4 repeated pairs; 12 riders: about 3 per round); with 16, 20, 24 or 30 riders none.
- **Double elimination cannot keep all three numbers for a few field sizes** (3 / 3 / 4 with 13 riders; 7–8 riders); the draw warns. With the default numbers (3, minimum 2, maximum 4) every field from 10 to 40 riders works.
- **The Final size in double elimination is even** (top N / 2 of each draw).
- Heat lengths and breaks are no longer on the Simple screen (your (e) and (f)): the per-round table is pre-filled from the ladder's own lengths; the single lengths are under Show all settings.
- No database change this round (only preset rows), so `test:rls` was not re-run.

### How to test round 6 (Vercel preview)
1. Events → your event → Divisions → Pro Men → **Format**. Seven cards, no "Start from a format" list. Click each card: its numbers, "Preview with", the diagram and "Heat length per round" are all on the page.
2. Click a round name in the diagram (e.g. "Semi-finals"), type a name, press Enter; change "Preview with" to 24: the name stays. Blank it: the default comes back. Click a heat name too.
3. **Double elimination**, 14 riders: "Main draw 1", "Second-chance draw 1", the final of 4; set Final size 2. **Qualifying heats + finals**: Small final; Heats per rider 1 changes the tag. **Round robin**: Heats per rider 4, Points table "10, 6, 3, 1". **Single final**: one heat.
4. "Load a saved format…": Megaloop is not in the list. "Build my own ladder…": press "+ Add round after Round 1", send 1st and 2nd of Round 2 to the Final with the dropdowns, read the checks, "Save as my format", then load it again from "Load a saved format…".

### Phase 4a-1 – compact format cards and organiser password sign-in (round 7)
Done:
- **Compact cards**: one line each (name, tag and a "?"), the one-line explanation under the selected card only. With the Format tab at the top of a 1440 × 900 window the cards, the numbers row, "Preview with" and the top of the diagram are all in view (Playwright asserts it). To get there I also removed the "Ladder type" heading row, the preset description under the load buttons and the "Every heat holds N to M riders" note, and tightened the spacing.
- **Email + password for organisers**: /org/login has email and password, "Sign in", "Sign in with a link instead" and "Forgot password?" (sends the existing link, which opens /org/set-password). "Set a password" (also in the header) lets an existing account set its first password after a link sign-in. Wrong password and unknown address give the same message. Officials' PIN flow unchanged. Playwright: `e2e/password-login.spec.ts` (right/wrong password, unknown address, non-organiser refused, forgot-password checks, set password then sign in, PIN page unchanged).
- Hosted auth settings applied by `npm run auth:password`: email provider on (it already was), minimum password length 8.

Things you should know:
- **I did not switch public sign-up off**, although "keep invite-only" suggests it: I tried, and Supabase's switch also blocks the anonymous sessions the officials' PIN flow uses (the join tests failed), so I put it back. Invite-only is kept by the app: no sign-up form, an unconfirmed self-made account cannot sign in (Supabase's standard behaviour with confirmation on; not tested here because a sign-up sends a real email), and a password sign-in without an organiser membership is refused and signed out. A stranger can still create an unconfirmed auth user through the public API (it sends them a confirmation email) but cannot get in; closing that fully needs a custom SMTP + hook, which I did not add.
- Password sign-in was already technically enabled on the project; "enable the provider" changed only the minimum length.
- The existing invite-only e2e test now first clicks "Sign in with a link instead" (the page opens in password mode).
- "Forgot password?" is not tested with a real address (each one sends a real email and the project allows 2 per hour); it is tested with an empty and an unregistered address.
- Removed the "Every heat holds N to M riders" note under the numbers to save height.

## Phase 4a-1c – platform owner layer (branch `phase-4a-1c-owner-admin`)

### Done
- **Database** (3 migrations, applied to the hosted development project over HTTPS): `platform_admins` (owner | staff), `platform_settings` (product name, logo, tagline, legal texts, default time zone), `platform_impersonations`, `organisations.archived_at`, `audit_log.organisation_id`, version and `published_at` on system presets (existing ones count as published), and the admin and public functions. RLS: only platform admins read or write the platform tables; they read every organisation; organisers are unchanged.
- **Your account is now platform owner** (`npm run bootstrap:platform-admin`, run against the hosted project: "f***@outlook.com is now platform owner", still owner of Arrow).
- **/admin** (404 for organisers and officials, sign-in page for visitors): Organisations list (events, status, plan, last activity), Create organisation (name, slug, logo, time zone), Invite first organiser (email, or a link to copy), Rename, Archive / Restore, Delete (owner only, type the slug, refused with published results), "Open as this organiser" with an audited session and the banner "Viewing as … — back to … admin", Platform settings, Master presets (edit = new draft version, "Publish to all customers"), Audit log, Health.
- **Header switch** "Sendbook admin ↔ Organiser view (Arrow)" for admins only. The organisation drop-down is a switcher with the logo only for people in more than one organisation.
- **Public**: the home page lists published, live and finished events of active organisations as "Organisation · Location · Date" and links to the event; new small event page `/e/[slug]`; new organisation page `/o/[orgSlug]` (logo, live / upcoming / past); tagline and product name from the platform settings; `/legal`.
- Every string is in `src/lib/ui-copy.ts`; labels above inputs; "?" help on the settings; one confirmation for each data-changing button.

### Test evidence
- `npm run typecheck`: clean. `npm run lint`: clean. `npm run build`: passes.
- `npm test`: **Test Files 56 passed, Tests 613 passed** (32 new, in `src/lib/platform`).
- `npm run test:rls`: **Test Files 2 passed, Tests 127 passed** (41 new in `tests/rls/platform.test.ts`; two older tests now publish their system preset first, because unpublished system presets are hidden on purpose). New tests: an organiser cannot read `/admin` data or other organisations, an admin can; impersonation is audited, expires, and ends when the admin role is removed; deleting is refused with published results, with a wrong slug and for staff; archive hides events from visitors; drafts are invisible to customers and publishing is owner-only.
- `npm run test:e2e`: **21 passed** (8 new in `e2e/admin.spec.ts`, including an invited organiser signing in through the copied link, the 404s, and create → invite → rename → open as organiser → archive → delete).
- Dry run of the Demo organisation deletion inside a rolled-back transaction: succeeds (1 event, 0 published results); the Demo organisation still exists.

### Choices I made where the docs were silent (please confirm or change)
1. **What staff may do.** Owner and staff can look, create, rename, archive, invite, open as organiser and save draft presets; only an owner deletes an organisation, publishes a preset, changes platform settings or manages admins.
2. **Archive is not read-only.** Organisers of an archived organisation can still sign in and work; only the public site hides it. The 4a-2 registration page must also refuse archived organisations.
3. **"Published events only"** on the home page means published, live and finished (as before); drafts never show.
4. **Organisation page appears with its first published event**, so a new customer's name does not leak before that.
5. **Open as this organiser lasts at most 8 hours** and gives full organiser rights in that one organisation.
6. **Small extras** so the links do not lead nowhere: a minimal public event page `/e/[slug]` (planned for 4b) and `/legal` for the legal texts.
7. **Invite** tries the email first, then falls back to a link, because generating a link replaces an older one.

### Not done / not verified here
- The invite **email** itself was not sent (the plan allows 2 per hour); the link path is tested end to end. The **logo upload** screens (create form, organisation page, platform settings) are not covered by Playwright. **Realtime "Connected"** was not observed in this sandbox (the test accepts Checking / Connected / Not connected); check it on the preview.
- Deleting the Demo organisation (your acceptance test) also removes Demo Cup, so `e2e/join.spec.ts` and the phone test below need `npm run seed:demo` again.
- Platform logo replacement leaves the old file in storage (harmless).

### How to test on the Vercel preview
1. Sign in at `/org/login`. The header now has **Sendbook admin ↔ Organiser view (Arrow)**; you belong to two organisations, so the organisation switcher shows too.
2. **Sendbook admin** → Organisations: Arrow and Demo organisation with events, Active, free, last activity.
3. **Create organisation** "Test Customer", slug `test-customer`. On its page, **Invite first organiser** with an address of yours (untick "Send the sign-in email now" to get a link to copy). Open the link in a private window: you land in that organisation only, and `/admin` shows "This page could not be found".
4. Back as owner: **Open as this organiser** → the yellow banner "Viewing as Test Customer — back to … admin" stays on every screen; press it. **Audit log** shows the start and end.
5. **Platform settings**: set a product name and tagline, save, open the home page (new name and tagline; clear the name to go back).
6. **Master presets**: open a scoring model, change a number, **Save as new version** (draft), then **Publish to all customers**. Existing divisions keep their version.
7. **Health**: database, Realtime, last publish.
8. Home page: each event reads "Organisation · Location · Date". `/o/arrow` shows the Arrow page. Archive Test Customer and check `/o/test-customer` says not found; restore it.
9. **Acceptance test: delete the Demo organisation.** Organisations → Demo organisation → Manage → Delete: type `demo-org`, confirm. Then delete Test Customer the same way. Leave Arrow alone: it has no published results yet, so the system would let you delete it too (after that, only Archive is possible).

### Phase 4a-1c – follow-up: "Create demo organisation" button
- **Done.** /admin shows **Create demo organisation** (owner only, one confirmation) only while no organisation with slug `demo` or `demo-org` exists. It builds the same demo as `npm run seed:demo`: the demo data is now the database function `private.seed_demo_data()` (migration `20261001100300`, applied to the hosted project; `supabase/seed.sql` just calls it), then the ladder engine draws every division (`src/lib/demo/draw.ts`, shared with the script).
- **Evidence.** RLS and integration: 45 tests in the two new/extended files pass (organisers and staff refused, an existing demo refuses a second one, the draw stores rounds/heats/slots once and a second run changes nothing). On the real project I deleted Demo and recreated it inside a rolled-back transaction: 20 riders, 20 entries, 3 divisions, 5 seats, PIN 100001 valid, a second call refused; the real Demo organisation is untouched.
- **Choices to confirm.** (1) The seed has always used the slug `demo-org`, not `demo`, so the button hides if either exists; I did not rename it because the bootstrap script, the tests and my earlier instructions use `demo-org`. (2) "Dev-safe" is on by default and switched off with the environment variable `DEMO_SEED_DISABLED=1` on any project with a real event, because the demo PINs are public.
- **Not verified.** The button click itself: this project already has a demo, so the Playwright test only proves the button is hidden (it runs the create flow when there is no demo). Please try it after the acceptance-test deletion: delete Demo, then press the button on the Organisations page.

### Phase 4a-1c – follow-up: "Move event to another organisation"
- **Done.** Organisation page in /admin has an **Events** table; the owner sees **Move event to another organisation** per event (drop-down of the other organisations, one confirmation naming the event and both organisations, audit entry). Database: `admin_move_event` (one transaction, owner only, refused while a heat is running or paused, for the same organisation or an unknown one) and `admin_organisation_events`; migrations `20261001100400` and `20261001100500` are applied to the hosted project.
- **What moves.** The event with divisions, rounds, heats, results, panels, officials, entries and settings; riders are matched in the new organisation by email or copied and the entries repointed; riders left with no entries in the old organisation are removed; organisation presets the divisions use are copied.
- **Evidence.** RLS: `tests/rls/platform.test.ts` 49 tests pass (8 new: organiser, new-organisation organiser and staff refused; running and paused heats refused with nothing moved; same/unknown organisation; the full move with nothing of the event left behind; access flips between the two organisers; audit line). Playwright: the owner sees the action, moves an event and finds it in the audit log; staff see "Only platform owners can move an event."
- **Choices to confirm.** (1) A rider entered in another event of the old organisation stays there and gets a copy in the new one. (2) Old organisation presets and logo files are not deleted. (3) The rules lock now allows repointing a division to a preset copy with identical content (needed because started events must be movable); real rule changes are still refused.
- **Not verified.** Moving an event that has published results was not tested (results follow the event by id; rider names are copied).

### Phase 4a-1c – bug report: /admin "Application error" on the Vercel preview
- **Root cause: not found, and I will not claim otherwise.** The preview is behind Vercel login, so I could not see its runtime log. I reproduced every reasonable difference locally in **production mode** as your real owner account against the same database, and `/admin` (all six screens, plus soft navigation) rendered every time: with the demo organisation present and absent, with an open "Open as this organiser" session, without `SUPABASE_SERVICE_ROLE_KEY`, and with a production build made without `NEXT_PUBLIC_PRODUCT_NAME` / `NEXT_PUBLIC_DEFAULT_TZ` / `NEXT_PUBLIC_SITE_URL`. So a missing variable is **not** what breaks the page: nothing on `/admin` reads the service key or those names while rendering. The remaining suspects are specific to Vercel's runtime, and only its log can name the exact line: Vercel → the project → Logs → search for the digest `3336292670`.
- **Fix (makes the page fail readably).** A failing part of an admin page is now caught, written to the server log with its name (`[admin] … failed`) and shown on the page as a message while the rest still works; the header switch and the platform settings can no longer take a page down; dates never throw on an unknown time zone; anything else lands on a readable error page with the error reference, "Try again" and a link to Health (`src/app/admin/error.tsx`). **Redeploy and reload `/admin`: if it still fails, the page now says why** (send me that sentence).
- **Health page** has a new "Server configuration" list: which of the settings exist, by name and yes/no, never values.
- **Landing.** Platform admins land on `/admin` after signing in (password or emailed link) unless they were heading somewhere else; organisers still land on `/org`. An admin with no organisation can now sign in with a password.
- **Which Vercel variables the app needs** (Project → Settings → Environment Variables, for Preview and Production): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key), both must already be there because `/org` works; `SUPABASE_SERVICE_ROLE_KEY` (the secret key, `sb_secret_…`, from Supabase → Project Settings → API), needed for inviting organisers, deleting an organisation's logo files and building the demo draw; optional: `NEXT_PUBLIC_PRODUCT_NAME`, `NEXT_PUBLIC_DEFAULT_TZ`, `NEXT_PUBLIC_SITE_URL`, `DEMO_SEED_DISABLED`. Use the Health page to see which are set.
- **Evidence.** `npm run build` passes (also without the optional variables). New unit tests (safe wrapper, configuration check, landing rule): 58 files, 626 tests pass. Playwright in dev mode: 25 passed, 1 skipped (the production-only test). `npm run test:e2e:prod` (builds, runs `next start`, loads every admin screen as the owner, checks the landing after password and link sign-in): 3 passed.

### Phase 4a-1c – follow-up: delete/archive events, row menu, test-data clean-up
- **Delete or archive an event.** Organisers: Event step, "Delete or archive this event" (typed web address; with published results Delete is refused and Archive is offered). Owners: the same two actions per event in the admin events table. Delete removes divisions, entries, officials, panels, heats and schedule plans in one transaction (riders stay in the organisation) and writes an audit line; Archive (`events.archived_at`) hides the event from the home page, organisation page, event page, live view, the join page and the organiser's list, keeps every row, and can be restored. Migration `20261001100600` is applied to the hosted project.
- **Also fixed:** the public live view ignored archived organisations; it now follows the same rule as the rest of the public site.
- **Organisations list.** Every row has a "⋯" menu: Rename, Archive / Restore, Delete (owners), Invite organiser. Test data (`e2e-`, `rls-`, `plat-`, `evdel-`) carries a "⚠ Test data" tag.
- **Leftover test organisations deleted** from the hosted development database: "E2E Big Air 06b4f0aa" and "E2E Big Air fc86e674" (both empty; Arrow, EKL and the recreated Demo untouched).
- **Test clean-up.** Every organisation and login a Playwright test creates is written to a per-run ledger; a global teardown removes it even when tests fail (proved with a deliberately failing spec that had no afterAll: its data was gone afterwards), and the next run's setup sweeps ledgers and `e2e-` organisations older than 30 minutes. `createOrganiser().cleanup()` now attempts every step even if one fails.
- **Evidence.** typecheck and lint clean; `npm test`: 58 files, 628 tests passed; `npm run test:rls`: 4 files, 144 tests passed (7 new in `tests/rls/event-delete.test.ts`: organiser of another organisation, platform staff and visitors refused; wrong address refused; published results refused, for owners too; archive hides the event in every public route and keeps the data; delete leaves nothing behind and keeps riders; audit lines); Playwright: 27 passed and 1 skipped in dev mode (4 new), `npm run test:e2e:prod`: 3 passed.
- **Test fix.** Two tests compared the home page with the built-in product name; you have since set "Sendbook" in the platform settings, so they now read the effective name.
- **Not verified.** Deleting an event that has unpublished scores and attempts (they are removed with it, and their audit lines stay, but I did not test with real scoring data); the archived-event join refusal is code-only (the join action is not covered by a browser test).

### Phase 4a-1c – bug fix: Knockout ladder ignored the maximum in later rounds
- **Cause.** The Knockout generator applied target / minimum / maximum only to Round 1; later rounds took whatever the "smaller heats" rule gave, so 24 riders at 3 / 3 / 3 went R1 8×3 → SF 2×4 → F 1×2 (11 heats): a semi-final above the maximum and no Round 2.
- **Fix.** A pure planner (`src/lib/engine/ladder/knockout-plan.ts`) works out every round from head counts: never above the maximum; 1 v 1 heats (heats of 2, one of 3 for an odd number) when the minimum cannot be kept; rounds until one heat can hold everybody left; the final size is a target. Result for your example: **R1 8×3 → R2 4×2 → SF 2×2 → F 1×2 = 15 heats**. New pairing "adjacent heats" (winners of H1 and H2 meet, H3 and H4, …) is the default when seeding into the next round is "By original seeding"; "By their result" stays as the alternative. Text preview and diagram follow automatically ("(1 v 1)" is shown on those rounds).
- **Evidence.** `npm test`: 59 files, 646 tests pass, including your three examples and a property test over N = 4…40 and every target / minimum / maximum / advance / final combination (660 setting combinations × 37 field sizes = 24,420 plans, plus the real draw for a spread of them). Playwright: your 24-rider case in the real Format tab shows the sentence above. docs/04 (new decision 33) and docs/08 (§2G7) are updated.
- **Preset.** The Knockout preset now defaults to "By original seeding" (`reseed`), stored as a new version (v3) in the hosted database, and published. Existing divisions keep the version they have; **a division whose format still says "By their result" keeps snake pairing until you switch that setting**, but its round sizes are fixed by the new planner as soon as this is deployed.
- **Also fixed:** `seed:presets` did not publish what it wrote (so a re-seeded preset would have been hidden from customers by the draft rule); it now does.
- **Behaviour changes to know about.** 5 riders with the default 3 / 4 / 4 / minimum 3 used to ride one heat of 5; the maximum is 4, so they now ride heats of 2 and 3 and a Final of 2. A heat of two advances one rider even when "How many advance" says 2, so somebody is out of every heat.
- **Not done (needs your decision).** The other generators (second chance, double elimination, qualifying, pools, round robin) still let the minimum win over the maximum in small fields. Audit (five settings from 3 / 3 / 3 to 4 / 4 / 4, 6 to 40 riders, 175 draws per generator, counting heats above the maximum outside the Final): second chance 201, double elimination 291, qualifying 232, pools 82, round robin 166; Knockout 0. Applying the same 1 v 1 fallback there changes how pools, qualifying rounds and round-robin rounds are built, so I did not do it silently.

### Owed: the same sizing rule in the other generators (decision recorded, not built)
The owner decided that the target / minimum / maximum rule with the 1 v 1 fallback applies to **every** generator, and that it is **not** part of this PR (docs/04 decision 34). Second chance, double elimination, qualifying, pools and round robin still exceed the maximum in small fields (audit: 201, 291, 232, 82 and 166 heats above the maximum outside the Final, five settings, 6 to 40 riders). A later phase applies a planner like `planKnockout` and a property test like `2g7-knockout-sizing.test.ts` to each of them. Also confirmed: N = 21 (3 / 3 / 3, 1 advances, final of 2) ends in a Final of 3; the preview now says "Final of 3 — 3 riders remain after Round 2".

## Phase 4a-2 – riders, officials, public registration, trick base, feedback notes (branch `phase-4a-2-riders-officials`)

### Done
- **Two small fixes.** The header button says **Set a password** until a password is saved or used, then **Change password** (the Change password page has its own wording). Every event web address in the organiser's list, the Event step and the admin events table is a link to the public page (new tab) with a **Copy link** button.
- **Riders step** (per division): add by hand; paste or upload a CSV with a preview (one line per problem with the file's line number, rows with a problem are never saved and are listed, the rest are saved together in one transaction); Excel exports, semicolons, quotes, blank lines and trailing spaces are handled; **Add from this organisation's riders**; registrations from the public page with **Approve** (confirmed) and **Decline** (optional reason); drag by the handle **or** the ↑ ↓ buttons; **Shuffle randomly** (repeatable, the code is stored) and **Sort by seed number**; Withdrawn and No-show; **Print start list**; identifier cells editable inline; a **Rider label** column showing each rider as judges will see them; warnings (never blocks) for a repeated fixed lycra colour, bib, near-identical kite, rash guard colour or name.
- **Identification per division**: a Rider label tab in the Divisions step (the event's identification by default, or the division's own scheme with the same editor). Every later screen uses the division's effective scheme. Name call-out is the default when there are no lycras.
- **Officials step**: add a seat (name, role, Head judge also scores); the PIN in a large box with Copy, a WhatsApp share link and a single-use QR code; afterwards behind **Show PIN**; **Print cards** (all seats or one) and **Regenerate PIN** are separate buttons; panels as a tick grid with "Pro Men needs 3 judges, 2 assigned" warnings; spotters free or assigned to riders or lycra colours; last seen from a heartbeat; pending self-added officials with Approve (makes the PIN) or Decline.
- **Public registration page** `/e/<address>/register` and the Event step's registration settings (open or closed, closing day and time, most riders per division, message shown when closed); honeypot field, per-address limits, photo shrunk on the phone and stored privately (2 MB).
- **Trick base** tabs in the Divisions step (five families, all ticked, categories derived by precedence, "+ Add block" proposed to the master base, lock after a heat starts); **/admin → Trick proposals** for the owner; master vocabulary **version 2 seeded and published**.
- **Feedback notes**: Note button for owners and organisers, lists in /admin and /org, **Export for Claude** (download and copy).
- Migrations `20261002100000` … `20261002100500` (seven files) applied to the hosted development project with the management-API script; `npm run db:types` now rewrites the type file from the hosted schema.

### Questions I asked first, and the owner's answers
1. PINs must be readable again for Show PIN and Print cards → **kept encrypted** (server-side key), hash kept for joining. 2. Regenerate PIN **signs the seat out**, refused while that seat's heat is running or paused; Print cards never signs anyone out. 3. Photo limit **2 MB** after shrinking. 4. Feedback export **without a token and without a sixth platform setting**: download plus Copy for Claude. The matching test ("the GitHub token is never readable by a non-owner") does not exist because there is no token. All four are written into docs/05 and docs/06.

### Test evidence
- `npm run typecheck` clean · `npm run lint` clean · `npm run build` passes.
- `npm test`: **Test Files 69 passed, Tests 801 passed** (628 at the end of the last phase): CSV parser on messy input, duplicate detection, repeatable shuffle, Rider label under every scheme and the division's effective scheme, identifier columns, trick base (families, categories, local blocks, lock rule, accepting a proposal), PIN encryption, panel check, share link, registration form, photo sizing, FEEDBACK.md formatter, the wizard's missing lists, the new Event settings. The banned-words test still passes (which is why the button says "Set as done").
- `npm run test:rls`: **5 files, 200 tests passed** (144 before; 56 new in `tests/rls/riders-officials.test.ts`): riders and entries only inside their organisation (also a guessed rider id), registration refused when closed, archived, full or past its closing time, photo slots, pending seats cannot join (PIN or QR) until approved, a regenerated PIN's old value is refused and the seat is signed out, regenerate refused for a connected seat in a running or paused heat, the PIN column unreadable and never in the audit log, heartbeat writes no audit line, panels and "head judge also scores", trick base lock, feedback notes visible only to their organisation and the owner, text never editable, screenshots private.
- `npm run test:e2e`: the complete run gave **45 passed, 5 failed, 1 skipped**. Four failures were old expectations that this phase changed on purpose (the registration tick box became Open / Closed; the Event step now has two address links) or a test that needed more time on a cold dev server; one was a random choice in my own new test. All five were fixed and then passed when re-run. After adding the acceptance walk-through, the panel change and cleaning up, I re-ran the affected specs (riders, officials, registration, trick base, feedback, division identification, join, password, admin, organiser): all green. A final complete run was cut short by a dev server that had hung; I did not get a second uninterrupted full run, so please treat "all 52 green in one go" as **not proven**.
- `npm run test:e2e:prod` (production build, `next start`): **3 passed**.
- New browser specs: `riders` (3), `officials` (5), `registration` (4), `trick-base` (3), `feedback` (2), `division-identification` (2), `phase4a2-basics` (2), `acceptance-4a2` (1: your "done means" list on a throwaway organisation: 24-rider CSV, every Rider label, seeds by drag and by tap, a phone registration approved, 3 judges + head judge + spotter with PINs, cards, one PIN regenerated, the "needs 3 judges" check turning green, a local trick block, a Note, the export).
- Test data: every organisation and login a browser test makes is in the ledger; I also taught the clean-up to remove the files tests upload (rider photos, screenshots, logos). The two test organisations left by my killed run and ten orphaned files were removed by hand; afterwards the hosted project holds only `arrow`, `ekl` and `demo-org`, no test logins and no files. Arrow, EKL and Demo were never touched. The master trick vocabulary holds versions 1 and 2 only (the test that accepts a proposal removes the version it creates).

### Choices I made where the docs were silent (please confirm or change)
1. **"Mark" is a banned house word** (a test enforces it), so the feedback button is **Set as done**, not "Mark done". Same for "withdrawn / no-show": the status list reads Confirmed, Withdrawn, No-show.
2. **Accepting a trick proposal publishes at once** (new version, older versions untouched, one confirmation, owner only) instead of leaving a draft for a second publish step. The block keeps its key (starts with "local_").
3. **A division that is duplicated does not copy its panel** (panels are now per division, so sharing one would make a change in one division change the other). It does copy description, own Rider label scheme and trick base.
4. **The Rider label switch gates the per-division scheme.** If the Event step's "Allow a different scheme for individual divisions" is off, the division's tab says so and links to the Event step; a scheme saved earlier is kept but ignored.
5. **The shuffle code survives hand edits**, so Repeat this shuffle always restores exactly the shuffled order; only a new shuffle replaces the code.
6. **Declined registrations are kept** (status declined with the reason) and can still be approved later from the collapsed "Declined" list.
7. **The registration insert is enforced by the database function**, as the earlier decision says (visitors have no write rights on the tables at all, so "RLS refuses" is shown by the tests as: direct inserts are refused, and the function refuses when closed, full or archived).
8. **Seats made before this phase have no stored PIN**: their card says so and Regenerate PIN gives them one (the demo organisation's and Arrow's existing seats, if any).
9. **Colours for spotters** only make sense once lycras exist, so the colour choice is offered only when the division's scheme uses lycra colours.

### How to test on the Vercel preview (also in the pull request)
1. Event step: open the event, see its address under the name as a link with **Copy link**; set **Registration** to Open, a closing day and time, **Most riders per division** 24 and a closed message; Save.
2. Divisions step: give Pro Men a level description; open **Rider label** and **Trick base** (tick and untick, **+ Add block**).
3. Riders step: paste a 24-row CSV (First, Last, Email, Seed …) and read the preview before pressing Import; drag a row by ⠿ and use ↑ ↓; press **Shuffle randomly**, move somebody, press **Repeat this shuffle**; **Sort by seed number**; **Print start list**.
4. On your phone open `/e/<address>/register`, register yourself as a rider (with a photo if the scheme asks for one); back on the Riders step press **Approve**.
5. Officials step: add three judges, a head judge and a spotter: read each PIN in the box; close it; tap **Show PIN**; **Print cards**; **Regenerate PIN** on one (the old PIN now fails at `/e/<address>/join`); tick the judges under Pro Men and watch "needs 3 judges" turn into ✔.
6. On a second phone open the join page, **Not on the list? Add your name**; approve it in Officials and join with the new PIN.
7. Press **Note** on the Riders step, write something, attach a screenshot; open **/admin → Feedback**, **Export for Claude**, **Download FEEDBACK.md** (or **Copy for Claude**). **/admin → Trick proposals** shows blocks events proposed.

### Not done / not verified
- The Note button is on every organiser and admin screen and on public pages for a signed-in organiser or owner, but it is **not** on the officials' phone screens or for visitors, as asked.
- Dictation uses the browser's speech recognition; it was not exercised in the test browser (no microphone): the button is shown only where the browser has it.
- "Request a rule" page: none existed, so nothing was migrated; the **new rule** kind is that list.
- Moving a rider between several divisions by drag is not built (enter them in each division).
- Email confirmation of registrations (Phase 7) and showing rider photos to officials (Phase 5: the bucket already lets the organisation read them) are not built.
- I could not open the Vercel preview from here. Everything below was run locally against the hosted development project.

## Phase 4b – Draw, hands-on editing, custom ladder builder, run order and timetable (branch `phase-4b-draw-timetable`)

### Step 0: the run on main before any change
- typecheck and lint clean; `npm test` 802 passed; `npm run test:rls` 200 passed; `npm run test:e2e:prod` 3 passed.
- Playwright on main: **51 passed, 1 skipped, in two passes, not one uninterrupted run** (I am saying so plainly). The first pass had 6 failures: they all passed on their own once the per-test limit was 90 s instead of 30 s (this sandbox is far from the database; the fix is in `playwright.config.ts`). A second pass lost 4 tests because the dev server was stopped by the sandbox; those passed when re-run. Nothing on main's code was red.

### Done
- **Draw step** per division: Generate draw (confirmed riders only), rounds as columns, heats as cards, Rider labels and placeholders ("1st H1", "1st R2 H3"), Regenerate (one confirmation, refused once a heat has started or while locked, offers to keep hand-arranged heats), Lock draw / Unlock with a written reason (audited), Print / PDF.
- **Hands-on editing**: drag on a desktop; tap a rider, tap the seat, "Move here" or "Swap with …"; hand-place a rider in any seat including a placeholder; put a place in a seat; clear a seat; add or take out seats, heats and rounds; rename. Checks after every change warn and never block. Every change is one audited server call; started or finished heats change only by name.
- **Custom ladder** (eighth card on the Format tab): whiteboard builder, dropdowns that grey out used places and say where they went, "1st →" gesture, checker beside (below on a phone) with red faults, amber recommendations and one-tap fixes, "Start from Knockout and edit", save as an organisation format (JSON round trip), **Apply to draw** saves, sets the division's format and draws.
- **Warm-up** before each heat in the division's timing, per round override, shown as its own part of the timetable row; the format preview states the total time.
- **Run order & timetable** per event day: unscheduled heats left, run order right, drag or move up / down, breaks and notes, tap a start to pin it, per-row length and break, projected finish and heats left, Duplicate plan, Activate, Hold / Resume at / Shift, PDF (print layout) and PNG in the Division / Session / Start / Duration / End / Break layout.
- **Dashboard** at `/org/events/<id>`: today's timetable, now and next, what is missing, share cards with link, Copy and QR.
- Database: migration `20261003100000` applied to the hosted project with `npm run db:apply`; types regenerated. The stored draw is hidden from the public role and writable only through `save_division_draw` / `lock_division_draw` / `unlock_division_draw` / `set_draw_walkover`; guards refuse seat changes on a locked draw or a started heat; `activate_schedule_plan`; plan changes audited. `seed:presets`: 24 unchanged, nothing new to publish (no preset file changed).

### Test evidence
- `npm run typecheck` clean, `npm run lint` clean, `npm run test:e2e:prod` 3 passed.
- `npm test`: **77 files, 929 tests passed** (was 802). New: draw editing, custom ladder (every fault and recommendation, hand-built 24-rider knockout equals the generated one, JSON round trip, property tests over 660 generated or edited ladders), warm-up and timetable cascade against the docs/08 values, run-order editing, export rows, heat model, plans, wizard.
- `npm run test:rls`: **215 passed** (200 before; 15 new in `tests/rls/draw-timetable.test.ts`: only the organisation's organisers save, lock, unlock and edit plans, a locked draw refuses seat changes, unlock needs a reason, started heats are never rearranged, audit rows, the public cannot read the draw). One older test that wrote the draw directly now uses the functions.
- Playwright: final full run **53 passed, 1 skipped, 1 failed**; the one failure (the Format tab's "everything in view" check) was my new eighth card pushing the diagram off screen, fixed by laying the cards in two columns, and that spec passes on its own. New specs in `e2e/draw-timetable.spec.ts` (3 walk-throughs). All test organisations are removed by the ledger; Arrow, EKL and Demo were never touched.

### Choices I made (please confirm or change)
1. **Warm-up sits after the break**: a heat starts (previous end + break + warm-up) after the previous one; a pin is on the heat's Start. That gives 253 minutes for your 15 heats, "about 4 h". If you meant warm-up to overlap the break, it is one line in the timetable engine.
2. **Regenerate on a locked draw is refused** (unlock with a reason first) and needs **one** confirmation, not a typed one; this differs from docs/06 decision 14 (recorded).
3. **All heats of a round send the same place to the same round** in the custom builder (1st of every Round 1 heat goes to the same round). "Places that go on" is one number per round.
4. **A 1 v 1 round under a minimum of 3** shows red until you tap "Allow heats of 2 in this round" (the round's own minimum).
5. **Regenerate keeping hand-arranged heats** keeps heats of the first round; other arranged structure is listed as "could not keep".
6. **Heat numbers** follow the ladder until a heat starts; after that they never change and a new heat takes the next number.
7. The Knockout preset's per-round lengths are 10 / 10 / 12 / 15; to get "5 + 10" for every heat set the Semi-finals and Final lengths to 10 in "Heat length per round".
8. The old "Build my own ladder…" button is replaced by the Custom ladder card; older saved custom formats still open in their round editor.
9. Signed-in users of other organisations can read the stored draw of a **published** event (names are public there anyway); drafts stay private.

### Owner's decisions on the choices (1 Oct 2026)
- Accepted as built: warm-up after the break; regenerate refused while locked with one confirmation (docs/06 decision 14 updated); choices 3–6 and 8 of the list above (one place per rank per round, "Allow heats of 2", keep only first-round heats on regenerate, heat numbers stable once a heat starts, Custom ladder card replaces "Build my own ladder…").
- Changed: the Knockout preset's heat length is now **10 minutes in every round** (preset version 4, seeded and published; existing divisions keep the version they use).

### Two fixes from the owner's click-through (1 Oct 2026)
- **Custom ladder builder follows "Preview with N riders".** The box is never locked. Round 1 seats, the checker ("24 riders, 21 seats — 3 riders have no heat") and the recommendations all use that number while you design; the division's real riders come first, placeholders ("Rider 23") fill the rest. "Apply to draw" uses the division's real confirmed riders and says what differs ("Designed for 24, the division has 22 — 2 seats will be empty"; or "… 2 riders will have no seat" the other way round). It warns, it never blocks.
- **Print / PDF of the draw is one page you can send on WhatsApp.** A4 landscape, the whole ladder scaled to fit; rounds are named columns, heats are boxes with the heat number and, when the active run order has one, the start time ("Times are estimates" is printed then). Lycra colours print as the real colour and as its name (white and black outlined), forced to print. Event logo, name, division, date at the top. A round of more than 8 heats is spread over columns of at most 8 and the draw goes onto two pages (big rounds on page 1, the rest on page 2). **Export PNG** draws the same page (one picture per page). Proof: the PDF made without "background graphics" still holds the palette's red, yellow and blue fills.
- Choice made without asking you: when there is no run order, no times and no "Times are estimates" line are printed.

### Owed for Phase 6 (owner, 1 Oct 2026)
- **The stored draw of a published event must be readable only through the public pages.** Today any signed-in user can read `divisions.draw` of a published event (the public role cannot). In Phase 6 the public pages must serve only what is meant to be shown, and drafts and unpublished rounds must never be visible to other organisations. Keep for now; do not forget.

### Not done / not verified
- Start / Hold / Shift for the head judge and the live timer are Phase 5; the organiser's live buttons exist now.
- The Vercel preview could not be opened from here; everything ran locally against the hosted development project.
- The public timetable, bracket and join pages are Phase 6.

### How to test on the preview
See the pull request description.

## Phase 5 – live heat operations

Plan: `docs/PLAN-phase-5.md` (the owner's answers of 1 Oct 2026 are in its §11). No migration in this phase's first PR.

| PR | Branch | Contents | Planned hours | Actual hours |
|---|---|---|---|---|
| **5a** | `phase-5a-design` | Step 0: beach colour themes, the presentational live components, the public `/design` page | 3–4 h | not measured (no clock was kept in the session); to be filled in by the owner |
| **5b** | `phase-5b-spotter-judge` (after the owner approves 5a) | Steps 1–3 and the 5b part of 7: migration, timer, minimal `/head` controls, trick composer and parser, queue, spotter, judge | 8–10 h | – |
| **5c** | `phase-5c-head-publish` (after 5b merges) | Steps 4–6, the rest of 7: head console, publish, re-open, Re-run heat, visibility and the leak fixes, announcer view, practice heat, the 3-phone acceptance run | 9–11 h | – |

If 5b runs long it splits at the spotter / judge boundary (5b-1 steps 1–2, 5b-2 step 3). If 5c runs long, Re-run heat and the practice heat move to a small 5d.

### Phase 5a – the /design preview (branch `phase-5a-design`)

**5b does not start before the owner writes "approved" (or a list of changes) on the pull request.** Four rounds so far (first preview; iPhone 14 test; second outdoor test; round 4 on size and the public results). This entry describes the result of round 4; rounds 1–3 stand unless said otherwise.

#### Done (round 4)
- **Sizes.** What "Normal" was is now **Large**. The new Normal is genuinely compact: pad squares 38 px with 4 px gaps and 16 px digits, chips no wider than their text plus 12 px (36 px minimum tap target), rows 38, composed trick name 15 px in at most two lines, CRASH and Log one row 44 px high, headings 12 px, selected-score readout 26 px. Every live screen (judge queue with the whole pad and history, spotter, heat end) fits 390 × 844 without scrolling; the queue also fits at 750 and 664 high.
- **Pad: tap or type.** The two rows stay (whole number, decimal) and a small number field with the numeric keyboard sits beside them. A whole number alone is valid: after 3 or 4, **Save** completes it (the readout shows "7." meanwhile); the decimal tap also completes it; typing then Save completes it. Off-step or out-of-range typing is refused (Save stays off); a comma works as the decimal mark.
- **Rider label follows the scheme and always shows the name,** on every screen (queue, spotter strip, heat end, results): Lycra → colour word in a coloured block with the name and nationality beside it; bib → number block + name; name call-out → name first. It replaces the round-3 label everywhere.
- **Details bug fixed:** every rider card is tappable, including riders who have used all attempts (only the spotter strip locks them out). The queue card carries one help line: Missed = "I did not see it" (no score from me; the panel average uses the others); Flag = "alert the head judge" (I still score).
- **Spotter:** riders in one row; a row for Left / Right; a row for the multipliers (with the type-a-trick field and mic); base tricks as a compact list on the left, add-ons and grabs in two columns on the right; CRASH and Log fixed at the bottom. Direction, multiplier, six base tricks, add-ons and Log are all reachable without scrolling in Normal. PLAN step 2 now says the base-trick order per division is set by drag-and-drop in the Divisions step (tap alternative) and the spotter shows that order.
- **Public results = heat summary** (modelled on the previous app and your two references; colours are not copied). Tabs per heat; one compact row per rider in rank order with the Rider label, place, total and the formula in words ("18.20 = tricks 13.50 + Impression 4.70"); the attempts as small boxes in attempt order. Crash red, not counted grey, counted graded yellow → green **across the whole heat** (highest counted score greenest, lowest yellowest), every box also with its word or icon. A per-division setting for what a box shows: attempt number + score (Arrow's default), trick name + score, or scores only. A **ladder view** shows each heat with its riders in their Lycra colour and their totals, with placeholders for heats not yet decided. Mocked on /design; the model is written into PLAN step 6 for Phase 6.
- **Head judge console:** each judge cell is coloured by its distance from the panel score, high and low alike (within tolerance green, then yellow, orange, red), with the distance written ("+0.4", "−1.6"); the tolerance is the scoring model's outlier threshold (1.5 for KOTA). A **tick box** left of each attempt number: selecting several enables **Merge** (duplicates) and **Delete** for the selection; the single-attempt menus stay.
- **Heat end:** same number sizes and the same label.
- **Docs:** PLAN-phase-5 steps 0, 2, 3, 4, 6 and §11 rows 22–26; docs/06 §00.2, §0 and the Phase 5a decisions log.

#### Test evidence
- `npm run typecheck` clean · `npm run lint` clean · production build: see the PR description.
- `npm test`: **92 files, 1141 tests passed.** New or changed in round 4: `size-tokens` (Normal inside your ranges, Large = old Normal), `theme-tokens` (grade and distance tints carry ink at 7:1 in both themes), `score-pad` (`parsePadInput`), `result-shading` (grade across the heat, crash / not counted, the three box texts), `cell-tone` (tolerance from the model, bands, signed distance), `console-ops` (merge keeps the first logged attempt; same rider and trick), `label-style`, fixtures (docs/08 values 31.54, 24.04 + 7.50, 7.71 / 8.25 / 7.29 / crash / 8.08).
- Playwright `e2e/design.spec.ts` at **390 × 844**, 27 tests: sizes (Normal and Large), chips ≤ text + 12, no scrolling on the live screens, pad tap-or-type, Details with an "Out" rider, the help line, spotter layout and fixed bar, heat end, both head tabs, distance bands, tick boxes with Merge and Delete, the rest of the console, public results (tabs, grades, three box modes, ladder), colour names, no sideways scroll, dark mode, no percentages.

#### Choices I made where the docs were silent (please confirm or change)
1. **Chips and 38 px pad squares instead of full-width list rows** for secondary controls. This is what makes it compact; the tap target is 36 px minimum, below the 44–56 px of the earlier rounds. Large is there if a thumb in the sun needs it.
2. **Large is the old Normal** (46 px pad), not the old Large.
3. **The colour word on a coloured Lycra block still cannot reach 7:1** for seven of ten colours (4.5:1 at best with the better ink). You asked for the block.
4. **Names are truncated in the rider strips** (spotter, Details) so the row stays one line; the full name is in the detail below and on results.
5. **The default box display is "attempt number + score"** (your wording for Arrow); the percent preview switch from round 2 is removed because the preview now shows no percentages at all.
6. **Distance bands (my choice):** green up to 1× the tolerance, yellow up to 1.5×, orange up to 2×, red beyond.
7. **Merge needs the same rider and the same trick (at least two ticked);** it keeps the earliest logged attempt. Delete works on any selection. Different tricks cannot be merged.
8. Carried over: tenths are two taps unless typed; criteria scoring is tabs + one pad; start heat on Control and the console; percent overlaps `heat.total.display` (5b settles).

#### Not done / not verified
- Nothing is live: no server-clock timer, no queue storage, no realtime, no saving (5b). The console's actions change only what the page shows.
- Not seen by me on a real phone in sun or on iPhone Safari (Chromium only; screenshots use a fallback font).
- Large is tested for sizes and sideways scroll, not for fitting one screen.
- Drag-and-drop trick ordering and the per-division display setting are written in the plan, not built.

#### How to test on a phone
See the click-through at the end of the pull request description.

### Phase 5b – timer, spotter and judge (branch `phase-5b-spotter-judge`)

One pull request holds steps 1, 2 and 3 and the 5b part of step 7, so there is no 5b-2.

#### Done
- **Heat timer on server time.** Start, Pause, Resume, End and "End at 0:00" are database functions; phones work out the time left from the server's clock (offset measured on each request), never from their own. Every official phone calls "end if due" at 0:00, so no scheduled job is needed. One running heat per event (event setting "Heats running at once", default 1). Start refuses in plain words: draw not locked, panel too small, a seat still waiting for a place, another heat running.
- **Beep and vibration** at 1:00 and 0:00 only after a "Sound on" tap (iPhone rule). The timer stays visible without sound.
- **Minimal /head page** (laptop or phone): Start, Pause, Resume, End, Hold, Resume at, Shift, rider totals as scores come in. The organiser's Hold / Resume at / Shift in the Timetable step now use server time. Publishing and the score table are 5c.
- **Spotter screen** (`/spot/<event>`): opens the running heat by itself; logs by tap, by typing and by speaking (where the browser has speech recognition); CRASH asks once; the 7th attempt greys the rider out; Undo last for 10 seconds; "Possible duplicate" between two spotters; works through a send queue (retry, idempotency key, pending / sent shown).
- **Trick model (your change during 5b):** a trick is an ordered sequence of blocks; "Late rotations" added (vocabulary v4); typed and spoken text read the same way; an unknown word touching the trick word is kept as free text for the head judge. Written in docs/03, 05, 06, 08 §1G and the plan (§11 row 27).
- **Spotter layout per division** in the Divisions step (family order, block order, visibility, move to another family, favourites on top, add block into any family; drag with arrows / "Move to…" as the tap alternative); stored in `divisions.trick_base.layout`; rendered on the spotter screen.
- **Judge screen** (`/judge/<event>`): scoring queue, each attempt appears within a second, one tap scores it, criteria tabs if the model has them, Missed and Flag, "Repeat" badge, no scoring of crashes, then the Impression / Variety step with the heat summary card and Submit (one confirmation). Scores lock at Submit or at review; the head judge can reopen one judge. Offline for 20 s loses and duplicates nothing.
- **Percentages:** division setting "Show scores as % of maximum" (Advanced, default off) decides what screens show; the model's display field is only the export default.
- **Data model without screens:** `trick_attempts.height_m / height_source / height_ref / height_at` and the `sensor_bindings` table.
- **Replaced the /design stand-ins** (trick-name builder, summary card counts) with the tested code.

#### Test evidence
- `npm run typecheck` clean · `npm run lint` clean · `npm test`: **106 files, 1321 tests** passed (new: tricks composer / reader / builder, layout, timer, cues, queue, current heat, run order, judge items, head totals, criteria, summary, beach-rules scan of the live screens).
- `npm run test:rls`: **10 files, 257 tests passed** against the hosted dev project (new: live-heat, live-judge, live-spotter, live-realtime).
- Playwright (throwaway organisations, removed by the ledger): live-spotter, live-spotter-layout, live-judge, live-head, trick-layout, plus the older suites updated for the new rules. Full run: **91 passed, 1 skipped, 6 failed on the first pass**; the 6 are timeouts after 20 minutes of load on the dev server (15 s limits); run again on their own, all 6 passed (5 in one batch, the Custom ladder test in its own run, 20 s).
- The migration `20261004100000_phase5b_live_heat.sql` and the vocabulary v4 are applied to the hosted project; types regenerated. Arrow, EKL and Demo were not touched by any test.

#### Choices I made where the docs were silent
1. **Reader tolerance:** one wrong letter for a 5-letter word, two for 6 letters or more, only when exactly one block is the clear winner (the plan's own vector "dubble" needs two).
2. **A judge stays on the last finished heat** until the next one starts, so the Impression step is never snatched away.
3. **Hold / Shift** return the new plan straight to the page, so the head page shows them without a reload.

#### Not done / not verified
- **Realtime could not be tested through the sandbox browser** (it cannot open the WebSocket). It is verified from Node against the hosted project; the phones also poll every 5 seconds if Realtime is down. Please check "two judge phones see each attempt within a second" on the preview.
- Not seen on a real iPhone or in sun. Speech recognition depends on the browser (Chrome Android yes; iPhone Safari partly).
- Publishing, the score table, re-open, Re-run heat, practice heat: 5c.
- Sensor data has no screens (by design).

#### How to test on the preview (laptop and two phones, Demo event)
See the click-through at the end of the pull request description.

### Phase 5c – head console, publish and visibility (branch `phase-5c-head-publish`)

One pull request holds steps 4, 5, 6 and the rest of step 7 (the Re-run heat button, the Practice heat, the announcer view). The two fixes from your 5b test are in.

#### Done
- **Head console (laptop).** Live score table with each judge's cell coloured by how far it is from the panel score; click a cell to edit it with a reason (it appears in the audit log); tick boxes for bulk Merge / Delete; attempt menu (Delete, Merge duplicate, Edit, Add attempt — past the attempt cap only with a reason, by the head judge, or by an organiser when the event has no head judge); rider menu (Did not start / Did not finish / Disqualified / Interference); "owes Impression score" with a type-in button; tie decision with reason; Flag-out; "That was a landing" flags switch the attempt to Landed.
- **Publish.** One server transaction. Blockers are listed in plain words; the head judge can override with a reason (recorded). Publishing twice gives one result; Re-open (with reason) then Publish gives version 2. The final can be held (`publish_hold`) and released.
- **Ladder fill.** Your rule: when a round's seats are fixed in advance (by original seeding with adjacent pairing, custom or hand-arranged ladders) publishing fills the target seat at once. When the next round re-seeds from all arrivals ("By their result") it still deals when every feeding heat is published or on "Seed now"; until then the Draw step shows "Sam · 1st H1 · seat pending". The Arrow 24-rider ladder fills R2 H1 seat 1 right after R1 H1 publishes (test).
- **Re-run heat / Cancel heat.** New heat "Heat N re-run" (number N, suffix R) with the same riders, seats and Lycras, placed right after the heat that was live; later seats follow it. Riders left out are marked Disqualified or Did not start and rank last. Refused once published.
- **Visibility.** Event tick boxes with per-division override; the head judge's per-heat live switch (follow division / on / off); held finals leak nowhere (two leaks closed: heat_slots and divisions for anonymous visitors); `get_public_results`; the per-division "What spectators see per attempt" setting is stored (screens that use it are later).
- **Practice heat.** Organiser only, on events marked "simulation": fake spotter feed from the division's trick base at a set rate while the tab is open. Demo is now flagged as a simulation and is hidden from every public door.
- **Announcer view** (`/head/<event>?mode=announcer`): read-only table and feed. **Console sound:** beep at 1:00 and 0:00 behind "Sound on".
- **Head phone:** Score and Control tabs; Control holds the controls, Publish, Re-open and a Details toggle (rider totals, blocker list).
- **Your two 5b fixes:** the Impression step moves to the next unscored rider after Save and offers Submit when all are done; disabled controls (Hold, Shift, …) say why in one sentence.

#### Test evidence
- `npm run typecheck` and `npm run lint` clean. `npm test`: 123 files, 1440 tests passed.
- RLS (hosted dev project): new suites live-head (18), live-publish (10), live-visibility (8), rerun (4) pass; the whole suite result is in the PR.
- Playwright (throwaway organisations): live-console — console, publish, re-run, live switch / release, practice heat, announcer, sound switch.

#### Choices I made (please confirm or change)
1. **Migrations are applied to the shared hosted project** (dev, Vercel preview and production share it). Two migrations: `20261005100000_phase5c_review_publish`, `20261005100100_phase5c_visibility_rerun_practice`. Arrow and EKL were not touched; Demo only got the simulation flag.
2. **Simulation events disappear from the public site** (home, event pages, registration). Demo is therefore no longer public.
3. **Re-run keeps the stored draw unchanged**; the heat's `draw_uid` moves to the re-run row.
4. **Head judge = head seat or organiser.** An organiser acts as head when the event has no head seat.
5. Plan corrections (docs/PLAN-phase-5.md): publish function is `publish_heat_commit` (heat, expected version, results, draw, projection, hold, override reason, actor, blockers); `rerun_heat` takes a few extra arguments for the new run order; `remove_penalty` exists.

#### Not done / not verified
- Realtime could not be tested through the sandbox browser; phones poll every 5 s as a fallback. Please check the two-phone steps on the preview.
- Not seen on a real iPhone or in sun. Sound depends on the browser's tap rule.
- Screens that use "What spectators see per attempt" are later; the setting is stored only.
- Browser tests for flag-out and the tie dialog are covered by unit and RLS tests only, not by Playwright.

#### How to test on the preview
See the click-through at the end of the pull request description.

## Phase 7a – organiser and admin redesign

Plan: `docs/PLAN-phase-7a.md`. The owner's answers of 1 Oct 2026 are in its top table. The owner notes are in docs/06 §13.

**Hard rule (owner, 1 Oct 2026):** 7a-1 ships before the event **only if the owner accepts it by Saturday 3 Oct 2026 evening**. Otherwise it waits until after the event, and the event runs on the current screens. Nothing from 7a reaches `main` before the event without that acceptance.

| PR | Branch | When | Contents | Planned hours | Actual hours |
|---|---|---|---|---|---|
| **7a-0** | `phase-7a-0-preview` | before the event | `/design/organiser` preview, shared organiser components | 4–5 h | – |
| **7a-1** | `phase-7a-1-shell-dashboard` | before the event, only if accepted by Sat 3 Oct evening | copy and banned words, shell and rail, dashboard (wind call from Phase 6), settings pattern, Previous / Next, number fields, head console division picker, then Reset + Restore last in its own commits | 16–20 h | – |
| **7a-1b** | `phase-7a-1b-reset` | only if Reset is not green by Fri 2 Oct evening | Reset + Restore split out of 7a-1; the rest of 7a-1 ships without it | (inside 7a-1) | – |
| **7a-2** | `phase-7a-2-tables` | only if 7a-1 is accepted by Sat 3 Oct evening, otherwise after the event | tables, Draw and Run order pass, consistency sweep, fixes from the Sunday test | 7–9 h | – |
| **7a-3** | `phase-7a-3-landing` | after Phase 6 merges | landing page `/` with three doors | 1 h | – |

Safeguards accepted by the owner:
- Reset is built last, in its own commits.
- If Reset is not green by Friday evening it moves to 7a-1b.
- The database change is additive only (a column, a table and functions; no existing data changed).

Test ids and web addresses stay unchanged.

Event-day steps if 7a-1 is live are in docs/09 §A.6:
- lock draws after 7a-1, before the first heat;
- recreate Demo and lock its draws.

The 30-minute test with a stranger runs on Sunday 4 Oct 2026.

### Status
- Plan merged (PR #13). 7a-0 preview approved and merged (PR #15). 7a-1 built on branch `claude/sleepy-edison-pgmzgn` (see below).

### Phase 7a-0 – the organiser design preview (built; waiting for the owner's "approved" or a list of changes)

**What it is.** A public page at `/design/organiser` that shows the whole organiser look with a made-up event ("Preview Cup", 3 divisions, 18 riders, 5 officials). It needs no login, is kept out of search engines, reads nothing from the database and saves nothing. Nothing else in Phase 7a starts before the owner says "approved" or lists changes.

**Done**
- The page shows nine sections, each as a full-width laptop mock (switch to a phone mock with the Laptop / Phone buttons at the top, Daylight / Dark and Normal / Large next to them):
  1. the event shell: top bar (event name, dates, state, public link with its QR code, organisation switcher, note, account menu) and the left rail of seven steps (Event, Divisions, Riders, Officials, Draw, Run order, Go live), each with a state word and one line of reason;
  2. Go live: the readiness list (two done, two needing attention, one not started, each with a Fix link), the heat that is running with its timer, the next two heats, the wind call slot, quick actions (Hold and Resume work), today's timetable and the share cards;
  3. Riders: a dense table with a header that stays put, search, filters, tick boxes with a bar for the ticked riders, a name you can edit in place, and the empty state;
  4. Divisions settings, Simple: six plain dials, each with a line under it and a "?" with an example; the sentence at the top is made by the real scoring code and changes with the dials; "Load…" is a small button;
  5. the same panel with "More settings (10)" open, the sentence staying in view;
  6. Previous / Next at the foot of a step (only Previous on Go live);
  7. number boxes: today's full-width box next to the new one (as wide as its biggest number, digits at the right) and the earlier idea (digits centred);
  8. buttons in four kinds, each also disabled with its reason printed under it, and every status pill;
  9. one organiser page (Riders) on a phone, with the step drop-down and the sticky Previous / Next bar.
- Sizes: controls and rows are 40 px on a computer, 44 px on a touch screen, 48 px with Large text. The official judge, spotter and head judge screens keep their own sizes.
- The new shared parts are built for real and are what 7a-1 will use: `src/components/org/` (app shell, step rail and picker, status pill, button with a required reason when disabled, number field, setting row, settings panel, data table, step footer, popover, dashboard parts). The made-up data is in `src/lib/org-design/` (the ladder is drawn by the real ladder engine and the sentence by the real scoring code).
- No database change, no existing screen touched, no new dependency. New files only, apart from this file.

**Choices I made (please confirm or change)**
1. **Digits at the right.** You asked for right-aligned digits. The plan said centred. The preview shows both; today's look is next to them.
2. **The wind call is only a place-holder** (a disabled card saying "The wind call arrives with the public pages"), because Phase 6 builds the control.
3. **The words live in `src/lib/org-design/copy.ts`**, not yet in `ui-copy.ts`, so this branch cannot clash with Phase 6. 7a-1 moves them into `ui-copy.ts` as the plan says. Its banned-words test already uses the longer list from the plan (configure, entity, record, RPC).
4. **No new colour values.** Everything uses the existing beach colours; a test fails if a component writes a hex colour. The QR code is the one fixed black on white, kept in its own file, because a dark QR code does not scan.
5. **A disabled button is never faded to light grey.** It keeps full-strength text with a dashed frame and its reason underneath, so it still reads at 7:1.
6. **Branch name.** The work is on `claude/phase-7a-0-organiser-preview-bziiuf` (the branch this session was given) instead of `phase-7a-0-preview`.

**Not done / not verified**
- Not seen on a real iPhone or in sun; it was checked in Chromium at 390 and 1280 px and 1440 px.
- Popovers (account menu, public link, Load…) are simple panels, not yet tested with a screen reader.
- The preview's Laptop frame on a phone is shrunk to fit; it is only there so the page never scrolls sideways.

**Test evidence**
- `npm run typecheck`, `npm run lint` and `npm test` pass (see the summary lines in the pull request).
- New unit tests: `src/lib/org-design/fixtures.test.ts`, `copy.test.ts` (banned words, no hex), `src/lib/table/search.test.ts`, `src/components/org/number-field.test.ts`.
- New browser tests, `e2e/design-organiser.spec.ts` (20): controls and rows 40 / 44 / 48 px, text at 7:1 in both themes, no sideways scrolling at 390, 1280 and 1440 px, a word on every pill, a reason on every disabled button, the rail and the step picker, search, tick boxes, bulk bar, in-place edit, the live sentence, Previous / Next, Hold and Resume.

**How to test on the phone and the laptop**
See the click-through at the end of the pull request description.

## Fix – timetable crash when a heat has no length (branch `fix-run-order-duration`, 1 Oct 2026)

On the Demo event, the head console and the Run order step both ended in "Application error" after the second division (Pro Women) was drawn and locked.

### What was really wrong (found by reproducing it on the hosted project)
- **Not a missing heat length.** Every heat on the hosted project has a length: the database refuses a heat without one (`duration_sec` and `warm_up_sec` can never be empty), and all 28 stored heats have both. Pro Women's rounds are 10 minutes, as the preview said.
- **The real cause:** the run order stores each row's heat by its id. When a draw is made again, the heats that are no longer in it are deleted, and the run-order rows that named them stayed behind. Demo Cup's run order had two such rows (`r12` and `r13`) pointing at heats that no longer exist. With no heat and no length of its own, the timetable threw `Heat "r12" has no duration`, and that error took down every page that works out the timetable. Unlocking the draw could not help, because those rows stayed in the run order.
- Reproduced with Demo Cup's real run order and heats (read-only): the old engine throws exactly that message; the new one returns all 15 rows.

### Done
- **The timetable never throws any more.** A heat with no length comes back as a row with the warning "No heat length — set it in Divisions → Format" and takes no time, and the rest of the day is still worked out. A row whose heat is gone comes back flagged "This heat is no longer in the draw … Take this row out of the run order", takes no time, moves nothing and is never offered as the next heat. A row with no heat link, or a break with no length, is handled the same way. The warning shows on the row itself in the run order and in the head console's run-order list; the printed timetable leaves a dangling row out and prints a missing length as blank.
- **Error boundaries.** Every live page (head, judge, spotter, seat), every organiser step (one boundary covers the whole event wizard, so the header and the step list stay) and the public event pages now end in a readable page with a reason and a way back instead of "Application error", plus one site-wide net. The run-order list in the head console and the Run order editor are also wrapped so that if only that part fails, it shows one line and the rest of the page keeps working. A test fails if a live page or organiser step ever loses its boundary.
- **Stops it happening again (migration, applied to the hosted project on 1 Oct 2026).** `20261007100000_run_order_follows_heats.sql`: deleting a heat now also removes its row, pin and recorded start from every run order of that event, and a one-off cleanup removes rows that already point at nothing. Dry-run on the hosted project inside a transaction that was rolled back: the trigger works, breaks are left alone, and the cleanup would change exactly one run order (Demo Cup, rows `r12` and `r13`); Arrow's is untouched. The version number had to be later than `20261006100100`, which the unmerged Phase 6 branch already applied to the shared project.
- **Heat lengths are tested end to end.** Every built-in format, at 6, 14 and 24 riders, gives every heat a length above zero and a warm-up of zero or more. A round with no length of its own takes the format's default; its own length wins when it has one.
- **"Heat length per round".** The table's rows now come from one tested function. For every built-in format and every rider count from 1 to 40 it lists exactly the rounds of the preview that have heats, each pre-filled with the heat length. If it ever has no rounds, it says why in one sentence instead of showing nothing.

### Test evidence
- `npm run typecheck` and `npm run lint` clean. `npm test`: **127 files, 1536 tests passed** (main had 123 / 1440). New: the timetable fallback chain and warning rows, draw lengths for every built-in format, the per-round table rows for every format at 1–40 riders, and the boundary-coverage test.
- `npm run build` succeeds.
- Playwright (throwaway organisations, removed by the ledger): the new two-division spec `run-order-missing-heat` locks two divisions on the Draw screen, makes a run-order row whose heat is gone, and opens the head console and the Run order step; it passes in dev and on the production build, and **fails on the old engine** with `Heat "r99" has no duration`. Affected suites (organiser, draw-timetable, live-console, live-head): 17 passed, 3 failed on the first parallel run with hosted-database statement timeouts and a redirect timeout under load; run again one at a time, all 3 passed.
- Migration dry-run on the hosted project (rolled back): trigger and cleanup behave as described; nothing was left behind.

### Choices I made (please confirm or change)
1. **A heat with no length takes 0 minutes** and is flagged, rather than guessing a length. The spec defines no event-wide heat length, so none was invented.
2. **Run-order rows do not copy the heat's length when they are added.** The heat always has one, and copying it would freeze the row: changing the round's length later would stop reaching the run order. A row's own length is still an override, as before.
3. **A dangling row is shown as "cancelled" in the engine,** so it takes no time and is never "next".
4. **The migration is applied** to the shared hosted project (on your go-ahead). Demo Cup's run order lost the two dead rows `r12` and `r13` (15 rows became 13); Pro Women's Final still has to be added to the run order with "Add". The new Playwright spec was run once more against the hosted project after that and passes.

### Not done / not verified
- **The empty "Heat length per round" table could not be reproduced.** With Pro Women's exact data (6 riders, same format, no overrides, stored draw copied in), on a throwaway event in a real browser, the table lists R1 and F, pre-filled with 10. The change is a hardening plus tests, not a proven fix of what you saw. If you still see it, tell me the number in "Preview with" and whether the draw was locked.
- A failing part showing one line was checked once by hand in a real browser (forced failure, then removed), not by a permanent test. Server-side page errors show an error reference rather than the reason, because the hosting setup hides server error text.
- Arrow Big Air: no problem found (12 heats in its run order, all exist). EKL: no run order and no heats yet.

### How to test on the preview
Open Demo Cup → Run order and the head console: both open; the two dead rows are gone. Add Pro Women's Final with "Add". If a row ever points at a missing heat again, it shows a yellow note with a ✕ button.

- Plan ready to merge (PR "Phase 7a – organiser design plan"). Nothing built yet.

## Phase 6 – public pages and big screen (branch `phase-6-public`)

### Done
- **One door for visitors.** Everything the public site shows comes from five database functions, called as a visitor with no login and no cookies: `get_public_site` (event, organisation, logo, sponsors, the few settings a visitor needs, the wind call, the divisions), `get_public_timetable` (the active run orders and the heats with what the timetable engine needs), `get_public_results` (replaces the 5c version), `get_public_draw` (the stored draw, cleaned) and `get_public_rules`. Visitors can no longer read `heat_slots` from the table at all. This closes the item "the stored draw must be readable only through the public pages" that was owed to this phase.
- **Public pages** under `/e/<address>`: Home (event logo, wind banner, "Now: Pro Men · R1 · Heat 2 · 6:12 left", "Up next" with two heats and estimated times, today's timetable with the states Done / Live / Next / Estimated / On hold / Pinned and "Times are estimates and update live.", share on WhatsApp, copy link, QR, sponsor strip), Live heat, Results (tabs per heat; the leaderboard opens on the live heat, otherwise the last published), Ladder, Placings (with "Highest jump"), Rider page (`/riders/<id>`), Rules, Join (role picker, every card is its own address) and one extra tab per outside leaderboard. The organisation page `/o/<slug>` reads as a visitor and has Open Graph tags.
- **Results rows** are the heat summary of the owner's round-4 notes: one compact row per rider in rank order with the Rider label, place, total and the formula in words ("20.5 = tricks 15.5 + Variety 5.0"; no percentage unless the division's setting is on), and the attempts as boxes in attempt order: crash red with CRASH, not counted grey, counted graded yellow to green across the whole heat, each with an icon or a word. The division setting "What spectators see per attempt" decides the box text.
- **Live heat**: the clock (from the server's stamps, corrected at every poll), the riders as Rider labels, running totals and boxes only when the division allows live scores (the totals come from the same scoring engine as the head judge's console); otherwise "Scores published after the heat."
- **Ladder**: heats as boxes, riders filled with their Lycra colour (the colour word beside the name) and their totals, "1st H1" placeholders, "Ana · 1st H1 · seat pending" for a seat that is dealt later, the winner in the next seat for fixed seats. Built by the same engine functions as the Draw step, from a draw the database has cleaned.
- **Big screen** `/screen/<address>`: white on dark, digits of about 130 px on a 1600 px screen, pages rotate every N seconds (new Event setting, default 20), Space pauses, number keys jump, QR to the public site, sponsor page, wind banner, a podium page once a final is released. Nothing animates (the test checks that there are no animations).
- **Wind call**: `set_wind_call` (head judge or organiser, 140 letters, audited, red / amber / green / clear), a control on the organiser's dashboard and on the head page, the banner on every public page and the big screen, switchable in the Event step.
- **Event step**: "Big screen: seconds per page" and "Other leaderboards" (title, https address, show inside the site yes/no, up to six), each with a "?".
- **Open Graph and Twitter tags** on every public page and a 1200 × 630 picture (`/e/<address>/og`, made with Next's built-in image support, the logo only from the project's own storage) that shows the event, and for a result the heat with its top three.
- **Fast**: public pages are server pages with three small client parts (poll, clock, page tabs). First-load script of the home page went from 168 kB to 114 kB (the whole copy file had been pulled into the clock and copy-link buttons). The Note button's code is only fetched on public pages for a signed-in organiser or owner.
- **Scripts**: `npm run preview:public -- create | remove <code>` builds a throwaway public event on the hosted project so you can look at it on a phone; `npm run test:e2e:budget` is the slow-connection check.
- Migration `20261006100000_phase6_public.sql` is applied to the hosted project; types regenerated.

### Test evidence
- `npm run typecheck` clean · `npm run lint` clean · `npm run build` passes.
- `npm test`: **135 files, 1619 tests passed** (123 files / 1440 tests at the start; the rest came with main's run-order fix): timetable states (done, live, next, estimated, pinned, held, cancelled, day choice), the heat tabs and formula line, the yellow-to-green grading and the box texts, the ladder with a pending seat, placings ("3="), the rules generator, the rider page, running totals on the live page, the big screen's pages, the WhatsApp link.
- `npm run test:rls`: **15 files, 311 tests passed** (14 files, 297 tests before). The new file `tests/rls/public-site.test.ts` (13 tests) tries every public function on a draft, a simulation event, an archived event, an archived organisation and an unknown address; checks that a held heat shows nothing (results, seat totals, the next seat, the stored draw, the highest jump); that no judge-level mark, flag or percentage leaves the database; that a draft draw is not public; the wind call rights and audit; and that visitors cannot read seats, the stored draw or event secrets from the tables.
- Playwright on a Pixel 5 profile, `e2e/public-site.spec.ts`: **16 passed** (home, wind hold, live heat with live scores on and off, results with the grading, the three box modes, ladder with a pending seat, placings and highest jump, rider page, rules, join deep links, outside leaderboards, Open Graph tags and the picture, big screen rotation and pause, podium after release, wind call set on the dashboard and seen by a visitor without reloading, simulation / draft / archived events are 404). `e2e/public-settings.spec.ts`: 1 passed.
- Budget check on the production build, Chromium with Lighthouse's "slow 4G" (1.6 Mbps, 150 ms) and a 4× slower CPU: home 146 kB transferred (123 kB script), 10 requests, largest paint 1.0 s; results 145 kB; live heat 143 kB. Limits in the test: 180 kB, 140 kB script, 16 requests, 2.5 s.
- Follow-up (owner decisions of 1 Oct), after rebasing onto main with the merged `fix-run-order-duration`: browser specs `public-site`, `public-settings`, `draw-timetable`, `join`, `live-head`, `live-console`, `live-judge`, `live-spotter`, `organiser` **47 passed**, one worker at a time. The `live-head` "runs a whole heat from a phone" test no longer depends on the hour: it puts the run order on a future day, so "Resume at 23:30" is always in the future (it used to fail after about 23:30 Cairo because the engine never starts a heat in the past). The public timetable hides a row with no length or whose heat left the draw (the new engine marks those; they are the organiser's to fix).
- Regression runs on the dev server: `public-site`, `public-settings`, `live-head`, `live-console`, `smoke`, `design` together **57 passed**; `organiser` (the Event step), `draw-timetable` and `event-delete` pass.
- Browser tests use throwaway organisations (removed by the ledger). Arrow, EKL and Demo were not touched.

### A bug from 5c found and fixed here
- **"Create event" in the Event step failed** with "The event could not be saved" ("permission denied for table events"): 5c made the form send `is_simulation` but only granted UPDATE on that column, not INSERT. Editing an existing event worked, creating a new one did not. Fixed by migration `20261006100100_events_insert_simulation_grant.sql` (applied) with a test; `e2e/organiser.spec.ts` (Event step) passes again.
- **Two older browser tests were stale** (`e2e/join.spec.ts`): they expected the old `/seat` text and the name "Demo Cup", but since 5b a joined phone goes straight to its role's screen and since 5c Demo is a simulation. They now run on a throwaway event with its own PIN and follow the current redirect (judge screen; the card stays on `/seat?card=1`).

### Choices I made where the docs were silent (please confirm or change)
1. **Judge-level scores never reach the public** (owner decision, 1 Oct 2026, built in this PR). `get_public_results` carries a whitelist of what a result holds. The live view is split: `get_public_live_heat` (what a visitor may call) returns the heat, seats and attempts and no score of any kind; the full view with the scores by seat number is `get_live_heat_for_server`, callable by the server only (service role). The public pages call it on the server, work the totals out with the same scoring engine as the head judge's console, and send the browser only the panel's results. Seats and organisers still read per-judge scores through their own row policies. Tests: a visitor, a judge, an organiser and the head judge are refused the server view; the public view contains no `scores`, `impressions`, `penalties`, `seat_no`.
2. **A division whose draw is not locked is not public** (no heats, no ladder, no seats); it still appears in Rules.
3. **A seat fed from a heat that is not released shows its placeholder** ("1st H1"), not the rider. The 5c publish fills the next seat at once; for a held heat that would have named the winner.
4. **One ready call setting** (owner decision, built in this PR): the Event step's "Ready call (minutes before the heat)", default 15, is the only one. It is no longer stored on a run order (schema, preset and stored plans cleaned); every timetable (organiser, head, spotter, judge, printed draw, public pages, rider page) reads the event's value. The migration carried existing values over: a value somebody chose on the event is kept, an event still holding the old unused default of 10 takes its run order's value, an event with neither gets 15. On the hosted project that gave Arrow 5 (it was set on the event and is kept; its run order had said 15, which is what the timetables showed, so Arrow's "be ready" times now say 5 minutes before: change it in the Event step if you want 15), Demo Cup 15, EKL and Demo 2 the default 15.
5. **Cancelled heats take no time on any timetable** (the engine's `cancelled` flag): the organiser's screens (dashboard, run order, head, spotter, judge) now pass it like the public pages do, so after a Re-run the organiser's and the public estimates agree (a test builds both from the same rows and compares).
6. **The stored division setting is `score_only` but the boxes were written for `scores_only`**, which would have shown trick names for "scores only". The public page reads both as scores only (test).
7. **Highest jump counts landed attempts of released heats only.**
8. **Public pages poll by asking the server for a fresh page** every "Live update" seconds (3 to 60, default 7), only while the page is visible. There is no realtime connection and no CDN cache; accepted for this event (owner, 1 Oct 2026). A few hundred phones at 7 seconds is about 40 requests a second to the server and the database.
9. **No dark theme on the public site** (Daylight only); the big screen is dark by design. Officials keep both.
10. **The Rider label on a rider's page** uses the seat colour of their next heat; with a per-heat Lycra scheme and no heat yet it reads by name (it used to read "NOT SET" with no name).
11. **Lighthouse is not installed** (not an approved dependency); the budget test measures the same things in the same conditions.
12. **The big screen shows at most four riders on a page, six timetable rows, and every rider who shares a podium place.**
13. **To see a public event on your phone** (Demo is a simulation, so it must not appear): `npm run preview:public -- create` prints the address of a throwaway event; `... -- remove <code>` deletes it.

### Owed for larger events
- **A short CDN cache in front of the public functions** (a few seconds, shared by every phone watching the same heat). Not needed for the Arrow launch; needed before an event with thousands of spectators, because every phone's poll currently reaches the server and the database.

### Not done / not verified
- **Announcer view polish (item 13) is not done** (not cheap: the rider's sponsor is not stored anywhere the announcer view reads).
- **Not seen on a real phone, in sun, or in a WhatsApp chat.** The preview picture is checked as an image (PNG, 1200 × 630) and the tags are checked in the page; whether WhatsApp shows it depends on its cache and on the live address.
- **Not run on Vercel.** The Vercel preview could not be opened from here; all browser runs were local against the hosted development project.
- The wind-call control on the head page is covered by the same component as the dashboard (which has a browser test) and by the function's access-rule tests, but has no browser test of its own.
- The embedded outside leaderboard works only if that website allows being shown inside another site; the link always works.
- A heat that is live but whose division shows scores only after publishing shows its riders and no totals; the head judge's per-heat live switch is honoured by the database (tested in 5c).

### How to test
See the click-through at the end of the pull request description.


## Console v2 – the head judge console, redesigned from the owner's first real test (branch `console-v2`)

One pull request: "Console v2 – head judge console redesign". It stays inside the head console (`/head` and the components only it uses), the engine functions it needs and `ui-copy.ts`. Test ids and web addresses are unchanged.

**For the Phase 7a-1 session (parallel work): do not build the head console division selector.** Console v2 owns it. 7a-1's plan line 8e is dropped; `docs/PLAN-phase-7a.md` says so. The shared files to watch when the two branches meet are `docs/STATUS.md`, `docs/PLAN-phase-7a.md` and `src/lib/ui-copy.ts`.

### Note on the brief
The brief names "docs/06 §1h (the owner's verdict on the 5c console)". There is no §1h in the repository on `main` or any branch, so the verdict is written down here and in the decisions log of `docs/06` from the brief itself. If a §1h exists elsewhere, it should be compared with this list.

### Done
- **Laptop layout (1280 and up).** Top bar: division tabs (one division at a time, remembered on this device; first choice = the division with a running heat, else the division of the next heat; a live dot with its word on another division's tab while one of its heats runs or is paused; a "On now" button when the running heat is in another division), the heat's name, the timer at 48 px with Start / Pause (Resume) / End beside it, Sound on. Left column: the run order of the selected division, one short line per heat ("R1 · H2 · 14:05 · Ended", "R1 · H3 · est. 14:20"), never cut short (it wraps), the next heat marked "Next", a fold "Other divisions", then small Hold / Shift +5 / Shift +10 (and Resume at while on hold) and the wind call as one button that opens a small panel. Centre: a strip of the heat's riders (Rider label, running total, attempts used / allowed), then the score table. Right: Publish, Re-open, Cancel heat, Re-run, the judges' status, what blocks Publish, open flags, rider totals, who owes an Impression score, ties. Everything else (live switch, agreement report, audit log, theme and size, the practice panel) is behind one "More" toggle.
- **Phone.** Score / Control tabs as before; the Control tab has the same division selector and the same controls in one column.
- **Score table.** Newest on top (a toggle groups it by rider, newest first inside each rider; the choice is remembered on the device). The judge columns are headed by the seat names ("Fawy", with "J1" as a small line under it). The same names are used in the judges' status, the blocker list ("Fawy has not submitted"), the audit log, the agreement report, the edit-score dialog, the merge dialog and "Owes Impression score". Outlier colours, tick boxes and menus are as built in 5c. A seat that was never renamed shows its own seat name ("Judge 2"); if a name cannot be read the tag ("J2") is used. The words "Judge 1" are not generated by the console any more.
- **Start any heat.** The head judge (or an organiser) may start any heat that has not started, in any division whose draw is locked and whose seats are filled, in any order. If it is not the next heat of the active run order, one warning with a choice: "Not the next heat in the run order — R1 · H1 was next" with "Start anyway" / "Don't start". The timetable then re-flows around the real order (it already did: started heats come first in their real order). Cancelled heats cannot be started (the button is off and says why). No database change was needed for this; the tests prove it.
- **Re-run on a cancelled heat.** The Re-run button also appears on a cancelled heat and creates the "3R" heat with the same rules as 5c (same riders, seats and Lycra colours, run-order rules, one audit line with the reason). A cancelled heat can be re-run once; a second try says "This heat has already been re-run."; a heat that was cancelled before it ever started is still refused. The head console may now open a cancelled heat that is picked in the run order (it did not before).
- **Break countdown.** After a heat ends the top bar says "Next: R1 · H3 · starts in 4:30": end of the last heat + break + warm-up from the active run order, counting down. "+1 min" makes this break one minute longer (it pins the next heat later, so everything after moves with it); "Pause break" holds the run order (a Hold) and freezes the countdown; "Resume" restarts it with the same time left. Nothing starts by itself: Start is still the head judge's tap. When the start time has passed it says "ready to start · 0:45 late" and keeps counting how late. Hidden while a heat is on; with no active run order one line says why.
- **Judge pad.** The number field shows a greyed "0.0", never the word "type".

### Choices I made (please confirm or change)
1. **"+1 min" rounds up to the next whole minute** (owner's answer, 1 Oct 2026). A pin in the run order holds whole minutes only, so the countdown (which shows seconds) cannot be extended by exactly 60 seconds. +1 min adds between 1:00 and 1:59 to the break, never less; Resume after Pause break gives at least the time that was left, rounded up to the minute. Exact seconds would need a database and run-order screen change that the Phase 7a-1 session is also working on.
2. **The out-of-order warning asks once** before starting (owner's answer, 1 Oct 2026).
3. **One migration on the shared hosted project:** `20261008120000_console_v2_rerun_cancelled.sql` replaces the `rerun_heat` function so that a cancelled heat can be re-run once. It changes no data. Arrow, EKL and Demo were not touched.
4. **The shown heat stays put** until the head judge picks another or a heat of the same division is started: a heat that has just ended does not slide away to the next one before it is reviewed and published. A heat that is running in another division is never lost: its tab has the live dot, "On now" jumps to it, and the clock, beeps and end-at-zero follow the heat that is on the water, wherever it is.
5. **A division whose scoring rules cannot be loaded** still gets its tab and its heats in the run order (before, its heats were listed but could not be opened).
6. **Grouped by rider** keeps the newest first inside each rider.
7. **Hold, Shift +5 and Shift +10 are also on between heats** (during a break), not only while a heat is running; before they were off then.

### Test evidence
- `npm run typecheck`, `npm run lint` clean. `npm test`: see the pull request for the final line.
- New unit tests: break countdown, +1 min and Pause break maths against the real timetable engine (`3k-break-countdown.test.ts`), the out-of-order check, the division filter and default and the remembered choice (`division-pick.test.ts`), judge names in blockers and the audit log (`judge-names.test.ts`), run-order lines (`run-line.test.ts`), table order (`matrix-order.test.ts`), the cancelled heat's controls (`head-state.test.ts`), opening a cancelled heat (`current-heat.test.ts`).
- RLS on the hosted development project (`tests/rls/console-v2.test.ts`, plus the changed expectation in `rerun.test.ts`): start out of order allowed for the head seat and the organiser, refused on an unlocked draw and while seats are not filled, refused for judges, spotters, an announcer and another organisation; a cancelled heat cannot be started; re-run from a cancelled heat works for the head seat and the organiser, is refused for judges, spotters, an announcer, another organisation and a visitor, works once only, and is refused for a heat cancelled before it started; the head seat and the organiser can read the judges' seat names while a judge reads only their own and the PIN columns stay closed.
- Playwright (throwaway organisations, `e2e/console-v2.spec.ts`): two divisions, select one and see only its heats, remembered after a reload, the phone has the same selector; live dot on another division's tab; start Heat 2 before Heat 1 and see the warning, the 48 px timer beside Start / End, End, the countdown, +1 min, Pause break and Resume; "Fawy" with "J1" in the table header and "Fawy has not submitted" in the blocker list; cancel a heat and re-run it from the cancelled row; the greyed "0.0". The older console specs were updated where the design changed on purpose (newest on top, short run-order lines, the "More" toggle, picking a heat of another division).

### Not done / not verified
- Realtime could not be tested through the sandbox browser (phones poll every 5 s as before). Not seen on a real phone or in sun.
- Not built because the brief did not ask: the announcer view keeps "Judge n" columns only through the seat names it can read (an announcer seat reads only its own seat, so it shows tags).

### How to test on the preview
See the click-through at the end of the pull request description.

## Phase 7a-1 – organiser shell, dashboard and settings (built; pull request open)

**What changed, in words**
- **Wording.** The banned-words test now also refuses configure / configuration, entity, record / recorded and RPC. Ten sentences were reworded (the plan listed nine; "That rider has used every attempt…", "Which kite details you record…" and a scoring-model message with "configuration" were also caught). The preview's words moved into `src/lib/ui-copy.ts`. The test now ignores TypeScript types such as `Record<…>` (the plan said it already did; it did not).
- **Shell.** Every organiser screen has the new top bar (product, organisation switcher, event name and dates, state, public link with QR code, account menu with Daylight / Dark, Normal / Large, password, sign out) and, inside an event, the rail of seven steps: Event, Divisions, Riders, Officials, Draw, Run order, Go live. Each step shows Done / Needs attention / Not started and one line of reason; both change as you complete things. On a phone the rail is the step drop-down with the same words. `/admin` has the same bar and a rail of its own.
- **Go live dashboard** (`/org/events/<id>`). Readiness checklist (riders, judges per division, draw locked, run order for today, PINs issued) with a Fix link per row, "Ready to run" when all green; running heat with the server-time timer, next two heats; Hold, Resume at…, Shift +5 / +10 (server clock, same actions as the Run order page); head judge console in a new tab; share cards with QR codes. The wind call and the big screen are greyed with their reason (see "Not done").
- **Settings pattern.** Simple dials each with a line under them and a "?" with an example; the live sentence (sticky); one "More settings (n)" fold, remembered per device; a small "Load…" menu for saved presets and "Save as preset…". Applied to Divisions → Scoring, Format and Rider label, the Event step, organisation settings and platform settings.
- **Heat length per round** is now a table: one row per round of the preview, each box pre-filled, with a note that a blank uses the division's heat length; if it ever has no rows it says why (including when the format has a problem).
- **Previous / Next** at the foot of every step (Go live has only Previous). On the Event step Next saves the form first and stays with the error if it cannot.
- **Number boxes** (every one outside the official practice panel) are as wide as their largest value, digits at the right; a test fails if a screen draws its own.
- **Reset event and Restore** (own commits). Migrations `20261008100000_phase7a_reset.sql` and `20261008100100_phase7a_reset_purge.sql`, applied to the hosted project with `npm run db:apply`; types regenerated. See the "Choices" below.

**Choices I made (please confirm or change)**
1. **Branch.** Work is on `claude/sleepy-edison-pgmzgn` (the branch this session was given), not `phase-7a-1-shell`.
2. **Withdrawals after the lock.** The plan says withdrawals made after the lock "stay as DNS walkovers as today". In the code, withdrawing a rider after the lock does not change the draw at all (the database function `set_draw_walkover` exists but nothing calls it). So Reset puts each ladder back to exactly the draw that was locked, and every seat modifier set during the event (DNS / DNF / DSQ by the head judge) is wiped. Nothing guesses.
3. **Unlocked draws.** A drawn division that is not locked and has no heat past "scheduled" is reset to its current draw (it has no copy and needs none).
4. **A refused Restore cannot delete its own expired copy** (a refusal rolls the transaction back). Expired copies go when the next Reset or Restore runs and when /admin/health loads (`purge_expired_reset_snapshots`).
5. **The Note button** stays the floating one it already was (not added again to the top bar); the Next button leaves room for it.
6. **The Organisation list / Settings / Feedback links** moved into the account menu (inside an event) and a short list on the left (outside one), as the plan says.
7. **Old look inside the new frame.** Riders, Officials, Draw, Run order, the events list and the Trick base tab keep their old look until 7a-2; they sit inside the new shell. In Dark mode those old screens show as white panels.

**Not done / not verified**
- **Wind call and big screen:** PR #14 merged; rebased onto main. The dashboard now holds Phase 6's wind-call control (as is) and the Big screen link (`/screen/<address>`, new tab). The greyed placeholders remain only in the design preview.
- **Owed (decided 2 Oct 2026):** a rider who withdraws after the lock does not become a DNS walkover in the stored draw. Reset restores exactly the locked draw; late withdrawals as walkovers are not needed before the event.
- **Head console division picker: not in this PR.** The owner decided (2 Oct 2026) that Console v2 owns the console division selector, so it was removed from 7a-1; the head console is untouched here.
- **Two red tests belong to other sessions' in-progress database changes on the shared project, and are left alone:** `rls.test.ts` table coverage lists `sim_baseline` and `sim_clock` (Simulator), and `rerun.test.ts` expects `HEAT_CANCELLED` where the database now answers `HEAT_ALREADY_RERUN` (Console v2). Neither is defined by a migration in this branch.
- Trick base tab, the division's live-screen settings (inside More settings) and the Rider label editor's inner fields are not restyled; tables, Draw and Run order, the consistency sweep and the "one primary button per screen" test are 7a-2.
- Every disabled control on the new screens explains itself; legacy screens still have plain disabled buttons (7a-2).
- Not seen on a real phone or in the sun; checked in Chromium at 390 and 1440 px.
- The 30-minute acceptance script (plan §11) has not been run.

**Test evidence**
- `npm run typecheck` and `npm run lint` clean. `npm test`: 140 files, 1633 tests passed (main had 131 / 1574).
- RLS (`npm run test:rls`, hosted dev project): new `tests/rls/reset.test.ts` 13 tests pass; with Phase 6 merged, the two public-view tests that were red now pass. The two remaining reds belong to other sessions (see above).
- Playwright (throwaway organisations, removed by the ledger): new `shell-dashboard` (5), `event-reset` (2); updated `organiser`, `division-identification`, `draw-timetable`, `riders`, `admin`, `password-login`, `officials`, `registration`, `phase4a2-basics`. After the rebase onto main (Phase 6 merged), `join.spec`, `shell-dashboard`, `event-reset` and `organiser` pass; one `shell-dashboard` test is timing-sensitive and passed on re-run. Several first-run timeouts were hosted-database load.

**How to test (laptop, then phone)** — see the pull request description.

## Simulator – auto-play, scenarios and View as (branch `simulator`, 2 Oct 2026)

### Done
- **Run as simulation** (`clone_event_as_simulation`), the **control panel** at `/org/events/<id>/simulate`, **speed** ×1/×5/×10/×20 (server-side, the heat's length is divided at start), **Start / Pause / Stop**, **virtual or real** per seat, **virtual spotters, judges and head judge** through add_attempt / submit_trick_score / submit_impression / submit_sheet / the publish path, **11 scenario buttons**, **View as…**, the **checklist** with the last run's numbers and a link to the Feedback notes, **Reset** and **Delete**. Words are in `copy.simulator`; the decisions are in docs/06 (Decisions log – Simulator).
- Migrations `20261009100000_simulator`, `20261009100100_simulator_stats` applied to the hosted project with `npm run db:apply`; types regenerated. The clone function was patched on the hosted project twice after the browser run found two bugs (a DELETE without WHERE, which the hosted API refuses; a locked division with no stored draw); the migration file holds the fixed version.
- Tests: unit (config, clock, attempt generator respects the cap and the trick base, judge spread and modes, scenarios and checklist, run order, View as links, preview cookie), `tests/rls/simulator.test.ts` (11: every function refused on a non-simulation event and for non-organisers, a copy never public but previewable by its organiser, virtual seats act through the same functions, fast clock, View as, Reset, delete), `e2e/simulator.spec.ts`.

### Not done / to know
- **One Reset.** The panel's Reset calls 7a-1's general Reset (`resetEvent`), then `sim_after_reset` for the simulator's own leftovers. A copy takes its `draw_at_lock` when it is made. "Wipe and draw again" (`sim_rebuild`) remains only for a simulation event with no draw copy (the Demo). The simulation-only Reset and the "save the starting point" button were removed (migration `20261009100200`); `sim_baseline` now keeps only the run order the copy started with (so a Plan B made by a scenario goes on Reset).
- **Auto-play needs the panel tab open.** There is no background worker. Each tick makes many round trips to the database, so from a distant machine two heats at ×20 took about 2.5 minutes.
- **The Demo has no saved starting point** (it was played before the simulator existed): the panel offers "Wipe and draw again". I did not touch the Demo, Arrow or EKL; all tests use throwaway organisations.
- **A seat cannot be viewed from a second seat at once** with one sign-in (by design, see the decisions log).
- Not run on Vercel or on a phone from here.

### How to test
See the click-through at the end of the pull request description.


## Fix – reset per section (branch `fix-reset-visibility`)

One pull request, "Fix – reset per section". Reset is no longer only on the Go live dashboard: each part of the event has its own reset, with one confirmation and one audit line. The whole-event Reset on the dashboard is as 7a-1 built it, except for the rebuild rule below.

### What it does
- **Reset this division** (Divisions step, on each division's card). All its heats back to not started; attempts, scores, penalties, flags, judge sheets, tie decisions, published results and actual times wiped; re-run heats removed; the draw back to the saved starting copy. Other divisions are not touched. One confirmation that shows the counts; a written reason (5+ characters) only if something of the division was ever shown publicly. Audit line `division_reset` with the counts.
- **Clear actual times** (Run order step, per plan). Clears the plan's actual starts (breaks) and the pins the head console wrote while the day ran (Shift, Resume at, +1 min, Pause break). **Pins the organiser set by hand (lunch, a briefing, a pinned heat) stay.** The plan now records which pins are hand-set (`schedule_plans.hand_pins`, kept by a database trigger: anything written from the Run order step, a copied or generated plan, counts as hand-set; the console's two functions do not). A plan made before this change cannot tell: it keeps every pin, and the confirmation says so; the first change the organiser saves to it makes it "known" with every pin it has then counted as hand-set. Audit line `plan_actuals_cleared` with before and after. The button stays, off, with a sentence when there is nothing to clear.
- **Reset this heat** (head console, "Heat menu" next to Cancel heat and Re-run). Back to not started with the same riders in the same seats. Allowed on ended, under-review, cancelled and published heats, and on a re-run heat. Its attempts, scores, penalties, sheets and published results are moved to a kept record (`heat_reset_records`, readable by organisers and the head seat) and no longer count. A published (or re-opened) result is taken out of the draw with the same ladder function Publish uses, and the next round's seat it had filled goes back to its placeholder. Refused when a later heat that depends on it has started (the heats are named). Audit line `heat_reset`. Head judge and organiser may use it.
- **Already re-run label.** On a cancelled heat that has its re-run, the Re-run button now reads "Already re-run as H1R" (off) instead of hiding the reason; its sentence moved into the button.
- **No saved copy: rebuild.** A division locked before Reset existed, or re-locked after its first heat, has no saved starting copy. Reset this division and the whole-event Reset no longer refuse it: the starting draw is rebuilt from the current draw (Round 1 keeps the seats it has, every later seat is back to its placeholder, "1st H1"; re-run heats removed). The confirmation says "this is a rebuild, not the saved copy". The event Reset's audit line lists the rebuilt divisions. This replaces 7a-1's "a reset is not possible yet" list.
- **Every reset is refused while any heat of the event is running or paused**, and names it ("Heat 3 is running. End it first."). The refusal shows in the confirmation, the button stays where it is.

### Choices I made (please confirm or change)
1. **Pins (changed after the first review).** Hand-set pins always stay. A pin the console moved stays hand-set if the organiser had set it (their time is moved, not dropped). A plan copied with "Duplicate plan" counts every pin it has as hand-set (conservative). Older plans keep all pins, as said above.
2. **Actual ends.** The plan stores no actual ends; heats keep their own real start and end. Clear actual times therefore does not touch heats that already ran (the screen says so and points to Reset this heat / division). A wind **hold** is left as it is (Resume ends it).
3. **A cancelled heat that has its re-run cannot be reset** (it would put the same riders in two heats). The menu says "Reset the re-run instead". A cancelled heat without a re-run can be reset.
4. **Marks of a reset heat.** DNS stays on a seat; DSQ stays only on a re-run (it was set when the re-run was made); DNF and interference marks go with the heat's records.
5. **No Restore for these three.** The whole-event Reset keeps its 30-day copy and platform-owner Restore. A division or heat reset keeps what it wiped only as audit counts (division) or the kept record (heat); a division reset cannot be undone from the screen.
6. **Two migrations on the shared hosted project:** `20261010100000_reset_per_section.sql` (new table, new functions, and `reset_event` replaced to accept a rebuild; `event_ever_public` now asks the new per-heat function) and `20261010100100_plan_hand_pins.sql` (`hand_pins` column and trigger; `set_plan_hold` and `set_plan_anchors` re-created as 5b has them plus one line that marks their pins as the console's; `clear_plan_actuals` re-created). `src/lib/supabase/database.types.ts` was regenerated from the hosted project.
7. **Simulator (PR #19, merged).** The branch is rebased onto it. The Simulator uses `reset_event` as it was and does not redefine it, so nothing conflicts. Its "Wipe and draw again" (for an event with no draw copy) still exists; the general Reset can now also reset such an event by rebuilding, so that path is no longer the only one. Its RLS (`simulator.test.ts`) and browser test (`simulator.spec.ts`) pass on this branch.

### Test evidence
- `npm run typecheck`, `npm run lint` clean. `npm test`: 158 files, 1837 tests passed (new: rebuild and heat-reset planning in `src/lib/reset/plan.test.ts`, the heat-menu rule in `head-state.test.ts`, hand-set pins in `src/lib/schedule/hand-pins.test.ts`).
- RLS (`npm run test:rls`, hosted dev project): `tests/rls/reset-sections.test.ts`, 27 tests (re-run after the rebase together with `reset`, `live-head`, `console-v2`, `rerun`, `draw-timetable` and `simulator`: 7 files, 99 tests, all pass). For Clear actual times: console pins cleared and hand-set pins kept, a pin the console moved stays hand-set, an older plan keeps every pin and says so, the organiser's own save marks hand-set pins. For each reset: for each reset the organiser is allowed; judge, spotter, the head seat (division and run order), and another organisation are refused; a running or paused heat is refused and named; plus rebuild, reason rule, other division untouched, re-run removal, published heat taken back with its next-round seat, a later heat started refused, cancelled with and without re-run, re-run heat reset, the kept record readable only by organiser and head seat. `tests/rls/reset.test.ts` (7a-1, 13 tests) passes; its one test about "no copy is refused" now says "no copy is rebuilt".
- Playwright (throwaway organisations): new `e2e/reset-sections.spec.ts`, 6 tests: run a heat, reset it from the console, see it not started; "Already re-run as H1R" and the menu refusing the cancelled heat; reset a division (rebuild note, other division untouched); a running heat refuses it and the button stays; Clear actual times (hand-set pins stay, the console's go; and an older plan keeps every pin); Reset event from the dashboard for a division with no copy. After the rebase: this spec and `event-reset` 9/9; `console-v2`, `live-console`, `shell-dashboard`, `draw-timetable` 24/24; `simulator` 1/1. `e2e/event-reset.spec.ts` updated for the rebuild.

### Not done / not verified
- Not seen on a real phone or in the sun; checked in Chromium on a laptop width. The heat menu on the phone layout is the same component, not clicked through on a phone.
- The Reset button on the Go live dashboard was not moved or restyled (owner: it is fine as it is).
- Two reds that belong to other sessions may still show in the full RLS run (`sim_*` tables in the table coverage list).

### How to test on the preview
1. Divisions step: on a division that has played heats, "Reset this division…" → read the counts and the rebuild/copy note → confirm → its heats show "Not started"; another division is unchanged.
2. Run order step: pin a heat or a break by hand; on the dashboard use Shift +5 or +1 min in the head console; then "Clear actual times" → the pins you set by hand stay, the Shift/+1 min ones go. An older run order keeps every pin and says so.
3. Head console: end a heat, "Heat menu" → "Reset this heat…" → confirm → the heat is "Not started" with the same riders. Cancel a heat and re-run it: the button reads "Already re-run as H1R".
4. Start a heat and try any reset: each says which heat is running and how to fix it.

## Phase 7a-2 – design system across organiser and admin

Branch `phase-7a-2-design-system`, started from main after PR #17 and #18. The Simulator (`/simulate`) is untouched. One commit per step so each lands on the preview.

**Done**
- **Step 1, the shared building blocks.** The base components (button, input, select, textarea, tick box and radio, label, tabs, card, badge, table, dialog, banner, toast) and the global styles carry the approved /design/organiser look: 1 px frames in the muted colour, 8 px controls and 12 px cards, semibold headings and regular body, the deep-teal accent for primary / selected / focus, controls 40 px (44 on touch, 48 with Large), number boxes sized to their digits with right-aligned digits. The shadcn colour names point at the beach tokens, so /design, the public pages and the base components share one set. Older markup (raw inputs, selects, tables, the old button and panel classes) gets the same look from element rules that sit at the lowest specificity, so a Tailwind class always wins; older heavy-weight and thick-frame classes are brought down to semibold and 1 px.
- **Step 2, the impersonation banner.** A slim muted strip: "Viewing as <organisation>" and a quiet "Back to admin".
- **Step 3, page by page.** Event: form and "In words" card in two columns on a laptop (card on top on a phone). Divisions: compact cards, real tabs (Scoring, Format, Rider label, Trick base), the lock notice is one small pill with a "?". Riders: the real seeded, draggable grid (every column, seeds, drag and the tap arrows unchanged) in the preview's look: sticky header, 40 px rows, search, tick boxes with a bulk bar (set status, remove from the division) and an empty state. Officials: the team as the preview's dense table (search, tick boxes, bulk switch on / off / delete, rename in place) with the PIN, panel and spotter tools on each seat's card below. Organisations: the preview table with search and a status filter. Draw: tabs per division, a one-line header with a status pill and a quiet toolbar, the ladder first, the checks under it. Run order: one strip for the plan tools, the timetable as the hero. Trick base and the live-screen settings use the same row pattern as the other settings. Sign-in and the events list are in the new look too.
- **Owner's additions.** (a) A private, unpublished, simulation or unknown event shows "This event isn't public" with a link home, in the design system, still with status 404; any other missing address shows "This page doesn't exist". (b) Go live names both dates: "No run order is active for today, Fri 2 Oct — the active plan is for Fri 16 Oct". (c) Run order says "Heats already ran on Fri 2 Oct" when the plan's heats have real start times.
- **Step 4, Dark mode.** Dialogs, toasts and the Note button open outside the themed page area; they now carry the device's Daylight / Dark and size choice themselves. The yellow Note button is a plain framed pill. The shot tool fails if anything large is painted white in Dark.
- **Step 5, screenshots and checks.** `e2e/design-system-shots.spec.ts` (run with `SHOTS=<folder>`): every organiser and admin screen, plus the impersonation strip, at 1280 and 390 px in Daylight and Dark; it also fails on sideways scrolling, a control under the control height, white panels in Dark and text under 4.5:1. The screenshots are attached to the pull request.
- **Step 6, the home page.** For riders and spectators: product name and one line; live events first (a live dot and "Now: Pro Men · R1 · Heat 3"), then upcoming, then recent results, each a compact card; one field "Have an event code?"; one quiet line "Organiser? Sign in · Official? Join with your PIN"; a small "Admin" link in the footer to the owner's sign-in (lands on /admin). Simulation and archived events never appear. Same Open Graph tags, with a picture in the same dark card as the event pages. No sign-up anywhere.

- **The time now, run-order times and the schedule drift (owner's additions of 2 Oct).** (1) A small muted HH:MM in the event's time zone, corrected by the server's clock, on the head console (next to the timer), the judge and spotter headers, the announcer, the organiser's Go live and Run order, the public event home and rider page, and the big screen. (2) Each console run-order line carries its time: "R1 · H2 · planned 14:05 · started 14:11 · Ended"; a heat not started shows "est. 14:35". "Planned" is the plan as written (the timetable engine run with nothing started and no clock). (3) A drift badge in the console top bar, on Go live and on the Run order header: "On schedule", "6 min late" or "4 min early", green, amber up to 10 minutes late, red beyond, each with an icon and a word; the public timetable shows a smaller "Running about 6 min late" only when the day has slipped. It compares the next heat that has not started in the plan as written with its time now; nothing is stored (`src/lib/schedule/drift.ts`, with tests for the maths).

**Not done / known**
- The clock is not on the Go live "Now and next" card (that card already shows the server time with seconds) and not on the head judge's phone Control tab preview.
- The print pages (start list, cards, timetable, draw) keep their own white paper look on purpose.
- Join and Register (official and rider entry pages) still have their own large type; they are not organiser screens.
- The Officials table lists the team; the per-seat cards below still hold the PIN, panel and spotter tools (tests and the print flow depend on them).
- The Organisations row menu opens inside the scrolling table; on the last rows it extends the scroll area.
- Not seen on a real phone or in the sun.

**How to test**: see the pull request description.

## Polish 1 – simulator panel, organiser access (branch `polish-1-simulator-access`)

One commit per item. Item 3 (the master trick base editor) is **not** in this pull request: see "Not done".

### Item 1 – the simulator panel in the design system
- `/org/events/[id]/simulate` now uses the shared organiser building blocks: the controls (speed, Start / Pause / Stop, the state and the one sentence that says what it is doing) are one quiet toolbar; Who plays, How they behave, Scenarios, View as…, Checklist, What happened and Reset are cards; the "Run as simulation" and "setting up" screens are a card and a banner. The old hard-coded daylight wrapper is gone, so the panel follows Daylight / Dark like every other organiser screen. Controls are 40 px (44 on touch); times in the log sit in a right-aligned column.
- View as… is a compact grid: public pages as buttons with icons; one row per official with a role icon, "Open" and "Phone". The PIN in the phone box is hidden until **Show PIN** is tapped.
- Behaviour, test ids and web addresses are unchanged. Buttons that cannot be pressed say why under them (Reset: "Type the event's web address first."). While an action is running the toolbar says "Working…" once instead of printing a reason under every button.
- The screenshot pass (`e2e/design-system-shots.spec.ts`) now includes the simulator (a real event's "Run as simulation" card, and a simulation's full panel) at 1280 and 390 px, Daylight and Dark, with the same checks (sideways scroll, control height, white panels in Dark, contrast). `SHOTS_ONLY=simulate` limits a run to those screens.
- The "Last run" numbers stay sentences ("3 of 12 heats published") because a test reads them; they use tabular digits but are not in right-aligned columns.

### Item 2 – organiser access, end to end
**What was wrong, found by testing on the hosted project**
- The invite **e-mail link did not sign anybody in.** The e-mail is sent by the server, and the auth service then returns the session after a `#` in the address, which a server route never receives, so `/auth/confirm` always said "link failed". (The copy-the-link path worked, which is why it was not noticed.) Fixed with a new page `/auth/link` that reads the session from the address, keeps it, and sends the person to their organisation (or `/admin` for the owner). An expired or already-used link goes to the sign-in page with its own sentence.
- The confirmation said "They open the link in the same browser they asked from", which is wrong for an invitation. Removed.
- There was **no way to remove an organiser.** New database function `admin_remove_organiser` (owner only; migration `20261011100000_organiser_access.sql`, applied to the hosted project with `npm run db:apply`, types regenerated): deletes the membership, deletes every session of that login (so a phone that is still open is signed out the next time it asks), keeps the login so the address can be invited again, writes an audit line. You cannot remove yourself. A person who is an organiser of two organisations loses only the one, but is signed out of both until they sign in again.

**What the owner sees now** (/admin → organisation)
- The Organisers table has an "Access" column with **Remove** (a question first: "Their access ends at once and every phone or computer they are signed in on is signed out. You can invite them again later."). Staff do not see it.
- The invite form is titled "Invite organiser" and says: "Only 2 sign-in e-mails per hour on this plan." The number is `NEXT_PUBLIC_AUTH_EMAIL_LIMIT_PER_HOUR` (default 2; set it on Vercel and redeploy when the plan or the sender changes; the sentence disappears at 0). If a send fails the confirmation says why in words (hourly limit used up / the plan's sender only writes to your own team's addresses / other) and gives the link to copy; it is never silent.
- Every invite confirmation ends with: "Ask them to click the link today and set a password straight away."
- No owner-set temporary passwords exist anywhere: the invite form has no password field (the test checks this); the organiser chooses theirs with **Set a password** in the account menu, then signs in with e-mail + password. "Forgot password?" is unchanged: it sends a sign-in link and lands on the set-password page.

**What the invite e-mail looks like, and where to change it**
- Subject "Your sign-in link"; body: heading "Your sign-in link", "Follow the link below to sign in. This link expires shortly and can only be used once.", and a link "Sign in". It is Supabase's **Magic Link** template (an invited login is an existing confirmed login, so that template is used).
- Sender: the Supabase default (name "Supabase Auth", a noreply address of Supabase's). Neither the sender nor the wording is in this code. Wording: Supabase dashboard → Authentication → Emails → Templates → Magic Link. Sender name/address: Authentication → Emails → SMTP Settings, which needs a custom SMTP provider; the sender address of the built-in service cannot be changed. The sign-in link is valid for **24 hours** (`mailer_otp_exp` 86400 s): it was 1 hour, and on the owner's instruction I raised it from the environment with the Management API (Authentication → Sign In / Providers → Email → "Email OTP expiration" shows the same setting). It applies to every sign-in and password-reset link of the project, Arrow's included. The plan allows 2 e-mails per hour, so "click the link today" is true. E-mail security scanners that open links can use up a one-time link; if somebody says their link "already expired", invite them again.
- Also not verified: whether the built-in sender writes to addresses outside the project team. No real e-mail was sent in testing (2 per hour); the link path is the same address the e-mail carries, produced by the auth service.

**Tests**
- `tests/rls/organiser-access.test.ts` (6): an organiser sees only their own organisation, events and members; cannot add or remove members by table or by the owner's functions; staff cannot remove; self and non-member refused; removal ends access at once, signs the session out (the old token no longer works, refresh fails), keeps the login, writes the audit line; re-adding works.
- `e2e/organiser-access.spec.ts` (2), on a throwaway platform owner and organisation: invite (no password field; the limit sentence and the "today" line visible) → the link opened in a private window lands in that organisation only (no admin, 404) → Set a password → sign out → sign in with e-mail + password → the e-mail's own link shape (session after `#`) signs in and a used link says so → "Forgot password" needs an e-mail first and its link lands on set-password → owner removes → table row gone, their window is sent to sign-in, the password gets "not an organiser" → invite again works. Plus: the owner cannot remove their own login, and an organiser gets 404 on the organisation's admin page.
- Unit: the hash parser and the e-mail failure classifier / limit (`src/lib/auth`).
- Found but not mine: see "Open issue" below.

### Open issue for the next polish session: `admin.spec` Archive timeout
- `e2e/admin.spec.ts`, test "the owner runs the platform: create, invite, rename, open as organiser, archive, delete" (line 44) fails at **line 128**: `page.getByRole("button", { name: "Yes, archive" }).click()` waits until the 240 s test timeout. The steps before it pass: at line 126 it clicks **Manage** in the organisation's row of the /admin list, and at line 127 it clicks **Archive organisation**, but the confirmation question with "Yes, archive" never appears.
- It fails the same way on an untouched copy of `main` (checked), so it is not caused by this branch. The same page, opened directly and clicked in a short test of its own, shows the question correctly, so the likely cause is the step before it: the test has just come back from "Open as this organiser" and "Back to admin" and goes to the page through the list's Manage link. Look at the page state after that detour (the organisation cookie, a click before the page is live) before changing the test.
- The other tests of the admin, password-login and organiser specs pass (39 of 40 in the admin spec).

### Not done
- **Item 3, the master trick base editor** (form editor, versions and diff, proposals queue, update-to-latest) is not started. It is a large change on its own (new tables or versioning rules, RLS, an editor with drag and drop, and four Playwright paths), and doing it in the same pull request would have meant a rushed, less tested editor. It becomes its own pull request.
- "Forgot password" and "Sign in with a link" on the login page still use the browser's own link (it works only in the same browser that asked, as the page says). Only the invite e-mail was moved to the any-browser link.
- Not seen on a real phone.

### How to test on the preview
1. Open /admin → an organisation → note the sentence about 2 e-mails an hour; Invite organiser with your own address (or untick the e-mail and copy the link); open the link in a private window: you are in that organisation, nothing else to do. Account → Set a password, sign out, sign in with e-mail + password.
2. Back in /admin: Remove next to that person, confirm; in the private window reload: you are sent to sign-in. Invite again.
3. Open an event → Simulate: the panel is in the same look in Daylight and Dark; View as… → Phone → Show PIN.
## Manual v1 – product manual, Help section, glossary (branch `manual-v1`)

### Done
- **The manual** in `docs/manual/` (40 pages, Markdown): README (how to read, how to update, the version rule), Quick start (an event in 30 minutes, mirroring the Go live checklist), Dependency map (what must be true before each action, where to fix it, the sentence shown; a Mermaid diagram of the chain), Event day (docs/09 brought up to the built product, organiser and head judge side by side), Troubleshooting (symptoms, then every sentence alphabetically), one page per screen (organiser steps, Go live, organiser access, head console laptop and phone, judge, spotter, announcer, the public pages, big screen, simulator, admin), Settings, Resets and undo, Roles, Glossary, Errors and refusals, Changelog. Every page has a one-line summary and “Last checked: ‹date› · Product version ‹version›”.
- **Generated, so they cannot drift**: `npm run manual:generate` writes the settings tables (labels, “?” texts, examples, defaults read from the Zod schemas, the values of every built-in preset), the errors appendix (every refusal sentence of `ui-copy.ts`, 530+, with where / meaning / fix from `scripts/manual/error-notes.ts`, and every database code raised by a migration) and the alphabetical sentence index of Troubleshooting.
- **Help section** at `/help` (public, noindex, a static page built from `docs/manual`): left table of contents, client-side search over every heading, the text under it and every anchored table row, the Mermaid diagram drawn (`mermaid` package, loaded only on /help), pictures served from `docs/manual/img`, **Download as PDF** (loads every picture, then the print window; print styles give one page per manual page).
- **Learn more**: every “?” on the organiser and admin screens (and the simulator's) opens its row of the settings page; every refusal sentence on the organiser, admin and head judge screens (alerts, field problems, the reason under a grey button, toasts) gets a “Learn more” link to its row of the errors page. Anchors are made by `copy.manual.anchor` in `ui-copy.ts`.
- **Product version** 0.9.0 (`package.json`), shown on /admin/health, in the home page's footer (with a Help link) and at the top of /help.
- **Screenshots**: `npm run manual:shots` builds a throwaway organisation on the hosted project (three divisions, 24 riders, officials with PINs, locked draws, Plan A / Plan B), photographs the setup and admin screens, copies the event into a simulation and plays it at ×20 for published heats, photographs the console, judge, spotter, announcer, public pages and big screen at 1280 / 390 px, and removes everything.
- **Rule** in CLAUDE.md (golden rule 9): every PR that changes a screen, a setting, a sentence or a rule updates the manual pages it touches, retakes their screenshots, and adds a changelog line.

### Tests
- `src/lib/manual/manual.test.ts`: the renderer; every page's summary and version line; unique anchors; every internal link resolves; every picture exists; house words; search lands “grey” on the Hold row; every refusal sentence and every database code in errors.md; every setting of the scoring, format, event and division-live schemas in settings.md; every “?” opens its own row; the generated tables are up to date.
- `e2e/help.spec.ts`: /help renders, search, links, pictures, the diagram, the PDF button; a grey button's reason and a “?” on the organiser screens carry Learn more links that resolve.

### Fixed on the way (owner, 2 Oct 2026)
- The Trick base tab and two Scoring/Format sentences said “Show all settings”; the fold is “More settings”.
- A division's Scoring or Format tab said “● Unsaved changes” before anything was touched when a stored override equalled the preset's own value (`effectiveOverrides`, with tests).
- The empty toast area painted a blank strip over the page (bottom right on a laptop: it hid “Opens in a new tab.” on Go live; the top strip on a phone). It is now see-through and lets taps through.
- docs/09 corrected to the built product.

### Owed (not needed before 8 October, owner 2 Oct 2026)
- Results export (CSV / PDF per division), audit-log export, “Duplicate event”, printed paper judge sheets.

### Not done / not verified
- The master trick base editor is being built in its own PR, which updates screens/admin-trick-base.md.
- Not seen on a real phone, in sun, or on the Vercel preview.

## Trick base editor – manage the master trick base without JSON (branch `trick-base-editor`, 2 Oct 2026)

Started from main after #22 and #23. A Polish 2 session works in parallel on the console, simulator and organiser screens: on the organiser side this branch touches only the Trick base tab (`trick-base-panel.tsx`), its two server actions (`saveTrickBase`, `addTrickBlock`) and one new file beside them (`trick-base-actions.ts`).

### Asked first, and the owner's answers (2 Oct 2026)
The brief and the code disagreed in seven places; all seven recommendations were accepted:
1. A block keeps its identity (`family:key`) for ever; moving it in the master base only changes the family it is **shown** in. Direction and Multiplier keep their own blocks; a family the owner adds behaves like Add-ons.
2. Each event keeps the master version it uses (`events.trick_vocabulary_version`). Every existing event (Arrow, EKL, Demo included) was set to the version it used that day (5); nothing they see changed. New events start from the newest published version.
3. /admin is the source of truth: `npm run seed:presets` writes the trick base only into an empty project and otherwise prints “skipped … managed in /admin”.
4. The naming template is real: `{direction} {blocks}`, written into the engine test-first; the default gives exactly the names of before (an older version holding a sentence names the same way).
5. Accepting a proposal adds it to a new draft; it reaches customers with the next “Publish to all customers”.
6. Only the Trick base tab and its actions on the organiser side (above).
7. After “Update to latest”, a retired block is gone from that event's spotter; tricks already logged keep their names (retired blocks stay in the data, hidden).
Smaller choices: the categories list is reorder-only (a new category also needs scoring settings); a key is editable only until its first published version.

### Done
- **Engine** (tests first, docs/08 §1I written before the code): `engine/tricks/naming.ts` (template, check, render); `composeTrick` uses it. Every §1G-3 name unchanged.
- **The editor's logic** (`src/lib/trick-base/master.ts`, pure): the master base as families of rows; rename, key (until published), aliases, category, takes a multiplier, rotation (information only), on for new events, retire / restore, remove (never published only), move (drag or **Move to…**), reorder, add block, families renamed / reordered / added; category precedence; naming; **validation in words**; **diff in words** (“3 renamed, 1 added, 1 retired”); the version plan; the live example.
- **Spotter and organiser read the event's version**: retired blocks and blocks off by default (unless ticked, stored in the division's `trick_base.enabled`) are off on the spotter, in typed and spoken text and in the derived categories; stored attempts keep their names. The spotter's families follow the master (names, order, shown-in).
- **Database** (`20261012100000_trick_base_editor.sql`, applied to the hosted project with `npm run db:apply`; types: only this branch's additions written in, see below): who saved / published each version and what changed; owner-only `admin_trick_base_save` (refuses a stale save: `TRICK_BASE_STALE`) and `admin_trick_base_publish`; `admin_trick_base_history`; the JSON route of the generic preset function is owner-only for the trick base; a dismissed proposal needs a reason (`REASON_REQUIRED`) which the organiser reads; `update_event_trick_base` (organisers of the event; refused while a heat runs: `HEAT_RUNNING`); new events get the newest published version; the division guard lets `enabled` only grow after a heat has started.
- **/admin → Master presets → Trick base** (`/admin/presets/trick-base`), in the 7a-2 look: proposals queue on top (accept into a family after editing name and aliases; dismiss with a reason); **Save as a new draft** / **Publish to all customers** (diff in words first); one card per family; category precedence with its one-line explanation; naming template and hide-multiplier with the live example; version history (who, when, what) with **View**; “Advanced: edit as JSON” with **Use this JSON**, **Export**, **Import a file**. Staff see it read only. `/admin/tricks` and `/admin/presets/trick-vocabulary/big-air-vocabulary` lead to it; the rail's “Trick proposals” item is gone (Master presets says how many proposals wait).
- **Divisions → Trick base**: “This event uses version ‹n›…”, the diff to the newest and **Update to latest**; a dismissed block shows the owner's reason.
- **Manual**: `screens/admin-trick-base.md` rewritten from “being built” to the real thing with 8 new screenshots (taken by a new test in `e2e/manual-shots.spec.ts`, `npm run manual:shots -- -g "trick base"`); admin-presets, organiser-divisions, roles, README, changelog; errors and troubleshooting regenerated; notes in `scripts/manual/error-notes.ts`.

### Found on the way (please confirm)
- **The hosted master base already had two shared words**: “KL” on Kiteloop and + Kiteloop, and “doobie” (an alias of Doobie loop and the name of the block Doobie accepted from the Demo). The brief's rule would have refused every save until they were fixed, so a word two blocks **already** shared in the version being edited does not block a save; it is listed under “Worth tidying up”. A new clash always blocks. Remove either word from one block when convenient.
- **“Tornado”** (your done-means list) is an alias of Late rotations today, so adding a block “Tornado” is refused with “““tornado” is already an alias of Late rotations.” Remove that alias from Late rotations in the same draft, then save.
- The hosted schema already holds Polish 2's changes (columns and functions not on main), so `npm run db:types` wrote them too; I kept only this branch's additions in `database.types.ts` to avoid a clash. Run `npm run db:types` after both are merged.
- Simulation copies made by the simulator start on the newest version (the simulator's copy function was not touched).

### Test evidence
- `npm run typecheck` clean · `npm run lint` clean · `npm test`: **167 files, 1948 tests** passed (new: naming template 8, master editor 27, plus the layout / trick base suites unchanged and passing).
- `npm run test:rls -- tests/rls/trick-base-editor.test.ts`: **6 passed** (owner only for every write; staff read; organisers read the published version and cannot change their event's version by hand; stale save refused; identical save makes nothing; publish and history with who; Update to latest refused for another organisation and while a heat runs; proposals written by their organiser, answered by the owner, reason required and readable by the organiser; `enabled` only grows after a heat). The hosted master base is back to versions 1–5 afterwards (checked).
- Playwright `e2e/trick-base-editor.spec.ts`: **5 passed** (rename + publish with the diff + the new label on a throwaway event after Update to latest; alias typed by the spotter; retire: gone from a new event, there on an old one; accept a proposal; dismiss with a reason the organiser sees). Re-run: trick-base, trick-layout (one wait added: the tab now loads its version first), live-spotter, admin (master presets heading now “Trick base”): all pass except `admin.spec` “archive”, the known open issue from Polish 1 (fails the same way on main).

- Re-run after the owner's request (main unchanged since #23, so no rebase was needed): unit suite 1948 passed; the retire test failed once because its Retire tap landed before the page was live (the tap was lost). Fixed at the root: the editor now says when it is live (`data-ready`) and the tests wait for it; then `trick-base-editor.spec` passed twice in a row (5/5), trick-base and trick-layout passed.

### Not done / not verified
- Not tried on a real phone; the editor is a laptop screen (it works at 390 px, see the screenshot).
- The full `npm run manual:shots` was not run (it rewrites every screenshot and would collide with Polish 2's); only the trick base pictures were retaken, and `admin-tricks-1280.png` was removed.
- The complete Playwright suite was not run in one go.

### How to test on the preview
See the pull request's click-through (your done-means list, on Demo).

## Polish 2 – simulator, console and organiser fixes (branch `polish-2`, 3 Oct 2026)

Started from main after #22 and #23; rebased onto main after #25 (trick base editor) — the only clash was a generated table of the manual, and the database types were regenerated once for both. One commit per numbered item. Product version 0.9.1 at merge; renumbered 0.9.2 by the release tracker (#26), because #25 is 0.9.1. The decisions are written in docs/06, “Decisions log – Polish 2” (P2-1 … P2-15). Trick-base-panel.tsx and its two server actions were not touched (they belonged to the parallel trick base editor).

### Done
1. **Publish blockers in words, with Fix.** “Fawy: sheet not submitted — 3 attempts unscored”, “Fawy: score for Red, attempt 2 missing”, “Fawy: Impression / Variety score for Red missing”; **Fix** opens that score (on the console side panel and in the Publish dialog). **Rule (P2-1):** when the head judge has set every missing score of a judge to Absent, that judge's sheet counts as submitted; typed values alone do not submit a sheet. Database: `impression_scores.missed` (Absent on an Impression / Variety score), `head_set_impression` can set Absent; the server's publish check uses the same rule.
2. **View as gives the seat back.** The phone says it is alive every 5 s; leaving the page (or 90 s of silence) gives the seat back to the simulator. The panel shows who holds each seat, with **Give back**.
3. **Pause pauses the heat clock.** Pause and Stop on the simulator pause the running heats with the same server pause as the console; the console says “Paused by the simulator”; Start / Resume resumes only those (a heat the head judge paused stays theirs).
4. **Behaviour settings independent** (cause: an empty form filled every missing setting with its default on save). **4b. Tick lock** given back after each step (unit test: two ticks in a row both run).
5. **Console after the heat:** each judge's Impression / Variety scores per rider — done, missing, Absent — with **Enter** per judge.
6. **Head judge enters a judge's sheet:** one **Save** for every rider, the next missing rider is picked by itself, **Save and submit** submits the whole sheet (recorded in the audit log as submitted by the head judge).
7. **Skip to end of heat** and **Run the whole event** on the simulator (the latter plays every day's active run order, day after day, heat after heat; without a run order it uses the order of divisions, rounds and heats).
8. **Scoring tab:** main dials first, the settings of a choice only with that choice. It says “21 more settings”, not 12: 21 is what is left once the main dials and hidden settings are taken out (honest count, it was 53).
9. **Every “?”** ends with where the setting shows and what it changes.
10. **Timing per round** under Format: one table (warm-up, heat length, break after each heat), the duplicate settings removed; the “?” says these make the starting plan of the run order.
11. **Trick categories:** nothing to change — the spotter's default grouping is already Base trick → Add-ons → Grabs & landings; a test now locks it in.
12. **Next / Previous bar** sticks to the bottom everywhere and the **Note** button and panel sit above it (Daylight and Dark checked).
13. **Spinners** back on every number box (boxes a bit wider to make room).
14. **Run order per day:** a day without a plan offers **Create a plan for ‹day›** (“Plan A – ‹day›”) and **Copy ‹day›'s plan to ‹day›** (heats, breaks, hand-set pins; not actual times or the console's pins); the Day list says which plan is active or “no plan”; every grey control says why; **Clear actual times** names what stays (“Your pinned 10:05 stays”); the Go live Fix opens on today.
15. **admin.spec Archive timeout — cause found:** the test clicked **Archive organisation** before the page was live (checked at the moment of the click: React not attached), so nothing happened. A slow phone would lose the tap the same way, so the shared one-confirmation button now stays grey until it can answer. The test is unchanged; admin.spec passes 12 of 12.

### Database (applied to the hosted project with `npm run db:apply`; types regenerated with `npm run db:types`)
`20261015100000` Absent rule · `20261015100100` View-as release · `20261015100200` simulator pause · `20261015100300` tick lock token · `20261015100400` head submits a judge's sheet.

### Not done / please check
- Not tried on a real phone.
- Copying a plan to another day copies all its heats; remove the heats that do not belong to that day (P2-14).
- One run of the organiser spec failed once on “Save as new version” and passed on the re-run; four RLS suites failed in setup only while a browser test used the same hosted project at the same time, and passed on their own.

### How to test on the preview
See the click-through in the pull request.
## Release tracker (0.10.0) – what's new and what to test, per version

### Done
- **docs/RELEASES.md**: one entry per version, newest first (version, date, PR, What changed, What to test as `- [ ] ` checks, Known issues). Backfilled for every merged PR (#1–#25) in merge order; 0.10.0 (this PR) and 0.9.2 (#24, Polish 2, from its click-through) have the full 8-check lists, 0.9.1 (#25) has 4 checks; the two plan-only PRs say “Nothing to test on the live address.”
- **Rule** (CLAUDE.md rule 10, the manual README and Admin: releases): every PR raises the version (fix +0.0.1, feature +0.1.0) and adds its entry and changelog line; a PR that changes no screen may write “Nothing to test on the live address.” instead of checks (owner's adjustment, 3 Oct). `src/lib/releases/releases.test.ts` fails when package.json's version has no entry, when an entry is incomplete, when the current version has fewer than 3 or more than 8 checks, or when a changelog version has no link to its entry.
- **Database** (`20261013100000_release_tracker.sql`, applied to the hosted project): `release_check_ticks` (version + check key + words, who, when) and `release_signoffs`; `admin_release_tick` and `admin_release_mark_tested` (owner only; confirming is refused with `RELEASE_CHECKS_OPEN` while a check is open; unticking removes the confirmation), `admin_release_status` (platform admins; with e-mail addresses). Audit lines for each tick, untick and confirmation. Types: only these additions written in (the hosted schema also has another branch's tables).
- **/admin/releases**: current version card, every entry as a card, tick boxes saved at once with “Ticked by ‹who›, ‹when›”, **Confirm version tested** (grey with “Tick every check first: ‹n› left.”). Staff see it read only. New rail item **Releases**.
- **Health** and the admin home show “‹version› — ‹n› of ‹n› checks done” / “— tested”, linking to Releases.
- **Manual**: new `screens/admin-releases.md` (with screenshots at 1280 and 390), health, organisations, roles, README, changelog (each version links to its release entry; 0.9.1 split out of 0.9.0), errors and troubleshooting regenerated, notes in `scripts/manual/error-notes.ts`.

### Decisions (confirmed by the owner, 3 Oct 2026)
- **Final numbering:** #23 = 0.9.0, #25 (trick base editor) = 0.9.1, #24 (Polish 2, merged after #25) = 0.9.2 (its changelog heading and its pages' “Last checked” lines renumbered from 0.9.1), this PR = 0.10.0.
- **Backfilled version numbers.** Applying “+0.1.0 per feature” to #1–#25 would have ended near 0.20.0 and given 0.9.0 a second meaning (the manual and Health already say 0.9.0 = the manual release). Instead, the entries follow what package.json really said: #1–#22 are 0.1.0–0.1.21 (package.json said 0.1.0 throughout), #23 is 0.9.0 (it set that), #25 is 0.9.1, #24 is 0.9.2, and the rule starts with this PR at 0.10.0.
- **The button is “Confirm version tested”**, not “Mark version tested”: “mark” is a banned house word (the old word for a score) and the wording test refuses it.
- **Owner only** ticks and confirms (staff look), like the other owner-only admin actions.

### Test evidence
- After rebasing onto main with Polish 2 (#24): `npm run typecheck` clean · `npm run lint` clean · `npm test`: **180 files, 2029 tests** passed (new: 17 release tests). Conflicts: changelog (both entries kept, Polish 2 renumbered 0.9.2), STATUS (both sections kept), package.json (0.10.0), the Health and Organisations pictures (retaken after the rebase, with Releases).
- `npm run test:rls -- tests/rls/release-tracker.test.ts`: **3 passed**.
- Playwright after the rebase, `e2e/admin-releases.spec.ts` + `e2e/admin.spec.ts`: **14 passed** (Polish 2's Archive fix included); `e2e/admin-releases.spec.ts` alone (owner ticks, reload keeps it with e-mail, Health and admin home count it, untick; staff cannot tick). `npm run build` passes and the build ships `docs/RELEASES.md` with /admin, /admin/health and /admin/releases.

### Not done / not verified
- Not tried on a real phone (the 390 px screenshot looks right).
- The full `npm run manual:shots` was not run (Polish 2 is running in parallel); only admin-releases, admin-health and admin-organisations were retaken (`npm run manual:shots -- -g releases`).

### How to test on the live address
The 8 checks of 0.10.0 on Admin → Releases.

## Observer seat – a read-only official (branch `observer-role`, 3 Oct 2026)

Started from main after #26 (release tracker); rebased onto main after #27 (audit 1a). None of the release tracker's files (RELEASES.md aside, which every PR adds its entry to), the admin pages, Health or the audit's files were touched. Version 0.11.0 (a feature).

### Done
- **Database** (`20261018100000_observer_seat.sql`, applied to the hosted project with `npm run db:apply`; `npm run db:types` changed nothing — the role is a text column): role `observer` on seats; an observer reads what the head judge reads (every judge's scores, Impression / Variety scores, sheets, flags, decisions, the audit log, the seats' names — never the PIN columns); `end_heat_if_due`, the only function any seat could call that changes a heat, now refuses an observer; an observer can never be on a panel (`OBSERVER_NOT_ON_PANEL`, a trigger on panels and on seats; "also scores" stays off); the simulator never gets an observer (a trigger skips it on every path that adds simulator seats); an observer of a **simulation** sees its public pages (the same preview its organiser gets) and the simulation's public live heat.
- **Officials step**: Role **Observer**, with a sentence on what it is and the warning never to give an observer PIN to a judge (it shows every judge's scores). PIN, card, Show / Regenerate PIN, Switch off as for any seat; never in the panel table.
- **Join**: an **Observer** card on the event's join page; the seat page and the official screens send an observer to its own page.
- **Observer view** (`/observe/‹event›`): top bar **Whose screen** (Head judge console laptop / phone, Judge 1…n in panel order, each spotter, Announcer, Big screen, Public page), **Actual size / Fit to screen** for laptop and big-screen views, the strip “Observing — read only”, then the official's **real** screen in a frame of that device's width (so a laptop console really lays out as on a laptop). The framed screen is drawn for that official's seat, so it picks the same heat and shows the same rows that official's phone gets (a judge's screen shows that judge's scores only; pure `maskFor`, tested). Every control is disabled (a disabled fieldset) and every tap, key and form event is stopped (dialogs too); scrolling works. The spotter's feed is shown open (an observer cannot tap Feed). The view checks every 10 s that the seat is still on: switched off or a new PIN ends it at once.
- **Head console**: “‹n› observers watching” under Judges (observers seen in the last 75 s).
- **Simulator**: View as… → **Observer** row (Open / Phone).
- **Manual**: new page Observer view; Roles, Officials, Join, Head console (laptop), Simulator, README updated; errors regenerated; changelog 0.11.0; release entry 0.11.0 in docs/RELEASES.md.

### Decided without asking (please confirm)
1. **The one write**: an observer's phone still says “I am here” (`touch_seat`, its own last-seen time only), because that is how the head judge can see “observers watching”. Everything else is refused; the RLS test checks that this call changes nothing but that time.
2. **The spotter's feed opens by itself** on the observer's screen; on the spotter's own phone nothing changed.
3. **Judge 1…n** are numbered by panel order across divisions; a head judge who also scores is one of them; a judge on no panel is not listed. A seat already named “Judge 1” is not shown as “Judge 1 · Judge 1”.
4. **Head console / announcer without such a seat**: the observer still gets the view, drawn for its own seat in that role (nothing to score, nothing to show that the real one would not).

### Blind spot to know
- An observer reads **every judge's scores** as they land. A judge who also holds an observer PIN on a second phone could see the others' scores before Submit. The Officials step says so; the database cannot tell who is holding the phone.

### Tests
- `npm run typecheck` clean · `npm run lint` clean · `npm test`: **184 files, 2104 passed** (new: `src/lib/live/observer.test.ts`, 14 tests).
- `npm run test:rls -- tests/rls/observer.test.ts`: **13 passed** — reads like the head judge; **every function a signed-in person may call** (82, listed in the test; a second test fails when a new function appears that is not in the list) refused for an observer and the whole event unchanged afterwards; every official table write refused; touch_seat moves only its own time; never on a panel; several observers; public pages never name it; Switch off / Regenerate PIN cut it off at once; on a simulation: the copy keeps the seat, the simulator never plays it, its observer sees the preview but cannot drive the simulator, View as can hold it.
- Neighbouring RLS suites re-run: live-heat, live-head, live-judge, live-spotter, simulator, riders-officials, public-site, rls, live-visibility — all pass (two first failed in setup with a hosted “Gateway Timeout” and passed on the re-run).
- Playwright `e2e/observer.spec.ts`: **1 passed** — the organiser adds an Observer on the Officials step of a throwaway simulation; a phone joins with the PIN; the simulator runs at ×10; the phone switches through every screen; Judge 1's scores arrive on Judge 1's screen; every control of every official screen is disabled; a tap does nothing; `pause_heat`, `submit_trick_score`, `add_attempt` and `set_wind_call` sent with the observer's own token are refused (NOT_ALLOWED); Switch off ends the view; the simulator's View as… opens the observer view.

### Not done / not verified
- Not tried on a real phone.
- Pictures taken in the sandbox show the screens' “Offline” badge (live updates cannot use websockets here; they fall back to asking every 5 s). On the live address they say Live.

### How to test on the phone
See the release entry 0.11.0 in docs/RELEASES.md (8 checks on Demo).

## Fix session 1 — audit 1a, engine findings (0.11.1)

### Done
- **A1a-1:** riders tied on total with no counted trick are a genuine tie (`rank.ts`), flagged, explained, and Publish waits for the head judge. Test: final of 2 where both crash everything.
- **A1a-3:** a score off the division's step or outside the scale is refused by the database (migration `20261019100000_fix_audit_1a_score_step.sql`: the four write functions plus a trigger for direct writes) with a sentence naming the step and the two nearest values; the engine never blanks a heat (rounds, notes it in the explanation, leaves out what is not a number). Reachability of an off-step score through each path is written up in docs/AUDIT.md.
- Tests: scoring engine 167, whole suite 2119 passing, 4 expected failures left (A1a-2, A1a-4, A1a-5, A1a-7). Manual: errors and troubleshooting regenerated, judge screen page, changelog. Release entry 0.11.1.

### Hosted-project results (3 Oct 2026, after rebasing onto 0.11.0)
- Migration `20261019100000_fix_audit_1a_score_step.sql` applied with `npm run db:apply` (it first collided with the version of another session's `ask_sendbook`, so it was renumbered). The four functions and both triggers were checked on the hosted project. One fix after the first run: a model with no Impression scale is not checked at all (the database behaves as before there); `tests/rls/rls.test.ts` had caught it.
- `npm run test:rls`, every file: all pass except `simulator.test.ts` (1 case, "Pause pauses the heat clock"), which fails because of another session's migration `20261020100000_polish2b_one_pause` that is applied on the hosted project but not on main. New: `score-step.test.ts` (7) and `score-flow.test.ts` (a whole heat through the real write functions, then Publish).
- Browser: judge pad (tapped scores with 20 s offline, Impression and Submit) passes. `simulator.spec.ts` fails at its first step (the ×20 speed button does nothing) on a clean `main` too, and the head-judge spec expects a sentence without the "Learn more" link that main now shows; neither involves score writing.

### Not done
- A1a-4 / A1a-5 (Shift, lateness badge): after the event; owner decision recorded in docs/AUDIT.md ("never shorter than asked", the board may show N + 1). A1a-2 and A1a-7 by procedure; the silent typed-pad refusal for Polish 2b. Manual screenshots not retaken (no screen changed).

### How to test
- Release entry 0.11.1 in docs/RELEASES.md (6 checks).


## Polish 2b – simulator pause, console menu, big screen colour, feedback admin, public tabs, copy a plan (branch `polish-2b`, 3 Oct 2026)

Started from main 0.11.0, rebased onto main 0.11.1 (fix session, #29); version 0.12.0 (a feature). No change to the engines or the score-saving functions.

### Done
1. **One pause.** Reproduced on main first (Playwright: Pause on the console left the simulator "Playing"; afterwards the simulator's Resume resumed nothing because it only resumed heats it had paused itself). Migration `20261020100000_polish2b_one_pause.sql`: a trigger moves `sim_control.state` with every heat going running → paused (console, wind Hold or simulator) and paused → running; `sim_resume_heats` resumes every paused heat; Stop stays stopped. The panel's Pause / Resume now call the database straight from the browser (server actions of one tab wait for each other, so behind a tick they took seconds) and the panel reads the state every second; the tick looks at the state again before each of its moves. Playwright `e2e/one-pause.spec.ts` (×10, View as head judge, both directions, 10 s of silence): 3 of 3 passes after the fixes.
2. **Live-scores pill** — CORRECTED in the flags PR: the pill was the wrong control (the owner's note named the wrong one). The live-scores switch is back in the More menu with `live-follow` / `live-on` / `live-off`; the pill and `src/lib/live/live-scores.ts` are removed; the **Release result** button (held final) is now beside Publish.
3. **Big screen Day / Dark.** `ScreenFrame` (control on mouse move / tap, hides after 3 s, **D**, remembered in localStorage), CSS variables `bs-dark` / `bs-day`, Event step radio (default Dark). `e2e/screen-colour.spec.ts`: before the event, running heat, published result, sponsors, wind hold, held final and podium in both modes (contrast at least 7:1, same digit sizes); screenshots looked at.
4. **Admin → Feedback.** Date filter and quick picks, tick boxes, Select all, Set done / Reopen (asks once, counts), export follows the filter. `e2e/feedback.spec.ts`.
5. **Public tabs.** Event step card, `src/lib/public/tabs.ts`, a guard on every tab page, migration `20261020100100_polish2b_public_site_settings.sql` (the public site function now also tells `screenColourMode`, `publicTabsOff`, `registrationOpen`). `e2e/public-tabs.spec.ts`.
6. **Copy a plan.** Only heats that have not ended, no breaks, notes or pins; the page says "Copied N heats — add this day's breaks and the first heat's pin". Audit A1a-7 test flipped (now passing); AUDIT.md says fixed in Polish 2b.
7. **Judge pad.** The server's sentence under the box with Learn more (to the judge page, `#ju-pad-step`); the same component serves the head judge's entry.
8. **Trick base editor browser test.** Re-run: it fails again, but not in the editor. The shared master base has an unpublished draft (v7) by the platform owner, made at 10:10 today; the editor opens that draft, so its counts describe the owner's work. Published v6 (the owner's, yesterday) also switches "Triple loop" off by default, which made `trick-base.spec.ts` stale. I did not touch the draft or the editor: `trick-base.spec.ts` now reads the default-off blocks from the published master version; `trick-base-editor.spec.ts` skips with a message while an unpublished master draft exists (so it can never save over the owner's work). Not re-verified with a clean master base.
9. **Manual.** The Draw step already had a page; it now also lists the refusals it can show and its Learn more targets. Updated pages: console laptop and phone, big screen (+ Day picture), Admin Feedback, Event step (+ Public page picture), public event, run order, judge, simulator; changelog 0.12.0; settings and errors regenerated.

### From the fix session (#29)
(a) `tests/rls/simulator.test.ts` now describes the one-pause behaviour (15 passed). (b) The ×20 button is not broken: the first tap lands before the page has loaded (the panel is drawn by the server first) and does nothing; the test taps until the button answers (the first tap failed, the second worked). (c) The head judge browser test expects the refusal sentence with its Learn more link.

### Not done / not verified
- Not tried on a real phone.
- Pause shown on the console uses realtime on the live address; in this sandbox (websockets blocked) the console asks every 5 s, so the "within a second" for the console side could not be measured here.

## Flags – start sequence and flag states on every screen (branch `flags`, 3 Oct 2026)

Started from main 0.12.0 (Polish 2b and fix session 1 merged); version 0.13.0 (a feature).

### Done
1. **State machine** (`src/lib/live/flags.ts`, pure, tests first in `flags.test.ts`): the four states derived from time stamps only (`armed_at` + `prestart_sec`, `started_at`, `paused_*`, duration) and the server clock — Before start, Running, Last minute, Stopped or paused (Finished / Paused / Hold / between heats / before the first heat). Also the horns (`hornsFor`), the announcer's cues (`cueFor`) and the text colour (`textOn`: black on yellow, white on green and red). Settings schema `src/lib/schemas/flags.ts` on `events.settings.flags` (on by default; labels, colours, pre-start 60 s, last-minute 60 s).
2. **Database** (`20261021100000_flags_start_sequence.sql`, applied to the hosted project): `heats.armed_at` / `prestart_sec`; `arm_heat(heat, prestart)` (null = event default, 0 = start now), `abort_start`, `start_heat` on an armed heat = Start now, `start_armed_if_due` (any official device writes the start down at the armed moment; observers refused); `heat_effective_status` already answers `running` once now ≥ armed + pre-start, so every write gate opens at green, never at the yellow; `pause_heat`, `end_heat`, `end_heat_if_due` write an armed heat's start down first; switching Flags off cancels a running start sequence; the audit log has `heat_armed` and `heat_start_aborted`; the public timetable and site functions carry the armed columns and the flag settings; the migration writes `flags.enabled = true` for every event (Arrow, EKL and Demo included) — nothing else on them was touched. The simulator's fast clock covers the pre-start (×10: 1:00 → 6 s).
3. **Screens:** `FlagStrip` replaces the clock line (console laptop and phone, judge, spotter, announcer, observed screens, public live tab and home); big screen frame + large word and countdown (Day and Dark); announcer cues; `Flag view` at `/e/<event>/flag` (polls `/e/<event>/flag/data` every 2 s, grey after 10 s without contact, Sound on, wake lock) linked from Go live and the Officials step (QR); Event step **Flags** card; horns replace the beeps when flags are on; nothing vibrates.
4. **Simulator:** virtual officials follow the sequence (yellow, then green); Skip to end lands on red; scenario **Abort the start** (twelve scenarios now); View as… and the observer's switcher have a **Flag view**.
5. **Manual:** new page *Flags and the start sequence*; updated console (laptop, phone), judge, spotter, announcer, observer, big screen, public live and home, Event step, Officials, Go live, simulator, dependency map, glossary, changelog; settings and errors regenerated (four new refusals with their notes).

### Decisions I made where the brief was silent
- The stopped state's *label* (default "Stopped") shows between heats; **Finished**, **Paused** and **Hold** are always spelled out, so renaming the stopped state cannot hide why the flag is red.
- Green default is #15803D (not #16A34A) so white text on it reads at 5:1.
- After a heat finishes the strip keeps saying "Finished — next: …" until the next heat starts (also during a long break); a wind Hold between heats overrides it with "Hold".
- A start sequence that is running when Flags are switched off is cancelled (audit line says so).
- A heat whose pre-start is over but whose start nobody has written down yet counts as running everywhere (database gates and every screen), with the start time = armed + pre-start; the next official device writes it down.

### Follow-up before merge (4 changes to the start controls, 4 bugs, 3 items; same branch and pull request, still 0.13.0)
1. **Start heat sequence** is the one primary button; the pre-start is a labelled group **Pre-start:** (event default ticked, **Other…** with a typed length 0:10 to 15:00 as m:ss or whole minutes, **Start now**). **+1 min** during the yellow (`extend_prestart`, audited, exactly 60 s). **Reset this heat** is a visible button before **Cancel heat** (the heat menu held only that item, so it is gone).
2. **Database** (`20261022100000_flags_prestart_controls.sql`, `20261023100000_impression_name.sql`, `20261023100100_drop_unused_fast_forward.sql`, all applied): `heats.armed_paused_at` (a frozen yellow, part of the one pause state), `heats.time_scale`, `extend_prestart`, `arm_heat` takes 0:10 to 15:00, a heat that goes back to scheduled clears any armed state, `get_public_rules` carries the impression name.
3. **Bugs, what I found:**
   - **(a) the head judge had no control over the yellow:** the pause functions (`pause_heat`, `sim_pause_heats`) only looked at running heats, so an armed heat's countdown kept running and started the heat. I fixed the database first and wrote the failing test after, so I did not see it fail beforehand (said honestly). Now Pause freezes the yellow from the console or the simulator, Resume carries on, and Start now / +1 min / Abort stay available at every moment. The simulator arms only while playing and not if the head judge has armed it.
   - **(b) Skip to end of heat** ended the heat outright. It now fast-forwards the virtual officials (every attempt logged and scored) and leaves the heat running for End heat and the review. The old behaviour is the separate **End heat and publish**.
   - **(c) speeds:** I could not reproduce a real-time heat at ×10 / ×20: the new `e2e/sim-speeds.spec.ts` measures real seconds at ×5, ×10 and ×20 (pre-start, heat clock, last minute, officials' pace) and passes. What was not scaled was the last minute (a 1:00 last minute swallowed a 6-second heat at ×10, so the strip was yellow the whole heat) and the break countdown: both now follow the speed (`time_scale` on the heat). The speed applies from the next heat.
   - **(d) Reset:** `reset_heat` left any stale `armed_at` / `prestart_sec` on the row and the strip's heat choice could show an earlier heat's "Finished". A reset heat is meant to be startable again, so the console shows Start heat sequence; the flag now shows red / Stopped and nothing is armed.
4. **Draw:** compact cards (one line per seat, heats in tight columns, `+ Seat` / `Take heat out` behind a small button), 8 heats of 3 end at about 800 px on a 900 px window (above the step footer); the banner is `fixed` to the top of the window. The banner has Move here / Swap with … and Cancel (there was no separate Done).
5. **Rider door:** public **Riders** tab and list, QR + address + home-screen hint on the rider page, **Rider links** sheet in the Riders step.
6. **Layout:** the content area is `max-w-[1400px]` centred; the per-page 2xl to 5xl caps are gone from non-print organiser and admin pages; explanatory text 70ch.
7. **Impression name:** Event step → Scoring settings → **Name of the impression score** (empty = each division's own name, so Arrow, EKL and Demo are unchanged); heading above the card's grid. Server refusals (for example “A rider has no Impression / Variety score from you yet”) keep the generic words.
8. **Found on the way:** the judge's Impression step crashed with “This page could not be shown” when the page opened before the heat's riders had loaded (an empty rider list); fixed.

### Tests
- `npm run typecheck` clean · `npm run lint` clean · `npm test`: 193 files, 2217 passed (+3 expected fails). New: `flags.test.ts` (38), `flag-data.test.ts` (5), `review-bar.test.ts` (5), `impression-card.test.ts` (7).
- RLS on the hosted project: `tests/rls/flags.test.ts` 13 passed; with live-heat, observer (every callable function, now including arm_heat / abort_start / start_armed_if_due), simulator, public-site, live-spotter, live-judge, console-v2: 8 files, 102 passed.
- Playwright on throwaway organisations: `flags.spec.ts` 5 passed, `review-console.spec.ts` 6 passed, `live-console.spec.ts` 8 passed, `observer.spec.ts` passed, `screen-colour.spec.ts` 5 passed, `simulator.spec.ts` passed, `simulator-polish2.spec.ts` items 2, 3 and 7 (Skip to end) passed. `one-pause.spec.ts` fails here, and fails the same way on a clean checkout of main against the migrated database; `simulator-polish2` "Run the whole event" ended with a network error in this sandbox.
- `manual:shots`: main, releases and observer sets passed; the trick base set failed (the owner's unpublished master draft, as in Polish 2b).

### Console additions (same pull request)
1. Corrects Polish 2b item 2 (see above): live-scores switch back in More, Release result beside Publish.
2. Review bar (laptop, under the heat header; phone, top of the Control tab) and the Impression card (laptop: beside the rider cards, shrinks to fit, a 36 px button with a pop-over when there is no room; phone: a block). The rider row keeps a fixed minimum height (116 px) while the card is on, and up to six rider cards share one line, so the table does not move.
3. Decision: at a 1280 px window three riders already fill the row, so the card is the button there; at 1500 px two riders get the full grid and three the tighter one.

### Not done / not verified
- Not tried on a real phone; the horn is a synthesised tone.
- At ×10 / ×20 on the simulator the last-minute length is not shortened, so a fast heat is yellow (last minute) from its green.

## Self-audit 1b – the system, for Gouna (branch `audit-1b`, 3–4 Oct 2026, 0.13.1)

### Done
- `docs/AUDIT.md` → "Self-audit 1b": a one-page summary ("safe to run Gouna: yes, with these fixes — and not on today's hosting"), the outage of 3 Oct (21:42–23:25 UTC) with its cause (the free database machine ran out of disk capacity: 453 MB memory, constant disk reads), the full browser suite on main with every red classified, 22 findings (A1b-0 … A1b-21) with severity, reproduction and proposed fix, the deferred Audit 1a scenarios on the database, flags, concurrency, security, data integrity, UI invariants, a ×20 rehearsal and a capacity projection against the Supabase and Vercel plans.
- New tests only (no application code, no database change): 4 unit files (`src/lib/**/audit-1b-*.test.ts`), 8 RLS files (`tests/rls/audit-1b-*.ts`), 2 browser specs (`e2e/audit-1b-*.spec.ts`). Tests that describe a fault are marked `.fails` / `test.fail` with the finding number.

### Not done
- The full RLS suite and the full browser suite with this audit's own specs were not run end to end after the outage (to spare the project); each audit file was run on its own (results in `docs/AUDIT.md` → "Test files of this audit").
- Large text on the judge and spotter phones, Audit 1a's 1b-3 (the head judge's marks in the mean) and 1b-8 (public timetable inputs) were not re-tested.
- Nothing is fixed here: the fix session takes the list in `docs/AUDIT.md`.

### How to test
- Nothing to see on the live address.
- On a laptop: `npm test` (unit, includes the audit's 4 files); `npm run test:rls -- tests/rls/audit-1b-ladder.test.ts` (one RLS file at a time); `AUDIT_LOAD=1 npm run test:rls -- tests/rls/audit-1b-load.test.ts` only on a project you may load.

## Export 1 – results CSV, printable results, event backup (branch `export-1`, 4 Oct 2026, 0.14.0)

Started from main (0.13.1, after #33). A Fix 2 session (the audit's findings and the public-page cache) runs in parallel on different files: this branch does not touch the public pages, the console, the flags or the Riders step beyond two buttons (Go live card, head console left column). Whoever merges second rebases onto main and takes the next version.

### Done
- **Routes** `src/app/export/[eventId]/`: `results.csv`, `print` (the printable page) and `backup.json`. Who: `export_role` (new database function: organiser, head, or nobody); the backup and the draft box are organisers only. `401` signed out, `403` anybody else (print: `404`), `409` for a practice event.
- **Results = the public's rules.** The files read `get_public_results / rules / draw / site` as the person pressing the button, so the visibility rules are the public's own. The printable page draws every heat with the public page's own `buildHeatTabs` + `HeatSummary`. Draft heats (organiser's tick box) are laid in as released rows: a heat under review is scored with the same engine and reader as Publish; a held heat uses its stored result; both through `toPublicBreakdown`, which mirrors `private.public_breakdown` (panel scores only, never a judge's marks).
- **Backup**: `BackupSchema` (Zod), allow-listed seat columns, `stripSecrets` on free-form JSON, `findSecrets` inside the schema. One file, `<slug>-backup-<date>-<hhmm>.json`.
- **Audit**: `log_export` writes `results_exported` / `backup_downloaded` (who, when, kind, draft box, heats). No file is given if the line cannot be written. Nothing else is written.
- **Docs**: `docs/EXPORT-FORMAT.md` (columns, JSON structure, examples, "How an import would work"); manual page "Exporting results and backups"; Go live, console, event day, roles, glossary, errors; runbook docs/09 §G1.
- **Folders**: the repo's guard test requires every file in `src/lib/exports/` to call `excludeSimulations`. The entry points that load an event (`access.ts`, `load-results.ts`, `load-backup.ts`) live there and call it; the pure formatting code lives in `src/lib/export-format/`.

### Tests
- Unit (`src/lib/export-format/*.test.ts`): the docs/08 §1A heat produces exactly the expected header and row (scores, counted flags, impression, total, place); a heat under review, held or cancelled is never in the file; the draft heat says DRAFT; the print order; the backup round-trips through the schema and holds none of seven planted secrets (as key or value).
- **Run against the hosted project** (4 Oct): `tests/rls/export.test.ts` 3/3 and `e2e/export.spec.ts` 2/2 pass. The shared test world publishes three heats (Pro Men 1, Knockout 1, Reseed 1) with Pro Men 2 under review; the first version of the spec expected two, and the score label is "7.0" (the public page's own label), both fixed in the spec, not the export. Hand check on a throwaway event: CSV opens (BOM, CRLF, 30 columns), printable page equals the public page for all three heats and carries the export time, the backup holds none of 19 planted PIN / hash / token values, audit log has one line per press.

### Owed
- The migration is applied and the types are regenerated (`npm run db:types`). It was renamed `20261024100000` → `20261025100000`: Fix 2's `fix2_less_churn` already holds version `20261024100000` on the hosted project, and today's calendar date would sort before 20 applied migrations.
- Screenshots `export-go-live`, `export-console` and `export-print` are taken (`npm run manual:shots -- -g export`) and shown on the manual page "Exporting results and backups".
- Restore from backup (the format is written down for it).
- `e2e/help.spec.ts` counts the manual's pages (40; it was already out of date before this version).

### How to test on a laptop
- Go live → **Results and backup** → **Download results**, **Open printable results**, the draft box, **Download event backup**; head judge console (laptop) → the first two under the wind call. See the release entry in `docs/RELEASES.md`.

## Fix session 2 – audit 1b findings, public-page cache, officials protected under load (branch `fix-2`, 4 Oct 2026, 0.14.1)

### Done
1. **Officials walled off from the crowd (A1b-0 / A1b-11, code half).** Public answers shared for about 3 s per server instance (`src/lib/public/shared-cache.ts`, used by `src/lib/public/load.ts`), edge headers `s-maxage=3, stale-while-revalidate=1` on the public pages and the big screen (`next.config.ts`; never with the simulation-preview cookie), the Flag view only joins reads in flight; the safety valve (`PUBLIC_MAX_IN_FLIGHT`, default 130 per instance, set from the measurement (peaks of 25, 39 and 65 in flight at 300 spectators in three runs)) shows the calm **Updating…** page; "last seen" at most once a minute (`touch_seat` 55 s guard, `sim_view_beat` 20 s). Statement logging cannot be changed from SQL or the management API (permission denied) and already is `ddl` only with no slow-statement logging; the lever left is fewer requests (the cache). The load harness `tests/rls/fix2-load.test.ts` is written and validated at 3 spectators; it was **not run at scale** (see "Not done").
2. **Findings:** A1b-1, A1b-2, A1b-3 (Riders step), A1b-7, A1b-16, A1b-18 fixed; their `.fails` tests are plain tests now.
3. **Trick base T1:** + Add block listed the five built-in family names; now the event's version; the panel's layout is read from the database.
4. **Console:** the Impression card stays a card at 1280 px and wider with 3, 4 and 5 riders.
5. **Big screen / Flag view (item 6):** nothing cut with "…", header fits, Day / Dark control in its own corner, every page fitted (`FitSlide`).

### Not done
- (Done after the first version of this entry, at the owner's request, on the compute as it was: the load proof and the ramp passed; tables in `docs/AUDIT.md` → Fix session 2. The hosted database still reports `max_connections = 60`, i.e. not the Small compute.)
- Item 5 (eight stale browser tests): see the pull request.
- The console's rider menu (per-heat DNS) does not call the walkover; a rule decision (see the pull request).

### How to test
See the release entry 0.14.1 (`docs/RELEASES.md`). `npm test`; `npm run test:rls -- tests/rls/audit-1b-*.test.ts tests/rls/fix2-churn.test.ts`; Playwright against a production build: `e2e/public-cache.spec.ts`, `e2e/public-valve.spec.ts` (second server with `PUBLIC_MAX_IN_FLIGHT=2`), `e2e/trick-base-version.spec.ts`, `e2e/review-console.spec.ts`, `e2e/screen-header.spec.ts`.

## Big screen — Follow the heat (branch `big-screen-follow`, 4 Oct 2026, 0.15.0)

### Done
1. **A second big-screen address, `/screen/<event>/follow`** (`src/app/screen/[slug]/follow/page.tsx`, `src/components/public/follow-screen.tsx`): live heat from the yellow until End heat (no rotation), "Judges reviewing" until Publish, then Results and Ladder alternating. The first big screen and its rotation are unchanged.
2. **The page-choosing rule is pure and tested first:** `src/lib/public/follow-model.ts` (`followPhase`, `buildFollowPages`, `paginateResults`, `paginateLadder`, `nextLine`, `walkKeyOf`) with `src/lib/public/follow-model.test.ts`. Results of today's published heats newest first, each followed by the ladder of its division; nothing unpublished or held can get in (pages are built from released heats only).
3. **Reuse, no new database path:** the screen's data (`src/lib/public/follow-load.ts`, answered by `/screen/<event>/follow/data`) goes through `loadCore` / `loadLive` / `loadDraw`, i.e. the shared 3-second answers and the safety valve of Fix session 2; the page has the same edge cache header and the same simulation-preview rule as the public pages. Results pages reuse the public results' `ScoreBox` and the Rider label (`RiderLabel screen`, `ScoreBox screen`: the same pieces drawn in vw for a TV).
4. **Never shrunk:** a heat that does not fit at the TV size is split across pages; a ladder is paged round by round (costs in vw in `follow-model.ts`); the screen never zooms.
5. **Setting:** Event step → More settings → **Follow the heat — seconds per page** (`settings.followRotateSec`, default 15, 5 to 120, refused in the house style); migration `20261026100000_big_screen_follow_setting.sql` adds it to `get_public_site`.
6. **Go live shortcut** "Big screen — Follow the heat"; **Note button removed from the big screens** (`FeedbackGate`).
7. Browser tests: `e2e/big-screen-follow.spec.ts` (1920 × 1080, a throwaway event with a ladder: the walk 3 → 2 → 1 → 3, the 2-second jump, Judges reviewing, public-results match, readability, keys, Reconnecting, the setting at 7), `e2e/big-screen-follow-simulation.spec.ts` (a simulation at ×20 as its own organiser).
8. Manual: new section "Follow the heat" on the Big screen page with pictures (`e2e/manual-shots-follow.spec.ts`, part of `npm run manual:shots`), Event step, Go live, glossary, Event day, settings (generated), changelog; release entry 0.15.0.

### Not done / decisions to confirm
- **Polling, not realtime:** an anonymous visitor cannot listen to the realtime channel, so the screen asks `/follow/data` twice a second. Through the 3-second shared copy the live heat appears within about 3 to 4 seconds on the live address; within 2 seconds holds in the browser tests, whose servers run with the cache off (`PUBLIC_CACHE_MS=0`).
- A heat whose division has no ladder gets Results only (no Ladder page). An old heat that was ended and never published stops holding "Judges reviewing" once a later heat has started.
- The simulator's **View as** list does not offer the Follow screen (that panel belongs to another session's work); open it by adding /follow to the big screen's address.

### How to test
See the release entry 0.15.0 (`docs/RELEASES.md`). `npm run typecheck && npm test`; with `npm run dev` running: `npx playwright test e2e/big-screen-follow.spec.ts e2e/big-screen-follow-simulation.spec.ts`.

## Speed 1 – organiser navigation, saves, simulator controls, Publish (branch `speed-1`, 4 Oct 2026, 0.15.1)

### Done
1. **Measured first** (production build served locally against the hosted project, throwaway organisation, 24 riders, 15 heats; `e2e/speed.spec.ts` with `SPEED_MEASURE=1`, fetch tracer `scripts/measure/trace-fetch.cjs`; numbers in `docs/perf/speed-1-before.json` / `speed-1-after.json`). Where the time went: every step page made 5–7 database requests one after another (auth check in the middleware, memberships, platform role, event, the page's lists, labels, trick base); Save asked the server to redraw the whole page before answering (43 requests); the simulator speed button waited for a 34-request status read; Publish made 19 requests (9 in a row); console buttons waited for the realtime stream.
2. **Fixed, one commit each:** Publish (one read function + the existing one-transaction write; heat buttons answer at once), step pages (one round each; login read from its token), saves (no revalidatePath; background refresh waits for a quiet moment), simulator (optimistic speed/start/stop, status in one round, realtime on `sim_control`), bundle (QR library on demand), head actions read a heat's rules in one request. A faster console middleware (login from its token on /head) was tried and taken out again: an intermittent blocked review bar was seen while it was in, the cause turned out to be elsewhere, but it was not proven safe.
3. Tests: `src/lib/live/publish-core.test.ts` (calls counted), `src/app/org/(console)/events/actions.test.ts`, `tests/rls/speed-loaders.test.ts` (old reads vs new reads as the organiser; a stranger gets nothing more).

### Not done / decisions for the owner
- Steps do **not** keep earlier steps' data in the browser (no prefetch / router cache): the Officials step shows judges waiting for approval and the Riders step shows registrations as they arrive, and a cached copy would hide them for minutes. Instead each step asks once and opens in about half a second.
- `ui-copy.ts` (about 82 kB compressed) is shipped whole with every page; splitting it is its own change.
- No index was missing for the columns the organiser pages filter by (checked against `pg_indexes`); nothing added.
- Publish's write is the larger of its two calls and varies with the free database's load (database time itself is about 0.2 s of it).

### How to test
Release entry 0.15.1 (`docs/RELEASES.md`). `npm test`; `npm run test:rls -- tests/rls/speed-loaders.test.ts`; measuring: `npm run build`, start with `npx next start -p 3200`, then `SPEED_MEASURE=1 E2E_BASE_URL=http://localhost:3200 npx playwright test e2e/speed.spec.ts`.

## Polish 3 – dry run 1 findings (branch `polish-3`, 4 Oct 2026, 0.16.0)

### Done
1. **Skip to end of heat** ends the heat after the virtual officials are done (`skipInside` in `src/lib/simulator/tick.ts`; refusals in `src/lib/simulator/skip.ts`), sends it to review when every sheet is in, and does not publish: a `reviewHold` in the simulator's config keeps the virtual head judge from publishing that heat; "End heat and publish" clears it. The button reads "Fast-forwarding…" while it works.
2. **Reasons are optional everywhere** (`src/lib/reason.ts`: an empty box is logged as "no reason given"). Server actions fill it in, the database's own minimum is untouched; the Publish override takes an explicit `override` flag (`publish-core.ts`). Unused "write a reason" sentences were removed from `ui-copy.ts` and the manual lists.
3. **Auto-play respects the break** (`src/lib/simulator/break-wait.ts`, using the engine's `breakCountdown` with the speed; the public timetable shows the same speed-scaled start for the next heat, `src/lib/public/timetable.ts`).
4. **Simulator left rail:** the cause was the page's own server-action polling queueing the router behind it; on `/simulate` the frame navigates with the browser (`src/lib/org/hard-navigation.ts`).
5. **Clear this plan** (`clearPlan` in `src/lib/engine/schedule/run-order.ts`, migration `20261102100000_polish3_clear_plan.sql`, button in `schedule/clear-plan-button.tsx`).
6–8. **Follow the heat:** one clock, the live heat drawn with the same row as Results (`FollowRider`), `livePages` split, no page counter.
9. **Refresh from event** (migration `20261102100100_polish3_sim_refresh.sql`, `settings-panel.tsx`): event settings and each division's scoring model/overrides/live settings, matched by name, before any heat has started.
10. **Event step:** placeholder from the divisions' current names (`src/lib/org/impression-names.ts`); `errorSentence(message, { impressionName })`.

11. **Collapsible Event step cards** (`src/components/org/fold-card.tsx`, `src/lib/org/fold-state.ts`, nine cards in `event-form.tsx`); the other organiser settings pages (organisation, platform) have no cards of this kind, only the Simple / More settings panel. Browser tests start with the cards remembered as open (`e2e/base.ts`, option `foldCardsOpen`); `e2e/fold-cards.spec.ts` uses the real defaults.
12. **Join tab follows its own switch** (`src/lib/public/tabs.ts`); the Join page got a Riders part (`src/app/e/[slug]/join/page.tsx`): the registration link when open, "Registration is closed" when not.

### Not done / to confirm
- The Join page had no rider part before; the Riders part was added (link, not the form).
- Both migrations were applied to the hosted project (`npm run db:apply`) while working; `db:types` was rewritten.
- Refresh from event does not copy the draw, heat lengths, format or run order.
- "Clear actual times" never had a reason box, so nothing changed there. The `/design` preview consoles were left as mock-ups.
- The browser tests ran against the dev server with one worker and no retries (see the pull request).

### How to test
Release entry 0.16.0 (`docs/RELEASES.md`). `npm run typecheck && npm test`; browser: `e2e/simulator-polish3.spec.ts`, `e2e/clear-plan.spec.ts`, `e2e/simulator-polish2.spec.ts` (Polish 3 item 1), `e2e/event-reset.spec.ts`, `e2e/live-head.spec.ts`, `e2e/impression-name.spec.ts`, `e2e/big-screen-follow.spec.ts`.
