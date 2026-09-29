# 03 — Scoring Engine Specification (configurable, pure, tested)

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Companion files: `presets/scoring/*.json`, `docs/08-TEST-SCENARIOS.md` (authoritative expected numbers)

## 1. Purpose and principles

The engine turns judges' marks into heat totals and rankings for **any** Big Air scoring model, driven by a `ScoringModel` JSON document. It lives in `src/lib/engine/scoring/` and:

- is **pure** (no database, no React, no clock) and deterministic;
- returns a **breakdown** with every number so the head judge, riders and commentators can see *why* a total is what it is;
- treats every rule as configuration validated by Zod (`src/lib/schemas/scoring-model.ts`), with sensible defaults;
- is covered by unit tests whose expected values are in `docs/08-TEST-SCENARIOS.md`.

Real-world models it must reproduce out of the box (details and sources in `docs/02-DOMAIN-RULES-REFERENCE.md`):

| Preset id | Based on | Trick entry | Counting | Impression | Heat total |
|---|---|---|---|---|---|
| `kota-best3-impression` (**default**) | Red Bull King of the Air 2026 | 4 criteria 0–10 (Height, Extremity, Technicality, Execution) → mean | best 3 | yes, 0–10 | 0–40 (3×10 + 10); shown also as % |
| `gka-category-overall` | GKA Kite World Tour Big Air (approximation — encode Rulebook ch.5 for exact rules) | 4 criteria 0–10 → weighted mean | best 1 per trick category (default 3 categories) | yes ("Overall score") 0–10 | 0–40 |
| `pukl-points` | PUKL British Big Air Nationals | Height 0–3 + Risk 0–3 + Technicality 0–3 + Ingenuity 0–1 → **sum** = 0–10 | best 3 | no | 0–30 |
| `megaloop-single-best` | Red Bull Megaloop 2026 | Extremity 70% + Trick 15% + Style 10% + Landing 5% → weighted mean 0–10 | single best jump | no | 0–10 |
| `overall-impression` | Club heats / JudgeMate-style | none per trick | none | yes, 0–10 (only score) | 0–10 |
| `club-quick-best2` | Expression-session heats (PUKL Div 2.5 style) | single mark 0–10 per trick | best 2 | no | 0–20 |
| `legacy-kol-best3-variety` | The owner's previous app (KOL 26 U16) — scales confirmed by the owner | single mark 0–10 per trick, 7 attempts per rider | best 3 | yes, "Variety" 0–10 | 0–40 |

## 2. Concepts

- **Attempt** — one jump/trick by one rider in a heat. Fields: `seq`, `riderId`, `categoryKey?`, `trickName?`, `direction?: left | right`, `status: landed | crashed`, `heightM?` (sensor), `createdBy` (spotter seat or judge), `inputMethod: builder | text | speech`, `rawText?`, `deleted` (soft-deleted attempts are excluded from everything but kept for audit), `possibleDuplicateOf?`. Attempts exist independently of scores so a spotter can log them before judges mark them; the head judge may edit, delete/merge or add attempts at any time before publish (audited).
- **Judge score** — one judge's mark for one attempt: either a set of criteria values or one single value, per the model's `trick.entry`.
- **Panel trick score** — the judges' trick scores for one attempt aggregated per `panel.aggregate`.
- **Counted tricks** — the subset of a rider's panel trick scores that form the heat total, per `heat.counting`.
- **Impression** — optional per-rider, per-heat mark from each judge (aggregated the same way), added as a component.
- **Heat total** — sum of weighted components (counted tricks, impression, bonuses, penalties).
- **Rank** — riders ordered by heat total; ties resolved by ordered `tieBreakers`.
- **Modifiers** — DNS / DNF / DSQ / INT applied to a rider in a heat.
- **Height sensor module** — optional measured height per attempt (WOO), used for display, as the Height criterion, or as a bonus.

## 3. `ScoringModel` schema (Zod; TypeScript shape)

