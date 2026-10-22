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
  /** Most attempts this rider could log in this heat when it was published, or null. */
  cap?: number | null;
  tricks_total: number | null;
  impression: number | null;
  counted: Array<{ seq: number; score: number }>;
  attempts: ReportAttempt[];
}

export interface ReportSlot {
  position: number;
  entry_id: string | null;
  modifier: string | null;
  /** The Lycra colour key of the seat in this heat, or null. */
  vest_colour?: string | null;
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
  nationality?: string | null;
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
  event: { id: string; name: string; slug: string; location?: string | null; timezone: string; status: string; start_date: string | null; end_date: string | null };
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
  /** Decimals the division shows scores with (the scoring model's). */
  decimals?: number;
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
  /** The names of the trick base's categories, as the event's scoring gives them (key → label); a key without a name is shown from its key. */
  familyLabels?: Record<string, string>;
  /** The colour of a seat's Lycra in a division as a hex, for the heat headers; null when the division has no Lycra colours. */
  lycraHex?: (divisionId: string, colour: string | null) => string | null;
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
  /** "winner": first in the last round; "final": rode the last round; "out": knocked out before it; "in": no place yet. */
  caption: "winner" | "final" | "out" | "in";
  /** The name of the round the rider was knocked out in, when he did not reach the end ("Round 3"); null otherwise. */
  outInRound: string | null;
  /** The name of the last round the rider rode in. */
  lastRound: string | null;
  steps: PathStep[];
}

/** The thirteen tiles of the report, in the order they are shown. Rates are 0..1; scores are as published. */
export interface Tiles {
  jumps: { value: number; heats: number; allowed: number | null };
  landed: { value: number; rate: number | null; fieldRate: number | null };
  crashes: { value: number; rate: number | null; fieldRate: number | null };
  different: { value: number; field: number | null };
  loops: { landed: number; tried: number };
  sides: { left: number; right: number; withDirection: number; jumps: number };
  bestTrick: { value: number | null; eventBest: number | null };
  averageTrick: { value: number | null; field: number | null };
  impression: { value: number | null; field: number | null };
  heatsWon: { won: number; heats: number; share: number | null; fieldShare: number | null };
  averageTotal: { value: number | null; field: number | null; finalists: number | null };
  bestTotal: { value: number | null; round: string | null; eventBest: number | null };
  steadiness: { value: number | null; min: number | null; max: number | null; field: number | null };
}

export type HighlightKind =
  | "highest_trick"
  | "best_heat_total"
  | "longest_winning_run"
  | "only_rider_to_land"
  | "most_tricks"
  | "most_different_tricks"
  | "most_loops"
  | "fewest_crashes"
  | "best_impression";

export interface Highlight {
  kind: HighlightKind;
  value: number | null;
  /** The trick, for "highest_trick" and "only_rider_to_land". */
  trick: string | null;
  /** The round of "best_heat_total". */
  round: string | null;
  /** The number of jumps, for "fewest_crashes". */
  jumps: number | null;
}

/** One point of the three takeaways (and of the suggested goals): a code and the numbers its sentence needs, in the order the sentence uses them. */
export interface Point {
  code: string;
  nums: number[];
  trick?: string | null;
  /** The round the point is about ("Round 1"). */
  round?: string | null;
  /** "left" | "right" */
  side?: "left" | "right" | null;
  /** What is aimed at: the round a rider missed ("Final"), or "1st place". */
  target?: string | null;
}

export type StrengthCode = "top_trick" | "loops" | "growth" | "landing_rate" | "every_attempt" | "impression_above" | "variety_per_heat" | "both_sides" | "totals_growth";
export type TrainCode = "never_landed" | "loops_half" | "no_loops" | "one_side" | "landed_average_low" | "crashed_half" | "repeat_same_side" | "impression_below";
export type StrategyCode = "gap_out" | "gap_direct" | "gap_place" | "unused_attempts" | "winner_fewer" | "late_first_trick" | "winner_more_loops" | "winner_more_tricks" | "same_tricks_as_winner" | "early_banker" | "best_late";

