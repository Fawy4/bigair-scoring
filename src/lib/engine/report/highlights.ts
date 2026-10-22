import type { Agg } from "./collect";
import { avgImpression, bestHeat, crashRate } from "./figures";
import type { Highlight, HighlightKind } from "./types";

/** Fewest crashes only counts from this many jumps. */
export const FEWEST_CRASHES_MIN_JUMPS = 8;
export const MAX_HIGHLIGHTS = 3;

/** Longest run of heats won one after the other. */
export function winningRun(a: Agg): number {
  let best = 0;
  let run = 0;
  for (const rh of a.heats) {
    run = rh.outcome === "won" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

interface Measure {
  kind: HighlightKind;
  /** Higher is better unless `lowerIsBetter`. */
  value: (a: Agg) => number | null;
  lowerIsBetter?: boolean;
  /** Must beat this to count at all (zero loops is not a highlight). */
  min?: number;
}

/** The measures that need no trick, in the owner's order; "the only rider to land" sits after the first three of them (see `highlightsOf`). */
const FIRST: Measure[] = [
  { kind: "highest_trick", value: (a) => a.bestTrick?.score ?? null, min: 0 },
  { kind: "best_heat_total", value: (a) => bestHeat(a)?.total ?? null, min: 0 },
  { kind: "longest_winning_run", value: winningRun, min: 1 },
];
const LAST: Measure[] = [
  { kind: "most_tricks", value: (a) => a.landed, min: 0 },
  { kind: "most_different_tricks", value: (a) => a.different.size, min: 0 },
  { kind: "most_loops", value: (a) => a.loopsLanded, min: 0 },
  { kind: "fewest_crashes", value: (a) => (a.jumps >= FEWEST_CRASHES_MIN_JUMPS ? crashRate(a) : null), lowerIsBetter: true },
  { kind: "best_impression", value: avgImpression, min: 0 },
];

function firstIn(m: Measure, me: Agg, riders: Agg[]): number | null {
  const mine = m.value(me);
  if (mine === null) return null;
  if (m.min !== undefined && mine <= m.min) return null;
  const theirs = riders.map(m.value).filter((x): x is number => x !== null);
  const top = m.lowerIsBetter ? Math.min(...theirs) : Math.max(...theirs);
  return Math.abs(mine - top) > 1e-9 ? null : mine;
}

/**
 * Up to three one-liners, only where the rider is first or joint first among the riders of his division, in this order: highest scoring trick, best heat total, longest winning
 * run, the only rider to land one of his best tricks, most tricks, most different tricks, most loops, fewest crashes, highest impression average. No highlight: an empty list.
 * `riders` holds everyone with a ridden heat, the rider himself included.
 */
export function highlightsOf(me: Agg, riders: Agg[], max: number = MAX_HIGHLIGHTS): Highlight[] {
  const out: Highlight[] = [];
  const make = (m: Measure, value: number): Highlight => ({
    kind: m.kind,
    value,
    trick: m.kind === "highest_trick" ? (me.bestTrick?.label ?? null) : null,
    round: m.kind === "best_heat_total" ? (bestHeat(me)?.round ?? null) : null,
    jumps: m.kind === "fewest_crashes" ? me.jumps : null,
  });
  for (const m of FIRST) {
    const v = firstIn(m, me, riders);
    if (v !== null) out.push(make(m, v));
  }
  const only = onlyRiderToLand(me, riders);
  if (only) out.push({ kind: "only_rider_to_land", value: only.score, trick: only.label, round: null, jumps: null });
  for (const m of LAST) {
    const v = firstIn(m, me, riders);
    if (v !== null) out.push(make(m, v));
  }
  return out.slice(0, max);
}

/** "The only rider to land X", only when X is one of his three best scoring tricks. */
export function onlyRiderToLand(me: Agg, riders: Agg[]): { label: string; score: number } | null {
  const best = new Map<string, { label: string; score: number }>();
  for (const rh of me.heats)
    for (const t of rh.attempts) {
      if (t.status !== "landed" || t.score === null || !t.key) continue;
      const p = best.get(t.key);
      if (!p || t.score > p.score) best.set(t.key, { label: t.label, score: t.score });
    }
  const top3 = [...best.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])).slice(0, 3);
  for (const [key, v] of top3) {
    const others = riders.filter((r) => r.entryId !== me.entryId);
    if (others.length && !others.some((o) => o.different.has(key))) return v;
  }
  return null;
}
