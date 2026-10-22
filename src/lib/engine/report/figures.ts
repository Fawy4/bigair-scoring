import { mean, spread, type Agg, type RiderHeat } from "./collect";
import type { BestTrick, CompareRow, DivisionRules, FamilyRow, FieldFigure, Tiles } from "./types";

/** The field figure of one number: the average over the riders of the division, and over the finalists among them. */
export function fieldOf(riders: Agg[], finalists: Set<string> | null, f: (a: Agg) => number | null): FieldFigure {
  const avg = (rs: Agg[]): number | null => mean(rs.map(f).filter((x): x is number => x !== null));
  return { all: avg(riders), finalists: finalists ? avg(riders.filter((r) => finalists.has(r.entryId))) : null };
}

export const rate = (a: Agg): number | null => (a.jumps ? a.landed / a.jumps : null);
export const crashRate = (a: Agg): number | null => (a.jumps ? a.crashed / a.jumps : null);
export const avgTotal = (a: Agg): number | null => mean(a.totals);

export function bestHeat(a: Agg): { total: number; title: string } | null {
  let best: { total: number; title: string } | null = null;
  for (const rh of a.heats) {
    const t = rh.result?.total;
    if (t !== null && t !== undefined && (!best || Number(t) > best.total)) best = { total: Number(t), title: rh.title };
  }
  return best;
}

export function tilesOf(me: Agg, riders: Agg[], finalists: Set<string> | null, rules: DivisionRules | undefined): Tiles {
  const cap = rules?.attemptCap ?? null;
  const best = bestHeat(me);
  const fig = (f: (a: Agg) => number | null) => fieldOf(riders, finalists, f);
  return {
    jumps: { value: me.jumps, allowed: cap === null ? null : cap * me.heats.length, field: fig((a) => a.jumps) },
    landed: { value: me.landed, field: fig((a) => a.landed) },
    crashes: { value: me.crashed, rate: crashRate(me), field: fig((a) => a.crashed) },
    differentTricks: { value: me.different.size, field: fig((a) => a.different.size) },
    loops: { landed: me.loopsLanded, tried: me.loopsTried, field: fig((a) => a.loopsLanded) },
    directions: { left: me.left, right: me.right, withDirection: me.withDirection, jumps: me.jumps },
    heatsWon: { value: me.heatsWon, heats: me.heats.length },
    averageTotal: { value: avgTotal(me), field: fig(avgTotal) },
    bestTotal: { value: best?.total ?? null, heatLabel: best?.title ?? null, field: fig((a) => bestHeat(a)?.total ?? null) },
    steadiness: { value: spread(me.totals), field: fig((a) => spread(a.totals)) },
  };
}

/** His three best scoring tricks (a trick counts once, with its best score). */
export function bestTricks(me: Agg): BestTrick[] {
  const best = new Map<string, BestTrick & { sort: string }>();
  for (const rh of me.heats) {
    for (const t of rh.attempts) {
      if (t.status !== "landed" || t.score === null) continue;
      const k = t.key ?? `#${rh.heat.id}-${t.seq}`;
      const prev = best.get(k);
      if (!prev || t.score > prev.score) best.set(k, { trick: t.label, score: t.score, side: t.direction, heatLabel: rh.title, sort: k });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.sort.localeCompare(b.sort)).slice(0, 3).map(({ sort: _s, ...rest }) => rest);
}

export function mixOf(rhs: RiderHeat[]): FamilyRow[] {
  const fam = new Map<string, { tried: number; landed: number; landedKeys: Map<string, string>; triedKeys: Map<string, string> }>();
  for (const rh of rhs) {
    for (const t of rh.attempts) {
      if (!t.key) continue;
      const f = fam.get(t.family) ?? { tried: 0, landed: 0, landedKeys: new Map(), triedKeys: new Map() };
      f.tried++;
      f.triedKeys.set(t.key, f.triedKeys.get(t.key) ?? t.label);
      if (t.status === "landed") {
        f.landed++;
        f.landedKeys.set(t.key, f.landedKeys.get(t.key) ?? t.label);
      }
      fam.set(t.family, f);
    }
  }
  return [...fam.entries()]
    .map(([key, f]) => ({
      key,
      tried: f.tried,
      landed: f.landed,
      landedTricks: [...f.landedKeys.values()].sort((a, b) => a.localeCompare(b)),
      stillToLand: [...f.triedKeys.entries()].filter(([k]) => !f.landedKeys.has(k)).map(([, label]) => label).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.tried - a.tried || a.key.localeCompare(b.key));
}

export function compareOf(me: Agg, riders: Agg[], finalists: Set<string> | null): CompareRow[] {
  const fns: Array<[CompareRow["key"], (a: Agg) => number | null]> = [
    ["landing_rate", rate],
    ["attempts_used", (a) => (a.heats.length ? a.jumps / a.heats.length : null)],
    ["loop_share", (a) => (a.jumps ? a.loopJumps / a.jumps : null)],
    ["tricks_per_heat", (a) => a.differentPerHeat],
    ["average_trick", (a) => mean(a.landedScores)],
    ["impression", (a) => mean(a.impressions)],
  ];
  return fns.map(([key, f]) => {
    const fg = fieldOf(riders, finalists, f);
    return { key, me: f(me), all: fg.all, finalists: fg.finalists };
  });
}
