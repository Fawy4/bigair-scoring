import { judgeTrickScore } from "@/lib/engine/scoring";
import type { Scale, ScoringModel } from "@/lib/schemas/scoring-model";
import { snapToStep } from "@/lib/live/score-pad";
import { scaledSec } from "./clock";
import { hash32, rng } from "./random";
import type { JudgeMode, SpreadMode } from "./config";

/** A judge the simulator plays: the seat and its position on the panel (1, 2, 3 …). */
export interface JudgeSeat {
  seatId: string;
  seatNo: number;
}

export interface PlanAttempt {
  id: string;
  entryId: string;
  /** 1 for the rider's first attempt of the heat, 2 for the second … (a forced tie matches riders by this number). */
  ordinal: number;
  status: "landed" | "crashed";
  /** Real seconds since the spotter logged it. */
  ageSec: number;
}

export interface ModeContext {
  mode: JudgeMode;
  /** Panel position the mode applies to. */
  specialSeatNo: number;
  missShare: number;
  /** Seconds on the heat's normal clock. */
  offlineSec: number;
  lateSec: number;
  speed: number;
  /** The heat is over (or in review): everything due is written now. */
  heatEnded: boolean;
  /** Real seconds since the heat started (not capped). */
  sinceStartSec: number;
  heatDurationSec: number;
}

export type JudgeWrite =
  | { kind: "score"; seatId: string; attemptId: string; criteria: Record<string, number> | null; score: number }
  | { kind: "missed"; seatId: string; attemptId: string };

export interface ImpressionWrite {
  seatId: string;
  entryId: string;
  value: number;
}

// ---- seeded numbers: the same inputs always give the same marks, so a tick that runs twice writes the same thing
const unit = (key: string): number => rng(hash32(key))();
/** About a bell curve with this standard deviation (a sum of three even draws). */
const bell = (rnd: () => number, sd: number): number => (rnd() + rnd() + rnd() - 1.5) * 2 * sd;

/** How far judges stray from the jump's real quality, as a share of the scale (docs: simulator decisions log). */
export const SPREAD_SD: Record<SpreadMode, number> = { agree: 0, normal: 0.05, disagree: 0.16 };

/** A judge looks at the attempt a little after it is logged; each phone a bit after the one before. */
const baseLagSec = (index: number): number => 0.8 + 0.6 * index;
/** The forced-tie jump: a clear landing, same for both riders. */
const TIE_QUALITY = 0.72;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const onScale = (q: number, scale: Scale) => snapToStep(scale.min + clamp01(q) * (scale.max - scale.min), scale);

/** One judge's mark for one landed attempt: the criteria (and the score the model makes of them) or a single mark. */
function markFor(model: ScoringModel, quality: number, sd: number, key: string, judgeKey: string): { criteria: Record<string, number> | null; score: number } | null {
  const { trick } = model;
  if (trick.entry === "none") return null;
  const noise = sd === 0 ? () => 0 : (() => { const r = rng(hash32(`${key}|${judgeKey}|noise`)); return () => bell(r, sd); })();
  if (trick.entry === "single") return { criteria: null, score: onScale(quality + noise(), trick.scale) };
  const criteria: Record<string, number> = {};
  for (const c of trick.criteria) {
    const wobble = (unit(`${key}|${c.key}`) - 0.5) * 0.12; // the same for every judge: the jump was better in some respects than others
    criteria[c.key] = onScale(quality + wobble + noise() * 0.6, c.scale);
  }
  return { criteria, score: judgeTrickScore(model, criteria).score };
}

/**
 * The scores the virtual judges should write right now, in attempt order: none for a crash, none that are already in, none from a judge whose phone died, and each
 * judge a moment behind the spotter. `agree / normal / disagree` set how far the judges stray from each other. The special mode applies to one panel position:
 * `misses` marks a share of attempts Missed, `offline` holds that judge's writes for a minute (of the normal clock, shortened with the speed) and then sends them all,
 * `late` holds each of that judge's scores longer. A forced tie gives the two riders identical marks from every judge, attempt for attempt.
 */
