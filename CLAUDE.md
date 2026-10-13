# CLAUDE.md — Big Air Scoring System

<!-- Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3). Keep this file SHORT; long material lives in docs/. -->

Web app that runs kitesurfing Big Air competitions end to end: organiser sets up event → divisions → riders → judges → format → timetable; spotters log attempts; judges score on phones; head judge reviews and publishes; riders/spectators follow live scores, ladders and the timetable. Every rule (criteria, counting, judge aggregation, formats, breaks) is **configuration** (`presets/`), never code. First live use: Arrow launch event, El Gouna, Egypt. Owner is not a developer — explain decisions in plain language, show evidence (test output), and ask before inventing a rule the spec does not define.

## Stack
Next.js 15 (App Router, TypeScript strict) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Realtime, Storage, RLS) · Zod for all config validation · Vitest (unit) · Playwright (smoke) · Vercel hosting · PWA (installable, mobile-first).

## Commands
- `npm run dev` — local dev (test on phone via laptop IP)
- `npm run typecheck` — `tsc --noEmit`; must be clean before any "done"
- `npm test` — Vitest (engine tests live in `src/lib/engine/**/*.test.ts`)
- `npm run test:e2e` — Playwright smoke tests (needs `npm run dev` running)
- `npm run lint` — ESLint
- `npx supabase db reset` — rebuild local DB from `supabase/migrations` + `supabase/seed.sql`
- `npx supabase db push` — apply migrations to the linked hosted project (blocked in some sandboxes: use `npm run db:apply`, which sends them over HTTPS; `npm run db:combine` writes `supabase/combined.sql` for the SQL Editor)
- `npm run test:e2e:budget` — public pages over a slow phone connection against the production build (transfer, scripts, requests, paint time); needs `npm run build` and `npx next start -p 3200`, then `E2E_BASE_URL=http://localhost:3200`
- `npm run preview:public -- create` / `-- remove <code>` — a throwaway public event on the hosted project to look at on a real phone
- `npm run test:rls` — Row Level Security tests against the hosted dev project (separate from `npm test`; skips without keys)
- `npm run seed:demo` / `npm run bootstrap:organiser -- --email … --org-name … --org-slug …` — demo draw / create the organiser login + organisation (name and slug are required)
- `npm run auth:password` — enables email + password sign-in for organisers in the hosted auth settings (Management API; idempotent)
- `npm run bootstrap:platform-admin -- --email …` — make an existing login the platform owner (`--role staff` for staff); with no `--email` it uses the only owner of organisation `arrow`
- `npm run db:types` — rewrite `src/lib/supabase/database.types.ts` from the hosted schema (run after every migration)
- `npm run seed:presets` — upsert `presets/**/*.json` into `scoring_models` / `format_templates` / `presets` (identification schemes, schedule templates)
- `npm run manual:generate` — rewrite the generated tables of the product manual (settings, errors, troubleshooting index) from the code; `npm run manual:shots` — retake every manual screenshot (throwaway organisation on the hosted project, needs `npm run dev`)

## Repo layout
```
src/app/            routes (App Router). Public: / , /e/[eventSlug]/... , /o/[orgSlug] , /design (look-and-feel preview, Phase 5a) ; organiser: /org/... ; platform owner: /admin/... (404 for everybody else) ; judge: /judge/... ; head: /head/... ; spotter: /spot/... ; screen: /screen/...
src/lib/public/     what the public pages show: loaders (public functions only, as a visitor), timetable states, heat tabs, ladder, placings, rules text, rider page, big-screen pages (pure + tests)
src/lib/engine/     PURE logic, no I/O: scoring/, ladder/, schedule/ (+ tests). Import nothing from Supabase or React here.
src/lib/schemas/    Zod schemas for ScoringModel, FormatTemplate, Schedule (single source of truth for types)
src/lib/supabase/   clients (server, browser, service), typed helpers
src/components/     UI; src/components/live/ for realtime widgets
supabase/migrations  SQL migrations; supabase/seed.sql dev data
presets/            scoring/*.json formats/*.json schedule/*.json identification/schemes.json tricks/big-air-vocabulary.json (validated by Zod on load and in tests)
docs/               specs; docs/STATUS.md = running progress log (update at end of every phase); docs/RELEASES.md = one entry per version (rule 10)
docs/manual/        the product manual (Markdown + img/), rendered in the product at /help; README.md says how to update it
```

