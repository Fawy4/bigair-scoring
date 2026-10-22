import { didRide, mean, roundName, type Agg, type RiderHeat } from "./collect";
import { avgImpression, avgTrick, rate } from "./figures";
import type { DivisionRules, Point, ReportRound } from "./types";

/** Thresholds named in the owner's brief and his reference. */
export const LANDING_POINTS_ABOVE_FIELD = 8;
export const ONE_SIDE_SHARE = 0.75;
export const ONE_SIDE_MIN_JUMPS = 8;
/** A landing rate that rises by this much from the first heat to the last is "growth through the day". */
export const GROWTH_POINTS = 25;
/** A best trick among this many highest scores of the event is worth saying. */
export const TOP_SCORES = 5;
/** Landed tricks averaging below this share of the finalists' average are "well below". */
export const AVERAGE_LOW_SHARE = 0.75;
/** Impression above / below the field by this share. */
export const IMPRESSION_SHARE = 0.25;

const pct = (x: number): number => Math.round(x * 100);

export interface TakeInput {
  me: Agg;
  /** Everyone with a ridden heat in the division, the rider included. */
  riders: Agg[];
  finalists: Agg[];
  rules: DivisionRules | undefined;
  /** Every landed panel score of the division, any order. */
  allScores: number[];
  /** The rounds of the division, in order. */
  rounds: ReportRound[];
  /** Does a logged line carry a loop? */
  loopOf: (a: { parts: unknown; category: string | null }) => boolean;
}

const fieldMean = (rs: Agg[], f: (a: Agg) => number | null): number | null => mean(rs.map(f).filter((x): x is number => x !== null));
const landRate = (rh: RiderHeat): number | null => (rh.attempts.length ? rh.attempts.filter((t) => t.status === "landed").length / rh.attempts.length : null);

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

/** The first strength that applies, in this order: a top score of the event, loops, growth through the day, landing rate, every attempt used, impression, variety, both sides, growth of the totals. */
export function strengthOf(t: TakeInput): Point | null {
  const { me, riders } = t;
  const best = me.bestTrick;
  if (best) {
    const rank = 1 + t.allScores.filter((s) => s > best.score + 1e-9).length;
    if (rank <= TOP_SCORES) return { code: "top_trick", nums: [best.score, rank], trick: best.label, round: best.round };
  }
  if (me.loopsLanded >= 2) return { code: "loops", nums: [me.loopsLanded, me.loopsTried] };
  const rated = me.heats.filter((rh) => landRate(rh) !== null);
  if (rated.length >= 2) {
    const a = rated[0];
    const z = rated[rated.length - 1];
    const ra = landRate(a) as number;
    const rz = landRate(z) as number;
    if (pct(rz) - pct(ra) >= GROWTH_POINTS) return { code: "growth", nums: [pct(ra), pct(rz)], round: roundName(a.round), target: roundName(z.round) };
  }
  const fieldRate = riders.reduce((s, a) => s + a.jumps, 0) ? riders.reduce((s, a) => s + a.landed, 0) / riders.reduce((s, a) => s + a.jumps, 0) : null;
  const mine = rate(me);
  if (mine !== null && fieldRate !== null && pct(mine) - pct(fieldRate) >= LANDING_POINTS_ABOVE_FIELD) return { code: "landing_rate", nums: [me.landed, me.jumps, pct(mine), pct(fieldRate)] };
  if (me.allowed !== null && me.heats.length && me.heats.every((rh) => rh.cap !== null && rh.attempts.length >= rh.cap)) return { code: "every_attempt", nums: [me.jumps, me.allowed] };
  const imp = avgImpression(me);
  const fieldImp = fieldMean(riders, avgImpression);
  if (imp !== null && fieldImp !== null && fieldImp > 0 && imp >= fieldImp * (1 + IMPRESSION_SHARE)) return { code: "impression_above", nums: [imp, fieldImp] };
  const fieldVariety = fieldMean(riders, (a) => a.differentPerHeat);
  if (me.differentPerHeat !== null && fieldVariety !== null && me.differentPerHeat > fieldVariety + 1e-9) return { code: "variety_per_heat", nums: [me.differentPerHeat, fieldVariety] };
  const both = bothSides(me);
  if (both) return { code: "both_sides", nums: [both.count], trick: both.label };
  if (me.totals.length >= 2 && me.totals[me.totals.length - 1] > me.totals[0] + 1e-9) return { code: "totals_growth", nums: [me.totals[0], me.totals[me.totals.length - 1]] };
  return null;
}

