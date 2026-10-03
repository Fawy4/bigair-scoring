import type { SchedulePlan } from "@/lib/schemas/schedule";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import type { DivisionLive } from "@/lib/schemas/division-live";
import type { LocalBlock, VocabularyJson } from "@/lib/trick-base";
import type { LabelRider } from "@/lib/identification/rider-label";
import type { ScheduleDefaults } from "@/lib/schemas/schedule";
import type { HeatMeta } from "./run-order";

/** Rows as the live screens read them (named columns only: hashes are never readable). */
export interface HeatRow {
  id: string;
  division_id: string;
  round_id: string;
  number: number;
  number_suffix: string | null;
  name: string | null;
  status: string;
  duration_sec: number;
  warm_up_sec: number;
  started_at: string | null;
  paused_at: string | null;
  paused_total_sec: number;
  ended_at: string | null;
  draw_uid: string | null;
  /** The heat this one re-runs (a cancelled heat is read-only and says "re-run as …"). */
  rerun_of: string | null;
  /** The head judge's per-heat live switch: true = show live, false = do not, null = follow the setting. */
  public_live: boolean | null;
  /** Set when the head judge re-opened a published result: it is "under correction" until published again. */
  reopened_at: string | null;
  /** The published result is held back from the public (a final waiting for its prize-giving). */
  publish_hold: boolean;
  /** "simulator" while the simulator's Pause (or Stop) holds this heat (Polish 2, item 3); null otherwise. */
  paused_reason?: string | null;
  updated_at: string;
}
export const HEAT_COLUMNS = "id, division_id, round_id, number, number_suffix, name, status, duration_sec, warm_up_sec, started_at, paused_at, paused_total_sec, ended_at, draw_uid, rerun_of, public_live, reopened_at, publish_hold, paused_reason, updated_at";

export interface SlotRow {
  id: string;
  heat_id: string;
  position: number;
  entry_id: string | null;
  vest_colour: string | null;
  modifier: string | null;
  flagged_out: boolean;
  updated_at: string;
}
export const SLOT_COLUMNS = "id, heat_id, position, entry_id, vest_colour, modifier, flagged_out, updated_at";

export interface AttemptRow {
  id: string;
  heat_id: string;
  entry_id: string;
  seq: number;
  client_key: string;
  direction: "left" | "right" | null;
  category_key: string | null;
  trick_name: string | null;
  trick_parts: unknown;
  status: "landed" | "crashed";
  created_by_seat: string | null;
  created_at: string;
  deleted_at: string | null;
  possible_duplicate_of: string | null;
  input_method: string;
  raw_text: string | null;
  updated_at: string;
}
export const ATTEMPT_COLUMNS = "id, heat_id, entry_id, seq, client_key, direction, category_key, trick_name, trick_parts, status, created_by_seat, created_at, deleted_at, possible_duplicate_of, input_method, raw_text, updated_at";

export interface ScoreRow {
  id: string;
  attempt_id: string;
  heat_id: string;
  judge_seat_id: string;
  score: number | null;
  missed: boolean;
  criteria: unknown;
  client_rev: number;
  version: number;
  /** Set when the head judge changed or entered the score ("Absent" for a judge marked absent for that attempt). */
  edit_reason: string | null;
  updated_at: string;
}
export const SCORE_COLUMNS = "id, attempt_id, heat_id, judge_seat_id, score, missed, criteria, client_rev, version, edit_reason, updated_at";

export interface ImpressionRow {
  id: string;
  heat_id: string;
  entry_id: string;
  judge_seat_id: string;
  /** null when the head judge marked the judge Absent for this rider (`missed`). */
  value: number | null;
  /** The head judge marked this judge Absent for this rider's Impression / Variety score: not counted, not missing. */
  missed: boolean;
  client_rev: number;
  updated_at: string;
}
export const IMPRESSION_COLUMNS = "id, heat_id, entry_id, judge_seat_id, value, missed, client_rev, updated_at";

export interface FlagRow {
  id: string;
  heat_id: string;
  attempt_id: string;
  judge_seat_id: string;
  kind: string;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}
export const FLAG_COLUMNS = "id, heat_id, attempt_id, judge_seat_id, kind, created_at, resolved_at, updated_at";

export interface SheetRow {
  id: string;
  heat_id: string;
  judge_seat_id: string;
  submitted_at: string | null;
  reopened_at: string | null;
  updated_at: string;
}
export const SHEET_COLUMNS = "id, heat_id, judge_seat_id, submitted_at, reopened_at, updated_at";

export type SeatRole = "judge" | "head" | "spotter" | "announcer" | "observer";

export interface LiveDivisionContext {
  id: string;
  name: string;
  sortOrder: number;
  model: ScoringModel;
  scheme: IdentificationScheme;
  trickBase: { disabled: string[]; layout: unknown };
  live: DivisionLive;
  /** The format's flag-out (the lowest riders leave the heat at a minute), when it has one: the rounds it applies to, the minute and how many riders. */
  flagOut: { rounds: string[]; atMin: number; count: number } | null;
  /** Seats on this division's panel. */
  panelSeatIds: string[];
  maxAttempts: number | null;
}

export interface LiveRiderInfo extends LabelRider {
  entryId: string;
  divisionId: string;
}

export interface LiveContext {
  event: { id: string; name: string; slug: string; timezone: string; judgesMayLogAttempts: boolean; maxRunningHeats: number; isSimulation: boolean; readyCallMin: number };
  /** Who is looking: a seat, or an organiser of the event (the head page only). */
  viewer:
    | {
        kind: "seat";
        seatId: string;
        name: string;
        role: SeatRole;
        spotterEntries: string[];
        spotterColours: string[];
        /** Set when an Observer seat looks at this official's screen: the observer's own seat. The screen is drawn for `seatId`, read only. */
        observer?: { seatId: string; name: string };
      }
    | { kind: "organiser"; name: string };
  divisions: LiveDivisionContext[];
  rounds: Array<{ id: string; division_id: string; name: string; short_name: string | null; sort_order: number }>;
  heats: HeatRow[];
  riders: LiveRiderInfo[];
  vocabulary: VocabularyJson | null;
  localBlocks: LocalBlock[];
  /** The active run order of the event (all days), for "Next: …". */
  plans: Array<{ id: string; day: string; name: string; plan: SchedulePlan; defaults: ScheduleDefaults; updatedAt: string }>;
  /** Breaks and last-heat-of-round per heat (from the stored draw), for the estimated start times. */
  heatMeta: Record<string, HeatMeta>;
  /** The names of the panel's seats ("Fawy"), for the judge columns and every sentence about a judge. The head seat and organisers read all of them; a judge's phone only its own. */
  seatNames: Record<string, string>;
  /** Every division of the event in order, by name, for the division selector and the run order: a division whose scoring rules cannot be used is missing from `divisions` but its heats are still listed. */
  divisionTabs: Array<{ id: string; name: string }>;
}

export interface PenaltyRowLive {
  id: string;
  heat_id: string;
  entry_id: string;
  type: string;
  reason: string | null;
  updated_at: string;
}
export const PENALTY_COLUMNS = "id, heat_id, entry_id, type, reason, updated_at";

/** A head judge's recorded decision: a tie order (payload.riderIds, best first) or a publish override. Only the head judge and organisers can read these. */
export interface DecisionRow {
  id: string;
  heat_id: string;
  kind: string;
  payload: { riderIds?: string[] } & Record<string, unknown>;
  reason: string | null;
  at: string;
}
export const DECISION_COLUMNS = "id, heat_id, kind, payload, reason, at";
