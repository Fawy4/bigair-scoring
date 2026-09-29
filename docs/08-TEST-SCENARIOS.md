# 08 — Test Scenarios & Acceptance Criteria (authoritative expected values)

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · All numbers below were computed independently (Python) on 29 Sep 2026. Claude Code must make its tests match these values — if a value looks wrong, stop and report, do not "fix" the expectation.

Rounding convention: panel scores and totals rounded half-up to 2 decimals for comparison; keep unrounded values in breakdowns.

## 1. Scoring engine (`presets/scoring/*.json`)

### 1A — KOTA preset `kota-best3-impression`, 3 judges, aggregate mean
Criteria order: height, extremity, technicality, execution (equal weights, 0–10, step 0.1). Rider "Red", one heat.

| Attempt | Trick | J1 (H,E,T,X) | J2 | J3 | Judge trick scores | Panel |
|---|---|---|---|---|---|---|
| 1 | Kiteloop board-off | 8.0, 7.5, 7.0, 8.0 | 8.5, 8.0, 7.0, 7.5 | 8.0, 7.5, 7.5, 8.0 | 7.625 / 7.75 / 7.75 | **7.71** |
| 2 | Double loop | 9.0, 9.0, 8.0, 7.0 | 9.0, 8.5, 8.0, 7.5 | 8.5, 9.0, 8.5, 7.0 | 8.25 / 8.25 / 8.25 | **8.25** |
| 3 | Late backroll kiteloop | 7.0, 7.0, 6.5, 8.5 | 7.5, 7.0, 7.0, 8.0 | 7.0, 6.5, 7.0, 8.5 | 7.25 / 7.375 / 7.25 | **7.29** |
| 4 | Board-off | crashed | crashed | crashed | — | not counted |
| 5 | Contra loop | 8.5, 8.0, 7.5, 8.5 | 8.0, 8.0, 8.0, 8.0 | 8.5, 8.5, 7.5, 8.0 | 8.125 / 8.0 / 8.125 | **8.08** |

Expected: counted = attempts 2, 5, 1 (8.25, 8.08, 7.71) → tricks component **24.04**; impression marks 7.5, 7.0, 8.0 → **7.50**; **total 31.54**; `percent` = 31.54 / 40 × 100 = **78.85**; breakdown lists attempt 4 as `crashed`, `counted: false`; `flags.incomplete = false`.

Variant 1A-i: remove J3's score on attempt 3 → panel(3) = mean(7.25, 7.375) = **7.31**, `incomplete = true`, `missing = [J3]`; total unchanged (31.54) because attempt 3 is not counted. Publish must be blocked while `requireAllJudges`.

Variant 1A-ii: interference `drop_best_trick` on Red → counted becomes 8.08, 7.71, 7.29 = 23.08; total **30.58**.

### 1B — Trimmed mean
Model `panel.aggregate = trimmed_mean`, `trimMinJudges = 5`.
- 5 judges: 7.0, 7.5, 8.0, 8.0, 9.5 → drop 7.0 and 9.5 → **7.83**.
- Same 5 with `mean` → **8.00**.
- 4 judges: 7.0, 7.5, 8.0, 9.5 → below threshold → plain mean **8.00**.
- 3 judges: 7.0, 8.0, 9.5 → **8.17**.
- `median` on 7.0, 7.5, 8.0, 8.0, 9.5 → **8.00**; on 7.0, 8.0, 9.0, 9.5 → **8.50**.