export interface Takeaways {
  strength: Point | null;
  train: Point | null;
  strategy: Point | null;
}

export interface BestTrick {
  trick: string;
  score: number;
  roundName: string;
  at_sec: number | null;
}

export interface TimelinePoint {
  /** 0..1 along the heat. */
  x: number;
  seconds: number | null;
  score: number | null;
  landed: boolean;
  counted: boolean;
  trick: string | null;
}

export interface JumpLine {
  seq: number;
  at_sec: number | null;
  trick: string | null;
  side: "left" | "right" | null;
  landed: boolean;
  score: number | null;
  counted: boolean;
}

export interface HeatRow {
  heatId: string;
  roundName: string;
  /** "Heat 12" */
  heatNo: string;
  outcome: Outcome;
  place: number | null;
  /** The name of the round the rider's place leads to, when it leads to one. */
  toRound: string | null;
  /** The heat decides the final places (the last round). */
  isFinal: boolean;
  /** The colour of the rider's Lycra in this heat, a hex, or null. */
  lycra: string | null;
  total: number | null;
  tricksTotal: number | null;
  impression: number | null;
  /** How far behind: to the winner (any heat), or in the final to the place above ("winner", or the place number). */
  behind: { gap: number; to: "winner" | number } | null;
  jumps: number;
  cap: number | null;
  crashes: number;
  crashRate: number | null;
  firstLandedAt: number | null;
  /** Seconds between jumps on average; null without a jump. */
  paceSec: number | null;
  lengthSec: number;
  fieldAverage: number | null;
  timeline: TimelinePoint[];
  jumpLines: JumpLine[];
}

export interface FamilyRow {
  /** The category key, "other", or "not_logged" for jumps with no trick name. */
  key: string;
  tried: number;
  landed: number;
  /** Average published score of the landed ones, or null. */
  average: number | null;
}

export interface Mix {
  families: FamilyRow[];
  landedTricks: Array<{ trick: string; count: number }>;
  stillToLand: string[];
  /** Crashes with no trick name logged. */
  crashesNoName: number;
}

export interface CompareRow {
  key: "landing_rate" | "attempts_used" | "loop_share" | "tricks_per_heat" | "average_trick" | "impression";
  /** "percent": 0..1 shown as a percentage; "number": shown as it is. */
  kind: "percent" | "number";
  me: number | null;
  all: number | null;
  finalists: number | null;
  /** What a full bar means: 1 for a percentage, the best rider's figure otherwise. */
  scale: number;
}

export interface RiderReport {
  status: "ok";
  entryId: string;
  name: string;
  nationality: string | null;
  divisionId: string;
  divisionName: string;
  eventName: string;
  eventLocation: string | null;
  /** The days (YYYY-MM-DD, in the event's time zone) the rider's published heats were ridden on. */
  days: string[];
  /** Names come from the event. */
  scoreName: string;
  sideWords: { left: string; right: string };
  familyLabels: Record<string, string>;
  decimals: number;
  /** The report counts only the heats published so far: show "so far". */
  soFar: boolean;
  headline: Headline;
  highlights: Highlight[];
  tiles: Tiles;
  takeaways: Takeaways;
  bestTricks: BestTrick[];
  heats: HeatRow[];
  mix: Mix;
  compare: CompareRow[];
  /** How many riders and finalists the field figures average over. */
  fieldSize: { riders: number; finalists: number };
  /** Suggested goals: the facts behind the first two things to train. */
  suggested: Point[];
}

/** One line of the rider picker: who, and where they got to. */
export interface PickerItem {
  entryId: string;
  name: string;
  divisionName: string;
  /** The final place when the rider rode the last round; null otherwise. */
  place: number | null;
  shared: boolean;
  /** The last round the rider rode in. */
  lastRound: string | null;
}

export type ReportResultOrNone =
  | RiderReport
  | { status: "not_found" }
  | { status: "withheld" }
  | { status: "no_heats"; entryId: string; name: string; divisionName: string; eventName: string };
