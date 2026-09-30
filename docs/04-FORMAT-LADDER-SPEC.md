# 04 — Format, Ladder & Timetable Specification

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Companion files: `presets/formats/*.json`, `presets/schedule/kitemania-day2.json`, `docs/08-TEST-SCENARIOS.md`

Lives in `src/lib/engine/ladder/` (format expansion + progression) and `src/lib/engine/schedule/` (timetable). Pure functions, Zod-validated configuration, unit-tested.

## 1. Concepts

- **Division** — entrants + one `ScoringModel` + one `FormatTemplate` (+ overrides). Divisions run independently but share the day's **run order**.
- **Round** — a stage (Round 1, Repechage, Quarter-final, Final). Has heat size, duration, break defaults, entrant sources and advancement rules.
- **Heat** — a timed session with 1–10 slots. Slots carry a bib colour, a rider (or "TBD — winner of Heat 3"), and after publishing: place, total, breakdown.
- **Entrant source** — where a round's riders come from: the seed list, or places from earlier rounds (e.g. "2nd and 3rd of every Round-1 heat").
- **Advancement rule** — where each heat place goes next ("1st → Round 3", "2nd–3rd → Round 2", "rest → eliminated, shared 13th").
- **Seeding** — order used to fill heats: original seed (entry list order/ranking), or performance in the previous round.
- **Run order** — the day's ordered list of heats and breaks across all divisions; drives the **timetable**.

## 2. `FormatTemplate` schema

```ts
type FormatTemplate = {
  id: string; name: string; description?: string; basedOn?: string;
  entrants: { min: number; max: number | null };                       // sizes the template supports
  vestColours: string[];                                                // palette by slot, used ONLY when the event's identification scheme assigns vests per heat slot (docs/06 §0); default ["red","yellow","blue","green","white","black","orange","pink","purple","grey"]
  timing: { defaultHeatMin: number; defaultBreakAfterHeatMin: number; defaultBreakAfterRoundMin: number };
  kind: "fixed" | "generator";
  rounds?: RoundSpec[];                                                  // kind = fixed
  generator?: { type: "single_elimination" | "dingle_elimination" | "pools_to_final"; params: Record<string, number | string> }; // kind = generator → expanded into RoundSpec[] for N entrants
  placings: { eliminated: "shared" | "by_heat_score"; finalHeatIsRanking: true };
  flagOut?: { rounds: string[]; atMin: number; count: number };       // KOTA-style: at minute atMin, the lowest-ranked `count` riders are flagged out
};

type RoundSpec = {
  id: string; name: string; shortName: string;                          // "R1", "REP", "QF", "SF", "F"
  heatSize: number;                                                     // target riders per heat
  durationMin: number; breakAfterHeatMin?: number; breakAfterRoundMin?: number;
  entrantsFrom: Array<{ type: "seeds" } | { type: "round_places"; round: string; places: number[] }>;
  seeding: "snake" | "sequential" | "manual" | "random";               // random = shuffle the entry list, then treat that order as seeds
  uneven: "smaller_heats_for_top_seeds" | "one_larger_heat" | "byes_top_seeds"; // what to do when N is not a multiple of heatSize (default smaller_heats_for_top_seeds)
  heatCountOverride?: number;                                           // organiser-set number of heats; wins over `uneven`
  reseed: "by_original_seed" | "by_heat_score" | "by_place_then_score"; // how riders arriving from earlier rounds are ordered before seeding
  advance: Array<{ places: number[] | "rest"; to: string | "eliminated" | "final_placing" }>;
  minRidersToRun: number;                                               // default 1 (walkover allowed)
};
```

