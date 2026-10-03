# AUDIT — Self-audit 1a: the engines, for the Gouna configuration

Branch `audit-1a`, 3 Oct 2026, product version 0.10.1. Scope: the scoring, ladder and timetable engines, unit level only, for the configuration we run on Thursday. No application code or database was changed; every problem is a numbered finding below for a separate fix session.

## Fix session 1 (0.11.1): A1a-1 and A1a-3 fixed, A1a-4 / A1a-5 left

- **A1a-1 fixed.** `higherFirst` in `rank.ts` now returns 0 when both values are equal, so "no value" against "no value" (−∞ against −∞) is a genuine tie for every tie-breaker. Two riders with no counted trick on the same total are flagged tied, the explanation says the tie is open, and Publish is blocked for a head judge decision. The audit's `.fails` test is a normal test, the "today" test is gone, and the random-heat comparison no longer skips these heats. New: `tie-no-value.test.ts` (a final of 2 where both crash everything, two riders on 0.00, each tie-breaker alone, the head judge's decision).
- **A1a-3 fixed, and it was reachable** (answer to scenario 1b-2, found by reading every write path):
  - *Judge pad, tapped:* cannot produce an off-step value. *Typed:* `parsePadInput` refuses it before Save (Save greys out, the box outlines red, no sentence). So not through the normal screen.
  - *But the judge pad sends straight to the database* (`submit_trick_score`, `submit_impression`, no server action in between) and **those functions checked nothing**; the table policies also let a seat write the tables directly, and `numeric(5,2)` accepts 7.25. A pad on a stale cached app, a queued score that outlives a step change in the Scoring settings, or a hand-built request would store 7.25 and blank the heat's totals.
  - *Head judge sheet entry, Save and submit, correction:* refused by the server action (`checkImpression` / `checkTrickScore`), but `head_set_trick_score` / `head_set_impression` themselves checked nothing.
  - *Simulator's virtual judges:* snap to the step (`snapToStep`) and call `submit_*`, so safe, and now double-checked.
  - **Fix at both ends.** Server: migration `20261016100000_fix_audit_1a_score_step.sql` adds the check (the division's own scale, overrides included) to the four write functions and to a trigger for direct table writes by signed-in users; refusals are `SCORE_OFF_STEP: step|below|above` and `SCORE_OUT_OF_RANGE: low|high`, shown as "That score is not on the 0.1 step. Use 7.2 or 7.3." and "That score is outside the scale (0 to 10)." with their Learn more link in the manual. The head judge's server action gives the same sentences. Engine: `computeHeat` never throws for a mark any more. An off-step value is counted as the nearest step (halves up), a value outside the scale as the nearest end, both written in the rider's explanation; something that is not a number, or a criteria mark that cannot be read, is left out (that judge is then "missing", which blocks Publish). `judgeTrickScore` stays strict. New: `off-step.test.ts`, extended `head-validate.test.ts`, `tests/rls/score-step.test.ts` (written, **not run**: it needs the migration on the hosted project). The migration's check function was run on a throwaway Postgres 16 against 21 cases (on step, off step, outside, NaN, partial criteria, a 0.5 step override, a missed mark, the owner path) and gave the expected result in each.
  - *Not done, for Polish 2b:* the typed pad refuses silently. The judge sees the red box but no sentence; an off-step typed value could name the step (the text is ready in `copy.liveErrors.codes.SCORE_OFF_STEP`). The engine's rounded-mark note is in the explanation only: it is not a Publish blocker and the head console does not highlight it.
- **A1a-4 and A1a-5 left for after the event, on purpose.** They do not come from the same helper: Shift truncates the projected start to HH:MM (`actions.ts`), the badge uses `Math.round` of the exact difference (`drift.ts`). They also pull in opposite directions: "never shorter than asked" (the rule of 1 Oct, used by +1 min and Pause break) rounds Shift up and can show N + 1 minutes on the board, while "exactly N on the board" is up to 59 seconds short in real time. That is an owner decision, not a rounding fix. Their three tests stay `.fails`.
- **Still open as before:** A1a-2 (handled by procedure: lock the draw with 24 first) and A1a-7 (don't copy plans), A1a-6 (rule question).

## Summary (one page)

**Engines safe for Gouna: yes, with these fixes.**

- **Fix in code before Thursday (small):** A1a-1. Two riders on the same total who both have no counted trick (for example both crashed everything and got the same Impression) are not treated as tied. The engine says the tie was "resolved by highest counted trick", ranks them in slot order, and Publish is not blocked. In a heat of 3 where only the winner goes on, that picks the wrong rider. The fix is one line in `rank.ts`.
- **Handle by procedure on Thursday (or the owner decides a rule change):** A1a-2. With "exactly 3 per heat", one withdrawal before the draw is locked (24 → 23) turns Round 1 into 11 heats, 10 of them 1 v 1, and the event goes from 15 heats to 19. **Procedure:** confirm (lock) the draw with all 24 riders, then record no-shows as DNS. A locked draw keeps 15 heats, and a heat of 3 runs with 2.
- **Handle by procedure:** A1a-7. Don't use "Copy Thursday's plan to Friday". Build Friday's run order from Friday's heats only. A copied plan shows Thursday's heats again, runs Thursday's lunch break again on Friday morning (pushing the 10:00 first heat to 10:20), and the drift badge reads hours early.
- **Can wait until after the event:** A1a-3 (one bad score value blanks the whole heat), A1a-4 (Shift +N can be up to 59 s short), A1a-5 (drift badge can be 1 min off the times on the board), A1a-6 (the Impression tie-breaker can never decide in this preset).

What held up (each is now a test in the suite):
- **Scoring:** 3,000 random heats scored by `computeHeat` and by a brute-force scorer written from the rules (whole-hundredths arithmetic) agree on every total, component, counted trick, place and publish blocker. The only exception is A1a-1. These invariants held: totals never negative, at most 3 counted, a crash never counts, nothing past attempt 7 counts, an Absent judge leaves the mean over the judges who scored, an off-panel score changes nothing, and the explanation text matches the numbers.
- **Ladder:** at N = 24, 23, 22, 21 and 20, with 20 random results each, every rider is placed exactly once and every heat is within the planner's documented sizes. No round before the final has one heat. Every winner sits where the ladder says, N = 24 pairs adjacent heats 8 → 4 → 2 → final of 2, and N = 21 ends in a final of 3. The custom ladder checker raises every one of its 19 documented faults and never throws on 500 random ladders.
- **Timetable:** 1,500 random states of the two Arrow days, with pins, holds, running heats with seconds and pauses, a cancelled heat, a re-run, a heat with no length, a dangling row and a note. In every state it never throws, End = Start + length, and next Start = End + break + warm-up (or the pin, or now). A pin means "not before", and the +1 min and Pause break rules round up to a whole minute. The drift badge equals its own arithmetic, and on 600 states the organiser and public timetables give identical times, finish and drift.

Test files (new, nothing else changed):
- `src/lib/engine/scoring/audit-1a-gouna.test.ts`: 21 passing, none marked `.fails` (A1a-1 and A1a-3 fixed in 0.11.1)
- `src/lib/engine/ladder/audit-1a-gouna.test.ts`: 28 passing, 1 marked `.fails` (A1a-2)
- `src/lib/engine/schedule/audit-1a-gouna.test.ts`: 12 passing, 3 marked `.fails` (A1a-4, A1a-5, A1a-7)

A test marked `.fails` describes the correct behaviour and fails today. When the fix lands, vitest reports it as "unexpectedly passed", and the fix session then removes `.fails` and deletes the matching "… today" test, which pins down the current wrong behaviour.

### The configuration audited
- 24 riders, Knockout, heats of exactly 3 (target 3, minimum 3, maximum 3), 1 advances, final of 2, "By original seeding" (adjacent pairing), template `heats4-top2-single-elim` with those parameters.
- Warm-up 5 + heat 10, 3 min between heats, 5 min after the last heat of a round; 15 heats over two days (Thursday R1 with a lunch break, Friday R2, SF, Final), Africa/Cairo.
- 3 judges plus a head judge who also scores: 4 scores per attempt. `trimMinJudges` is 5, so this is a plain mean with no trimming. 1–2 spotters.
- Preset `kota-best3-impression` with `heat.maxAttemptsPerRider = 7`: 4 criteria 0–10 on the 0.1 step, best 3 tricks plus Impression (0–40), tie-breakers highest counted → next counted → Impression → most landed → head judge. Published after review.

## Findings by severity

### Blocks the event

#### A1a-2 — One withdrawal before lock turns Round 1 into 1 v 1 heats and adds 4 heats
- **Where:** `src/lib/engine/ladder/knockout-plan.ts` (`knockoutLayout`), `seeding.ts` (`feasibleHeatCounts`). The behaviour is documented (docs/04 decision 33, test 2G7), so this is a risk of the rule, not a coding slip.
- **What happens:** with minimum = maximum = 3, any field that is not a multiple of 3 cannot be split into heats of 3. The planner then runs the whole round as heats of 2:

  | Riders | Round 1 | Heats in the event |
  |---|---|---|
  | 24 | 8 × 3 | 15 |
  | 23 | 10 × 2 + 1 × 3 | **19** |
  | 22 | 11 × 2 | **19** |
  | 21 | 7 × 3 | 11 (final of 3) |
  | 20 | 10 × 2 | **18** |

  Four extra heats at 18 min each (warm-up 5 + heat 10 + 3 break) is about 72 minutes more. Most Round 1 riders also get a 1 v 1 instead of a heat of 3.
- **Reproduction:** `expandFormat(GOUNA, makeEntrants(24))`, then `withdrawEntrant(draw, "r1")` while the draw is still `draft`. Round 1 has 11 heats. Test: "A1a-2: one withdrawal before lock…" (`.fails`) and "the heat count for each N".
- **Proposed fix:**
  1. **For Thursday (no code):** confirm the draw with 24 riders before anyone withdraws. After `lockDraw`, a withdrawal is a DNS walkover: still 15 heats, and the heat of 3 runs with 2. A test covers this. If the organiser must re-draw with 23, set minimum 2 / maximum 3 instead: 12 heats, R1 7 × 3 + 1 × 2, then 3 heats, then a final of 3.
  2. **Rule change (owner decision, after the event):** when no split fits the minimum, use as many heats of the maximum as possible plus the fewest smaller heats (≥ 2). For 23 that gives 7 × 3 + 1 × 2 = 8 heats, keeping 8 → 4 → 2 → final. That changes decision 33, so the owner has to decide it.

### Wrong result

#### A1a-1 — Riders tied with no counted trick are "resolved" by slot order
- **Where:** `src/lib/engine/scoring/rank.ts`, `higherFirst`. For two riders with no counted trick it compares `-Infinity` with `-Infinity`. `b - a` is `NaN`, `Math.abs(NaN) < EPS` is false, so it returns `NaN`. `NaN !== 0` counts as "decided". The same applies to `highest_any_trick` (`Math.max()` of nothing).
- **What happens:** yellow and blue both crash everything and both get Impression 5.30. Ranking says yellow 1st and blue 2nd, both "resolved by highest counted trick", with no `tie_unresolved` blocker. Swapping the slot order swaps the winner. In a heat where one rider advances, the wrong rider can go through without the head judge being asked. It also happens to two riders on 0.00 with nothing landed. The random heats reach it (the property test counts it and checks it is reached).
- **Reproduction:** test "A1a-1: two riders on the same total with no counted trick are tied" (`.fails`) and "A1a-1 today" (green, shows the slot-order split).
- **Proposed fix:** in `higherFirst`, return 0 when `a === b` before subtracting (`if (a === b) return 0;`). That covers −∞ vs −∞. Then remove `.fails` and delete the "today" test. The brute-force property test then needs no exclusion: delete the `noTrickTie` branch.

#### A1a-7 — A day plan copied from Thursday shows Thursday's heats on Friday and moves Friday's start
- **Where:** `src/lib/schedule/day-plans.ts` `copyPlanToDay` copies every item (the known P2-14 gap). `computeTimetable` takes whatever the plan lists. Nothing stops a heat appearing in two days' plans.
- **What happens:** Thursday ran (heats 1–8 and a 45-min lunch). Friday is made with "Copy Thursday's plan" plus Friday's 7 heats, with Friday's first heat pinned at 10:00. Friday's timetable then shows:
  - Thursday's 8 heats again, as done, with Thursday's times
  - Thursday's lunch break again, as un-started, at 09:30–10:15, which pushes Friday's first heat from its 10:00 pin to **10:20**, on the organiser screens and the public page
  - a drift badge that says "early" by more than 150 minutes, because the plan-as-written puts Thursday's 8 heats on Friday morning.
- **Reproduction:** test "A1a-7: Friday made with 'Copy Thursday's plan'…" (`.fails`) and "A1a-7 today" (green, shows all three effects).
- **Proposed fix:** two parts.
  1. In `copyPlanToDay`, leave out heat rows whose heat has already started (`heatsRanOn` already exists), and leave out break items that sit between them.
  2. In `computeTimetable` (or the save action), warn on a heat row whose heat started on another day ("ran on Thu 8 Oct — take it out of this day"), so it takes no time and moves nothing, like a dangling row.

  Procedure for Thursday: don't copy plans; build Friday from Friday's heats.

### Annoying

#### A1a-3 — One off-step or out-of-range score blanks every total of the heat
- **Where:** `src/lib/engine/scoring/round.ts` `assertOnStep`, called from `judge.ts` and `heat.ts`. `computeHeat` throws `ScoringInputError` for the whole heat. Its callers catch it and show nothing: `head-totals.ts` shows "no total" for every rider, `publish-core.ts` refuses Publish with the engine's message, and `public/live-model.ts` shows no live scores.
- **What happens:** one Impression of 7.25, or a criterion of 10.5, takes every total of the heat off the console and the public live page until someone finds and fixes that one value. `impression_scores.value` is `numeric(5,2) check (value >= 0)`, so the database itself accepts 7.25. Whether the write functions refuse it is Part 1b scenario 1b-2.
- **Reproduction:** test "an off-step or out-of-range value is refused…" (green, documents the contract) and "A1a-3: one off-step mark should cost only that mark" (`.fails`).
- **Proposed fix:** in `computeHeat`, catch the error per mark rather than per heat. Treat a bad mark as missing (it is not in the mean), and add a publish blocker `{ type: "score_invalid", judge, rider, attemptSeq, message }`, so the head judge sees "Fawy: score for Red, attempt 2 is 7.25 — not on the 0.1 step" with **Fix**. Severity goes up to "blocks the event" if 1b-2 shows the server accepts such values.

#### A1a-4 — Shift +N moves the next heat by less than N when the projected start has seconds
- **Where:** `src/lib/engine/schedule/actions.ts` `shift`. It pins `utcToLocalHHMM(start + N min)`, which drops the seconds. `extendBreak` and `resumeBreak` in `break.ts` round up instead, per the owner's rule of 1 Oct: "never shorter than asked".
- **What happens:** R1 H1 ends at 10:10:40, so H2 is projected at 10:18:40. Shift +5 pins "10:23", so H2 moves by 4 min 20 s, not 5.
- **Reproduction:** test "A1a-4: Shift +N should move the next start by at least N minutes" (`.fails`) and "A1a-4 today" (green, 4 min 20 s).
- **Proposed fix:** use the same `roundUpToMinute` as `extendBreak`: `utcToLocalHHMM(Math.ceil((start + N·60000) / 60000) · 60000, tz)`.

### Cosmetic

#### A1a-5 — The drift badge can be 1 minute off the two times on the board
- **Where:** `src/lib/schedule/drift.ts` `driftOf` uses `Math.round` of the exact difference. The board shows `HH:MM` with the seconds dropped (`utcToLocalHHMM`).
- **What happens:** the plan says 10:18 and the board now says 10:20, but the badge says "3 min late", because the real start is 10:20:40. `Math.round` also rounds 2.5 late up to 3 but 2.5 early down to 2.
- **Reproduction:** test "A1a-5: the badge should agree with the two times on the board" (`.fails`), "A1a-5 today" and "A1a-5 detail" (green).
- **Proposed fix:** compute the badge from the two displayed minutes: `floor(current / 60000) − floor(planned / 60000)`. The badge then always equals the arithmetic a person does on the board.

#### A1a-6 — The Impression tie-breaker can never decide in this preset
- **Where:** `presets/scoring/kota-best3-impression.json` `tieBreakers`. This is a rule question, not a code bug.
- **What happens:** two riders reach the Impression tie-breaker only when their totals are equal and their counted and other landed tricks are equal too. Total = tricks + Impression, so their Impressions are then equal as well. "Most landed" can only decide through a landed trick that every judge marked Missed. In practice every real tie after the trick tie-breakers goes to the head judge. The rules page still lists 5 tie-breakers, which is misleading.
- **Reproduction:** test "3. Impression can never decide in this preset" (exhaustive, green) and "4. most landed: only reachable through a landed trick every judge marked Missed".
- **Proposed fix (owner decision):** either move `impression` before `next_counted_trick`, so a rider with the better whole heat wins a tie on highest trick, or leave the order and drop Impression from the list shown to riders. Don't change it before Thursday without the owner.

## Part 1b — system audit (deferred scenarios)

These rules live in database functions, server actions or the screens, not in the engines, so they were not run here. Each one is written as a scenario with the expected behaviour, for a session that may call the hosted development project and drive the browser.

- **1b-1 Attempt cap 7.** The spotter logs attempts 1–7 for Red, then an 8th. Expected: the 8th is refused with "This rider has already used 7 of 7 attempts in this heat." Deleting attempt 3 then lets an 8th in, and the engine never counts more than 7 (the engine part is green here).
- **1b-2 Off-step scores (A1a-3).** Send a criterion of 7.05, 10.5 and −0.1, and an Impression of 7.25, through each write path: judge pad, head judge's "Enter ‹judge›'s sheet", correction. Expected: each is refused before it is stored. If any is stored, A1a-3 becomes "blocks the event".
- **1b-3 The head judge's scores count.** The Gouna panel has 4 seats (J1, J2, J3, head judge). Expected: the head judge's seat is a panel member of every heat, so its scores are in the mean, not in `ignoredMarksFrom`. Remove the head seat from the panel: its scores show as "from a judge not on the panel" and do not count.
- **1b-4 Publish blocked exactly when required scores are missing.** One judge leaves attempt 2 unscored. Expected: Publish is refused and names that judge and attempt; setting it Absent clears the blocker (P2-1); an override needs a reason and is written to `audit_log` with who and when.
- **1b-5 A tie for the heat win (and A1a-1).** Two riders tie on total with equal tricks. Expected: Publish is refused with the tie blocker until the head judge records a decision; the decision reaches the ladder (the chosen rider fills the next seat) and `audit_log`. After the A1a-1 fix, repeat with two riders who crashed everything.
- **1b-6 Publish → next seat.** Publish R1 H3. Expected: its winner appears in R2 H2 seat 1 on the organiser draw, the console and the public ladder within one poll; correcting R1 H3 after R2 H2 has started is refused with a conflict naming R2 H2.
- **1b-7 Lock before withdrawals (A1a-2).** Expected: confirming the draw calls `lockDraw`, so a later withdrawal shows DNS and keeps 15 heats. Check the organiser can see whether the draw is confirmed before pressing Withdraw.
- **1b-8 Public timetable inputs.** Expected: `round_last`, `break_after_heat_min` and `break_after_round_min`, as the public timetable function computes them, equal what the organiser side reads from the stored draw. This audit proved both sides give identical times when those inputs agree; the SQL derivation itself is unchecked.
- **1b-9 Server time and pauses.** Expected: `started_at` and `ended_at` are set by the database clock, not the phone's. While a heat is paused, its projected end moves (check `paused_total_sec` includes the pause that is still running, or that the screens add it), so the next heat's estimate does not jump when the pause ends.
- **1b-10 Re-run a heat.** Expected: the original is cancelled and keeps its real times; the re-run heat gets its own row in the run order, its result is the one the ladder uses, and its label tells it apart from the original on the organiser run order. `buildHeatModel` labels heats `Heat ‹number›` with no suffix, while the public side shows the suffix.
- **1b-11 Score edits are audited.** Expected: a head judge correction writes `audit_log` with before, after, who, when and reason, and the published `heat_results` snapshot changes only on re-publish.
- **1b-12 Offline judge.** Expected: a judge phone that loses signal queues scores, shows "pending", and sends each once (idempotency key) when back; no duplicate score row and no lost score.
- **1b-13 Copy plan (A1a-7).** Expected: after the fix, copying Thursday to Friday leaves out heats that already ran; until then the run-order screen warns "Heats already ran on Thu 8 Oct".

## Not covered (for the full audit after the event)

**Scoring presets not audited:** `club-quick-best2`, `gka-category-overall`, `legacy-kol-best3-variety`, `megaloop-single-best`, `overall-impression`, `pukl-points`.

**Scoring features not exercised:**
- trimmed mean with 5 or more judges, and median
- best per category, distinct trick names, counted weights, trick weight ≠ 1, crash = zero
- height sensor (criterion and bonus)
- interference as percent or points, and more than one interference
- duplicate-attempt detection, flag-out, `requireAllJudges: false`, optional Impression
- the trick-name parser

**Formats not audited:** `kota-dingle`, `double-elimination`, `megaloop-men-16`, `megaloop-women-6`, `pools-to-final`, `qualifying-to-finals`, `round-robin`, `single-final`.

**Ladder features not exercised:**
- Knockout with heats of 4 and more than 1 advancing
- "By their result" re-seeding, byes, second chance
- "Seed now" walkovers, hand edits to the draw (`draw-edit`), regenerate keeping hand edits
- custom ladders other than the generated Gouna one, identifier clashes per identification scheme

**Timetable features not exercised:**
- plan switch (alternative plans), the `kitemania-day2` preset
- several divisions interleaved in one run order
- a day crossing midnight, a DST change (Egypt's summer time ends 29 Oct, after the event)
- ready-call times, the printed run order, the PNG export

**Not in any engine (Part 1b and later):** RLS, logins by PIN/QR, realtime, the client queue, screens, and the public pages' loaders.
