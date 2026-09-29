# PLAN — Phase 2: ladder engine + timetable engine

> Agreed 29 Sep 2026. Specs: `docs/04-FORMAT-LADDER-SPEC.md` (incl. §9 Decisions log), `docs/08-TEST-SCENARIOS.md` §2 and §3. Presets: `presets/formats/*.json`, `presets/schedule/kitemania-day2.json`.

## Rules for this phase
- Engine code is pure (no Supabase, no React, no `Date.now()` inside: "now" is always a parameter).
- Tests are written first, in doc 08 terms (one test file per doc 08 section); the values in doc 08 are authoritative.
- Every public function returns a breakdown/explanation (why a rider is in a heat, why a row starts when it does) plus `warnings[]`.
- Zod 4; every field that could differ between events has a default. No new dependencies (time zones via built-in `Intl.DateTimeFormat`).

## 1. Schemas — `src/lib/schemas/`

| File | Contents |
|---|---|
| `format-template.ts` | `RoundSpecSchema` (seeding `snake \| sequential \| manual \| random`, uneven `smaller_heats_for_top_seeds` (default) `\| one_larger_heat \| byes_top_seeds`, optional `heatCountOverride`, `entrantsFrom`, `reseed`, `advance`, `minRidersToRun` default 1, optional breaks); `GeneratorSchema` as a discriminated union with typed, defaulted params per type: `single_elimination` (heatSize, advancePerHeat, finalSize, earlyMin, semiMin, finalMin, seeding, uneven, reseed), `dingle_elimination` (r1HeatSize, finalSize, r1Min, repMin, koMin, finalMin, …), `pools_to_final` (heatSize ≤ 10, finalists, poolMin, finalMin, `poolRounds` 1\|2 default 1, `poolCombine` best\|sum default best, crossPoolTieBreak); `FormatTemplateSchema` (fixed ⇒ `rounds`, generator ⇒ `generator`), `parseFormatTemplate`. Refinements: `advancePerHeat < heatSize` (the ladder must shrink), `random` only on rounds fed by `seeds`, `advance.to` must name an existing round, `heatCountOverride ≥ 1`. |
| `format-template.test.ts` | All 5 files in `presets/formats/` parse; each refinement rejects a bad example. |
| `schedule.ts` | `RunItemSchema` (heat with `heatId` or `heatRef {division, round, heat}`; break; note), `SchedulePlanSchema` (anchors `HH:MM`, items, hold, defaults, active; `actualStarts` kept optional for non-heat items only — heat actuals come from heats, Decision 9), `ScheduleDaySchema` (eventDay, timezone, defaults, plans; exactly one active plan), `parseScheduleDay`. |
| `schedule.test.ts` | `kitemania-day2.json` parses; two active plans, a bad `HH:MM`, or an anchor on an unknown item fail. |

`src/lib/schemas/index.ts` re-exports both.

## 2. Ladder engine — `src/lib/engine/ladder/`

| File | Public functions |
|---|---|
| `types.ts` | `Entrant`, `DivisionDraw`, `DrawRound`, `DrawHeat`, `Slot` (rider or placeholder `{ from: { round, heat, place } }`, or `bye`), `HeatResultInput` (ranked riders with place, total and tie-break keys), `Placing`, `LadderWarning`, `Conflict`. |
| `seeding.ts` | `heatCount(N, round)` (default ceil; `one_larger_heat` per Decision 2; `heatCountOverride` wins), `capacities(N, H)`, `dealSnake(seeds, caps)`, `dealSequential`, `byeCount` (Decision 6), `shuffleSeeds(entrants, rngSeed)` (seeded PRNG; the seed is stored in the draw so a random draw is reproducible and auditable). |
| `generators.ts` | `generateSingleElimination(N, params)`, `generateDingleElimination(N, params)` (Decision 4), `generatePoolsToFinal(N, params)` (Decision 7) → `RoundSpec[]`. |
| `expand.ts` | `expandFormat(template, entrants, overrides?)` → `DivisionDraw`: validates N, small-division single final, division-wide heat numbering (byes unnumbered, Decision 5), placeholders, vest colours per slot, identifier-clash warnings, "Heat X eliminates nobody" warning (Decision 3). |
| `progress.ts` | `applyHeatResult(draw, heatId, result)` (fills slots, arrival pools, auto-seeds a round when all its source heats are published, bye auto-advance, conflict when a downstream heat has started — nothing changes), `seedNow(draw, roundId)` (missing places → DNS walkovers), `withdrawEntrant(draw, entrantId)` (before draw → re-seed; after → DNS), `manualMove(draw, …)` (sets `manualOverride`). |
| `placings.ts` | `divisionPlacings(draw)` → final place per rider (`shared` → "13=", `by_heat_score`, final heat 1..k, pools ranking). |
| `index.ts` | Re-exports. |