### Generators (expand to concrete rounds for any N)
- **`single_elimination`** — params `heatSize` (default 4), `advancePerHeat` (default 2), `finalSize` (default 4), `finalMin`, `earlyMin`. Rounds are created until one heat of `finalSize` remains. Byes go to top seeds when `uneven = byes_top_seeds`; otherwise heats are sized as evenly as possible with top seeds in the smaller heats.
- **`dingle_elimination`** ("Knockout with a second chance"; inspired by the Red Bull King of the Air 2026 structure) — params `r1HeatSize = 3` (the target), `minHeatSize`, `maxHeatSize`, `secondChancePlaces` (absent = everyone who did not win), `finalSize = 3` (the size aimed for), `r1Min = 13`, `repMin = 10`, `koMin = 10`, `finalMin = 15`. Round 1 heats follow the sizing rule (Decision 23); the winner of each heat goes to the main draw and the other riders (or the next `secondChancePlaces`) go to the Second-chance round; its winners join the main draw, which runs as many rounds as it needs to reach the final. **Every round uses the same three numbers**; the number of heats and how many riders advance per heat are planned by `planSecondChance` (Decision 27). Nobody advances without riding. Optional flag-out in R1 at minute 8, count 1.
- **`pools_to_final`** (expression-session style) — params `heatSize ≤ 10`, `finalists`, `poolMin`, `finalMin`, `poolRounds` (1 or 2, default 1), `poolCombine` (`best` | `sum`, default `best`; used only when `poolRounds = 2`). Every rider rides once (twice with `poolRounds = 2`) in a pool heat; all pool riders are ranked by heat total across pools (same scoring model; with two pool rounds, the best or the sum of their two heat totals per `poolCombine`) and the top `finalists` go to one final. Used for beginner/amateur divisions.
- **`double_elimination`** — params `heatSize` (target, default 3), `minHeatSize`, `maxHeatSize`, `advancePerHeat` (optional; absent = the top half of the smallest heat), `finalSize` (even, default 4: the top `finalSize / 2` of each draw), `mainMin`, `secondMin`, `finalMin`. Main draw rounds `M1…`, Second-chance draw rounds `S1…`, then `F`. Decision 28.
- **`qualifying_to_finals`** — params `heatSize`, `minHeatSize`, `maxHeatSize`, `qualifyingRounds` (1–3, default 2: "Heats per rider"), `qualifyingCombine` (`best` | `sum`), `finalSize` (default 4), `smallFinalSize` (default 4; 0 = none), `qualifyingMin`, `smallFinalMin`, `finalMin`. Rounds `Q1…`, `SF` (Small final), `F`. The last qualifying round ranks everybody across all heats (`crossHeat` with `alsoTo`). Decision 29.
- **`round_robin`** — params `heatSize`, `minHeatSize`, `maxHeatSize`, `heatsPerRider` (2–10, default 3), `pointsTable` (optional; absent = heat size + 1 − place), `heatMin`. Rounds `RR1…`; every round holds every rider; from round 2 the heats are dealt with `seeding: "rotate"`. The last round ranks by points over all rounds (`crossHeat` with `over`). Decision 30.
- **`single_final`** — params `finalMin`. One heat with everybody (a warning above 10 riders). Decision 31.

Fixed templates shipped: `megaloop-men-16`, `megaloop-women-6`, `kota-18-dingle` (fixed version for exactly 18), `heats4-top2-single-elim` (generator config), `pools-to-final` (generator config), `club-heats-of-4-top2-8-riders` is just the generator at N=8.

## 3. Expansion algorithm (`expandFormat(template, entrants, overrides) → DivisionDraw`)