### 1C — PUKL preset `pukl-points` (combine = sum; H 0–3, R 0–3, T 0–3, I 0–1; step 0.5), best 3, 3 judges
| Attempt | J1 | J2 | J3 | Judge sums | Panel |
|---|---|---|---|---|---|
| 1 | 2.5, 2.0, 2.0, 0 | 2.5, 2.5, 2.0, 0 | 2.0, 2.0, 2.5, 0 | 6.5 / 7.0 / 6.5 | **6.67** |
| 2 | 3.0, 3.0, 2.5, 1 | 3.0, 2.5, 2.5, 0 | 3.0, 3.0, 2.0, 1 | 9.5 / 8.0 / 9.0 | **8.83** |
| 3 | 1.5, 1.0, 1.5, 0 | 2.0, 1.5, 1.0, 0 | 1.5, 1.5, 1.5, 0 | 4.0 / 4.5 / 4.5 | **4.33** |
| 4 | 2.5, 3.0, 2.0, 0 | 2.5, 2.5, 2.5, 0 | 3.0, 2.5, 2.0, 0 | 7.5 / 7.5 / 7.5 | **7.50** |
Expected: counted 2, 4, 1 → **total 23.00** (of 30); no impression component. Validation: a preset with `combine = sum` whose criteria maxes do not add to `trick.scale.max` must fail to parse.

### 1D — Megaloop preset `megaloop-single-best` (weights 0.70 extremity, 0.15 trick, 0.10 style, 0.05 landing; all 0–10)
- Jump 1: J1 9.0, 7.0, 8.0, 6.0 → 8.45; J2 8.5, 7.5, 8.0, 7.0 → 8.225; J3 9.0, 7.0, 7.5, 6.5 → 8.425 → panel **8.37**.
- Jump 2: J1 7.0, 9.0, 9.0, 9.0 → 7.60; J2 7.5, 9.0, 8.5, 9.0 → 7.90; J3 7.0, 8.5, 9.0, 9.5 → 7.55 → panel **7.68**.
- Heat total = single best = **8.37**; breakdown shows jump 2 as not counted.

### 1E — Tie-break
KOTA preset. Red counted 8.6, 8.0, 7.2 + impression 7.4 → 31.20. Blue counted 8.2, 8.2, 7.6 + impression 7.2 → 31.20. `tieBreakers = [highest_counted_trick, next_counted_trick, impression, head_judge]` → Red 1st (8.6 > 8.2), `tieResolvedBy = "highest_counted_trick"`. Variant: Blue counted 8.6, 7.8, 7.6 + 7.2 → 31.20 with best 8.6 = Red's → compare next counted: Red 8.0 > Blue 7.8 → Red 1st, `tieResolvedBy = "next_counted_trick"`. Variant: identical counted lists and impression → `tieUnresolved = true` until a `head_judge` decision is supplied.

### 1F — Other edge cases (assert behaviour, values follow from the rules)
- Rider with 2 landed attempts (8.0, 7.0) under best 3 → tricks 15.00.
- `crash = zero` with landed 8.0 and one crash under best 3 → counted [8.0, 0] → 8.00; a crash never displaces a landed trick.
- `best_per_category`, `maxPerCategory 1`: kiteloop 8.4 and 8.9, board_off 7.2, rotation none → counted 8.9 + 7.2 = 16.10.
- DNS in a 3-rider heat → place 3, total shown "—"; DNS + DSQ in same heat → DSQ last.
- `overall-impression` preset: judges 7.5, 8.0, 7.0 → total **7.50**.
- Height sensor `height_criterion` with linear mapping 5 m → 0, 25 m → 10: 15 m → Height = 5.00 for every judge; 30 m clamps to 10.00; 3 m clamps to 0.00.
- Value not on step (8.55 on step 0.1) → validation error.
- Every file in `presets/scoring/` parses; `maxRaw = "auto"` for KOTA resolves to 40, PUKL 30, Megaloop 10, club-quick-best2 20, overall-impression 10, legacy-kol-best3-variety 40.
- `distinctTrickNames = true` (KOTA-style single marks): attempts "Left Backroll Board Off Handle" 6.3 and 5.3, "Left x2 Backroll" 4.0, "Right Frontroll" 3.5 under best 3 → tricks component **13.80**; with the flag false → **15.60**.
- `maxAttemptsPerRider = 7`: the server rejects an 8th attempt for the same rider with a readable error; if an 8th arrives anyway, `computeHeat` ignores it and sets `flags.extraAttemptsIgnored = true`.
- **Missed**: KOTA 1A attempt 3 with J3 = Missed → panel from J1, J2 = **7.31**, `missedBy = [J3]`, `incomplete = false`; all three judges Missed → attempt has no panel score and is not counted.
- **Impression required**: 1A heat with J3's impression for Red absent → `publishBlockers` contains `{ type: "impression_missing", judge: "J3", rider: "Red" }`; with `required = false` → no blocker and impression computed from J1, J2 = **7.25**.
- **Duplicates**: attempts for Red from spotter A at 12:00:00 and spotter B at 12:00:08 → the second carries `possibleDuplicateOf` = first; at 12:00:45 → no flag. Soft-deleting the second removes it from counting and from the "n / 7" counter; seq numbers of remaining attempts unchanged.
- **Speech/text parsing** (`presets/tricks/big-air-vocabulary.json`): "left double backroll board off handle" → direction left, multiplier x2, base backroll, modifiers [board_off, handle_pass], name "Left ×2 Backroll Board-off Handle pass", category `handle_pass` (precedence); "right mega" → Right Megaloop, category `kiteloop`; "left banana jump" → base unmatched, kept as free text "banana jump" with `needsReview = true`.
- Legacy preset sanity check against the old app's public data: panel trick averages 4.7, 4.3, 4.0, 3.5, 2.8 + two crashes, Variety 4.3 → best 3 = 13.0, total **17.3** (decimals = 1); the crash chips are listed but not counted; attempt counter reads "7 / 7".

