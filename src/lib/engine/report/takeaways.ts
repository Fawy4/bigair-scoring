import { didRide, mean, roundName, type Agg, type RiderHeat } from "./collect";
import { rate } from "./figures";
import type { DivisionRules, GapLine, ReportContext, Strategy, Strength, Takeaways, Train } from "./types";

/** Thresholds named in the owner's brief (item 4d). */
export const LANDING_POINTS_ABOVE_FIELD = 8;
export const ONE_SIDE_SHARE = 0.75;
export const ONE_SIDE_MIN_JUMPS = 8;

const pct = (x: number): number => Math.round(x * 100);

/** The first strength that applies, in this order: landing rate, loops, variety, both sides, growth, every attempt used. */
export function strengthOf(me: Agg, field: Agg[], rules: DivisionRules | undefined): Strength | null {
  const fieldRate = mean(field.map(rate).filter((x): x is number => x !== null));
  const mine = rate(me);
  if (mine !== null && fieldRate !== null && pct(mine) - pct(fieldRate) >= LANDING_POINTS_ABOVE_FIELD) return { code: "landing_rate", n: pct(mine), m: pct(fieldRate) };
  if (me.loopsLanded >= 2) return { code: "loops", n: me.loopsLanded, m: me.loopsTried };
  const fieldVariety = mean(field.map((a) => a.differentPerHeat).filter((x): x is number => x !== null));
  if (me.differentPerHeat !== null && fieldVariety !== null && me.differentPerHeat > fieldVariety + 1e-9) return { code: "variety_per_heat", n: Math.round(me.differentPerHeat * 10) / 10, m: Math.round(fieldVariety * 10) / 10 };
  const both = bothSides(me);
  if (both) return { code: "both_sides", n: both.count, m: null, trick: both.label };
  if (me.totals.length >= 2 && me.totals[me.totals.length - 1] > me.totals[0] + 1e-9) return { code: "growth", n: me.totals[0], m: me.totals[me.totals.length - 1] };
  const cap = rules?.attemptCap ?? null;
  if (cap !== null && me.heats.length && me.heats.every((rh) => rh.attempts.length >= cap)) return { code: "every_attempt", n: cap, m: me.heats.length };
  return null;
}

/** A trick landed on both sides: how many different tricks, and the first one's name. */
export function bothSides(me: Agg): { count: number; label: string } | null {
  const sides = new Map<string, { left: boolean; right: boolean; label: string }>();
  for (const rh of me.heats)
    for (const t of rh.attempts) {
      if (t.status !== "landed" || !t.key || !t.direction) continue;
      const s = sides.get(t.key) ?? { left: false, right: false, label: t.label };
      if (t.direction === "left") s.left = true;
      if (t.direction === "right") s.right = true;
      sides.set(t.key, s);
    }
  const both = [...sides.values()].filter((s) => s.left && s.right);
  return both.length ? { count: both.length, label: both[0].label } : null;
}

/** The first thing to train, in this order. `finalistLoopJumps` is the finalists' average of jumps with a loop; null without finalists. */
export function trainOf(me: Agg, finalistLoopJumps: number | null): Train | null {
  // a trick tried at least twice and never landed
  const tried = new Map<string, { n: number; landed: number; label: string }>();
  for (const rh of me.heats)
    for (const t of rh.attempts) {
      if (!t.key) continue;
      const e = tried.get(t.key) ?? { n: 0, landed: 0, label: t.label };
      e.n++;
      if (t.status === "landed") e.landed++;
      tried.set(t.key, e);
    }
  const never = [...tried.values()].filter((e) => e.n >= 2 && e.landed === 0).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))[0];
  if (never) return { code: "never_landed", n: never.n, m: null, trick: never.label };
  if (me.loopsTried > 0 && me.loopsLanded * 2 < me.loopsTried) return { code: "loops_half", n: me.loopsLanded, m: me.loopsTried };
  if (me.loopsTried === 0 && finalistLoopJumps !== null && finalistLoopJumps > 0) return { code: "no_loops", n: 0, m: null };
  const w = me.withDirection;
  if (w >= ONE_SIDE_MIN_JUMPS && w * 2 >= me.jumps) {
    const big = Math.max(me.left, me.right);
    if (big / w >= ONE_SIDE_SHARE) return { code: "one_side", n: pct(big / w), m: w, side: me.left >= me.right ? "left" : "right" };
  }
  // a heat with half or more of the jumps crashed (the latest such heat)
  const crashed = [...me.heats].reverse().find((rh) => rh.attempts.length > 0 && rh.attempts.filter((t) => t.status === "crashed").length * 2 >= rh.attempts.length);
  if (crashed) return { code: "crashed_half", n: crashed.attempts.filter((t) => t.status === "crashed").length, m: crashed.attempts.length, heatLabel: crashed.title };
  // the same trick landed twice on the same side in one heat
  for (const rh of me.heats) {
    const seen = new Map<string, { n: number; label: string; side: "left" | "right" }>();
    for (const t of rh.attempts) {
      if (t.status !== "landed" || !t.key || !t.direction) continue;
      const k = `${t.key}|${t.direction}`;
      const e = seen.get(k) ?? { n: 0, label: t.label, side: t.direction === "right" ? ("right" as const) : ("left" as const) };
      e.n++;
      seen.set(k, e);
    }
    const twice = [...seen.values()].find((e) => e.n >= 2);
    if (twice) return { code: "repeat_same_side", n: twice.n, m: null, trick: twice.label, side: twice.side, heatLabel: rh.title };
  }
  return null;
}

