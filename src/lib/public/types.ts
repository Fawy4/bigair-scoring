import type { DivisionDraw } from "@/lib/engine/ladder";
import type { EntrantIdentifiers } from "@/lib/engine/ladder";

/** The shapes the public database functions return (supabase/migrations/20261006100000_phase6_public.sql). */

export interface SiteDivision {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  identification: unknown;
  attempt_display: string;
  show_percent: boolean;
  drawn: boolean;
}

export interface Sponsor {
  name: string;
  logoUrl?: string;
  url?: string;
}

export interface PublicSite {
  found: true;
  event: { id: string; name: string; slug: string; location: string | null; start_date: string | null; end_date: string | null; status: string; timezone: string };
  organisation: { name: string; slug: string; logo_url: string | null };
  branding: { logoUrl: string | null; sponsors: Sponsor[] };
  settings: {
    windCallBanner: boolean;
    readyCallMin: number;
    livePollSec: number;
    screenRotateSec: number;
    externalLeaderboards: Array<{ title: string; url: string; embed: boolean }>;
    identification: { scheme?: unknown; allowDivisionOverride?: boolean } | null;
    publicLiveScores: string;
  };
  wind: { status: "red" | "amber" | "green"; message: string | null; at: string } | null;
  divisions: SiteDivision[];
}

export interface TimetableHeat {
  id: string;
  division_id: string;
  round_id: string;
  number: number;
  suffix: string | null;
  name: string | null;
  status: string;
  effective_status: string | null;
  held: boolean;
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  paused_total_sec: number;
  duration_sec: number;
  warm_up_sec: number;
  rerun_of: string | null;
  round_last: boolean;
  break_after_heat_min: number | null;
  break_after_round_min: number | null;
}

export interface PublicTimetable {
  allowed: true;
  server_now: string;
  timezone: string;
  poll_sec: number;
  ready_call_min: number;
  plans: Array<{ id: string; day: string; name: string; items: unknown; anchors: unknown; actual_starts: unknown; hold: unknown; defaults: unknown }>;
  divisions: Array<{ id: string; name: string; sort_order: number }>;
  rounds: Array<{ id: string; division_id: string; name: string; short_name: string | null; sort_order: number }>;
  heats: TimetableHeat[];
}

export interface PublicBreakdownAttempt {
  seq: number;
  status: "landed" | "crashed";
  trickName: string | null;
  categoryKey: string | null;
  score: number | null;
  counted: boolean;
  panelScore: number | null;
  ignored?: string | null;
  repeatIndex?: number;
}

export interface PublicBreakdown {
  status: string;
  total: number;
  totalLabel: string;
  components: { tricks: number; impression: number; bonus: number; penalty: number };
  counted: Array<{ attemptSeq: number; score: number }>;
  allAttempts: PublicBreakdownAttempt[];
  impression: { score: number | null } | null;
  landedCount: number;
  attemptCount: number;
  attemptCap: number | null;
  modifiers: unknown[];
}

export interface ResultRow {
  entry_id: string;
  place: number | null;
  total: number | null;
  percent: number | null;
  breakdown: PublicBreakdown | null;
  version: number;
}

export interface SlotRowPublic {
  position: number;
  entry_id: string | null;
  vest_colour: string | null;
  modifier: string | null;
  source: { round: string; heat: number; place: number } | null;
}

export interface ResultsHeat {
  id: string;
  number: number;
  suffix: string | null;
  name: string | null;
  draw_uid: string | null;
  status: string;
  held: boolean;
  rerun_of: string | null;
  rerun_id: string | null;
  published_at: string | null;
  draw_round: string | null;
  draw_index: number | null;
  slots: SlotRowPublic[];
  results: ResultRow[];
}

export interface ResultsDivision {
  id: string;
  name: string;
  sort_order: number;
  attempt_display: string;
  show_percent: boolean;
  highest_jump: { height_m: number; entry_id: string; heat_id: string; trick_name: string | null } | null;
  rounds: Array<{ id: string; name: string; short_name: string | null; sort_order: number; heats: ResultsHeat[] }>;
}

export interface PublicEntry {
  id: string;
  division_id: string;
  first_name: string | null;
  last_name: string | null;
  nationality: string | null;
  identifiers: EntrantIdentifiers | null;
}

export interface PublicResults {
  allowed: true;
  event: { id: string; name: string; slug: string; timezone: string };
  poll_sec: number;
  divisions: ResultsDivision[];
  entries: PublicEntry[];
}

export interface PublicDrawPayload {
  allowed: true;
  divisions: Array<{ id: string; name: string; draw: DivisionDraw | null }>;
}

export interface PublicRulesDivision {
  id: string;
  name: string;
  description: string | null;
  identification: unknown;
  scoring_model: unknown;
  scoring_overrides: unknown;
  format_template: unknown;
  format_params: unknown;
  riders: number;
}
export interface PublicRules {
  allowed: true;
  divisions: PublicRulesDivision[];
}

/** The public live-heat function (Phase 3 / 5c). */
export interface PublicLiveHeat {
  allowed: boolean;
  poll_sec?: number;
  heat?: { id: string; status: string; effective_status: string | null; started_at: string | null; duration_sec: number; paused_at: string | null; paused_total_sec: number; ended_at: string | null; live_rev: number; server_now: string };
  slots?: Array<{ position: number; entry_id: string | null; vest_colour: string | null; modifier: string | null; flagged_out: boolean }>;
  attempts?: Array<{ id: string; entry_id: string; seq: number | null; direction: string | null; category_key: string | null; trick_name: string | null; status: "landed" | "crashed"; height_m: number | null; possible_duplicate_of: string | null; created_at: string }>;
  scores?: Array<{ attempt_id: string; seat_no: number; criteria: unknown; score: number | null; missed: boolean }>;
  impressions?: Array<{ entry_id: string; seat_no: number; value: number | null }>;
  penalties?: Array<{ entry_id: string; type: string; value: number | null }>;
}
