# 07 — Build Prompts for Claude Code (paste one phase per session)

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack

**How to use:** open a terminal in the repo, run `claude`, set the model shown, paste the prompt, approve the plan when asked, test on your phone, ask for fixes, then have it commit/push, then `/clear`. Each prompt is self-contained and tells Claude which files to read (with `@`), what "done" means, and to show evidence. Do not paste doc contents — the `@` references do that on demand.

Before Phase 0, copy `CLAUDE.md`, `docs/`, and `presets/` from this pack into the empty repo folder (locally) or upload them to the GitHub repository (cloud path).

> ### Cloud sessions — read this first (claude.ai/code, no install)
> - One phase = one session = one branch + pull request. **Merge each PR before starting the next phase.**
> - Claude runs `npm test`, `npm run typecheck` and `npm run build` inside its own cloud environment and reports the results; you never run commands yourself. Where a prompt says "show me", read the session summary and the PR description.
> - Where a prompt says "run the dev server / open on your phone", use the **Vercel Preview link** the Vercel bot posts on the PR.
> - **Phase 0 cloud variant**: the repository already exists with the blueprints uploaded, so replace step 6 of the Phase 0 prompt with: "Commit on a branch `phase-0-scaffold` and open a pull request titled 'Phase 0 – scaffold'." Skip "init git" and the push instructions.
> - **Phase 3 cloud variant**: there is no local Supabase (no Docker in the sandbox). Add to the prompt: "Apply the migrations to the hosted project with `npx supabase link --project-ref $SUPABASE_PROJECT_REF` and `npx supabase db push` (token and DB password are in the environment). If the network blocks this, write `supabase/combined.sql` containing all migrations + seed for me to paste into the Supabase SQL Editor, and tell me. Run the RLS tests against the hosted project using the anon and service-role keys from the environment."
> - **Phase 5/6**: if Playwright or Lighthouse cannot run in the sandbox, keep the test files in the repo, note it in STATUS.md, and rely on the preview link for the manual checks.
> - **Phase 8**: the dry run targets the hosted project with an event slug starting `dryrun-`; include an `npm run dryrun:clean` script that deletes only `dryrun-*` events.
> - Steering: you can type into a running session ("stop — dark mode for judges", "use the KOTA preset in the seed"); it adjusts without restarting.

---

## Phase 0 — Scaffold, deploy hello-world (model: `sonnet`, ~30 min)

```
Read @CLAUDE.md and @docs/05-ARCHITECTURE-DATA-MODEL.md sections 1–4. Then scaffold this project:

1. Create a Next.js 15 app (App Router, TypeScript strict, Tailwind, ESLint) in the current folder; add shadcn/ui (button, card, input, dialog, tabs, badge, table, toast), Zod, Vitest, Playwright (one smoke test), and the Supabase JS client with SSR helpers. No other dependencies.
2. Create the folder layout from CLAUDE.md, an empty src/lib/engine with index files, and a placeholder home page that shows the product name from an env var (NEXT_PUBLIC_PRODUCT_NAME, default "[PRODUCT_NAME]") and "Build OK".
3. Add npm scripts: dev, build, typecheck, test, test:e2e, lint, seed:presets (stub for now).
4. Create .env.example listing every env var we will need (Supabase URL, anon key, service role key, product name, default timezone Africa/Cairo) and make sure .env* is git-ignored.
5. Create docs/STATUS.md with a "Phase 0 – done / next" section.
6. Init git, commit "chore: scaffold", and print the exact commands I must run to push to my GitHub repo and import it in Vercel (I will paste the env vars into Vercel myself).

Done means: `npm run typecheck`, `npm test`, `npm run build` all pass — show me the summary lines — and the dev server renders the placeholder page.
```

After it finishes: push to GitHub, import the repo in Vercel, add the env vars, confirm the deployed URL loads. Then `/clear`.

---

## Phase 1 — Scoring engine + presets + tests (model: `opusplan`, plan mode first, ~1.5 h)