## Golden rules (IMPORTANT)
1. **Engine purity:** `src/lib/engine` is deterministic and side-effect free; every public function returns a breakdown that explains the number. Write/extend tests in `docs/08-TEST-SCENARIOS.md` terms BEFORE implementing; the exact expected values there are authoritative.
2. **No hard-coded rules.** If a behaviour could differ between events (criteria, weights, counting, judges, formats, durations, breaks, colours, penalties), it is a field in a Zod schema with a default, exposed in the organiser UI.
3. **Server time is truth.** Heat timers use `started_at` from the database; clients compute remaining time from server timestamps (never from device clocks alone). Store UTC; display in the event's time zone (`events.timezone`, e.g. `Africa/Cairo`).
4. **Security:** RLS on every table. Judges/spotters/head judge authenticate by per-event PIN/QR (anonymous Supabase session bound to a `judge_seats` row); organisers by magic link. Service-role key only in server code. Never commit `.env*`.
5. **Auditability:** every score create/edit/delete writes `audit_log` (who, before, after, when, reason). Published results are snapshotted in `heat_results`.
6. **Resilience:** score submissions go through a client queue with retry + idempotency key; UI shows pending/synced state. Publishing is blocked while required scores are missing unless the head judge explicitly overrides (recorded).
7. **Mobile first:** judge/spotter screens are one-thumb, high contrast for sunlight, sizes and rules per docs/06 §00 (beach readability standard: pad buttons ≥56px, taps only), works in Safari iOS and Chrome Android. Rider identification follows the event's configurable scheme (lycra colour per heat, fixed lycra, bib number, kite brand/model/size/colours, rash guard, photo, name call-out — docs/06 §0, presets/identification): one shared RiderLabel component everywhere, colour always shown as text too, never assume vests exist.
8. **Wording:** every user-facing string lives in `src/lib/ui-copy.ts`, never inline in a component. House words (a test enforces them): "Rider label", "Lycra", "score", "Impression / Variety score"; never the old words for them. Every setting has a "?" (tap) with one sentence and an example.
9. **The manual is part of the product.** Every PR that changes a screen, a setting, a sentence or a rule updates the manual pages it touches (docs/manual), retakes their screenshots (`npm run manual:shots`), and adds a changelog line (docs/manual/changelog.md). Run `npm run manual:generate` after changing ui-copy.ts, a schema or a migration's error codes; a new refusal sentence gets its meaning and fix in `scripts/manual/error-notes.ts`. Tests fail when a refusal sentence, a database code or a setting is missing from the manual. Product version = `package.json` version (1.0.0 after the Arrow launch).
10. **Every PR is a release.** Before a PR is ready to merge it raises `version` in package.json (fix +0.0.1, feature +0.1.0; rebase onto main first so the number follows the last merged one) and adds its entry at the top of `docs/RELEASES.md`: version, date, `PR: #number`, "What changed" in plain words for the owner, "What to test" as 3–8 `- [ ] ` checks a non-developer can do on the live address in 15 minutes (a PR that changes no screen — tests only, docs only — still bumps and adds an entry, and may write the single line "Nothing to test on the live address." instead), "Known issues". The matching `docs/manual/changelog.md` entry links to it (`/admin/releases#release-x-y-z`). A unit test fails if package.json's version has no entry. The owner ticks the checks at /admin/releases.
11. **Dependencies:** the stack above plus shadcn/ui's helper packages (Radix UI primitives, class-variance-authority, clsx, tailwind-merge, lucide-react, tailwindcss-animate) are pre-approved; anything else, ask first.

