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
  updated_at: string;
}
export const HEAT_COLUMNS = "id, division_id, round_id, number, number_suffix, name, status, duration_sec, warm_up_sec, started_at, paused_at, paused_total_sec, ended_at, draw_uid, updated_at";

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
  updated_at: string;
}
export const SCORE_COLUMNS = "id, attempt_id, heat_id, judge_seat_id, score, missed, criteria, client_rev, updated_at";

export interface ImpressionRow {
  id: string;
  heat_id: string;
  entry_id: string;
  judge_seat_id: string;
  value: number;
  client_rev: number;
  updated_at: string;
}
export const IMPRESSION_COLUMNS = "id, heat_id, entry_id, judge_seat_id, value, client_rev, updated_at";

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

export type SeatRole = "judge" | "head" | "spotter" | "announcer";

export interface LiveDivisionContext {
  id: string;
  name: string;
  sortOrder: number;
  model: ScoringModel;
  scheme: IdentificationScheme;
  trickBase: { disabled: string[]; layout: unknown };
  live: DivisionLive;
  /** Seats on this division's panel. */
  panelSeatIds: string[];
  maxAttempts: number | null;
}

export interface LiveRiderInfo extends LabelRider {
  entryId: string;
  divisionId: string;
}

export interface LiveContext {
  event: { id: string; name: string; slug: string; timezone: string; judgesMayLogAttempts: boolean; maxRunningHeats: number };
  /** Who is looking: a seat, or an organiser of the event (the head page only). */
  viewer: { kind: "seat"; seatId: string; name: string; role: SeatRole; spotterEntries: string[]; spotterColours: string[] } | { kind: "organiser"; name: string };
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
}