/** Everything he could train, in the order of the reference: the first is the takeaway, the first two are the suggested goals. */
export function trainList(t: TakeInput): Point[] {
  const { me } = t;
  const out: Point[] = [];
  const tried = new Map<string, { n: number; landed: number; label: string }>();
  for (const rh of me.heats)
    for (const a of rh.attempts) {
      if (!a.key) continue;
      const e = tried.get(a.key) ?? { n: 0, landed: 0, label: a.label };
      e.n++;
      if (a.status === "landed") e.landed++;
      tried.set(a.key, e);
    }
  const finJumps = t.finalists.reduce((s, a) => s + a.jumps, 0);
  const finLoops = t.finalists.reduce((s, a) => s + a.loopJumps, 0);
  if (me.loopsTried === 0 && finJumps > 0 && finLoops > 0) out.push({ code: "no_loops", nums: [pct(finLoops / finJumps)] });
  const w = me.withDirection;
  if (w >= ONE_SIDE_MIN_JUMPS && w * 2 >= me.jumps) {
    const big = Math.max(me.left, me.right);
    if (big / w >= ONE_SIDE_SHARE) out.push({ code: "one_side", nums: [big, w], side: me.left >= me.right ? "left" : "right" });
  }
  const mineAvg = avgTrick(me);
  const finAvg = fieldMean(t.finalists, avgTrick);
  if (mineAvg !== null && finAvg !== null && finAvg > 0 && mineAvg < finAvg * AVERAGE_LOW_SHARE) out.push({ code: "landed_average_low", nums: [mineAvg, finAvg] });
  // the heat with the highest share of crashes, when half or more of its jumps crashed (the later heat when two are level)
  const crashShare = (rh: RiderHeat): number => (rh.attempts.length ? rh.attempts.filter((a) => a.status === "crashed").length / rh.attempts.length : 0);
  const crashed = [...me.heats].filter((rh) => crashShare(rh) >= 0.5).reduce<RiderHeat | undefined>((m, rh) => (!m || crashShare(rh) >= crashShare(m) ? rh : m), undefined);
  if (crashed) out.push({ code: "crashed_half", nums: [crashed.attempts.filter((a) => a.status === "crashed").length, crashed.attempts.length], round: roundName(crashed.round) });
  if (me.loopsTried > 0 && me.loopsLanded * 2 < me.loopsTried) out.push({ code: "loops_half", nums: [me.loopsLanded, me.loopsTried] });
  const never = [...tried.entries()].filter(([k, e]) => e.n >= 2 && e.landed === 0 && /^[a-z]+:/.test(k)).map(([, e]) => e).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))[0];
  if (never) out.push({ code: "never_landed", nums: [never.n], trick: never.label });
  for (const rh of me.heats) {
    const seen = new Map<string, { n: number; label: string; side: "left" | "right" }>();
    for (const a of rh.attempts) {
      if (a.status !== "landed" || !a.key || !a.direction) continue;
      const k = `${a.key}|${a.direction}`;
      const e = seen.get(k) ?? { n: 0, label: a.label, side: a.direction === "right" ? ("right" as const) : ("left" as const) };
      e.n++;
      seen.set(k, e);
    }
    const twice = [...seen.values()].find((e) => e.n >= 2);
    if (twice) {
      out.push({ code: "repeat_same_side", nums: [twice.n], trick: twice.label, side: twice.side, round: roundName(rh.round) });
      break;
    }
  }
  const imp = avgImpression(me);
  const fieldImp = fieldMean(t.riders, avgImpression);
  if (imp !== null && fieldImp !== null && fieldImp > 0 && imp <= fieldImp * (1 - IMPRESSION_SHARE)) out.push({ code: "impression_below", nums: [imp, fieldImp] });
  return out;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** What the winner of a heat landed: tricks and loops. */
export function winnerFigures(rh: RiderHeat, loopOf: TakeInput["loopOf"]): { landed: number; loops: number } | null {
  const w = rh.heat.results.find((r) => r.place === 1 && (!r.status || r.status === "ok"));
  if (!w || w.entry_id === rh.entryId) return null;
  const landed = w.attempts.filter((a) => a.status === "landed" && a.ignored !== "over_cap");
  return { landed: landed.length, loops: landed.filter((a) => loopOf(a)).length };
}

const nameOfRound = (rounds: ReportRound[], drawId: string | undefined): string | null => {
  const r = rounds.find((x) => x.draw_round === drawId);
  return r ? roundName(r) : null;
};
const ruleFor = (round: ReportRound, place: number | null | undefined) => (place == null ? undefined : (round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(place)) ?? (round.advance ?? []).find((a) => a.places === "rest"));

/**
 * "In the Final you were 1.3 points from 1st place. One more trick scoring above 5.2, in place of your third-best (3.9), would have moved you up." (and its two other forms: a heat
 * that knocked him out, and a second place that sent him to the second chance). Only when a trick scoring that much was landed in the division.
 */