```
Enter plan mode. Read @CLAUDE.md, @docs/03-SCORING-ENGINE-SPEC.md, @docs/08-TEST-SCENARIOS.md section 1, and the six files in @presets/scoring/. Plan the implementation of the scoring engine in src/lib/engine/scoring and the Zod schema in src/lib/schemas/scoring-model.ts. Keep the plan short: files, functions, test files. Then stop and show me the plan.
```
Approve the plan (Shift+Tab out of plan mode) and send:
```
Implement the plan test-first:
1. Write Vitest tests that encode EVERY worked example and edge case in @docs/08-TEST-SCENARIOS.md section 1 with the exact expected numbers (rounding to 2 decimals as specified). Also add a test that every JSON in presets/scoring parses with the Zod schema.
2. Implement parseScoringModel, judgeTrickScore, panelScore, computeHeat, rankHeat, explain exactly as in the spec's Public API. Pure functions only.
3. Run `npm test` until green, then `npm run typecheck`. Show me the test summary and the list of files.
4. Update docs/STATUS.md and commit "feat(engine): scoring engine + presets".
If any expected number in the scenarios seems inconsistent with the spec, do not change the number — stop and tell me which one and why.
```

---

## Phase 2 — Ladder + timetable engine (model: `opusplan`, plan mode first, ~1.5 h)

```
Enter plan mode. Read @CLAUDE.md, @docs/04-FORMAT-LADDER-SPEC.md, @docs/08-TEST-SCENARIOS.md sections 2–3, the files in @presets/formats/ and @presets/schedule/. Plan src/lib/engine/ladder (expandFormat, applyHeatResult, divisionPlacings, generators) and src/lib/engine/schedule (computeTimetable with anchors, actual starts, holds, plan switching), plus Zod schemas in src/lib/schemas/format-template.ts and schedule.ts. Show me the plan, then stop.
```
Approve, then:
```
Implement test-first from @docs/08-TEST-SCENARIOS.md sections 2–3: exact heat compositions for snake seeding at N = 7, 8, 10, 12, 16, 18, 24; the KOTA dingle ladder at 18; Megaloop men 16 and women 6; pools_to_final at 23; withdrawal before/after draw; correction conflict; and the Kitemania timetable rows including the 14:00 re-anchor, both alternative plans, and the 15:10 late-start cascade. All presets must parse. Run tests and typecheck until green, show summaries, update docs/STATUS.md, commit "feat(engine): ladder + timetable engine".
```

---

## Phase 3 — Database, security, auth (model: `sonnet`, ~1.5 h)

```
Read @CLAUDE.md and @docs/05-ARCHITECTURE-DATA-MODEL.md fully. Then:
1. Write Supabase SQL migrations for every table in section 5 (organisations, memberships, events, divisions, riders, entries, scoring_models, format_templates, rounds, heats, heat_slots, judge_seats, panels, panel_members, trick_attempts, trick_scores, impression_scores, penalties, heat_results, schedule_plans, wind_calls, audit_log) with indexes, updated_at triggers, and the audit trigger for trick_scores/impression_scores/heat_results.
2. Enable Row Level Security on every table and write the policies in section 6 exactly (organiser role by membership; judge/spotter/head via judge_seats bound to auth.uid(); public read of published data and of live heats when the event setting allows).
3. Enable Realtime on heats, heat_slots, trick_attempts, trick_scores, impression_scores, heat_results, schedule_plans, wind_calls.
4. Implement auth: organiser magic-link sign-in; "Join as official" page where a person enters the event PIN (or scans a QR) → anonymous sign-in → bound to a judge_seats row (name + role). Officials never need email.
5. Implement `npm run seed:presets` to upsert presets/**/*.json as system presets (organisation_id null).
6. Write a seed.sql with one demo event (3 divisions, 20 riders, 3 judges + head judge) for local testing; make `npx supabase db reset` work.
Done means: migrations apply cleanly locally, seed works, an RLS test script (Vitest, using the service client vs anon client) proves a judge cannot write scores to a heat they are not on. Show evidence, update STATUS.md, commit.
```

---

## Phase 4 — Organiser console (model: `sonnet`, ~2 h)

```
Read @CLAUDE.md, @docs/06-SCREENS-UX.md sections 1–3, and @docs/04-FORMAT-LADDER-SPEC.md sections 2–5 and 7. Build the organiser console under /org:
1. Event wizard: create event (name, slug, location, dates, timezone, branding logo URL, public live-scores setting, rider identification scheme picked from presets/identification/schemes.json with editable palette and per-division override — see docs/06 §0) → divisions (name, scoring preset picker with "duplicate & edit" JSON form built from the Zod schema, format template picker with parameters, judges min/max) → riders (add manually, paste CSV, or import from registrations; fields per spec including identifier columns — bib, lycra colour, kite brand/model/size/colours, rash guard, photo; show each rider's RiderChip as judges will see it; seed order via drag) → officials (add judges/spotter/head judge, generate PIN + QR, assign panel per division, toggle "head judge also scores") → Generate draw (calls expandFormat; shows bracket with vest colours; manual drag override) → Run order & timetable (drag heats/breaks, set anchors, duplicate plan, activate).
2. Public rider self-registration page /e/[slug]/register (name, email, phone, nationality, division, sponsor, consent) creating an entry in status "registered"; organiser approves → "confirmed".
3. Dashboard: today's timetable, live heat, quick links/QR codes for judge join, public scoreboard, big screen.
Use server actions with Zod validation; every write is RLS-checked. Mobile-friendly but desktop-optimised.
Done means: with the seed data I can create a new division, import 10 riders from CSV, generate a heats-of-4 draw, build a run order with two anchors and see the timetable computed. Show me a short walkthrough (routes to open) and update STATUS.md, commit.
```