export function planScoreWrites(input: {
  model: ScoringModel;
  spread: SpreadMode;
  judges: JudgeSeat[];
  attempts: PlanAttempt[];
  existing: ReadonlySet<string>;
  mode: ModeContext;
  deadSeatIds: string[];
  tieEntries: [string, string] | null;
  limit?: number;
}): JudgeWrite[] {
  const { model, mode } = input;
  if (model.trick.entry === "none") return [];
  const sd = SPREAD_SD[input.spread];
  const tie = input.tieEntries ? new Set(input.tieEntries) : null;
  const offFrom = 0.3 * mode.heatDurationSec;
  const offTo = offFrom + scaledSec(mode.offlineSec, mode.speed);
  const out: JudgeWrite[] = [];
  const limit = input.limit ?? 12;
  for (const a of input.attempts) {
    if (a.status === "crashed") continue;
    const tied = tie?.has(a.entryId) ?? false;
    const key = tied ? `tie|${a.ordinal}` : a.id;
    const quality = tied ? TIE_QUALITY : 0.35 + 0.6 * unit(`${a.id}|quality`);
    input.judges.forEach((j, index) => {
      if (out.length >= limit) return;
      if (input.deadSeatIds.includes(j.seatId) || input.existing.has(`${a.id}|${j.seatId}`)) return;
      const special = mode.mode !== "none" && j.seatNo === mode.specialSeatNo;
      let lag = baseLagSec(index);
      if (special && mode.mode === "late") lag += scaledSec(mode.lateSec, mode.speed);
      if (a.ageSec < (mode.heatEnded && !(special && mode.mode === "late") ? 0 : lag)) return;
      if (special && mode.mode === "offline" && mode.sinceStartSec < offTo && mode.sinceStartSec >= offFrom) return; // phone offline: writes wait
      if (special && mode.mode === "misses" && !tied && unit(`${a.id}|${j.seatId}|miss`) < mode.missShare) {
        out.push({ kind: "missed", seatId: j.seatId, attemptId: a.id });
        return;
      }
      const m = markFor(model, quality, sd, key, tied ? `${j.seatId}|tie` : j.seatId);
      if (m) out.push({ kind: "score", seatId: j.seatId, attemptId: a.id, criteria: m.criteria, score: m.score });
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** The Impression / Variety scores to write at the end of the heat: one per rider from each judge, tied riders alike. Nothing when the model has none. */
export function planImpressionWrites(input: {
  model: ScoringModel;
  spread: SpreadMode;
  judges: JudgeSeat[];
  riders: Array<{ entryId: string }>;
  existing: ReadonlySet<string>;
  deadSeatIds: string[];
  tieEntries: [string, string] | null;
}): ImpressionWrite[] {
  const impression = input.model.heat.impression;
  if (!impression) return [];
  const sd = SPREAD_SD[input.spread];
  const tie = input.tieEntries ? new Set(input.tieEntries) : null;
  const out: ImpressionWrite[] = [];
  for (const r of input.riders) {
    const tied = tie?.has(r.entryId) ?? false;
    const quality = tied ? TIE_QUALITY : 0.4 + 0.5 * unit(`${r.entryId}|impression`);
    for (const j of input.judges) {
      if (input.deadSeatIds.includes(j.seatId) || input.existing.has(`${r.entryId}|${j.seatId}`)) continue;
      const rnd = rng(hash32(`${tied ? "tie" : r.entryId}|${j.seatId}${tied ? "|tie" : ""}|impression-noise`));
      out.push({ seatId: j.seatId, entryId: r.entryId, value: onScale(quality + (sd === 0 ? 0 : bell(rnd, sd)), impression.scale) });
    }
  }
  return out;
}