export function gapOf(t: TakeInput, rh: RiderHeat, bestLanded: number | null): Point | null {
  const res = rh.result;
  if (!res || res.total === null || rh.outcome === "won" || !didRide(rh) || t.rules?.weighted || bestLanded === null) return null;
  const place = res.place ?? null;
  if (place === null) return null;
  const mine = Number(res.total);
  const rule = ruleFor(rh.round, place);
  const ok = rh.heat.results.filter((r) => (!r.status || r.status === "ok") && r.total !== null && r.entry_id !== rh.entryId);
  let miss: number | null = null;
  let code: string;
  let target: string | null = null;
  if (rule?.to === "eliminated") {
    const through = ok.filter((r) => {
      const x = ruleFor(rh.round, r.place);
      return x && x.to !== "eliminated" && x.to !== "final_placing";
    });
    if (!through.length) return null;
    miss = Math.min(...through.map((r) => Number(r.total))) - mine;
    code = "gap_out";
    target = nameOfRound(t.rounds, (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(1))?.to);
  } else if (rule?.to === "final_placing" || rule === undefined) {
    const above = ok.find((r) => r.place === place - 1);
    if (!above) return null;
    miss = Number(above.total) - mine;
    code = "gap_place";
    target = place - 1 === 1 ? "1st" : place - 1 === 2 ? "2nd" : place - 1 === 3 ? "3rd" : `${place - 1}th`;
  } else {
    const winner = ok.find((r) => r.place === 1);
    if (!winner) return null;
    miss = Number(winner.total) - mine;
    code = "gap_direct";
    target = nameOfRound(t.rounds, (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(1))?.to);
  }
  miss = r2(miss);
  if (miss <= 0) return null;
  const counted = res.counted.map((c) => c.score).sort((a, b) => a - b);
  const n = t.rules?.countedN ?? null;
  const full = n !== null && counted.length >= n;
  const replaces = full ? counted[0] : null;
  const needAbove = r2((replaces ?? 0) + miss);
  if (bestLanded <= needAbove) return null;
  return { code, nums: [miss, needAbove, replaces ?? Number.NaN, full ? (n as number) : Number.NaN], round: roundName(rh.round), target };
}

/** The other strategy points of one heat he did not win: unused attempts, then the winner's tricks. */
function lostHeatPoint(t: TakeInput, rh: RiderHeat): Point | null {
  const round = roundName(rh.round);
  const cap = rh.cap;
  const landed = rh.attempts.filter((a) => a.status === "landed");
  const len = rh.lengthSec;
  if (cap !== null && rh.attempts.length < cap) return { code: "unused_attempts", nums: [rh.attempts.length, cap], round };
  const w = winnerFigures(rh, t.loopOf);
  if (w && landed.length > w.landed) return { code: "winner_fewer", nums: [landed.length, w.landed], round };
  const first = landed.filter((a) => a.at_sec !== null).sort((a, b) => (a.at_sec as number) - (b.at_sec as number))[0];
  if (first && (first.at_sec as number) > len / 2) return { code: "late_first_trick", nums: [first.at_sec as number, len], round };
  if (w) {
    const myLoops = landed.filter((a) => a.loop).length;
    if (w.loops > myLoops) return { code: "winner_more_loops", nums: [w.loops, myLoops], round };
    if (w.landed > landed.length) return { code: "winner_more_tricks", nums: [w.landed, landed.length], round };
    if (w.landed === landed.length && landed.length > 0) return { code: "same_tricks_as_winner", nums: [landed.length], round };
  }
  return null;
}

function wonHeatPoint(rh: RiderHeat): Point | null {
  const len = rh.lengthSec;
  const round = roundName(rh.round);
  const counted = rh.attempts.filter((a) => a.counted && a.at_sec !== null);
  const early = [...counted].sort((a, b) => (a.at_sec as number) - (b.at_sec as number)).find((a) => (a.at_sec as number) <= len / 3);
  if (early) return { code: "early_banker", nums: [early.at_sec as number], round };
  const bestCounted = [...counted].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (bestCounted && (bestCounted.at_sec as number) > len / 2) return { code: "best_late", nums: [bestCounted.at_sec as number], round };
  return null;
}

/**
 * One strategy point. First the gap line of the heats he did not win (the latest first), then the other points of those heats (unused attempts, the winner's tricks, the latest
 * first), then the points of the heats he won (the earliest first).
 */
export function strategyOf(t: TakeInput, bestLanded: number | null): Point | null {
  const rode = t.me.heats.filter(didRide);
  const lost = rode.filter((h) => h.outcome !== "won").reverse();
  for (const rh of lost) {
    const gap = gapOf(t, rh, bestLanded);
    if (gap) return gap;
  }
  for (const rh of lost) {
    const p = lostHeatPoint(t, rh);
    if (p) return p;
  }
  for (const rh of rode.filter((h) => h.outcome === "won")) {
    const p = wonHeatPoint(rh);
    if (p) return p;
  }
  return null;
}
