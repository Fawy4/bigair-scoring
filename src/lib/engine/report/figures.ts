import { mean, roundName, spread, type Agg, type RiderHeat } from "./collect";
import type { BestTrick, CompareRow, DivisionRules, Mix, Tiles } from "./types";

const nums = (xs: Array<number | null>): number[] => xs.filter((x): x is number => x !== null);
const avg = (xs: Array<number | null>): number | null => mean(nums(xs));

export const rate = (a: Agg): number | null => (a.jumps ? a.landed / a.jumps : null);
export const crashRate = (a: Agg): number | null => (a.jumps ? a.crashed / a.jumps : null);
export const avgTotal = (a: Agg): number | null => mean(a.totals);
export const avgTrick = (a: Agg): number | null => mean(a.landedScores);
export const avgImpression = (a: Agg): number | null => mean(a.impressions);
export const winShare = (a: Agg): number | null => (a.heats.length ? a.heatsWon / a.heats.length : null);

/** The rate of a group of riders taken over all their jumps together ("the field landed 67%"). */
export const pooled = (rs: Agg[], top: (a: Agg) => number, bottom: (a: Agg) => number): number | null => {
  const b = rs.reduce((s, a) => s + bottom(a), 0);
  return b ? rs.reduce((s, a) => s + top(a), 0) / b : null;
};

export function bestHeat(a: Agg): { total: number; round: string } | null {
  let best: { total: number; round: string } | null = null;
  for (const rh of a.heats) {
    const t = rh.result?.total;
    if (t !== null && t !== undefined && (!best || Number(t) > best.total)) best = { total: Number(t), round: roundName(rh.round) };
  }
  return best;
}

const subset = (riders: Agg[], ids: Set<string> | null): Agg[] => (ids ? riders.filter((r) => ids.has(r.entryId)) : []);

export function tilesOf(me: Agg, riders: Agg[], finalists: Set<string> | null, rules: DivisionRules | undefined): Tiles {
  const cap = rules?.attemptCap ?? null;
  const best = bestHeat(me);
  const fin = subset(riders, finalists);
  const totals = me.totals;
  return {
    jumps: { value: me.jumps, heats: me.heats.length, allowed: me.allowed ?? (cap === null ? null : cap * me.heats.length) },
    landed: { value: me.landed, rate: rate(me), fieldRate: pooled(riders, (a) => a.landed, (a) => a.jumps) },
    crashes: { value: me.crashed, rate: crashRate(me), fieldRate: pooled(riders, (a) => a.crashed, (a) => a.jumps) },
    different: { value: me.different.size, field: mean(riders.map((a) => a.different.size)) },
    loops: { landed: me.loopsLanded, tried: me.loopsTried },
    sides: { left: me.left, right: me.right, withDirection: me.withDirection, jumps: me.jumps },
    bestTrick: { value: me.bestTrick?.score ?? null, eventBest: nums(riders.map((a) => a.bestTrick?.score ?? null)).reduce<number | null>((m, x) => (m === null || x > m ? x : m), null) },
    averageTrick: { value: avgTrick(me), field: avg(riders.map(avgTrick)) },
    impression: { value: avgImpression(me), field: avg(riders.map(avgImpression)) },
    heatsWon: { won: me.heatsWon, heats: me.heats.length, share: winShare(me), fieldShare: avg(riders.map(winShare)) },
    averageTotal: { value: avgTotal(me), field: avg(riders.map(avgTotal)), finalists: fin.length ? avg(fin.map(avgTotal)) : null },
    bestTotal: { value: best?.total ?? null, round: best?.round ?? null, eventBest: nums(riders.map((a) => bestHeat(a)?.total ?? null)).reduce<number | null>((m, x) => (m === null || x > m ? x : m), null) },
    steadiness: { value: spread(totals), min: totals.length ? Math.min(...totals) : null, max: totals.length ? Math.max(...totals) : null, field: avg(riders.map((a) => spread(a.totals))) },
  };
}