---

## Phase 5 — Live heat operations: judge, head judge, spotter (model: `opusplan`, plan mode first, ~3 h)

```
Enter plan mode. Read @CLAUDE.md, @docs/06-SCREENS-UX.md sections 4–6, @docs/03-SCORING-ENGINE-SPEC.md section 8, @docs/05-ARCHITECTURE-DATA-MODEL.md sections 7–8. Build one shared RiderChip component from the identification scheme (docs/06 §0) and use it on every official screen. Include the spotter trick builder (direction · count · base trick · modifiers → consistent name + derived category) and the per-rider attempt cap counter (docs/06 §5, docs/03 maxAttemptsPerRider); read @docs/11-LESSONS-FROM-PREVIOUS-APP.md section 2 for the behaviours to keep. Plan the realtime heat flow: heat state machine (scheduled → running → paused → ended → under_review → published), server-timestamp timer, spotter attempt logging, judge scorecard with the submission queue (idempotency key, retry, pending/synced badge), head judge matrix (attempts × judges) with missing/outlier flags, edits with reason, flag-out, publish → heat_results snapshot → ladder progression → timetable actual start. Show the plan, then stop.
```
Approve, then:
```
Implement the plan. Requirements to verify before "done":
- Two phones as judges + one as spotter + a laptop as head judge, on the seeded demo heat: spotter logs an attempt for Red → both judges see it within 1 s and score it → head judge sees both marks and the panel score → head judge ends heat → judges enter impression → head judge publishes → results page shows totals equal to computeHeat's breakdown → next-round slot fills with the winner → timetable shows actual start time and cascades.
- Judges' and spotters' phones open the heat automatically when the head judge presses Start (no navigation).
- Spotter logs via the trick builder (direction · multiplier · base trick · modifiers, combinable), via typed text and via speech where the browser supports it (vocabulary and aliases from @presets/tricks/big-air-vocabulary.json); a CRASH button logs the intended trick with no score.
- Two spotters logging the same rider within 20 s → the head judge sees a *possible duplicate* and can delete or merge; deleted attempts disappear from judges' phones and from counters immediately.
- A judge pressing **Missed** is excluded from that attempt's average and shown as missed in the matrix without blocking publish.
- At heat end every judge must enter the variety/impression mark for every rider; Publish stays blocked (with the list of who is missing) until they do, unless the head judge overrides with a reason.
- Kill the network on a judge phone for 20 s while scoring → marks show "pending" then sync with no duplicates.
- Missing score → publish blocked with a clear list; override requires a reason and is audited.
Write Playwright smoke tests for the happy path using the seed. Show test output, update STATUS.md, commit "feat(live): heat operations".
```

---

## Phase 6 — Public pages and big screen (model: `sonnet`, ~1.5 h)

```
Read @CLAUDE.md, @docs/06-SCREENS-UX.md sections 7–9 and @docs/11-LESSONS-FROM-PREVIOUS-APP.md. Build the public site under /e/[slug]: a /join role-picker page with deep links per role, an auto-generated /rules page from each division's scoring model and format, an identification legend, result rows that print the formula in words with counted chips highlighted and CRASH chips in red, a leaderboard that defaults to the live heat, a public organisation page /o/[orgSlug] listing events, plus: event home (branding, wind call banner, today's timetable with est./pinned/live states and "Up next"), live heat (riders by vest colour, running totals if the event allows live scores, counted tricks + impression, timer), draw/ladder per division, results per heat with breakdown, final placings, rider page (their heats, ready-call times, results), and /screen/[slug] big-screen mode that auto-rotates live heat → timetable → last results every 20 s with sponsor logos (Arrow, WOO placeholders) and a QR code to the public site. All realtime, no login, fast on mobile data. Add Open Graph tags for WhatsApp sharing.
Done means: Lighthouse mobile performance ≥ 80 on the live heat page with seed data; a change published by the head judge appears on the public page within 2 s. Update STATUS.md, commit.
```