1. Validate `entrants.length` within `template.entrants`. If below `minRidersToRun` for the first round, return a single "Final" round (everyone in one heat) with a warning — small divisions must still run.
2. Produce `RoundSpec[]` (fixed or generated).
3. For each round, compute heats with the **capacity-aware snake**:
   - **Seeds** = the entry order: organiser-ranked, imported ranking, or `random` (shuffle, then treat the shuffled order as seeds 1..N).
   - **Number of heats H**: `uneven = smaller_heats_for_top_seeds` (default) → `H = ceil(N / heatSize)`; `uneven = one_larger_heat` → `H = floor(N / heatSize)` when no heat would then exceed `heatSize + 1`, otherwise `H = ceil(N / (heatSize + 1))`; leftover riders go into the last heats and no heat ever exceeds `heatSize + 1` (Decision 2); `uneven = byes_top_seeds` → top seeds skip the round and enter its target round directly. An explicit `heatCountOverride` from the organiser wins over all of these.
   - **Capacities**: `base = floor(N / H)`, `extra = N mod H`; the first `H − extra` heats hold `base` riders and the last `extra` heats hold `base + 1`, so top seeds always land in the smaller heats.
   - **Deal** seeds 1..N in snake order (heats 1→H, then H→1, …), skipping heats that are already full.
   - Worked results that must hold: N=7 size 4 → [1,4,5] [2,3,6,7]; N=10 size 4 → [1,6,7] [2,5,8] [3,4,9,10]; N=13 size 3 default → [1,10] [2,9] [3,8,11] [4,7,12] [5,6,13]; N=13 size 3 `one_larger_heat` → [1,8,9] [2,7,10] [3,6,11] [4,5,12,13]; N=13 size 4 `one_larger_heat` → [1,6,7,12] [2,5,8,11] [3,4,9,10,13].
4. Slots in later rounds hold **placeholders** (`{ from: { round: "R1", heat: 2, place: 1 } }`) until results exist; the public bracket shows "Winner H2".
5. Identification: if the event's scheme assigns vests per heat slot, assign colours by slot index from the palette; otherwise slots carry the rider's fixed identifiers (fixed lycra colour, bib number, kite, rash guard) and the generator returns **warnings** when two riders in the same heat share a primary identifier (same lycra colour, same kite brand+size+colours) so the organiser can swap slots. Heat numbering is division-wide and sequential (Heat 1…Heat n) — matches your Kitemania sheet.
6. Every heat gets `durationMin` and default breaks from the round → used by the schedule engine.

## 4. Progression algorithm (`applyHeatResult(draw, heatId, rankedResult) → DivisionDraw`)

1. On **publish** of a heat, write each rider's place/total into its slot.
2. For each `advance` rule, push riders at those places into the target round's **arrival pool** with `{ fromHeat, place, total, originalSeed }`.
3. When every source heat of the target round is published (or the organiser presses **"Seed now"** to proceed with TBDs filled by walkovers), order the pool by the round's `reseed` rule and snake-seed into its heats. `by_place_then_score` = 1st-places first ordered by total, then 2nd-places, etc. (the KOTA repechage "reseeded" behaviour).
4. `eliminated` riders receive a **final placing**: `shared` → equal place = (number of riders still alive) + 1, displayed "13=" style; `by_heat_score` → ranked among the eliminated of that round by total.
5. The final heat's ranking gives places 1..k.
6. **Un-publish / correction**: re-running a heat's result re-computes downstream pools; if a downstream heat already started, the engine refuses and returns the conflict for a manual decision.
7. **Withdrawals / no-shows**: mark entry `withdrawn`; before the draw → removed and re-seeded; after → the slot becomes a walkover (DNS) and the heat still runs if `minRidersToRun` is met.
8. **Manual override**: the organiser can drag any rider into any slot before a heat starts; the engine records `manualOverride = true` and stops auto-seeding that heat.

## 5. Overall event placings and points
`divisionPlacings(draw)` returns each rider's final place (1st…, shared places for eliminated rounds). Optional `pointsTable` (per placing) for series rankings — later phase.

## 6. Flag-out
For rounds listed in `flagOut.rounds`: the head-judge console shows a "Flag-out" button at `atMin`. The engine ranks on current totals, marks the lowest `count` riders `flaggedOut`; their attempts after that moment are ignored; their heat place is fixed at the bottom. No flag-out in finals unless configured.

## 7. Schedule & Timetable engine (`src/lib/engine/schedule/`) — from your Kitemania sheet

