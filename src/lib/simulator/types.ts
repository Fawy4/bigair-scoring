import type { SimConfig } from "./config";
import type { ChecklistRow } from "./scenarios";

export type SeatRole = "judge" | "head" | "spotter" | "announcer";

/** One official as the simulator sees them. */
export interface SeatInfo {
  id: string;
  name: string;
  role: SeatRole;
  mode: "virtual" | "real";
  /** The login holding the seat right now (a phone, the organiser through View as, or the simulator), if any. */
  boundUser: string | null;
  virtualUser: string | null;
  /** Place on the panel of any division (judges). */
  seatNo: number | null;
  /** Played by a person right now (a real seat, or a phone / the organiser holds it). */
  person: boolean;
}

export interface SimControlView {
  speed: number;
  state: "stopped" | "playing" | "paused";
  config: SimConfig;
  blocker: string | null;
  runNo: number;
  lastTickAt: string | null;
}

export interface SimStats {
  run: number;
  heats_total: number;
  heats_published: number;
  heats_running: number;
  attempts: number;
  scores: number;
  impressions: number;
  blockers: number;
  flagged_duplicates: number;
  has_baseline: boolean;
  baseline_at: string | null;
  played: boolean;
  locked_divisions: number;
  divisions: number;
}

/** What the panel shows about the heat that is on now. */
export interface NowView {
  heatId: string | null;
  label: string | null;
  status: string | null;
  remainingSec: number | null;
}

export interface LogLine {
  id: string;
  at: string;
  kind: string;
  scenario: string | null;
  text: string;
}

export interface SeatView {
  id: string;
  name: string;
  role: SeatRole;
  seatNo: number | null;
  mode: "virtual" | "real";
  /** "simulator" plays it, "you" holds it through View as, "phone" a person joined, "nobody" a real seat waits. */
  heldBy: "simulator" | "you" | "phone" | "nobody";
}

export interface SimStatus {
  event: { id: string; name: string; slug: string; timezone: string; isCopy: boolean };
  control: SimControlView;
  stats: SimStats;
  seats: SeatView[];
  riders: Array<{ entryId: string; name: string; divisionName: string }>;
  now: NowView;
  line: string;
  checklist: ChecklistRow[];
  log: LogLine[];
  /** The scenario buttons that wait for their moment. */
  armed: string[];
  /** Phase of the two-press scenarios: the wind is held, a judge's phone is dead, the final waits for its release. */
  windHeld: boolean;
  deadJudge: string | null;
  finalHeld: boolean;
  planNames: { active: string | null; other: string | null };
}
