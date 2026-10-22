import { aggregate, didRide, everyone, finalistIds, indexOf, riderHeats, roundName, type Agg, type RiderHeat } from "./collect";
import { bestTricks, compareOf, mixOf, tilesOf } from "./figures";
import { heatRow } from "./heats";
import { highlightsOf } from "./highlights";
import { strategyOf, strengthOf, trainList, type TakeInput } from "./takeaways";
import { hasLoop } from "./tricks";
import type { Headline, PathStep, ReportContext, ReportResultOrNone, ReportRound } from "./types";

/** How many facts the "Suggested goals" box holds. */
export const MAX_SUGGESTED = 2;

/** The day (YYYY-MM-DD) in the event's time zone. */
function dayOf(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Final place or the round reached, and the path through the rounds. */
export function headlineOf(ctx: ReportContext, entryId: string, rounds: ReportRound[], rhs: RiderHeat[]): Headline {
  const placing = ctx.placings[entryId] ?? null;
  const last = rhs[rhs.length - 1];
  const finalRound = rounds[rounds.length - 1];
  const rodeFinal = Boolean(last && finalRound && last.round.id === finalRound.id && didRide(last));
  const knockedOutRound = placing ? rounds.find((r) => r.draw_round === placing.round) : undefined;
  const outIn = knockedOutRound && finalRound && knockedOutRound.id !== finalRound.id ? roundName(knockedOutRound) : null;
  const steps: PathStep[] = rhs.map((rh) => {
    const rule = rh.result?.place != null ? (rh.round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(rh.result?.place as number)) : undefined;
    const target = rule && rule.to !== "eliminated" && rule.to !== "final_placing" ? rounds.find((r) => r.draw_round === rule.to) : undefined;
    return { heatId: rh.heat.id, roundName: roundName(rh.round), heatLabel: rh.title, outcome: rh.outcome, place: rh.result?.place ?? null, toRound: target ? roundName(target) : null };
  });
  return {
    place: placing?.place ?? null,
    shared: placing?.shared ?? false,
    caption: placing && rodeFinal ? (placing.place === 1 ? "winner" : "final") : outIn ? "out" : "in",
    outInRound: outIn,
    lastRound: last ? roundName(last.round) : null,
    steps,
  };
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
  const rounds = [...(division?.rounds ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ").trim();
  const eventName = ctx.data.event.name;
  const rhs = riderHeats(ctx, entryId, idx);
  if (!rhs.length) return { status: "no_heats", entryId, name, divisionName: division?.name ?? "", eventName };

  const rules = ctx.divisionRules[entry.division_id];
  const riders: Agg[] = [...everyone(ctx, idx).values()].filter((a) => a.divisionId === entry.division_id);
  const me = aggregate(entryId, rhs);
  if (!riders.some((r) => r.entryId === entryId) && me.heats.length) riders.push(me);
  const finalists = finalistIds(ctx, entry.division_id);
  const finalistAggs = finalists ? riders.filter((r) => finalists.has(r.entryId)) : [];
  const scoreName = (ctx.impressionName || rules?.impressionName || "").trim();

  const take: TakeInput = {
    me,
    riders,
    finalists: finalistAggs,
    rules,
    allScores: riders.flatMap((r) => r.landedScores),
    rounds,
    loopOf: (a) => hasLoop(idx, a as never),
  };
  const bestLanded = take.allScores.length ? Math.max(...take.allScores) : null;
  const trains = trainList(take);
  const ridden = rhs.filter(didRide);
  const days = [...new Set(ridden.map((rh) => dayOf(rh.heat.started_at ?? rh.heat.published_at, ctx.data.event.timezone)).filter((d): d is string => d !== null))].sort();

  return {
    status: "ok",
    entryId,
    name,
    nationality: entry.nationality ?? null,
    divisionId: entry.division_id,
    divisionName: division?.name ?? "",
    eventName,
    eventLocation: ctx.data.event.location ?? null,
    days,
    scoreName,
    sideWords: ctx.sideWords,
    familyLabels: ctx.familyLabels ?? {},
    decimals: rules?.decimals ?? 2,
    soFar: ctx.data.event.status !== "complete",
    headline: headlineOf(ctx, entryId, rounds, rhs),
    highlights: highlightsOf(me, riders),
    tiles: tilesOf(me, riders, finalists, rules),
    takeaways: { strength: strengthOf(take), train: trains[0] ?? null, strategy: strategyOf(take, bestLanded) },
    bestTricks: bestTricks(me),
    heats: ridden.map((rh) => heatRow(rh, ctx, rounds, rules?.attemptCap ?? null)),
    mix: mixOf(ridden, Object.keys(ctx.familyLabels ?? {})),
    compare: compareOf(me, riders, finalists, rules),
    fieldSize: { riders: riders.length, finalists: finalistAggs.length },
    suggested: trains.slice(0, MAX_SUGGESTED),
  };
}