Your spreadsheet encodes exactly the right model: **one manually anchored start**, `End = Start + Duration`, `Next start = End + Break`, a **second anchor** where you deliberately re-pinned a block (Advanced Round 2 at 14:00), and **alternative running orders** for good vs bad wind. The engine reproduces this and adds live behaviour.

### 7.1 Schema
```ts
type RunItem =
  | { id: string; kind: "heat"; heatId: string; durationMin?: number; breakAfterMin?: number }   // durations default from the round; per-item override allowed
  | { id: string; kind: "break"; label: string; durationMin: number }                             // lunch, prize giving, riders' briefing, safety demo
  | { id: string; kind: "note"; label: string };                                                  // zero-length marker ("Wind call 09:00")

type SchedulePlan = {
  id: string; name: string;                     // "Plan A – Good wind", "Plan B – Bad wind"
  eventDay: string;                             // "2026-10-03"
  timezone: string;                             // "Africa/Cairo"
  items: RunItem[];                             // the run order across all divisions
  anchors: Record<string, string>;              // itemId → "HH:MM" pinned start (at least the first item)
  actualStarts: Record<string, string>;         // itemId → ISO timestamp when the heat really started (set automatically by the head judge's Start button)
  hold?: { since: string; reason?: string };    // wind hold in progress
  defaults: { breakAfterHeatMin: number; breakAfterRoundMin: number; readyCallMin: number };  // readyCallMin = "be at the launch 15 min before"
  active: boolean;                              // exactly one active plan per event day
};
```

