import type { FormatTemplate, RoundSpec } from "@/lib/schemas/format-template";

/** Result modifiers a heat can carry (docs/03). Only DNS changes how the ladder routes a rider. */
export type LadderModifier = "DNS" | "DNF" | "DSQ" | "INT";

/** Fixed identifiers of a rider (docs/05 entries.identifiers). Which one is "primary" depends on the scheme. */
export interface EntrantIdentifiers {
  vest_colour?: string;
  bib?: string | number;
  kite?: { brand: string; model?: string; size?: number | string; colours?: string };
  rashguard_colour?: string;
}

/** Entry order = seed order (seed 1 first). */
export interface Entrant {
  id: string;
  name: string;
  identifiers?: EntrantIdentifiers;
  withdrawn?: boolean;
}

export type IdentificationSchemeId =
  | "name-callout"
  | "vests-per-heat"
  | "fixed-lycra-per-rider"
  | "bib-numbers"
  | "kites-no-vests"
  | "brand-launch-same-kites";

export type HeatStatus = "pending" | "running" | "published";

/** Where a placeholder slot's rider will come from. `heat` is the 1-based heat index inside `round`. */
export interface SlotSource {
  round: string;
  heat: number;
  place: number;
}

/** One finished heat a rider has already ridden (used by pool rounds that combine several heats). */
export interface HistoryEntry {
  round: string;
  heat: number;
  total: number | null;
  tieKeys: number[];
}

export interface Slot {
  index: number;
  /** Colour from the template palette by slot index (used only when the scheme assigns vests per heat). */
  vestColour?: string;
  /** Set once the rider is known. Placeholder slots only have `from`. */
  entrantId?: string;
  /** Original seed of the rider (1-based). */
  seed?: number;
  /** Placeholder ("Winner H2") or the source of a walkover. */
  from?: SlotSource;
  /** DNS = withdrawn rider or walkover: the slot exists but nobody rides it. */
  modifier?: LadderModifier;
  history?: HistoryEntry[];
}

export interface DrawHeat {
  /** `${roundId}-H${index}` */
  id: string;
  round: string;
  /** 1-based index inside the round. */
  index: number;
  /** Division-wide heat number ("Heat 7"). Byes have none (Decision 5). */
  number: number | null;
  bye: boolean;
  slots: Slot[];
  durationMin: number;
  breakAfterHeatMin: number;
  breakAfterRoundMin: number;
  /** Last heat of its round that actually rides (drives `breakAfterRoundMin`). */
  roundLast: boolean;
  status: HeatStatus;
  manualOverride: boolean;
}

/** A rider on his/her way into a round, before the round is dealt into heats. */
export interface Arrival {
  /** Undefined = walkover (source heat not published when "Seed now" was pressed). */
  entrantId?: string;
  originalSeed: number;
  from: SlotSource;
  place: number;
  total: number | null;
  tieKeys: number[];
  modifier?: LadderModifier;
  history: HistoryEntry[];
}

export interface DrawRound {
  id: string;
  name: string;
  shortName: string;
  spec: RoundSpec;
  /** How many riders this round is structurally expected to receive. */
  expectedEntrants: number;
  heats: DrawHeat[];
  /** Slots hold real riders (true) or placeholders (false). */
  seeded: boolean;
  /** Organiser pressed "Seed now": missing places became walkovers. */
  seededNow: boolean;
  arrivals: Arrival[];
}

export interface RankedEntry {
  entrantId: string;
  /** 1 = winner. */
  place: number;
  total: number | null;
  modifier?: LadderModifier;
  /** Tie-break keys from the scoring model, best first, higher is better (e.g. best counted trick, next, impression). */
  tieKeys?: number[];
}

/** What the scoring engine hands over when a heat is published. */
export interface HeatResultInput {
  ranked: RankedEntry[];
}

export type LadderWarningType =
  | "duplicate_identifier"
  | "eliminates_nobody"
  | "heat_size_limits"
  | "below_template_min"
  | "above_template_max"
  | "small_division_single_final"
  | "random_seed_defaulted";

export interface LadderWarning {
  type: LadderWarningType;
  message: string;
  round?: string;
  heatId?: string;
  suggestion?: string;
}

export interface Conflict {
  type: "downstream_started";
  message: string;
  /** The heat whose result was being changed. */
  heatId: string;
  /** Downstream heats that have started/published (or are hand-arranged) and would change. */
  affectedHeats: Array<{ heatId: string; status: HeatStatus; manualOverride: boolean }>;
}

export interface ApplyResult {
  /** The new draw; identical to the input draw when `conflict` is set. */
  draw: DivisionDraw;
  conflict?: Conflict;
}

export interface DrawOverrides {
  /** Scheme that decides slot colours and which identifiers may clash (default `vests-per-heat`). */
  identification?: IdentificationSchemeId;
  /** Seed of the shuffle for `random` seeding; stored in the draw so the draw is reproducible. */
  rngSeed?: number;
  /** roundId → number of heats; wins over `uneven`. */
  heatCountOverride?: Record<string, number>;
}

export interface DivisionDraw {
  templateId: string;
  template: FormatTemplate;
  overrides: DrawOverrides;
  /** "draft" = before the draw is confirmed: a withdrawal re-seeds. "locked" = a withdrawal becomes a walkover. */
  status: "draft" | "locked";
  /** Every entrant given to the draw, in entry order (withdrawn ones included). */
  entrants: Entrant[];
  /** Entrant ids in seed order after any shuffle; seed n = seedOrder[n-1]. */
  seedOrder: string[];
  rngSeed?: number;
  rounds: DrawRound[];
  /** Published results by heat id (byes are implicit and not stored). */
  results: Record<string, HeatResultInput>;
  warnings: LadderWarning[];
}

export interface Placing {
  entrantId: string;
  place: number;
  /** True when more than one rider holds this place ("13="). */
  shared: boolean;
  /** "13=" or "1". */
  label: string;
  /** Round where the rider's placing was decided. */
  round: string;
  reason: string;
}