## 2. Ladder engine (`presets/formats/*.json`)

### 2A — Snake seeding, heat size 4, `uneven = smaller_heats_for_top_seeds` (seed numbers)
| N | Heats |
|---|---|
| 7 | [1, 4, 5] · [2, 3, 6, 7] |
| 8 | [1, 4, 5, 8] · [2, 3, 6, 7] |
| 10 | [1, 6, 7] · [2, 5, 8] · [3, 4, 9, 10] |
| 12 | [1, 6, 7, 12] · [2, 5, 8, 11] · [3, 4, 9, 10] |
| 16 | [1, 8, 9, 16] · [2, 7, 10, 15] · [3, 6, 11, 14] · [4, 5, 12, 13] |
| 18 | [1, 10, 11] · [2, 9, 12] · [3, 8, 13, 18] · [4, 7, 14, 17] · [5, 6, 15, 16] |
| 24 | [1, 12, 13, 24] · [2, 11, 14, 23] · [3, 10, 15, 22] · [4, 9, 16, 21] · [5, 8, 17, 20] · [6, 7, 18, 19] |
Heat size 3: N = 7 → 3 heats; N = 18 → 6 heats ([1,12,13] · [2,11,14] · [3,10,15] · [4,9,16] · [5,8,17] · [6,7,18]).

Capacity-aware snake, N = 13 (docs/04 §3 step 3):
| N | Heat size | `uneven` | Heats |
|---|---|---|---|
| 13 | 3 | `smaller_heats_for_top_seeds` (default) | [1, 10] · [2, 9] · [3, 8, 11] · [4, 7, 12] · [5, 6, 13] |
| 13 | 3 | `one_larger_heat` | [1, 8, 9] · [2, 7, 10] · [3, 6, 11] · [4, 5, 12, 13] |
| 13 | 4 | `one_larger_heat` | [1, 6, 7, 12] · [2, 5, 8, 11] · [3, 4, 9, 10, 13] |

`one_larger_heat` heat counts (docs/04 Decision 2): N=11 size 4 → 3 heats (3/4/4: [1, 6, 7] · [2, 5, 8, 11] · [3, 4, 9, 10]); N=13 size 3 → 4 heats; N=13 size 4 → 3 heats; N=5 size 4 → one heat of 5; N=20 size 4 → 5 heats of 4; N=25 size 4 → 6 heats 4/4/4/4/4/5; N=30 size 4 → 7 heats 4/4/4/4/4/5/5.