```ts
type Scale = { min: number; max: number; step: number };          // e.g. {0,10,0.1}

type Criterion = {
  key: string;            // "height" | "extremity" | ... (snake_case, unique)
  label: string;          // shown to judges
  help?: string;          // one-line judging hint shown on long-press
  scale: Scale;           // per-criterion scale (PUKL uses 0–3, 0–3, 0–3, 0–1)
  weight: number;         // used by combine = "weighted_mean"
  sensorFill?: "height";  // if heightSensor.use === "height_criterion", this criterion is auto-filled
};

type TrickCategory = { key: string; label: string; examples?: string[]; colour?: string };

type ScoringModel = {
  id: string; name: string; description?: string; version: number; basedOn?: string;
  trick: {
    entry: "criteria" | "single" | "none";   // none = judges score no tricks (overall-impression model)
    scale: Scale;                             // the trick score scale (result of combine, or the single mark)
    criteria: Criterion[];                    // required when entry = "criteria"
    combine: "weighted_mean" | "sum";         // weighted_mean → normalised to trick.scale; sum → Σ criteria (their maxes must add to trick.scale.max)
    crash: "not_counted" | "zero";            // crashed attempts: excluded from counting, or count as 0
    allowNoScore: boolean;                    // judge may mark an attempt "Missed" (didn't see it): excluded from the panel aggregate, visible to the head judge, never blocks publishing by itself
  };
  panel: {
    minJudges: number;                        // default 3
    maxJudges: number;                        // default 7
    aggregate: "mean" | "trimmed_mean" | "median";
    trimMinJudges: number;                    // trimmed_mean drops one high + one low only when judges >= this (default 5); below it, plain mean
    decimals: number;                         // rounding of panel scores and totals (default 2)
    outlierWarnPct: number;                   // head-judge warning if any two judges differ by more than this % of the trick scale range (default 15)
    requireAllJudges: boolean;                // block publish if any judge score is missing (default true; head judge can override with reason)
  };
  heat: {
    counting:
      | { type: "best_n"; n: number; distinctTrickNames?: boolean }   // distinctTrickNames: only the best of identically-named tricks may count (default false)
      | { type: "best_per_category"; maxPerCategory: number; categoriesCounted?: number; requireDistinctCategories: boolean }
      | { type: "single_best" }
      | { type: "all" }
      | { type: "none" };
    trickWeight: number;                       // multiplier on the sum of counted tricks (default 1)
    impression: null | { label: string; help?: string; scale: Scale; weight: number; required: boolean };  // required (default true): publishing waits until EVERY panel judge has an impression/variety mark for EVERY rider in the heat (head judge may override with reason)
    total: { display: "raw" | "percent" | "both"; maxRaw: number | "auto" };  // auto = n×trick.max (+ impression.max)
    landedRatioHint: boolean;                  // show landed/attempted to judges before impression (KOTA/GKA guidance)
    maxAttemptsPerRider?: number | null;       // cap on non-deleted attempts per rider per heat (e.g. 7); null/absent = unlimited; overridable per division; UI shows "5 / 7"
    duplicateWindowSec: number;                // attempts for one rider from different spotter seats within this many seconds are flagged possibleDuplicateOf (default 20)
  };
  categories: TrickCategory[];                  // editable per event; used by spotter and best_per_category
  tieBreakers: Array<"highest_counted_trick" | "next_counted_trick" | "impression" | "most_landed" | "highest_any_trick" | "head_judge" | "share_place">;
  modifiers: {
    interference: { penalty: "drop_best_trick" | "percent" | "points" | "none"; value?: number; allowMultiple: boolean };
    dns: { placing: "last"; total: 0 };
    dnf: { keepScores: boolean };               // true: rider keeps scores earned before stopping
    dsq: { placing: "last"; total: 0 };
  };
  heightSensor: {
    enabled: boolean;                           // default false (Gouna: judged by eye; WOO switchable)
    source: "manual" | "woo_api";
    use: "display" | "height_criterion" | "bonus";
    mapping?: { type: "linear"; fromM: number; toM: number; toScore: [number, number] } | { type: "bands"; bands: Array<{ minM: number; score: number }> };
    bonus?: { perMetreAbove: number; thresholdM: number; capPoints: number };
    award: { highestJump: boolean };            // ranks riders by max measured height for a side award
  };
};
```