/** The heat strategy point of one heat (item 4d), or null when no rule fits. */
export function strategyOfHeat(rh: RiderHeat, rules: DivisionRules | undefined, winner: { landed: number; loops: number } | null): Strategy | null {
  const base = { heatId: rh.heat.id, heatLabel: rh.title };
  const cap = rules?.attemptCap ?? null;
  const landed = rh.attempts.filter((t) => t.status === "landed");
  const len = rh.lengthSec;
  if (rh.outcome === "won") {
    const counted = rh.attempts.filter((t) => t.counted && t.at_sec !== null);
    const early = counted.find((t) => (t.at_sec as number) <= len / 3);
    if (early) return { code: "early_banker", ...base, n: early.at_sec as number, m: len };
    const bestCounted = [...counted].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (bestCounted && (bestCounted.at_sec as number) > len / 2) return { code: "best_late", ...base, n: bestCounted.at_sec as number, m: len };
    return null;
  }
  if (cap !== null && rh.attempts.length < cap) return { code: "unused_attempts", ...base, n: cap - rh.attempts.length, m: cap };
  const first = landed.filter((t) => t.at_sec !== null).sort((a, b) => (a.at_sec as number) - (b.at_sec as number))[0];
  if (first && (first.at_sec as number) > len / 2) return { code: "late_first_trick", ...base, n: first.at_sec as number, m: len };
  if (winner) {
    const myLoops = landed.filter((t) => t.loop).length;
    if (winner.loops >= 0 && winner.loops > myLoops) return { code: "winner_more_loops", ...base, n: winner.loops, m: myLoops };
    if (winner.landed > landed.length) return { code: "winner_more_tricks", ...base, n: winner.landed, m: landed.length };
    if (winner.landed === landed.length && landed.length > 0) return { code: "same_tricks_as_winner", ...base, n: landed.length, m: null };
  }
  return null;
}

/** What the winner of a heat landed: tricks and loops. */
export function winnerFigures(rh: RiderHeat, loopOf: (a: { parts: unknown; category: string | null }) => boolean): { landed: number; loops: number } | null {
  const w = rh.heat.results.find((r) => r.place === 1 && (!r.status || r.status === "ok"));
  if (!w || w.entry_id === rh.entryId) return null;
  const landed = w.attempts.filter((a) => a.status === "landed" && a.ignored !== "over_cap");
  return { landed: landed.length, loops: landed.filter((a) => loopOf(a)).length };
}

/** One strategy point: the heats he lost first (the latest first, the knock-out heat above all), then the heats he won. */
export function strategyOf(heats: RiderHeat[], rules: DivisionRules | undefined, winnerOfHeat: (rh: RiderHeat) => { landed: number; loops: number } | null): Strategy | null {
  const rode = heats.filter(didRide);
  const lost = rode.filter((rh) => rh.outcome !== "won").reverse();
  const won = rode.filter((rh) => rh.outcome === "won").reverse();
  for (const rh of [...lost, ...won]) {
    const s = strategyOfHeat(rh, rules, winnerOfHeat(rh));
    if (s) return s;
  }
  return null;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * "You missed the Final by 0.4 points. One more trick scoring above 2.0, in place of your third best (1.6), would have taken you through": for the heat that knocked
 * him out, only when a trick scoring that much was landed at the event (`bestLanded` is the best panel score of the division).
 */
export function gapOf(ctx: ReportContext, rh: RiderHeat | undefined, rules: DivisionRules | undefined, bestLanded: number | null): GapLine | null {
  if (!rh || rh.outcome !== "out" || !rh.result || rules?.weighted) return null;
  const mine = rh.result.total;
  if (mine === null) return null;
  // the lowest total that went through in this heat
  const through = rh.heat.results
    .filter((r) => r.entry_id !== rh.entryId && r.total !== null && (r.place ?? 99) < (rh.result?.place ?? 0))
    .filter((r) => {
      const rule = (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(r.place as number));
      return rule && rule.to !== "eliminated" && rule.to !== "final_placing";
    })
    .map((r) => Number(r.total));
  if (!through.length) return null;
  const miss = r2(Math.min(...through) - Number(mine));
  if (miss <= 0) return null;
  const counted = [...rh.result.counted].map((c) => c.score).sort((a, b) => a - b);
  const n = rules?.countedN ?? null;
  const full = n !== null && counted.length >= n;
  const replaces = full ? counted[0] : null;
  const needAbove = r2((replaces ?? 0) + miss);
  if (bestLanded === null || bestLanded <= needAbove) return null;
  const rule = (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(1));
  const target = ctx.data.divisions.find((d) => d.id === rh.divisionId)?.rounds.find((r) => r.draw_round === rule?.to);
  return { heatId: rh.heat.id, heatLabel: rh.title, miss, toRound: target ? roundName(target) : null, needAbove, replaces, rank: replaces === null ? null : n };
}

export function takeawaysOf(parts: { strength: Strength | null; train: Train | null; strategy: Strategy | null; gap: GapLine | null }): Takeaways {
  return parts;
}