## Design rules (every session, and any design skill, follows these; where a design skill disagrees, these win)
The look of the product is the owner's brand, shared with his Instagram (Sendbook). It is decided; do not "improve" it away.
- **Brand, fixed:** near-black #111111, white #FFFFFF, grey #B0B0B0, and **teal** as the one accent (Day #0F5C57 with white text, Dark #5FD3C6 with #04211E text; both pass 7:1). Every button, every selected state, every focus ring and every progress bar is teal. **Orange appears only in the Sendbook logo (#FF6A00) and in "Needs your score"** (the bar, the tag border and the glow; the words stay ink at 7:1). In Day that orange is the deeper **#E65F00** (3.5:1 on white; #FF6A00 is only 2.87:1); in Dark it is #FF6A00 (7.31:1 on black). Font: Rubik (Bold for headings, rider names, heats, timers, scores; Regular/Medium for the rest). Never replace any of it, never add another colour, font or decoration.
- **Day is the default on every page** (the front door too) and must read in full sun. Dark is an option, never the only mode, and the Daylight / Dark choice is the same everywhere (kept on the device).
- **Contrast:** essential text at least 7:1, other text 4.5:1; bars and states that carry meaning at least 3:1 (that includes the orange "Needs your score" bar, glow and outline). A test computes this from the tokens (`src/lib/live/theme-tokens.test.ts`).
- **Never colour alone:** words or icons always. **Red only** for crashes, lycra and destructive buttons that also say what they do in words (a quiet red outline at rest; solid red only in the confirm dialog).
- **Controls at rest are flat:** white (Day) or near-black (Dark) with a thin light-grey edge. No grey fill, no thick dark outline (selected = teal fill or teal frame). A control that cannot be pressed keeps its shape with faded words, never a grey block. The score pad keys keep their light-grey fill. Rows with thin dividers instead of boxed cards.
- **Motion:** at most one thing moves on a screen; transitions about 150 ms; reduce motion is respected.
- **Sizes:** tap targets at least 44 px, with one owner-approved exception: the stacked pairs beside the trick name (Missed over Flag on a judge's line, L | R over Crash on a spotter's line) are at least 32 px tall and fill their column. Text inside boxes at least 16 px. The trick name is the main thing on both Rider sheets (at least 20 characters visible on the spotter's, wrapping to two lines on the judge's). The Rider sheets show header, rider cards and 7 lines at 390 × 844 in Normal without scrolling; if they do not, shrink the stacked buttons, never the trick name.
- **The flag strip** (the flag's colour, the timer and its full words) has its own full-width row on every officials' screen and on the console; nothing sits beside it, and long words wrap instead of ending in "…".
- **Words:** no wording changes without the copy test (`src/lib/ui-copy.ts`, `ui-copy.test.ts`). The product is called **Sendbook**; "Big Air" stays only where it names the sport.
- **Design skill:** `.claude/skills/frontend-design` (Anthropic, Apache-2.0, unchanged) may be used for design passes. Its "avoid near-black with one bright accent" does not apply: that palette is the brand. Make screens distinctive through type scale and weight, spacing, rhythm and one signature element (the scoreboard header bar), not through new colours.

## Workflow rules
- Start each phase by reading `docs/STATUS.md` and ONLY the docs the prompt references. Use plan mode for multi-file work; keep plans short.
- Small commits per phase: `feat(engine): ...`, `feat(ui): ...`, `fix: ...`, `docs: ...`. Push after each green phase (Vercel deploys `main`).
- Before saying done: `npm run typecheck && npm test` pass; show the summary lines; list files changed; update `docs/STATUS.md` (done / not done / how to test on phone), the manual (rule 9) and the version + release entry (rule 10).
- When the spec is ambiguous, list the options with a recommendation and ask — do not silently pick.
- Explain in plain language; the owner is a competition judge, not an engineer.

## Domain glossary
Event → Divisions → Rounds → Heats → Slots (riders shown as a RiderLabel per the identification scheme: vest colour / bib number / kite / rash guard). Attempt = one trick by one rider (logged by spotter/judge; landed | crashed). Judge trick score (from criteria or single mark) → Panel score (mean / trimmed mean / median) → Counted tricks (best N / best per category / single best) + Impression → Heat total → Rank (tie-breakers) → Ladder progression → Timetable (anchors, durations, breaks, wind holds). Modifiers: DNS, DNF, DSQ, INT. Head judge = reviews/overrides/publishes; optional.

## Gotchas
- Never `select *` from `events` or `judge_seats` in client code: the PIN/QR hash columns are unreadable by design, so name the columns.
- Supabase Realtime: tables need `alter publication supabase_realtime add table ...`; filter subscriptions by `heat_id`.
- Supabase free projects pause after ~7 days idle — don't be surprised locally; the owner wakes it before the event.
- Use `numeric(5,2)` for scores in SQL; in TS keep full precision and round only for display/ranking as the spec says.
- Time zones: never construct dates from local strings without the event tz; use `Intl.DateTimeFormat` / `date-fns-tz`-free approach with explicit offsets is fine.
- iOS Safari: no `Notification` API in PWA without permission; keep the heat timer visible, not audio-dependent (optional beep behind a tap).