Tests (fixtures in `fixtures.ts`):
- `2a-seeding.test.ts`: every §2A row (heat size 4 and 3), the N=13 tables, the `one_larger_heat` checks, the §2F N=17 case, and "eliminates nobody" for N=5.
- `2b-single-elim.test.ts`: N = 16, 10, 4, 2.
- `2c-dingle.test.ts`: N = 18 (22 heats, 13= / 7= / 4=), N = 12 (byes to the top seeds), and one flag-out config.
- `2d-fixed.test.ts`: `megaloop-men-16`, `megaloop-women-6`.
- `2e-pools.test.ts`: N = 23 → 7/8/8 and final of 6, cross-pool tie; poolRounds 2 with best and with sum.
- `2f-progression.test.ts`: publish → pools; Seed now; withdrawals; correction conflict; manual override.

## 3. Timetable engine — `src/lib/engine/schedule/`

| File | Public functions |
|---|---|
| `types.ts` | `HeatLive` (heatId, status, startedAt, endedAt, pausedMin, division/round/heat labels, round-last flag, default duration/breaks), `TimetableRow` (item, start/end UTC ISO + local `HH:MM`, break, status `done \| live \| next \| est \| held \| pinned`, `readyCallAt`, `reason`, warnings). |
| `time.ts` | `localToUtc(eventDay, "HH:MM", tz)`, `utcToLocalHHMM(iso, tz)`, `addMinutes` (explicit offsets from `Intl`, DST-safe). |
| `timetable.ts` | `computeTimetable(plan, heats, { now?, timezone, eventDay, defaults })`: cursor walk; actual times from heats (Decision 9); pin = "not before" with warning (Decision 8); break precedence item → round (last heat of round uses `breakAfterRoundMin`) → plan default, explicit break item replaces the automatic break (Decision 12); running-over/pause (Decision 11); hold → un-started rows `held`, no times; done/live rows first after a plan switch and never projected before `now` (Decision 10); last row break shown "—". |
| `actions.ts` | `startHold(plan, at, reason?)`, `resumeHold(plan, heats, restartAt)` (pins the next un-started item, clears hold), `shift(plan, heats, minutes)` (pins the next un-started item at its projected start + N), `activatePlan(day, planId)`. All return a new plan (no mutation). |
| `resolve.ts` | `resolveHeatRefs(day, lookup)` for preset/test files that use `heatRef`. |
| `index.ts` | Re-exports. |

Tests (all from `kitemania-day2.json`, heats linked by `heatRef`; no draw generation needed):
- `3a-anchors.test.ts`: the §3A table and finish 16:53; rows before 14:00 are unaffected; plus pushing a pin (Decision 8) gives a warning.
- `3bc-plans.test.ts`: "Bad wind" finishes 12:20 and "Good wind" 13:33, with every start.
- `3d-actual-start.test.ts`: 15:10 → 15:25 / 15:40 / 15:57 / 16:16 / 16:37, finish 16:55.
- `3e-hold-shift.test.ts`: hold → `held`; resume 16:00 → 16:17 / 16:36 / 16:57; shift +10 → pin 15:48; running over / pause.
- `3f-plan-switch.test.ts`: Women's actuals kept, rest re-flows, not before `now`.
- `time.test.ts`: Cairo summer and winter offsets.

## 4. Order of work (small commits)
1. `feat(schemas): format-template + schedule schemas` (+ preset parse tests)
2. `feat(engine): ladder seeding` → generators → expandFormat → progression → placings
3. `feat(engine): timetable` → actions
4. `docs: STATUS phase 2`: typecheck + test summary lines, files changed, how to test.

Done = `npm run typecheck && npm test` green (Phase 1's 100 tests still pass) and STATUS updated.
