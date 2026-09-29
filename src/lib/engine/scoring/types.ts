import type { TieBreaker } from "@/lib/schemas/scoring-model";

/** One judge's criteria values for one attempt, keyed by criterion key. */
export type CriteriaValues = Record<string, number>;

/** A single mark (entry = "single"), criteria values (entry = "criteria"), or "missed" (judge didn't see it). */
export type JudgeMarkValue = number | CriteriaValues | "missed";

export interface JudgeMark {
  judgeId: string;
  value: JudgeMarkValue;
}

export interface Attempt {
  seq: number;
  status: "landed" | "crashed";
  categoryKey?: string | null;
  trickName?: string | null;
  direction?: "left" | "right" | null;
  heightM?: number | null;
  /** Soft-deleted attempts are ignored by the engine (kept in the database for audit). */
  deleted?: boolean;
  /** ISO UTC timestamp; used for duplicate detection. */
  createdAt?: string | null;
  /** Spotter seat or judge that logged it; used for duplicate detection. */
  createdBy?: string | null;
  marks: JudgeMark[];
}

export type ModifierType = "DNS" | "DNF" | "DSQ" | "INT";

export interface Modifier {
  type: ModifierType;
  reason?: string;
}

export interface ImpressionMark {
  judgeId: string;
  value: number;
}

export interface RiderInput {
  riderId: string;
  modifiers?: Modifier[];
  attempts: Attempt[];
  impressionMarks?: ImpressionMark[];
  /** Overrides the max of attempt heights for the height bonus. */
  maxHeightM?: number | null;
}

/** Head judge's recorded decision for a tie: riderIds ordered best first. */
export interface TieDecision {
  riderIds: string[];
  reason: string;
}

export interface HeatInput {
  panelJudgeIds: string[];
  riders: RiderInput[];
  headJudgeDecisions?: TieDecision[];
}

export interface CriterionDetail {
  key: string;
  value: number;
  source: "judge" | "sensor";
}

export interface JudgeScoreDetail {
  criteria?: CriterionDetail[];
  /** Height was meant to come from the sensor but no reading existed; the judge's mark was used. */
  sensorMissing?: boolean;
}

export interface JudgeTrickScore {
  score: number;
  detail: JudgeScoreDetail;
}

export interface PanelJudgeEntry {
  judgeId: string;
  score: number;
  detail?: JudgeScoreDetail;
  /** Dropped as the high or low mark by trimmed_mean. */
  trimmed?: boolean;
}

export interface PanelScore {
  /** Rounded to panel.decimals; null when no judge scored. */
  score: number | null;
  unrounded: number | null;
  judgeScores: PanelJudgeEntry[];
  /** A panel judge has not entered anything yet (Missed does not count as missing). */
  incomplete: boolean;
  missing: string[];
  missedBy: string[];
  outlier: boolean;
}

export type AttemptIgnoredReason =
  | "over_cap"
  | "crashed"
  | "no_score"
  | "not_selected"
  | "interference_dropped"
  | "rider_status";

export interface AttemptResult {
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  categoryKey: string | null;
  /** null for crashed attempts, over-cap attempts and entry = "none". */
  panel: PanelScore | null;
  /** The score used for counting (rounded panel score, or 0 for a crash with crash = "zero"). */
  score: number | null;
  counted: boolean;
  ignored?: AttemptIgnoredReason;
  /** Number of earlier non-deleted attempts by this rider with the same normalised trick name (0 = first). */
  repeatIndex: number;
  possibleDuplicateOf?: number;
  sensorMissing?: boolean;
}

export interface CountedTrick {
  attemptSeq: number;
  score: number;
  categoryKey: string | null;
}

export type RiderStatus = "ok" | "DNF" | "DNS" | "DSQ";

export interface RiderResult {
  riderId: string;
  status: RiderStatus;
  /** Rounded to panel.decimals, never below 0. */
  total: number;
  unroundedTotal: number;
  /** "—" for DNS/DSQ, otherwise the total with fixed decimals. */
  totalLabel: string;
  percent: number | null;
  components: { tricks: number; impression: number; bonus: number; penalty: number };
  /** Counted tricks, best first (after any interference drop). */
  counted: CountedTrick[];
  /** Non-deleted attempts in seq order. */
  allAttempts: AttemptResult[];
  impression: PanelScore | null;
  landedCount: number;
  /** Non-deleted attempts (for the "n / cap" counter). */
  attemptCount: number;
  attemptCap: number | null;
  interferenceCount: number;
  flags: {
    incomplete: boolean;
    outliers: number[];
    extraAttemptsIgnored: boolean;
    sensorMissing: number[];
    /** best_per_category only: landed attempts without a category (cannot count). */
    uncategorised: number[];
  };
  modifiers: Modifier[];
}

export interface RankedResult {
  riderId: string;
  place: number;
  total: number;
  totalLabel: string;
  status: RiderStatus;
  tieResolvedBy?: TieBreaker;
  tieUnresolved?: boolean;
  sharedPlace?: boolean;
}

export type PublishBlocker =
  | { type: "score_missing"; judge: string; rider: string; attemptSeq: number }
  | { type: "impression_missing"; judge: string; rider: string }
  | { type: "tie_unresolved"; riders: string[] };

export interface HeatResult {
  riders: RiderResult[];
  ranking: RankedResult[];
  publishBlockers: PublishBlocker[];
  maxRaw: number | null;
}