Validation rules (Zod refinements): criteria keys unique; if `combine = "sum"` then Σ criteria `scale.max` = `trick.scale.max`; weights > 0; `n ≥ 1`; `minJudges ≥ 1` (organiser default 3, UI warns below 3); `impression.weight ≥ 0`; if `heightSensor.use = "height_criterion"` exactly one criterion has `sensorFill = "height"`.

## 4. Algorithm

### 4.1 Judge trick score
For attempt *a* and judge *j*:

- `entry = "single"` → `s(a,j)` = the mark, snapped to `trick.scale.step`.
- `entry = "criteria"`, `combine = "weighted_mean"` → `s = (Σ w_c · (v_c − min_c)/(max_c − min_c)) / Σ w_c · (trick.max − trick.min) + trick.min`. With equal weights on 0–10 criteria this is the plain mean.
- `combine = "sum"` → `s = Σ v_c`.
- Crashed attempt: no criteria are entered; `s` is undefined and the attempt is handled by `trick.crash`.
- Judge may submit **Missed** when `allowNoScore`: excluded from aggregation, recorded as `missedBy`, and *not* counted as a missing mark for `requireAllJudges` (a judge who genuinely didn't see a trick should not block the heat). If every judge missed an attempt it has no panel score and is not counted.
- Soft-deleted attempts (duplicates, spotter errors) are ignored entirely; attempt counters and `maxAttemptsPerRider` exclude them.

### 4.2 Panel trick score
Let `S = { s(a,j) }` for judges who scored. `k = |S|`.

- `mean` → average.
- `trimmed_mean` → if `k ≥ trimMinJudges`: drop exactly one highest and one lowest, average the rest; else average all.
- `median` → middle value (average of two middles when even).
- Round to `panel.decimals` (half-up). Keep the unrounded value in the breakdown.
- If a panel judge has entered nothing for this attempt → mark `incomplete = true` and list them in `missing`. A judge who pressed **Missed** is listed in `missedBy` instead and does **not** make the score incomplete (doc 08 §1F is authoritative).
- Outlier flag: if `max(S) − min(S) > outlierWarnPct% × (trick.max − trick.min)` → `outlier = true` (head-judge console highlights).

### 4.3 Counted tricks for a rider
Eligible = panel scores of the rider's attempts with status `landed` (plus `crashed` as 0 if `crash = "zero"`), each tagged with its category.

- `best_n` → top `n` by score (stable: earlier `seq` first on equal scores). If `distinctTrickNames`, first keep only the best attempt per normalised trick name (case/whitespace-insensitive), then take the top `n`.
- `maxAttemptsPerRider` (if set) is enforced by the server when attempts are logged; the engine additionally ignores every non-deleted attempt after the cap, counted in `seq` order (not by `seq` number, because deleted attempts keep their numbers), and sets `flags.extraAttemptsIgnored`.
- Every attempt carries `repeatIndex` = number of earlier non-deleted **landed** attempts by the same rider in the heat with the same normalised trick name (0 = first landing), and `priorCrashesSameTrick` = number of earlier non-deleted **crashed** attempts with that name. Display only ("repeated trick" badge, "crashed once before" note); no penalty unless `distinctTrickNames` is on.
- `best_per_category` → for each category take the top `maxPerCategory`; keep the top `categoriesCounted` categories by their best score (default = all categories); if `requireDistinctCategories` and a category has no landed attempt it simply contributes nothing.
- `single_best` → top 1. `all` → everything. `none` → nothing.
- Fewer eligible tricks than `n` → count what exists (missing slots contribute 0).

### 4.4 Components and heat total
- `tricks = trickWeight × Σ counted`
- `impression = weight × panelAggregate(impression marks)` (same aggregation & rounding as tricks; 0 if not configured or not yet entered).
- `bonus` (height sensor `use = "bonus"`): `min(capPoints, perMetreAbove × max(0, maxHeightM − thresholdM))`.
- `penalty` (interference): `drop_best_trick` removes the top counted trick and recounts; `percent` → `−value% × subtotal`; `points` → `−value`.
- `total = tricks + impression + bonus − penalty`, rounded to `decimals`, never below 0. `tricks` is the sum of the **rounded** panel scores of the counted tricks. `percent = total / maxRaw × 100` when requested. `maxRaw = "auto"` → `n × trick.max × trickWeight + impression.max × impression.weight` (+ bonus cap).

### 4.5 Ranking
Sort by `total` desc. Riders with DNS/DSQ rank last (DSQ below DNS), total shown as `—`. DNF riders keep or lose scores per `dnf.keepScores` and rank by total. Ties (equal rounded totals) resolved in `tieBreakers` order:

1. `highest_counted_trick` – compare best counted trick; 2. `next_counted_trick` – then the second, third…; 3. `impression`; 4. `most_landed` – count of landed attempts; 5. `highest_any_trick` – best trick even if not counted; 6. `head_judge` – manual decision recorded with reason; 7. `share_place` – equal placing allowed (only if listed).

If the list is exhausted without `share_place` or `head_judge`, the engine returns `tieUnresolved = true` and the UI forces a head-judge decision (or re-ride) before publishing.

### 4.6 Flag-out (KOTA Round 1 style)
Not a scoring rule but the engine exposes `rankAt(time)`: at `flagOut.atMin` the head judge presses "Flag out"; the engine ranks riders on scores so far and marks the lowest `count` as `flaggedOut` (their scores stay; they cannot add attempts; their final heat placing is fixed at the bottom). Configured in the format (see doc 04), consumed here.

## 5. Public API (pure functions)

```ts
parseScoringModel(json: unknown): ScoringModel                       // Zod, throws readable errors
judgeTrickScore(model, criteriaOrSingle): { score: number; detail }
panelScore(model, judgeScores: Array<{judgeId; score}>, panelJudgeIds): { score; unrounded; incomplete; missing: judgeId[]; outlier: boolean }
computeHeat(model, input: HeatInput): HeatResult
rankHeat(model, results: RiderResult[]): RankedResult[]           // applies tie-breakers, returns tieUnresolved flags
explain(result: RiderResult): string[]                              // plain-language lines for the UI/commentary
```

`HeatInput = { panelJudgeIds: string[]; riders: Array<{ riderId; modifiers: Modifier[]; attempts: Attempt[]; impressionMarks: Array<{judgeId; value}>; maxHeightM? }> }`

`RiderResult = { riderId; total; percent?; components: { tricks, impression, bonus, penalty }; counted: Array<{attemptSeq, score, categoryKey}>; allAttempts: Array<{seq, status, panel: PanelScore}>; flags: { incomplete, outliers: seq[], tieUnresolved? }; modifiers }`

## 6. Worked examples (these are the unit tests — exact numbers in doc 08)

**A. KOTA preset, 3 judges (mean).** Rider Red: 5 attempts; #4 crashed (not counted).

| # | Trick | J1 mean of 4 criteria | J2 | J3 | Panel |
|---|---|---|---|---|---|
| 1 | Kiteloop board-off | 7.63 | 7.75 | 7.75 | **7.71** |
| 2 | Double loop | 8.25 | 8.25 | 8.25 | **8.25** |
| 3 | Late backroll kiteloop | 7.25 | 7.38 | 7.25 | **7.29** |
| 4 | Board-off — crashed | — | — | — | not counted |
| 5 | Contra loop | 8.13 | 8.00 | 8.13 | **8.08** |

Best 3 = 8.25 + 8.08 + 7.71 = **24.04**. Impression marks 7.5 / 7.0 / 8.0 → **7.50**. Heat total **31.54 / 40 = 78.85 %**.

**B. Trimmed mean, 5 judges.** Marks 7.0, 7.5, 8.0, 8.0, 9.5 → drop 7.0 and 9.5 → **7.83** (plain mean would be 8.00). With `trimMinJudges = 5` and only 3 or 4 judges the engine must return the plain mean.

**C. PUKL preset (sum), 3 judges, best 3.** Attempt sums per judge: #1 6.5/7.0/6.5 → 6.67; #2 9.5/8.0/9.0 → 8.83; #3 4.0/4.5/4.5 → 4.33; #4 7.5/7.5/7.5 → 7.50. Best 3 = 8.83 + 7.50 + 6.67 = **23.00 / 30**.

**D. Megaloop preset (weighted 0.70/0.15/0.10/0.05), single best.** Jump 1 judges 8.45/8.23/8.43 → 8.37; jump 2 → 7.68. Heat total = **8.37**.

**E. Tie-break.** Red counted [8.6, 8.0, 7.2] + impression 7.4 = 31.20; Blue [8.2, 8.2, 7.6] + 7.2 = 31.20. `highest_counted_trick`: 8.6 > 8.2 → **Red ranks above Blue**.

## 7. Edge cases the tests must cover
- Judge scores missing for one attempt → panel computed from available judges, `incomplete = true`; `computeHeat` still returns totals so live scores keep flowing; publish blocked while `requireAllJudges`.
- 4 judges with `trimmed_mean` → plain mean (below `trimMinJudges`).
- Rider with only 2 landed attempts under `best_n = 3` → total from 2.
- Impression `required`: heat cannot be published while any (judge, rider) impression mark is absent → `publishBlockers` lists them; head-judge override records a reason.
- Two attempts for the same rider from different spotter seats logged 8 s apart → `possibleDuplicate` flag on the later one (threshold `duplicateWindowSec`, default 20); deleting one removes it from counting and counters without renumbering the others.
- `best_per_category` with two kiteloop tricks and no board-off → only the best kiteloop counts (plus other categories present).
- Crash with `crash = "zero"` → a 0 can be "counted" (relevant when fewer landed tricks than n; it never displaces a landed trick).
- Interference `drop_best_trick` on a rider with one counted trick → total 0 (not negative).
- DNS in a 3-rider heat → ranks 3rd; DSQ below DNS if both.
- Rounding: totals compared after rounding to `decimals`; breakdown keeps unrounded.
- Impression entered before any trick → total = impression only (allowed).
- Model with `entry = "none"` and `counting = "none"` → total = impression.
- Height sensor `height_criterion`: with mapping linear 5 m→0, 25 m→10, a 15 m jump fills Height = 5.0 for every judge (locked); judges still score the other criteria.
- Snap-to-step: a judge value of 8.55 on step 0.1 → rejected by validation (UI prevents), engine throws.
- `distinctTrickNames = true`: two attempts named "Left Backroll Board Off Handle" (6.3, 5.3) plus 4.0 and 3.5 under best 3 → counted 6.3 + 4.0 + 3.5 = 13.80 (with the flag off: 15.60).
- `maxAttemptsPerRider = 7`: an 8th logged attempt is rejected; if one slips through (offline sync), the engine ignores it and flags it.

## 8. Judge input rules the UI must enforce (from this spec)
- Marks snap to `scale.step`; range enforced; per-criterion help text on long-press.
- A judge can edit their own marks until the heat is locked (`under_review`); afterwards only the head judge (audited).
- Impression is entered at heat end (button appears when the timer hits 0 or the head judge ends the heat); the UI shows landed/attempted per rider when `landedRatioHint`.
- Quick mode toggle for judges: enter single trick mark instead of criteria (only if the model's `entry = "single"`; never mix within one heat).

## 9. Extensibility notes
- New models = new JSON, no code. Organiser UI: "Duplicate preset → edit → save as event-specific".
- Per-division overrides: a division stores `scoring_model_id` + `overrides` (JSON patch) — e.g. Women's division with `n = 2`.
- Future: video timestamp per attempt (for replay), per-judge calibration reports (agreement %), season points.

## 10. Decisions log

All decisions below were agreed with the owner on 29 Sep 2026 (Phase 1). The code and tests follow them; where they refine the text above, this section wins.

| # | Topic | Decision |
|---|---|---|
| 1 | Rounding | Each panel trick score is rounded (half-up, `panel.decimals`). The tricks component is the sum of the **rounded** counted scores; the heat total is then rounded again. Unrounded panel values stay in the breakdown. |
| 2 | Attempt cap | `heat.maxAttemptsPerRider` (null = unlimited) is configurable per division. It counts **non-deleted attempts in order**, not seq numbers: the attempt after the cap is ignored and flagged (`ignored = "over_cap"`, `flags.extraAttemptsIgnored`). Crashes count toward the cap. |
| 3 | `next_counted_trick` | Compares the 2nd, 3rd… counted tricks; when the counted list runs out it falls through to the rider's next-best landed but uncounted tricks, in every model (so Megaloop ties compare the second-best jump). |
| 4 | Duplicates / parser | New field `heat.duplicateWindowSec` (default 20). Only attempts from **different** seats are flagged. The speech/text trick parser is Phase 5 (`src/lib/engine/tricks/`). |
| 5 | Floor | Every heat total is clamped at 0 (interference by points, percent or drop-best can never make it negative). |
| 6 | Auto max | `best_n`: n × trick max × trickWeight; `single_best`: 1 × trick max; `best_per_category`: maxPerCategory × categoriesCounted × trick max (GKA = 40 with impression); `all`: attempt cap × trick max when a cap is set, otherwise no percentage; `none`: 0. Plus impression max × weight and the height-bonus cap. |
| 7 | DNS / DSQ | All DNS riders share the place after the scored riders; DSQ riders share the place after DNS. Total shown "—". |
| 8 | Missing sensor reading | When the sensor fills Height but an attempt has no reading, the judge's own Height mark is used and the attempt is flagged `sensorMissing`. |
| 9 | Missed vs missing | A judge's **Missed** is not "incomplete" and never blocks publishing (§4.2 wording fixed). Only a panel judge with no entry at all is `missing`. |
| 10 | Legacy preset step | Stays 0.5; its description says the step is editable per event. |
| 11 | `repeatIndex` | Every attempt returns `repeatIndex` = earlier non-deleted **landed** attempts with the same case/whitespace-normalised name (unnamed = 0), for a "repeated trick" badge. A crash followed by a landing of the same trick is **not** a repeat; earlier crashed tries are reported separately as `priorCrashesSameTrick` so the judge card can mention them. No automatic penalty unless `distinctTrickNames` is on. |
| 12 | Uncategorised tricks | Under `best_per_category` a landed trick with no category cannot count; it is listed in `flags.uncategorised` so the head judge can fix the category. `categoriesCounted` absent = every category present. |
| 13 | Tie results | A tie the list cannot separate gets `tieUnresolved = true` on both riders, the same place, and a `tie_unresolved` publish blocker until a `head_judge` decision (`headJudgeDecisions`) is supplied. |
| 14 | Marks from off-panel judges | Marks from a judge who is not on the heat's panel are excluded from every calculation but never silently: `computeHeat` returns them in `ignoredMarksFrom` (`{ judgeId, riderId, attemptSeq }`, `attemptSeq = null` for an impression mark; deleted attempts not reported) so the head-judge console can warn. |
| 15 | Missed disallowed | If a preset sets `allowNoScore = false` and a Missed mark arrives, the engine throws a readable error rather than skipping it. |

