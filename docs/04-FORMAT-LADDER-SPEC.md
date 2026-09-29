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
  seeding: "snake" | "sequential" | "manual";
  uneven: "byes_top_seeds" | "smaller_heats_for_top_seeds";            // what to do when N is not a multiple of heatSize
  reseed: "by_original_seed" | "by_heat_score" | "by_place_then_score"; // how riders arriving from earlier rounds are ordered before seeding
  advance: Array<{ places: number[] | "rest"; to: string | "eliminated" | "final_placing" }>;
  minRidersToRun: number;                                               // default 1 (walkover allowed)
};
```

### Generators (expand to concrete rounds for any N)
- **`single_elimination`** — params `heatSize` (default 4), `advancePerHeat` (default 2), `finalSize` (default 4), `finalMin`, `earlyMin`. Rounds are created until one heat of `finalSize` remains. Byes go to top seeds when `uneven = byes_top_seeds`; otherwise heats are sized as evenly as possible with top seeds in the smaller heats.
- **`dingle_elimination`** (Red Bull King of the Air 2026 structure) — params `r1HeatSize = 3`, `finalSize = 3`, `r1Min = 13`, `repMin = 10`, `koMin = 10`, `finalMin = 15`. Round 1 heats of 3: 1st → Round 3; 2nd & 3rd → Round 2 (repechage, heats of 2, winner → Round 3, loser eliminated with shared place). From Round 3: man-on-man single elimination until a `finalSize` final. Optional flag-out in R1 at minute 8, count 1.
- **`pools_to_final`** (expression-session style) — params `heatSize ≤ 10`, `finalists`, `poolMin`, `finalMin`. Every rider rides once in a pool heat; all pool riders are ranked by heat total across pools (same scoring model) and the top `finalists` go to one final. Used for beginner/amateur divisions.

Fixed templates shipped: `megaloop-men-16`, `megaloop-women-6`, `kota-18-dingle` (fixed version for exactly 18), `heats4-top2-single-elim` (generator config), `pools-to-final` (generator config), `club-heats-of-4-top2-8-riders` is just the generator at N=8.

## 3. Expansion algorithm (`expandFormat(template, entrants, overrides) → DivisionDraw`)

1. Validate `entrants.length` within `template.entrants`. If below `minRidersToRun` for the first round, return a single "Final" round (everyone in one heat) with a warning — small divisions must still run.
2. Produce `RoundSpec[]` (fixed or generated).
3. For each round, compute heats: `H = ceil(N / heatSize)`. Distribute ordered entrants by **snake seeding**: seeds 1..H go to heats 1..H, seeds H+1..2H go to heats H..1, and so on. Uneven N: with `smaller_heats_for_top_seeds` the earlier heats are the smaller ones (e.g. N=7, size 4 → [1,4,5] and [2,3,6,7]; N=10 → [1,6,7], [2,5,8], [3,4,9,10]). With `byes_top_seeds`, top seeds skip the round and enter its target round directly.
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
- `dingle_elimination` at N = 18: 6 R1 heats of 3 → R2 6 heats of 2 (from 2nd/3rd places, 12 riders) → R3 6 heats of 2 (6 R1 winners + 6 R2 winners) → SF 3 heats of 2 → Final of 3; eliminated in R2 share 13th.
- `megaloop-men-16`: 8 → (8 winners to R3, 8 runners-up to R2 of 4 heats → 4 winners to R3) → R3 6 heats → SF 3 → Final 3.
- `pools_to_final` N = 23, heatSize 10, finalists 6 → pools of 8/8/7 (smaller heats for top seeds rule gives 7/8/8 — assert the configured rule), final of 6.
- Withdrawal before the draw re-seeds; after the draw creates a DNS walkover.
- Correction of an already-published heat whose target heat has started → conflict returned, no silent change.