/** His three best scoring tricks (a trick counts once, with its best score), with where in the event he landed it. */
export function bestTricks(me: Agg): BestTrick[] {
  const best = new Map<string, BestTrick & { sort: string }>();
  for (const rh of me.heats) {
    for (const t of rh.attempts) {
      if (t.status !== "landed" || t.score === null) continue;
      const k = t.key ?? `#${rh.heat.id}-${t.seq}`;
      const prev = best.get(k);
      if (!prev || t.score > prev.score) best.set(k, { trick: t.label, score: t.score, roundName: rh.round.name, at_sec: t.at_sec, sort: k });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.sort.localeCompare(b.sort))
    .slice(0, 3)
    .map((b) => ({ trick: b.trick, score: b.score, roundName: b.roundName, at_sec: b.at_sec }));
}

/** The trick mix: tried and landed by family in the order the scoring lists its categories (then the rest, then the jumps with no trick name), what landed, what is still to land. */
export function mixOf(rhs: RiderHeat[], familyOrder: string[] = []): Mix {
  const fam = new Map<string, { tried: number; landed: number; scores: number[] }>();
  const landedKeys = new Map<string, { trick: string; count: number }>();
  const triedKeys = new Map<string, string>();
  let crashesNoName = 0;
  for (const rh of rhs) {
    for (const t of rh.attempts) {
      const f = fam.get(t.family) ?? { tried: 0, landed: 0, scores: [] };
      f.tried++;
      if (t.status === "landed") {
        f.landed++;
        if (t.score !== null) f.scores.push(t.score);
      } else if (!t.key) crashesNoName++;
      fam.set(t.family, f);
      if (!t.key) continue;
      if (!triedKeys.has(t.key)) triedKeys.set(t.key, t.label);
      if (t.status === "landed") {
        const e = landedKeys.get(t.key) ?? { trick: t.label, count: 0 };
        e.count++;
        landedKeys.set(t.key, e);
      }
    }
  }
  const rank = (k: string): number => (k === "not_logged" ? 1e6 : familyOrder.indexOf(k) >= 0 ? familyOrder.indexOf(k) : 1e5);
  const families = [...fam.entries()]
    .map(([key, f]) => ({ key, tried: f.tried, landed: f.landed, average: mean(f.scores) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || b.tried - a.tried || a.key.localeCompare(b.key));
  return {
    families,
    landedTricks: [...landedKeys.values()].sort((a, b) => b.count - a.count),
    stillToLand: [...triedKeys.entries()].filter(([k]) => !landedKeys.has(k)).map(([, label]) => label),
    crashesNoName,
  };
}

export function compareOf(me: Agg, riders: Agg[], finalists: Set<string> | null, rules: DivisionRules | undefined): CompareRow[] {
  const cap = rules?.attemptCap ?? null;
  const fin = subset(riders, finalists);
  const hasFin = fin.length > 0;
  const allowed = (a: Agg): number => a.allowed ?? (cap === null ? 0 : cap * a.heats.length);
  const rows: Array<{ key: CompareRow["key"]; kind: CompareRow["kind"]; one: (a: Agg) => number | null; group: (rs: Agg[]) => number | null }> = [
    { key: "landing_rate", kind: "percent", one: rate, group: (rs) => pooled(rs, (a) => a.landed, (a) => a.jumps) },
    cap === null && me.allowed === null
      ? { key: "attempts_used", kind: "number", one: (a) => (a.heats.length ? a.jumps / a.heats.length : null), group: (rs) => avg(rs.map((a) => (a.heats.length ? a.jumps / a.heats.length : null))) }
      : { key: "attempts_used", kind: "percent", one: (a) => (allowed(a) ? a.jumps / allowed(a) : null), group: (rs) => pooled(rs, (a) => a.jumps, allowed) },
    { key: "loop_share", kind: "percent", one: (a) => (a.jumps ? a.loopJumps / a.jumps : null), group: (rs) => pooled(rs, (a) => a.loopJumps, (a) => a.jumps) },
    { key: "tricks_per_heat", kind: "number", one: (a) => a.differentPerHeat, group: (rs) => avg(rs.map((a) => a.differentPerHeat)) },
    { key: "average_trick", kind: "number", one: avgTrick, group: (rs) => avg(rs.map(avgTrick)) },
    { key: "impression", kind: "number", one: avgImpression, group: (rs) => avg(rs.map(avgImpression)) },
  ];
  return rows.map((r) => {
    const mine = r.one(me);
    const all = r.group(riders);
    const finalistsValue = hasFin ? r.group(fin) : null;
    const best = Math.max(0, ...nums(riders.map(r.one)), mine ?? 0);
    return { key: r.key, kind: r.kind, me: mine, all, finalists: finalistsValue, scale: r.kind === "percent" ? 1 : best || 1 };
  });
}
