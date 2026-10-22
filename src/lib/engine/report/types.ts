/**
 * Rider report (RA1): the shapes the pure report module reads and returns. No I/O: nothing here imports Supabase or React.
 *
 * INPUT is exactly what the database function `get_rider_report` answers (published, released heats only; never a single judge's mark) plus a small context the page
 * works out from the rules it already loads. OUTPUT holds numbers and codes, never sentences: the words live in ui-copy.ts, so the names of the score ("Impression",
 * "Variety") and of the sides ("Left / Right", "In / Out") always come from the event.
 */

export interface ReportParts {
  direction?: string | null;
  items?: Array<{ id: string; multiplier?: string | null }>;
  freeText?: string;
}

export interface ReportAttempt {
  seq: number;
  status: "landed" | "crashed";
  /** The published panel score of a landed attempt; null when the panel gave none. */
  score: number | null;
  counted: boolean;
  /** "over_cap" etc.: an attempt the result does not count at all. */
  ignored?: string | null;
  /** The key of the side ("left" | "right") the spotter logged, or null. */
  direction: string | null;
  trick: string | null;
  category: string | null;
  parts: ReportParts | null;
  /** Seconds after the heat started, or null when the line has no time. */
  at_sec: number | null;
}

export interface ReportResult {
  entry_id: string;
  place: number | null;
  total: number | null;
  /** "ok" | "DNS" | "DSQ" | "DNF" | "WO" | "OUT" */
  status?: string | null;
  tricks_total: number | null;
  impression: number | null;
  counted: Array<{ seq: number; score: number }>;
  attempts: ReportAttempt[];
}

export interface ReportSlot {
  position: number;
  entry_id: string | null;
  modifier: string | null;
}

export interface ReportHeat {
  id: string;
  number: number;
  suffix: string | null;
  name: string | null;
  published_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** The heat's length on the clock in seconds (extensions included). */
  duration_sec: number;
  paused_total_sec: number;
  slots: ReportSlot[];
  results: ReportResult[];
}

export interface ReportRound {
  id: string;
  /** The ladder's own id of the round ("R3"), the key the placings use. */
  draw_round: string | null;
  name: string;
  short_name: string | null;
  sort_order: number;
  /** Where each place goes: [{ to: "R3", places: [1] }, { to: "eliminated", places: "rest" }]. */
  advance: Array<{ to: string; places: number[] | "rest" }> | null;
  heats: ReportHeat[];
}

export interface ReportDivision {
  id: string;
  name: string;
  sort_order: number;
  rounds: ReportRound[];
}

export interface ReportEntry {
  id: string;
  division_id: string;
  first_name: string | null;
  last_name: string | null;
  withdrawn: boolean;
  /** The rider's record says under 18: no report is shown. */
  report_withheld: boolean;
}

export interface ReportBlock {
  id: string;
  family: string;
  key: string;
  label: string;
  category: string | null;
  retired: boolean;
}

export interface ReportData {
  allowed: true;
  how: string;
  event: { id: string; name: string; slug: string; timezone: string; status: string; start_date: string | null; end_date: string | null };
  impression_name: string | null;
  blocks: ReportBlock[];
  divisions: ReportDivision[];
  entries: ReportEntry[];
}

export interface DivisionRules {
  /** Most attempts per rider per heat; null = no limit. */
  attemptCap: number | null;
  /** How many tricks count in a heat total (best N); null when the division counts differently. */
  countedN: number | null;
  /** The division's own name for the separate score ("Impression", "Variety"); null = the division has none. */
  impressionName: string | null;
  /** The heat total is not a plain sum of the counted tricks (weights, per-category limits): the "missed it by" line is left out. */
  weighted?: boolean;
}

export interface Placing {
  place: number;
  shared: boolean;
  /** The ladder's id of the round the rider was knocked out in, or finished in. */
  round: string;
}