### 2B — `single_elimination` generator, heatSize 4, advancePerHeat 2, finalSize 4
- N = 16 → R1 4 heats → Semi 2 heats (8 riders) → Final 1 heat (4). Round count 3.
- N = 10 → R1 3 heats (3/3/4) → 6 advance → Semi 2 heats (3/3) → Final of 4. Eliminated in R1 share 7th (4 riders) with `placings.eliminated = shared`.
- N = 4 → single Final.
- N = 2 → single Final of 2 (warning: below template minimum if min = 3).

### 2C — `dingle_elimination` (KOTA), N = 18, r1HeatSize 3, finalSize 3
- R1: 6 heats of 3 (13 min). Advance: place 1 → R3; places 2–3 → R2.
- R2: 12 riders → 6 heats of 2 (10 min), reseeded `by_place_then_score`; winners → R3; losers eliminated **13=**.
- R3: 12 riders (6 R1 winners + 6 R2 winners) → 6 heats of 2; winners → SF (losers 7=).
- SF: 3 heats of 2; winners → Final (losers 4=).
- Final: 1 heat of 3 (15 min) → places 1–3. Flag-out available only in R1 at minute 8, count 1.
- Sanity: total heats = 6 + 6 + 6 + 3 + 1 = 22.

### 2D — Fixed templates
- `megaloop-men-16`: R1 8 heats of 2 → winners to R3, losers to R2; R2 4 heats of 2 → winners to R3; R3 6 heats of 2 → winners to SF; SF 3 heats of 2 → Final of 3. Total heats 22. Placings: R2 losers 13=, R3 losers 7=, SF losers 4=.
- `megaloop-women-6`: R1 2 heats of 3 → winners to Final; 2nd places → SF (1 heat of 2) → winner to Final; Final of 3. 3rd places share 5th; SF loser 4th.

### 2E — `pools_to_final`, N = 23, heatSize 10, finalists 6
Pools: 3 heats sized 7 / 8 / 8 (smaller heat for top seeds first). All 23 ranked by pool total across pools; top 6 → Final (1 heat). Tie across pools uses the scoring model's tie-breakers, then original seed.

### 2F — Progression behaviours
- Publishing R1 Heat 2 (places Red 1st, Blue 2nd, Green 3rd) fills R3 pool with Red and R2 pool with Blue, Green. R2 heats are generated only when all six R1 heats are published, or when the organiser presses "Seed now" (missing places become DNS walkovers).
- Withdrawal before draw (N 18 → 17): regenerate gives 6 heats of 2/3/3/3/3/3, heat 1 has 2 riders ([1, 12] · [2, 11, 13] · [3, 10, 14] · [4, 9, 15] · [5, 8, 16] · [6, 7, 17]).
- Withdrawal after draw: slot keeps the rider with modifier DNS; heat still runs (`minRidersToRun 1`).
- Correction: re-publishing R1 Heat 1 with a different winner when R3 Heat 1 has status `running` → returns `conflict` listing the affected heat; nothing changes.
- Manual drag of a rider into another slot before start → `manual_override = true`; auto-seeding leaves that heat alone.

## 3. Timetable engine (`presets/schedule/kitemania-day2.json`)

### 3A — Main plan, anchors Women H1 = 10:30 and Advanced R2 H4 = 14:00 (Africa/Cairo)
| Item | Start | Dur | End | Break after |
|---|---|---|---|---|
| Women R1 Heat 1 | 10:30 (anchor) | 9 | 10:39 | 3 |
| Women R1 Heat 2 | 10:42 | 9 | 10:51 | 5 |
| Women R2 Heat 3 | 10:56 | 9 | 11:05 | 5 |
| Women Final | 11:10 | 15 | 11:25 | 15 |
| Advanced R2 Heat 4 | 14:00 (anchor) | 15 | 14:15 | 5 |
| Advanced Final | 14:20 | 18 | 14:38 | 15 |
| Pros R1 Heat 1 | 14:53 | 12 | 15:05 | 3 |
| Pros R1 Heat 2 | 15:08 | 12 | 15:20 | 3 |
| Pros R1 Heat 3 | 15:23 | 12 | 15:35 | 3 |
| Pros R1 Heat 4 | 15:38 | 12 | 15:50 | 5 |
| Pros R2 Heat 5 | 15:55 | 16 | 16:11 | 3 |
| Pros R2 Heat 6 | 16:14 | 16 | 16:30 | 5 |
| Pros Final | 16:35 | 18 | 16:53 | — |
Projected finish **16:53**. Rows before 14:00 must not be affected by the second anchor.

