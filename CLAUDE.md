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
- `npm run test:rls` — Row Level Security tests against the hosted dev project (separate from `npm test`; skips without keys)
- `npm run seed:demo` / `npm run bootstrap:organiser -- --email … --org-name … --org-slug …` — demo draw / create the organiser login + organisation (name and slug are required)
- `npm run seed:presets` — upsert `presets/**/*.json` into `scoring_models` / `format_templates` / `presets` (identification schemes, schedule templates)

## Repo layout
```
src/app/            routes (App Router). Public: /e/[eventSlug]/... ; organiser: /org/... ; judge: /judge/... ; head: /head/... ; spotter: /spot/... ; screen: /screen/...
src/lib/engine/     PURE logic, no I/O: scoring/, ladder/, schedule/ (+ tests). Import nothing from Supabase or React here.
src/lib/schemas/    Zod schemas for ScoringModel, FormatTemplate, Schedule (single source of truth for types)
src/lib/supabase/   clients (server, browser, service), typed helpers
src/components/     UI; src/components/live/ for realtime widgets
supabase/migrations  SQL migrations; supabase/seed.sql dev data
presets/            scoring/*.json formats/*.json schedule/*.json identification/schemes.json tricks/big-air-vocabulary.json (validated by Zod on load and in tests)
docs/               specs; docs/STATUS.md = running progress log (update at end of every phase)
```

## Golden rules (IMPORTANT)
1. **Engine purity:** `src/lib/engine` is deterministic and side-effect free; every public function returns a breakdown that explains the number. Write/extend tests in `docs/08-TEST-SCENARIOS.md` terms BEFORE implementing; the exact expected values there are authoritative.
2. **No hard-coded rules.** If a behaviour could differ between events (criteria, weights, counting, judges, formats, durations, breaks, colours, penalties), it is a field in a Zod schema with a default, exposed in the organiser UI.
3. **Server time is truth.** Heat timers use `started_at` from the database; clients compute remaining time from server timestamps (never from device clocks alone). Store UTC; display in the event's time zone (`events.timezone`, e.g. `Africa/Cairo`).
4. **Security:** RLS on every table. Judges/spotters/head judge authenticate by per-event PIN/QR (anonymous Supabase session bound to a `judge_seats` row); organisers by magic link. Service-role key only in server code. Never commit `.env*`.
5. **Auditability:** every score create/edit/delete writes `audit_log` (who, before, after, when, reason). Published results are snapshotted in `heat_results`.
6. **Resilience:** score submissions go through a client queue with retry + idempotency key; UI shows pending/synced state. Publishing is blocked while required scores are missing unless the head judge explicitly overrides (recorded).
7. **Mobile first:** judge/spotter screens are one-thumb, high contrast for sunlight, sizes and rules per docs/06 §00 (beach readability standard: pad buttons ≥56px, taps only), works in Safari iOS and Chrome Android. Rider identification follows the event's configurable scheme (vest colour per heat, fixed lycra, bib number, kite brand/model/size/colours, rash guard, photo — docs/06 §0, presets/identification): one shared RiderChip component everywhere, colour always shown as text too, never assume vests exist.
8. **Dependencies:** the stack above plus shadcn/ui's helper packages (Radix UI primitives, class-variance-authority, clsx, tailwind-merge, lucide-react, tailwindcss-animate) are pre-approved; anything else, ask first.

## Workflow rules
- Start each phase by reading `docs/STATUS.md` and ONLY the docs the prompt references. Use plan mode for multi-file work; keep plans short.
- Small commits per phase: `feat(engine): ...`, `feat(ui): ...`, `fix: ...`, `docs: ...`. Push after each green phase (Vercel deploys `main`).
- Before saying done: `npm run typecheck && npm test` pass; show the summary lines; list files changed; update `docs/STATUS.md` (done / not done / how to test on phone).
- When the spec is ambiguous, list the options with a recommendation and ask — do not silently pick.
- Explain in plain language; the owner is a competition judge, not an engineer.

## Domain glossary
Event → Divisions → Rounds → Heats → Slots (riders shown as a RiderChip per the identification scheme: vest colour / bib number / kite / rash guard). Attempt = one trick by one rider (logged by spotter/judge; landed | crashed). Judge trick score (from criteria or single mark) → Panel score (mean / trimmed mean / median) → Counted tricks (best N / best per category / single best) + Impression → Heat total → Rank (tie-breakers) → Ladder progression → Timetable (anchors, durations, breaks, wind holds). Modifiers: DNS, DNF, DSQ, INT. Head judge = reviews/overrides/publishes; optional.

## Gotchas
- Never `select *` from `events` or `judge_seats` in client code: the PIN/QR hash columns are unreadable by design, so name the columns.
- Supabase Realtime: tables need `alter publication supabase_realtime add table ...`; filter subscriptions by `heat_id`.
- Supabase free projects pause after ~7 days idle — don't be surprised locally; the owner wakes it before the event.
- Use `numeric(5,2)` for scores in SQL; in TS keep full precision and round only for display/ranking as the spec says.
- Time zones: never construct dates from local strings without the event tz; use `Intl.DateTimeFormat` / `date-fns-tz`-free approach with explicit offsets is fine.
- iOS Safari: no `Notification` API in PWA without permission; keep the heat timer visible, not audio-dependent (optional beep behind a tap).
