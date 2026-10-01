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