---

## Phase 7 — Hardening, exports, WOO module, branding (model: `sonnet`, ~2 h)

```
Read @CLAUDE.md, @docs/03-SCORING-ENGINE-SPEC.md section 3 (heightSensor) and @docs/09-EVENT-DAY-RUNBOOK.md. Implement:
1. Height sensor module: organiser toggle per division (off by default); when on with source "manual", the spotter/head judge can enter metres per attempt; "display" mode shows heights and a Highest Jump leaderboard; "height_criterion" mode auto-fills the Height criterion from the mapping and locks it for judges. Unit-test the mapping.
2. Exports: heat results and final placings to CSV and printable PDF; timetable to PDF/PNG in the Division/Session/Start/Duration/End/Break layout; paper judge sheets PDF per heat (rider colours, 10 attempt rows, criteria columns) for the fallback.
3. Wind call banner (red/amber/green + message) editable by the organiser, shown everywhere public.
4. Head judge "re-open heat" with audit; per-judge agreement report (average absolute difference from panel per judge).
5. Branding: event logo + sponsor strip; product name placeholder.
6. PWA manifest + icons so officials can add the app to the home screen.
Done means: tests green, exports open correctly, WOO toggle switches the judge screen behaviour live. Update STATUS.md, commit.
```

---

## Phase 8 — Dry run and event readiness (model: `sonnet`, ~1 h)

```
Read @docs/09-EVENT-DAY-RUNBOOK.md. Create a script `npm run dryrun` that resets the local DB, creates an event "Arrow Big Air Gouna – Dry Run" with two divisions (Pro Men: KOTA preset, dingle ladder at 9 riders; Amateur: club-quick-best2 preset, pools_to_final at 12 riders), 3 judges + head judge, a run order with one anchor at 10:30 and a lunch break, and prints the join PINs and URLs. Then walk me through the runbook steps 1–12 against the running app and fix anything that does not match. Finally produce docs/EVENT-DAY-CHECKLIST.md (one page) and update STATUS.md. Commit and push.
```

---

## Sendbook support agent

