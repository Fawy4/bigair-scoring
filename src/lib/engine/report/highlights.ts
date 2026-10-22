import type { Agg } from "./collect";
import { bestHeat, crashRate } from "./figures";
import type { Highlight, HighlightKind } from "./types";

/** Fewest crashes only counts from this many jumps (item 4c). */
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

const maxImpression = (a: Agg): number | null => (a.impressions.length ? Math.max(...a.impressions) : null);

interface Measure {
  kind: HighlightKind;
  /** Higher is better unless `lowerIsBetter`. */
  value: (a: Agg) => number | null;
  lowerIsBetter?: boolean;
  /** Must beat this to count at all (zero loops is not a highlight). */
  min?: number;
}

const MEASURES: Measure[] = [
  { kind: "highest_trick", value: (a) => a.bestTrick?.score ?? null, min: 0 },
  { kind: "best_heat_total", value: (a) => bestHeat(a)?.total ?? null, min: 0 },
  { kind: "longest_winning_run", value: winningRun, min: 1 },
  { kind: "most_tricks", value: (a) => a.landed, min: 0 },
  { kind: "most_different_tricks", value: (a) => a.different.size, min: 0 },
  { kind: "most_loops", value: (a) => a.loopsLanded, min: 0 },
  { kind: "fewest_crashes", value: (a) => (a.jumps >= FEWEST_CRASHES_MIN_JUMPS ? crashRate(a) : null), lowerIsBetter: true },
  { kind: "best_impression", value: maxImpression, min: 0 },
];

/**
 * Up to three one-liners, only where the rider is first or joint first among the riders of his division (item 4c); in this fixed order. No highlight: an empty list
 * (and the page shows no card). `riders` holds everyone with a ridden heat, the rider himself included.
 */
export function highlightsOf(me: Agg, riders: Agg[], scoreName: string | null, max: number = MAX_HIGHLIGHTS): Highlight[] {
  const out: Highlight[] = [];
  for (const m of MEASURES) {
    const mine = m.value(me);
    if (mine === null) continue;
    if (m.min !== undefined && mine <= m.min) continue;
    const theirs = riders.map(m.value).filter((x): x is number => x !== null);
    const top = m.lowerIsBetter ? Math.min(...theirs) : Math.max(...theirs);
    if (Math.abs(mine - top) > 1e-9) continue;
    out.push({
      kind: m.kind,
      value: mine,
      trick: m.kind === "highest_trick" ? (me.bestTrick?.label ?? null) : null,
      scoreName: m.kind === "best_impression" ? scoreName : null,
    });
  }
  const only = onlyRiderToLand(me, riders);
  if (only) out.push({ kind: "only_rider_to_land", value: only.score, trick: only.label, scoreName: null });
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