export interface ReportContext {
  data: ReportData;
  /** Sides as the event shows them: { left: "IN", right: "OUT" } or { left: "Left", right: "Right" }. */
  sideWords: { left: string; right: string };
  /** The event's name for the separate score; the division's own name is used when this is empty. */
  impressionName: string;
  divisionRules: Record<string, DivisionRules>;
  /** Final places the public Placings page shows (entry id → place), as far as they are decided. */
  placings: Record<string, Placing>;
  /** Categories that count as "loops". */
  loopCategories?: string[];
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// output

export type Outcome = "won" | "through" | "out" | "walkover" | "did_not_start" | "out_of_event" | "did_not_finish" | "disqualified" | "done";

export interface PathStep {
  heatId: string;
  roundName: string;
  heatLabel: string;
  outcome: Outcome;
  place: number | null;
  /** Round the rider moved to, when known ("Final"). */
  toRound: string | null;
}

export interface Headline {
  /** The rider's place from the Placings, or null while undecided. */
  place: number | null;
  shared: boolean;
  /** The name of the round the rider was knocked out in, when he did not reach the end ("Round 3"); null otherwise. */
  outInRound: string | null;
  /** The name of the last round the rider rode in. */
  lastRound: string | null;
  /** Still in the event (a heat may still be ahead). */
  stillIn: boolean;
  steps: PathStep[];
}

export interface FieldFigure {
  /** Average over every rider of the division with a published heat; null when nobody has one. */
  all: number | null;
  /** Average over the riders of the division's last round; null when it has no published heat. */
  finalists: number | null;
}

export interface Tile {
  /** The rider's figure; null when it cannot be worked out (for steadiness: fewer than two heats). */
  value: number | null;
  field: FieldFigure;
}

export interface Tiles {
  jumps: { value: number; allowed: number | null; field: FieldFigure };
  landed: Tile;
  crashes: { value: number; rate: number | null; field: FieldFigure };
  differentTricks: Tile;
  loops: { landed: number; tried: number; field: FieldFigure };
  directions: { left: number; right: number; withDirection: number; jumps: number };
  heatsWon: { value: number; heats: number };
  averageTotal: Tile;
  bestTotal: { value: number | null; heatLabel: string | null; field: FieldFigure };
  /** Spread (standard deviation) of his heat totals; lower = steadier. */
  steadiness: Tile;
}

export type HighlightKind =
  | "highest_trick"
  | "best_heat_total"
  | "longest_winning_run"
  | "most_tricks"
  | "most_different_tricks"
  | "most_loops"
  | "fewest_crashes"
  | "best_impression"
  | "only_rider_to_land";

export interface Highlight {
  kind: HighlightKind;
  value: number | null;
  /** The trick, for "highest_trick" and "only_rider_to_land". */
  trick: string | null;
  /** The score name for "best_impression". */
  scoreName: string | null;
}

export type StrengthCode = "landing_rate" | "loops" | "variety_per_heat" | "both_sides" | "growth" | "every_attempt";
export type TrainCode = "never_landed" | "loops_half" | "no_loops" | "one_side" | "crashed_half" | "repeat_same_side";
export type StrategyCode = "unused_attempts" | "late_first_trick" | "winner_more_loops" | "winner_more_tricks" | "same_tricks_as_winner" | "early_banker" | "best_late";

export interface Strength {
  code: StrengthCode;
  /** The numbers the sentence needs. */
  n: number;
  m: number | null;
  trick?: string | null;
}
export interface Train {
  code: TrainCode;
  n: number;
  m: number | null;
  trick?: string | null;
  /** "left" | "right" for one_side. */
  side?: "left" | "right" | null;
  heatLabel?: string | null;
}
export interface Strategy {
  code: StrategyCode;
  heatId: string;
  heatLabel: string;
  n: number;
  m: number | null;
}

export interface GapLine {
  heatId: string;
  heatLabel: string;
  /** How far he missed it by, in points. */
  miss: number;
  /** The round he missed ("Final"). */
  toRound: string | null;
  /** A trick scoring above this would have taken him through. */
  needAbove: number;
  /** The counted trick it would replace (his lowest), or null when he had a free counting place. */
  replaces: number | null;
}

export interface Takeaways {
  strength: Strength | null;
  train: Train | null;
  strategy: Strategy | null;
  gap: GapLine | null;
}

export interface BestTrick {
  trick: string;
  score: number;
  /** The side it was landed on, as a key. */
  side: string | null;
  heatLabel: string;
}

export interface TimelinePoint {
  /** 0..1 along the heat. */
  x: number;
  seconds: number | null;
  score: number | null;
  landed: boolean;
  counted: boolean;
}

export interface JumpLine {
  seq: number;
  at_sec: number | null;
  trick: string | null;
  side: string | null;
  landed: boolean;
  score: number | null;
  counted: boolean;
}

export interface HeatRow {
  heatId: string;
  roundName: string;
  heatLabel: string;
  outcome: Outcome;
  place: number | null;
  total: number | null;
  tricksTotal: number | null;
  impression: number | null;
  /** The gap in points: to the winner (lost) or to the place that went through; for a win, the lead over the next rider (negative never). */
  gapToWinner: number | null;
  gapToThrough: number | null;
  leadOverNext: number | null;
  jumps: number;
  crashes: number;
  crashRate: number | null;
  firstLandedAt: number | null;
  /** Seconds between jumps on average; null with fewer than two jumps. */
  paceSec: number | null;
  lengthSec: number;
  fieldAverage: number | null;
  timeline: TimelinePoint[];
  jumpLines: JumpLine[];
}

export interface FamilyRow {
  key: string;
  tried: number;
  landed: number;
  landedTricks: string[];
  stillToLand: string[];
}

export interface CompareRow {
  key: "landing_rate" | "attempts_used" | "loop_share" | "tricks_per_heat" | "average_trick" | "impression";
  me: number | null;
  all: number | null;
  finalists: number | null;
}

export type GoalCode = StrengthCode | TrainCode | StrategyCode;
export interface Goal {
  /** The takeaway the goal comes from. */
  from: "train" | "strategy" | "strength" | "gap";
  code: string;
  n: number;
  m: number | null;
  trick?: string | null;
  side?: "left" | "right" | null;
}

export interface RiderReport {
  status: "ok";
  entryId: string;
  name: string;
  divisionId: string;
  divisionName: string;
  eventName: string;
  /** Names come from the event. */
  scoreName: string;
  sideWords: { left: string; right: string };
  /** The report counts only the heats published so far: show "so far". */
  soFar: boolean;
  headline: Headline;
  tiles: Tiles;
  highlights: Highlight[];
  takeaways: Takeaways;
  bestTricks: BestTrick[];
  heats: HeatRow[];
  mix: FamilyRow[];
  compare: CompareRow[];
  goals: Goal[];
}

export type ReportResultOrNone =
  | RiderReport
  | { status: "not_found" }
  | { status: "withheld" }
  | { status: "no_heats"; entryId: string; name: string; divisionName: string; eventName: string };