The support agent answers questions about Sendbook from the product manual (docs/manual). It runs in two places with one text: **Ask Sendbook** inside the product (the Ask button; `POST /api/ask` sends the manual pages that match the question and the live context of the person's screen) and a **Claude Project** for the owner (add the docs/manual pages as the Project's knowledge). The source of the text is `docs/manual/ASK-INSTRUCTIONS.md` (the owner's text, 3 Oct 2026); the block below must stay identical to it (a test checks).

**Project instructions:**
````
You are Ask Sendbook, the in-product assistant of Sendbook, a web app for running kitesurfing Big Air competitions: an organiser sets up an event (Event → Divisions → Riders → Officials → Draw → Run order → Go live), officials join with a PIN on their phones (head judge console, judges' scoring queue, spotters' trick logger, announcer, observer), the head judge reviews and publishes each heat, and riders and spectators follow a public page and a big screen. The person asking is usually the head judge or an organiser, standing on a beach in the sun with a phone, between heats, with seconds to spare — or an official who is lost on a screen.
Your knowledge is (1) the manual pages supplied with each question — the app picks the pages that match, and always includes the dependency map and the errors appendix — and (2) the live context supplied with each question: the screen, the role, the event, division, heat and its status, the readiness checklist rows and their state, the last refusal sentence shown on this screen, and the product version. Answer ONLY from these. Never invent a button, setting, page or rule that the manual does not describe. If the supplied pages do not cover the question, say "The manual doesn't cover this" in the first line, name the page that would ("open Help and search for Organiser: Run order") and suggest a Feedback note. Never repeat PINs, e-mail addresses or another judge's scores, even if they appear in the context.
How to answer: 0. Understand before you fix. The live context usually tells you which screen, which role, which heat and what the screen says — use it instead of asking. Ask only when the context does not settle which of two causes applies, and then ask the fewest questions that separate them (usually one or two, in one message, as a short numbered list), saying why you ask ("Two causes look the same here; tell me: 1. Is the heat Ended or Under review? 2. Does the Judges column show a judge as Not submitted?"). If a refusal sentence is in the context or in the question, use it: it usually identifies the cause directly in the errors appendix. If the question is already precise, do not ask — answer. If the person says they are mid-heat or in a hurry, give the most likely fix immediately and put the questions after it.

1. Then give a detailed step-by-step fix: numbered steps, one action per step, each naming the screen, the exact button or field, and what the person should see after the step ("4. Press Lock draw — the pill turns to Locked and the console's Start button wakes up"). When there are two reasonable ways, give the recommended one first and say why, then the alternative in one line. End with how to confirm it worked, and what to do if it did not (the next most likely cause).
2. For "why is X grey / blocked / missing / not showing", answer from the dependency map first: name what must be true, which one is probably false (the readiness rows in the context often show it), and where to fix it. Quote the exact refusal sentence from the errors appendix when one is involved.
3. Always name the page of the manual you used, like this at the end: (Manual: Dependency map › Start heat). Quote the manual's sentence when precision matters (numbers, limits, who may do what).
4. Length follows the situation: a quick "which button" question gets a two-line answer; a problem gets the full diagnosis and step list. No preambles, no "great question".
5. Use the product's words exactly: Rider label, Lycra colour, run order, plan, pin, Hold, Shift, drift, publish, re-run, reset, scores (never "marks"), Impression / Variety score, head judge, judge, spotter, announcer, observer.
6. Distinguish roles: if an action is head-judge-only or organiser-only, say who can do it and where they are (laptop console vs phone vs organiser screen). If the person's own role cannot do it, say who to call.
7. Safety: for anything that wipes or changes results (Reset event, Reset this division, Reset this heat, Re-open, Re-run, Cancel, Clear actual times, Delete), state in one line what it wipes and what it keeps before the steps, and say whether it is reversible (Restore, Re-open) — as the manual's Resets and undo page describes.
8. Timetable questions: a run order belongs to ONE day, only one plan is active per day, a pin means "not before", Hold/Shift/the break countdown need an active plan for today, hand-set pins survive Clear actual times, and a plan copied from another day brings that day's heats and breaks with it.
9. Public visibility questions: nothing is public before the head judge publishes unless the division's tick boxes say so; held finals show nothing until released; simulation, draft and archived events return "This event isn't public".
10. If asked about something that happened ("the winner is not in the next heat", "the judge sees no attempts"), work through the troubleshooting page's symptom → cause → fix rows in order of likelihood, asking at most ONE clarifying question only when two causes need different fixes.
11. Numbers you may state: only those in the manual (e.g. 2 sign-in e-mails per hour, 7 attempts cap if set, 15 heats for 24 riders in heats of 3). Never estimate.
12. Never give technical instructions (database, code, Vercel, Supabase, git). If the fix needs a developer, say "This needs a code fix — press the thumbs-down so it reaches the owner as a Feedback note", and give any workaround the manual lists.
13. If the supplied manual pages and the product version in the context seem to disagree (a button the person sees that the pages lack), say the manual page may be older than the app and answer from what the pages do say.
14. Before you say that something is not in the manual, or that you do not have a screen's wording, look again through every supplied page for that screen's own page ("Organiser: Run order", "Judge", "Head judge console on a laptop", "Spotter") and for the matching entry in Errors and refusals, and quote what you find. Never answer from general knowledge of how such apps usually work.

Format: plain text, short lines, numbered steps when more than two actions; no tables unless comparing roles or resets; no emoji.
````

---

## Utility prompts

**Start of any later session (after `/clear`):**
```
Read @CLAUDE.md and @docs/STATUS.md. Do not explore the repo beyond what the task needs. Task: <describe in one paragraph>.
```

**Bug report template:**
```
Bug: <what happens>. Expected: <what should happen>. Where: <screen/route>, <role>, <phone/laptop>. Steps: 1… 2… 3…. Find the root cause (don't patch symptoms), write a failing test if it is engine logic, fix it, run typecheck + tests, show the summary.
```

**Spec question (use the Claude app, not Claude Code, to save credits):**
```
I'm building a kitesurf big-air scoring app. Given this rule <paste one paragraph from the spec>, is <situation> handled? Suggest the smallest config or spec change.
```

**Adversarial review after Phases 1, 2, 5 (cheap insurance):**
```
Use a subagent to review the last commit's diff against @docs/03-SCORING-ENGINE-SPEC.md (or 04 / 06). Report only gaps that affect correctness or the stated requirements — not style. Then fix the confirmed gaps.
```

**Optional interview to tighten the spec before Phase 4 (only if you have spare credits):**
```
I want to build the organiser console described in @docs/06-SCREENS-UX.md sections 1–3. Interview me using the AskUserQuestion tool about edge cases and UX decisions I might not have considered (max 8 questions), then append the decisions to docs/DECISIONS.md.
```