### 3B — Plan "Bad wind" (anchor Advanced R2 H4 = 09:30; order: Advanced R2, Advanced Final, Pros R1 H1–H4, Women R1 H1–H2, Women R2 H3, Women Final)
Starts: 09:30, 09:50, 10:23, 10:38, 10:53, 11:08, 11:25, 11:37, 11:51, 12:05 → finish **12:20**.

### 3C — Plan "Good wind" (same anchor; adds Pros R2 H5, H6 and Pros Final between Pros R1 H4 and Women)
Starts: 09:30, 09:50, 10:23, 10:38, 10:53, 11:08, 11:25, 11:44, 12:05, 12:38, 12:50, 13:04, 13:18 → finish **13:33**.

### 3D — Actual start cascade
Main plan; Pros R1 Heat 2 actually starts at **15:10** (two minutes late). Remaining projected starts: Heat 3 15:25, Heat 4 15:40, Heat 5 15:57, Heat 6 16:16, Final 16:37 → finish **16:55**. Earlier rows unchanged.

### 3E — Hold and resume
Main plan; hold set at 15:30 during Pros R1 Heat 3 → Heat 3 keeps its actual start; all un-started rows show `held` without times. Resume at 16:00 → Heat 4 anchored 16:00 → Heat 5 16:17, Heat 6 16:36, Final 16:57. "Shift +10" instead → Heat 4 anchor 15:48 (15:38 + 10).

### 3F — Plan switch
Switching the active plan from Main to "Good wind" after Women's heats have actual starts keeps those actual starts (matched by heatId) and re-flows the rest.

## 5. Rider identification chips (`presets/identification/schemes.json`)
- `vests-per-heat`: slot 2 of any heat → chip primary text "YELLOW" with hex `#facc15`; secondary shows name and nationality; `heat_slots.vest_colour = "yellow"`.
- `fixed-lycra-per-rider`: two entries with `identifiers.vest_colour = "red"` seeded into the same heat → `expandFormat` returns a warning naming that heat; the draw still generates.
- `bib-numbers` with `bibNumbering = per_division`: numbers 1..N assigned in seed order per division; chip primary "14"; callout label "number".
- `kites-no-vests`: entry with kite {brand "North", model "Orbit", size 9, colours "blue/white"} → chip primary "North Orbit 9 · blue/white"; two riders with identical brand+size+colours in one heat → warning.
- `brand-launch-same-kites`: slot has no vest colour and the rider has `rashguard_colour = "green"` → primary falls back to "GREEN" (rash guard) and secondary shows "9 m · blue/white", name, photo.
- Any scheme: chip text never relies on colour alone (colour name is always present); every preset in the file parses with the Zod schema.

## 4. Acceptance checks per build phase (what you test on your phone)
- **Phase 1–2**: `npm test` green; ask Claude to print the 1A breakdown as text and compare with this doc.
- **Phase 3**: judge PIN join works on a phone; a judge cannot open another heat's scorecard (RLS test green).
- **Phase 4**: create division → import 10 riders → generate heats-of-4 draw → compositions match §2A (N = 10) → run order with two anchors → times match the pattern in §3A → switch the identification scheme from vests-per-heat to kites-no-vests and confirm the rider chips on the draw change accordingly (§5).
- **Phase 5**: 3-phone run-through (spotter logs, two judges score, head judge publishes) → totals equal the engine breakdown; airplane-mode judge for 20 s → no duplicates, badge returns to synced.
- **Phase 6**: public page updates within 2 s of publish; big screen rotates; timetable shows est./pinned/live states.
- **Phase 7**: WOO toggle on → spotter can enter metres; Highest Jump leaderboard; exports open; paper sheets print.
- **Phase 8**: dry run per doc 09 completed end to end without touching the database manually.