### 7.2 Computation (`computeTimetable(plan, heats) → TimetableRow[]`)
Walk `items` in order keeping a cursor `t`:
- If the item has an **actual start** → `start = actualStart` (locked, shown as "live"/"done").
- Else if the item has an **anchor** → `start = anchor` (locked, shown with a pin).
- Else → `start = previousEnd + previousBreak` (projected, shown as "est.").
- `end = start + durationMin`; `previousBreak = item.breakAfterMin ?? round default ?? plan default` (a round's last heat uses `breakAfterRoundMin`).
- Output per row: division, round, heat, riders (or TBD), start, end, break, status (`done | live | next | est | held`), `readyCallAt = start − readyCallMin`.
- **Wind hold**: while `hold` is set, every un-started row shows `held` with no times; on **Resume**, the head judge picks the restart time → written as an anchor on the next item, and the cascade continues. "Shift everything by +N min" = add N to the next un-started item's anchor.
- **Late/early finishes** cascade automatically because the next projected start uses the previous *actual* end when the heat has ended (`actualEnd = actualStart + duration`, or the head judge's early "End heat").
- **Switching plans**: the organiser activates Plan B; anchors/actuals already recorded for heats that ran are preserved (heats identify by `heatId`, not position).

### 7.3 Test cases (exact expected times — see doc 08 §3)
From your sheet, **Kitemania Day 2**, Women anchored 10:30, Advanced R2 re-anchored 14:00:

| Division | Round | Heat | Start | Dur | End | Break |
|---|---|---|---|---|---|---|
| Women | R1 | Heat 1 | 10:30 | 9 | 10:39 | 3 |
| Women | R1 | Heat 2 | 10:42 | 9 | 10:51 | 5 |
| Women | R2 | Heat 3 | 10:56 | 9 | 11:05 | 5 |
| Women | Final | Final | 11:10 | 15 | 11:25 | 15 |
| Advanced | R2 | Heat 4 | **14:00** (anchor) | 15 | 14:15 | 5 |
| Advanced | Final | Final | 14:20 | 18 | 14:38 | 15 |
| Pros | R1 | Heat 1 | 14:53 | 12 | 15:05 | 3 |
| Pros | R1 | Heat 2 | 15:08 | 12 | 15:20 | 3 |
| Pros | R1 | Heat 3 | 15:23 | 12 | 15:35 | 3 |
| Pros | R1 | Heat 4 | 15:38 | 12 | 15:50 | 5 |
| Pros | R2 | Heat 5 | 15:55 | 16 | 16:11 | 3 |
| Pros | R2 | Heat 6 | 16:14 | 16 | 16:30 | 5 |
| Pros | Final | Final | 16:35 | 18 | 16:53 | — |

Plan "Bad wind" (Advanced first, anchored 09:30; Pros R1 only; Women last) finishes **12:20**; plan "Good wind" (adds Pros R2 + Final before Women) finishes **13:33**. If Pros R1 Heat 2 actually starts at 15:10 instead of 15:08, the remaining rows become 15:25 / 15:40 / 15:57 / 16:16 / 16:37, finishing **16:55**.

### 7.4 UI behaviour (details in doc 06)
- Organiser: build run order by dragging heats from each division's draw; set anchors by tapping a time; duplicate plan → edit → name it; activate one.
- Head judge: Start heat (records actual start → cascade), End heat early, Hold / Resume at…, Shift +5/+10.
- Public timetable: rows with est./pinned/live states, current heat highlighted, "Up next", and a rider's personal view "Your next heat: Pros R1 H3 — est. 15:23 — ready call 15:08". Times shown in event time zone with the label "Times are estimates and update live".
- Exports: PDF/PNG of the timetable for WhatsApp and the noticeboard (matches your spreadsheet layout: Division / Session / Start / Duration / End / Break).

## 8. Test cases for the ladder (see doc 08 §2)
- N = 7, 8, 10, 12, 16, 18, 24 with `heatSize 4` snake seeding → exact heat compositions.
- `dingle_elimination` at N = 18 (target 3, default minimum 2 and maximum 4): 6 R1 heats of 3 → Second chance 4 heats of 3 (the 12 other riders) → R3 4 heats of 2/2/3/3 (6 R1 winners + 4 second-chance winners) → Final of 4; eliminated in the second-chance round share 11th (doc 08 §2C, §2G2).
- `megaloop-men-16`: 8 → (8 winners to R3, 8 runners-up to R2 of 4 heats → 4 winners to R3) → R3 6 heats → SF 3 → Final 3.
- `pools_to_final` N = 23, heatSize 10, finalists 6 → pools of 8/8/7 (smaller heats for top seeds rule gives 7/8/8 — assert the configured rule), final of 6.
- Withdrawal before the draw re-seeds; after the draw creates a DNS walkover.
- Correction of an already-published heat whose target heat has started → conflict returned, no silent change.

## 9. Decisions log

All decisions below were agreed with the owner on 29 Sep 2026 (Phase 2 planning). The code and tests follow them; where they refine the text above, this section wins.

| # | Topic | Decision |
|---|---|---|
| 1 | Doc 08 §2F wording | Withdrawal N 18 → 17 with heat size 3 gives heats **2/3/3/3/3/3: heat 1 (seed 1) has 2 riders**, as the capacity-aware snake requires. Doc 08 §2F corrected. |
| 2 | `one_larger_heat` | Hybrid rule: `H = floor(N / heatSize)` when no heat would then exceed `heatSize + 1` (and H ≥ 1); otherwise `H = ceil(N / (heatSize + 1))`. No heat ever exceeds `heatSize + 1`; no warning. Checks: N=11 size 4 → 3 heats (3/4/4); N=13 size 3 → 4 heats; N=13 size 4 → 3 heats; N=5 size 4 → one heat of 5; N=20 size 4 → 5 heats of 4; N=25 size 4 → 4/4/4/4/4/5; N=30 size 4 → 4/4/4/4/4/5/5. (Revised 29 Sep 2026: replaces "`N / heatSize` if divisible, else `ceil(N / (heatSize + 1))`", which gave N=25 five heats of 5.) |
| 3 | Heats that eliminate nobody | The rule is kept (e.g. N=5, size 4, top 2 advance → [1,4] · [2,3,5]); `expandFormat` returns the warning "Heat X eliminates nobody" and suggests `heatCountOverride`. |
| 4 | `dingle_elimination` for N ≠ 18 (superseded by Decision 27) | After R1/R2, man-on-man rounds (heats of 2) continue while more than `2 × finalSize` riders remain; then one semi round with exactly `finalSize` heats (one winner each) feeds the final. Heats with one rider are byes, and the capacity rule gives them to the top seeds. N=18 is unchanged (22 heats). |
| 5 | Byes (one-rider heats) | The rider advances automatically. A bye gets no heat number and no timetable slot and shows as "Bye" on the bracket. |
| 6 | `byes_top_seeds` | Number of byes = `N mod heatSize` (so every heat that rides is full); byes go to the top seeds and enter the round's place-1 target. `heatCountOverride` turns byes off. |
| 7 | `pools_to_final` with `poolRounds = 2` | Pool round 2 is a fresh draw seeded by the round-1 score (riders meet different opponents). Cross-pool ties: the scoring model's tie-breakers applied to the deciding heat (for `poolCombine = sum`, the better single heat), then original seed. |
| 8 | Anchors (pins) | A pin means "not before": `start = max(pin, previous end + break)`. When the previous heat is expected to finish later, the start is pushed and the row carries a warning. |
| 9 | Actual times | Actual starts and ends come from the heat's server timestamps (`heats.started_at` / `ended_at`), not from the plan. Pins stay with their own plan and are not copied on a plan switch. |
| 10 | Plan switch | Done and live heats move to the top of the timetable in their actual order; un-started heats follow in the new plan's order, starting from the last actual end + break; un-started rows are never projected earlier than "now". |
| 11 | Running over / pause | A running heat's projected end = actual start + duration + paused minutes; if it is still running after that, its end is "now", so later rows slip live. |
| 12 | Break items | An explicit break item (lunch, briefing) replaces the previous heat's automatic break; it is not added on top. |
| 13 | Draft vs locked draw | A draw is a **draft** until `lockDraw()` is called (when the organiser confirms it). Withdrawing a rider from a draft re-seeds the field without them; from a locked draw the rider keeps the slot with modifier DNS (walkover) and the heat still runs if `minRidersToRun` is met. (Confirmed by owner, 29 Sep 2026.) |
| 14 | Trailing break after a plan switch | The last item of a plan usually has a 0-minute break. If a plan switch leaves such a heat followed by other rows, its 0 is ignored and the round's default break applies (the round-end break for a round's last heat, otherwise the heat break, then the plan default). (Confirmed by owner, 29 Sep 2026.) |
| 15 | "Seed now" walkovers | Missing places become DNS walkovers, dealt **last**, so they meet the top seeds. If the missing result is published later and the round has not started, the round is re-dealt with the real riders. (Accepted by owner, 29 Sep 2026.) |
| 16 | Pools ranking field | Pool rounds use an optional round field `crossHeat { advanceTop, to, combine }`: rank every rider across all heats of the round; the top `advanceTop` go to `to`, the rest are eliminated. Round ids are `P1`, `P2`, `F`. |
| 17 | Cross-pool tie-break | Tie on the pool ranking: the tie-break keys of the deciding heat (the higher-scoring heat; for `sum` the better single heat), then original seed. The scoring engine hands the keys over as `tieKeys` on each ranked rider. |
| 18 | `seeding: "manual"` | Deals in entry order and marks every heat of the round hand-arranged, so the engine never re-deals it. |
| 19 | Semi-final naming | The round before the Final is called "SF" only when it has exactly 2 heats and is not the first round; otherwise it is "R*n*". |
| 20 | Timetable return value | `computeTimetable` returns `{ rows, finish, finishUtc, warnings }`, so the projected finish (e.g. 16:53) is a real value; `finish` is null while any row has no time (hold, missing anchor). |
| 21 | Hold-and-resume test setup | Doc 08 §3E's 16:00 restart assumes Heat 3 has already ended (a paused Heat 3 would end later, Decision 11), so the test has Heat 3 finish at 15:35 before the resume. |
| 22 | Mixed round sources | A round fed by both the seed list and earlier rounds is not supported yet — `byes_top_seeds` covers the common case of top seeds entering a later round; revisit if a format needs pre-qualified riders entering mid-ladder. `expandFormat` refuses such a round with a clear error. |
| 23 | Riders per heat: target, minimum and maximum (owner, Phase 4a-1) | Every generated format has three plain numbers: **Riders per heat (target)**, **Minimum per heat** (default: target − 1, never below 2) and **Maximum per heat** (default: target + 1, at most 10); the organiser may set min = max = target. The number of heats is the one that keeps every heat between the minimum and the maximum with sizes closest to the target: heats above the target count far more than heats below it, so ceil(N / target) heats is used whenever every heat can meet the minimum; otherwise fewer heats (the last heats bigger); with two equally close options, the one with fewer heats. A field smaller than the minimum is one heat with everyone. Top seeds go to the smaller heats (snake deal over the sizes, smallest first). The minimum wins over the maximum when no split within both limits exists (11 riders, 4 / 4 / 4 → 5/6; 7 riders → one heat of 7) and the draw carries a `heat_size_limits` warning. When the whole first round would be one heat it is the final. Round fields `uneven = "minimum_riders"`, `minHeatSize`, `maxHeatSize` carry the rule; the older `uneven` options (smaller heats for top seeds, one larger heat, top seeds advance without riding) stay only in the custom ladder builder. The rule applies to **every** generated round (Decision 27 for second-chance ladders). The pools preset sets a minimum of 6 so 23 riders still make three pools (7/8/8). Note: read literally "closest to the target, fewer heats on a tie" would make 13 riders at 4 / 3 / 5 → 4/4/5 and 14 at 4 / 3 / 5 → 4/5/5; the owner's earlier examples (3/3/3/4 and 3/3/4/4) are kept, hence "not above the target if it can be helped". |
| 24 | Plain words in ladders (owner) | Users never see "bye", "repechage", "dingle elimination" or "man-on-man". A rider who advances without riding is labelled "Advances without riding"; the extra round is the "Second-chance round" (heats "Second chance H1…"); 2-rider heats are "1 v 1 heats"; the two draws are the "Main draw" and "Second-chance draw". Placeholder slots read "1st H1", "2nd H3", "1st R2 H5" (place, the round when it is not the previous round, the heat) and "1st of all heats" for pools. |
| 25 | Minimum heats per rider | `minHeatsPerRider(draw)` (pure) gives the fewest heats any rider is guaranteed, whatever the results (a rider who advances without riding counts none for that round). The format preview shows it ("Minimum heats per rider: 2"). Knockout and pools: 1; knockout with a second chance: at least 2. |
| 26 | Heat length per round | Generated ladders accept `roundDurationMin` (round id → minutes); breaks stay global (see docs/06 decision 35). |
| 27 | Second-chance ladder: every round follows the sizing rule (owner) | Replaces the fixed 1 v 1 structure of Decision 4. Round 1 is sized by Decision 23; the winner of each heat goes to the main draw; the other riders get a second chance (`secondChancePlaces` absent = all of them, so every rider rides at least 2 heats; set to N = only the next N places, the rest are out after one heat, shown as "4th → out" and the menu tag changes). The Second-chance round and every main-draw round are sized by the same three numbers. `planSecondChance` (pure, `second-chance-plan.ts`) chooses the number of heats and how many advance per heat, in this order: (1) every heat between the minimum and maximum, (2) no round before the Final is a single heat, (3) no round sends more than half of its smallest heat on, except the round feeding the Final (so e.g. top 2 of 2 heats of 3 → a Final of 4), (4) a Final of at least the size aimed for (`finalSize`), (5) heat sizes closest to the target, (6) fewer rounds, (7) a larger Final. Nobody ever advances without riding in a generated ladder (the "Advances without riding" label remains for hand-built ladders). Fields too small to keep all three numbers get a single second-chance heat or a `heat_size_limits` warning rather than a hidden rule break. Examples: 14 riders, 3 / 3 / 4 → R1 3/3/4/4 → Second chance 3/3/4 → Semi-finals 3/4 → Final of 4 (10 heats); with `secondChancePlaces = 2`: R1 3/3/4/4 → Second chance 4/4 → Semi-finals 3/3 → Final of 4 (9 heats). |
| 28 | Double elimination (owner, Phase 4a-1) | Lose once → the Second-chance draw; lose twice → out. **In every heat the top half stay in their draw, the bottom half drop** (owner's answer): from the Main draw to the Second-chance draw, from the Second-chance draw out. "How many advance" (`advancePerHeat`) is the number that stay; empty = the top half of the smallest heat. Both draws end in one heat whose top `finalSize / 2` go to the Final (**owner: "top 2 of each draw for now", to be decided on the day, so `finalSize` is a setting; 2 = the two draw winners meet**). Stage t: Main draw round t (≥ 2 heats unless it is the last), then Second-chance draw round t (the riders who dropped + the survivors of round t − 1). `planDoubleElimination` (pure) picks heats and advance counts in this order: (1) every heat between the minimum and maximum, (2) no Second-chance round before the last is a single heat, (3) advance counts as close to the top half as possible, (4) heat sizes closest to the target, (5) fewer rounds. Some field sizes cannot keep all three numbers (3 / 3 / 4 with 13 riders; 7–8 riders): the draw then carries a `heat_size_limits` warning. Riders eliminated in the same round share their place ("7="). |
| 29 | Qualifying heats + finals | The last qualifying round ranks all riders across heats (best or sum of their heats). The best `finalSize` ride the Final, the next best `smallFinalSize` a Small final (only when at least the minimum riders are left for it), the rest are placed **by their qualifying rank, one place each** (`placings.eliminated = by_heat_score`). A Small final rider's place starts after the Final's (`placeOffset` = the Final's size). A field that fits in the Final rides one heat. Round field `crossHeat.alsoTo { count, to }` carries the second tier; `crossHeat.to = "final_placing"` marks a ranking that is the result. "Every rider gets at least 2 heats" holds with the default 2 qualifying heats each; with 1 the tag says "can be out after 1 heat". |
| 30 | Round robin | `heatsPerRider` rounds, each with every rider in heats sized by the rule. Round 1 is the snake deal; later rounds use `seeding: "rotate"` (`dealRotate`: riders go where they meet the fewest riders they have already ridden against, then swaps while that lowers the repeats). Repeats are avoided when the field allows it (16, 20, 24 or 30 riders: none) and are the fewest possible otherwise. Points per heat: `pointsTable` (1st, 2nd, …) or, absent, heat size + 1 − place; the ranking is the sum over all rounds (`crossHeat.combine = "points"`, `over` = the earlier rounds), ties by the best single heat, then seed. Owner answer: "place points, editable". |
| 31 | Single final | One round `F` with one heat of everybody; above the template maximum of 10 riders the draw carries `above_template_max` and `heat_size_limits` warnings. |
| 32 | Format tab: one picker, fixed templates hidden, names (owner) | The seven cards (Knockout, Knockout with a second chance, Double elimination, Qualifying heats + finals, Pools to a final, Round robin, Single final) are the only picker; a card loads that type's built-in format (`KIND_PRESET_KEY`). "Load a saved format…" pre-fills the card from a saved format. Fixed templates carry `hidden: true` and are not offered (Megaloop men and women keep their files and tests). Round and heat names are overrides keyed by round id (`roundNames`) and heat id (`heatNames`, "R1-H2"); they live in the division's format overrides, survive regeneration (a heat name applies again where that heat id exists), and are carried on `DrawRound.name` / `DrawHeat.name` for the timetable and public pages. |
