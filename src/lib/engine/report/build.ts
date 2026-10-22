import { aggregate, didRide, everyone, finalistIds, indexOf, riderHeats, roundName, type Agg, type RiderHeat } from "./collect";
import { bestTricks, compareOf, mixOf, tilesOf } from "./figures";
import { heatRow } from "./heats";
import { highlightsOf } from "./highlights";
import { gapOf, strategyOf, strengthOf, trainOf, winnerFigures } from "./takeaways";
import { hasLoop } from "./tricks";
import type { Goal, Headline, PathStep, ReportContext, ReportResultOrNone, Takeaways } from "./types";

export const MAX_GOALS = 3;

function pathOf(rhs: RiderHeat[]): PathStep[] {
  return rhs.map((rh) => ({ heatId: rh.heat.id, roundName: roundName(rh.round), heatLabel: rh.title, outcome: rh.outcome, place: rh.result?.place ?? null, toRound: null }));
}

/** Final place or the round reached, and the path through the rounds. */
export function headlineOf(ctx: ReportContext, entryId: string, divisionId: string, rhs: RiderHeat[]): Headline {
  const division = ctx.data.divisions.find((d) => d.id === divisionId);
  const rounds = [...(division?.rounds ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const placing = ctx.placings[entryId] ?? null;
  const steps = pathOf(rhs).map((s) => {
    const rh = rhs.find((x) => x.heat.id === s.heatId)!;
    const rule = (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && rh.result?.place != null && a.places.includes(rh.result.place));
    const target = rule ? rounds.find((r) => r.draw_round === rule.to) : undefined;
    return { ...s, toRound: target ? roundName(target) : null };
  });
  const last = rhs[rhs.length - 1];
  const finalRound = rounds[rounds.length - 1];
  const knockedOutRound = placing ? rounds.find((r) => r.draw_round === placing.round) : undefined;
  const outIn = knockedOutRound && finalRound && knockedOutRound.id !== finalRound.id ? roundName(knockedOutRound) : null;
  return {
    place: placing?.place ?? null,
    shared: placing?.shared ?? false,
    outInRound: outIn,
    lastRound: last ? roundName(last.round) : null,
    stillIn: !placing,
    steps,
  };
}

function goalsOf(t: Takeaways): Goal[] {
  const out: Goal[] = [];
  if (t.train) out.push({ from: "train", code: t.train.code, n: t.train.n, m: t.train.m, trick: t.train.trick ?? null, side: t.train.side ?? null });
  if (t.gap) out.push({ from: "gap", code: "gap", n: t.gap.needAbove, m: t.gap.miss });
  if (t.strategy) out.push({ from: "strategy", code: t.strategy.code, n: t.strategy.n, m: t.strategy.m });
  if (t.strength && out.length < 2) out.push({ from: "strength", code: t.strength.code, n: t.strength.n, m: t.strength.m, trick: t.strength.trick ?? null });
  return out.slice(0, MAX_GOALS);
}

/**
 * The report of one rider (RA1). Pure: the same data and context give the same report. Only published heats are in the data, so nothing here can show an unpublished
 * heat; a rider whose record says under 18 gets no report at all.
 */
export function buildRiderReport(ctx: ReportContext, entryId: string): ReportResultOrNone {
  const entry = ctx.data.entries.find((e) => e.id === entryId);
  if (!entry) return { status: "not_found" };
  if (entry.report_withheld) return { status: "withheld" };
  const idx = indexOf(ctx);
  const division = ctx.data.divisions.find((d) => d.id === entry.division_id);
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ").trim();
  const eventName = ctx.data.event.name;
  const rhs = riderHeats(ctx, entryId, idx);
  if (!rhs.some(didRide) && !rhs.length) return { status: "no_heats", entryId, name, divisionName: division?.name ?? "", eventName };

  const rules = ctx.divisionRules[entry.division_id];
  const everyoneMap = everyone(ctx, idx);
  const riders: Agg[] = [...everyoneMap.values()].filter((a) => a.divisionId === entry.division_id);
  const me = aggregate(entryId, rhs);
  if (!riders.some((r) => r.entryId === entryId)) riders.push(me);
  const finalists = finalistIds(ctx, entry.division_id);
  const scoreName = (ctx.impressionName || rules?.impressionName || "").trim();

  const loopOf = (a: { parts: unknown; category: string | null }) => hasLoop(idx, a as never);
  const winnerOfHeat = (rh: RiderHeat) => winnerFigures(rh, loopOf);
  const finalistAggs = finalists ? riders.filter((r) => finalists.has(r.entryId)) : [];
  const finalistLoopJumps = finalists && finalistAggs.length ? finalistAggs.reduce((s, a) => s + a.loopJumps, 0) / finalistAggs.length : null;
  const bestLanded = riders.reduce<number | null>((m, a) => (a.bestTrick && (m === null || a.bestTrick.score > m) ? a.bestTrick.score : m), null);
  const knocked = [...rhs].reverse().find((rh) => rh.outcome === "out");

  const takeaways: Takeaways = {
    strength: strengthOf(me, riders, rules),
    train: trainOf(me, finalistLoopJumps),
    strategy: strategyOf(rhs, rules, winnerOfHeat),
    gap: gapOf(ctx, knocked, rules, bestLanded),
  };

  return {
    status: "ok",
    entryId,
    name,
    divisionId: entry.division_id,
    divisionName: division?.name ?? "",
    eventName,
    scoreName,
    sideWords: ctx.sideWords,
    soFar: ctx.data.event.status !== "complete",
    headline: headlineOf(ctx, entryId, entry.division_id, rhs),
    tiles: tilesOf(me, riders, finalists, rules),
    highlights: highlightsOf(me, riders, scoreName || null),
    takeaways,
    bestTricks: bestTricks(me),
    heats: rhs.map(heatRow),
    mix: mixOf(rhs.filter(didRide)),
    compare: compareOf(me, riders, finalists),
    goals: goalsOf(takeaways),
  };
}
