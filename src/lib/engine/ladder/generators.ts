import {
  RoundSpecSchema,
  type DingleEliminationParams,
  type DoubleEliminationParams,
  type PoolsToFinalParams,
  type QualifyingToFinalsParams,
  type RoundRobinParams,
  type SingleFinalParams,
  type RoundSpec,
  type RoundSpecInput,
  type SingleEliminationParams,
} from "@/lib/schemas/format-template";
import { planDoubleElimination } from "./double-elimination-plan";
import { planKnockout } from "./knockout-plan";
import { planSecondChance } from "./second-chance-plan";
import { heatLimits, roundLayout } from "./seeding";

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
const ALL_PLACES = range(1, 10);
const spec = (input: RoundSpecInput): RoundSpec => RoundSpecSchema.parse(input);

function finalRound(entrantsFrom: RoundSpec["entrantsFrom"], size: number, durationMin: number, reseed: RoundSpec["reseed"], extra: Partial<RoundSpecInput> = {}): RoundSpec {
  return spec({
    id: "F",
    name: "Final",
    shortName: "F",
    heatSize: Math.min(10, Math.max(1, size)),
    heatCountOverride: 1,
    durationMin,
    entrantsFrom,
    seeding: "sequential",
    reseed,
    advance: [{ places: "rest", to: "final_placing" }],
    ...extra,
  });
}

/** A final (or Small final) heat that is checked against the three sizing numbers: too big or too small → a warning in the draw. */
const limitedFinal = (extra: Partial<RoundSpecInput>, limits: { min?: number; max?: number }): Partial<RoundSpecInput> => ({ uneven: "minimum_riders", minHeatSize: limits.min, maxHeatSize: limits.max, ...extra });

/**
 * Knockout (docs/04 decision 33). Every round follows the sizing rule (target, minimum, maximum riders per heat, see `planKnockout`):
 * never above the maximum, heats of 2 (1 v 1) when the minimum cannot be kept, rounds until one heat remains. The round before the Final is
 * the "Semi-final" when it has exactly 2 heats. With "By original seeding" (the default) the next round pairs neighbouring heats: the winners of
 * H1 and H2 meet, H3 and H4 meet, …; with "by result" the survivors are re-seeded and dealt in a snake.
 */
export function generateSingleElimination(n: number, p: SingleEliminationParams): RoundSpec[] {
  if (p.uneven !== undefined && p.uneven !== "minimum_riders") return generateLegacySingleElimination(n, p);
  const limits = heatLimits(p.heatSize, p.minHeatSize, p.maxHeatSize);
  const plan = planKnockout(n, { limits, advance: p.advancePerHeat, finalSize: p.finalSize });
  const ids = plan.rounds.map((r, i) => (i >= 1 && i === plan.rounds.length - 1 && r.heats.length === 2 ? "SF" : `R${i + 1}`));
  const adjacent = p.reseed === "by_original_seed";
  const rounds: RoundSpec[] = plan.rounds.map((r, i) => {
    const isSemi = ids[i] === "SF";
    const to = i === plan.rounds.length - 1 ? "F" : ids[i + 1];
    return spec({
      id: ids[i],
      name: isSemi ? "Semi-finals" : `Round ${i + 1}`,
      shortName: ids[i],
      heatSize: p.heatSize,
      minHeatSize: p.minHeatSize,
      maxHeatSize: p.maxHeatSize,
      heatCountOverride: r.heats.length,
      durationMin: isSemi ? p.semiMin : p.earlyMin,
      entrantsFrom: i === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: ids[i - 1], places: range(1, plan.rounds[i - 1].advance) }],
      seeding: i === 0 ? p.seeding : adjacent ? "adjacent" : "snake",
      // heats of 2 are the rule here, not a problem: they are not checked against the minimum
      uneven: r.oneVOne ? "smaller_heats_for_top_seeds" : "minimum_riders",
      reseed: i === 0 ? "by_original_seed" : p.reseed,
      advance: [{ places: range(1, r.advance), to }, { places: "rest", to: "eliminated" }],
    });
  });
  const last = ids.at(-1);
  rounds.push(
    finalRound(
      last ? [{ type: "round_places", round: last, places: range(1, plan.rounds.at(-1)!.advance) }] : [{ type: "seeds" }],
      Math.max(p.finalSize, plan.finalSize),
      p.finalMin,
      p.reseed,
      // "By original seeding", one rider advancing from each semi-final heat: the winners meet in the Final in the order of their heats, so a seat is known
      // the moment its heat is published. With more than one rider advancing per heat the Final is seeded by original seed and dealt when the round is complete.
      adjacent && last && plan.rounds.at(-1)!.advance === 1 ? { seeding: "adjacent" } : {},
    ),
  );
  return rounds;
}

/**
 * The older knockout, kept for formats that name a legacy `uneven` rule (byes for the top seeds, one larger heat, …): rounds until one heat of
 * `finalSize` remains, heat counts from that rule. Formats that use the three sizing numbers (the default) go through `planKnockout`.
 */
function generateLegacySingleElimination(n: number, p: SingleEliminationParams): RoundSpec[] {
  const plan: Array<{ heats: number }> = [];
  let riders = n;
  while (riders > p.finalSize && plan.length < 40) {
    const layout = roundLayout(riders, { heatSize: p.heatSize, uneven: p.uneven ?? "minimum_riders", minHeatSize: p.minHeatSize, maxHeatSize: p.maxHeatSize, seeding: p.seeding });
    if (layout.capacities.length === 1) break; // one heat with everyone is already the final
    const next = layout.capacities.reduce((sum, c) => sum + Math.min(p.advancePerHeat, c), 0);
    if (next >= riders) break; // cannot shrink any more (e.g. only tiny heats): everybody goes to the final
    plan.push({ heats: layout.capacities.length });
    riders = next;
  }
  const ids = plan.map((r, i) => (i >= 1 && i === plan.length - 1 && r.heats === 2 ? "SF" : `R${i + 1}`));
  const rounds: RoundSpec[] = plan.map((r, i) => {
    const isSemi = ids[i] === "SF";
    const to = i === plan.length - 1 ? "F" : ids[i + 1];
    return spec({
      id: ids[i],
      name: isSemi ? "Semi-finals" : `Round ${i + 1}`,
      shortName: ids[i],
      heatSize: p.heatSize,
      minHeatSize: p.minHeatSize,
      maxHeatSize: p.maxHeatSize,
      durationMin: isSemi ? p.semiMin : p.earlyMin,
      entrantsFrom: i === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: ids[i - 1], places: range(1, p.advancePerHeat) }],
      seeding: i === 0 ? p.seeding : "snake",
      uneven: p.uneven ?? "minimum_riders",
      reseed: i === 0 ? "by_original_seed" : p.reseed,
      advance: [{ places: range(1, p.advancePerHeat), to }, { places: "rest", to: "eliminated" }],
    });
  });
  const last = ids.at(-1);
  rounds.push(
    finalRound(
      last ? [{ type: "round_places", round: last, places: range(1, p.advancePerHeat) }] : [{ type: "seeds" }],
      Math.max(p.finalSize, riders),
      p.finalMin,
      p.reseed,
    ),
  );
  return rounds;
}

/**
 * Knockout with a second chance (docs/04 decision 26). Round 1 heats follow the sizing rule (target, minimum, maximum riders
 * per heat); the winner of each heat goes to the main draw and the other riders get a second chance (all of them, or the next
 * `secondChancePlaces`). The Second-chance round's winners join the main draw, which runs as many rounds as it needs to end in
 * the Final. Every round uses the same sizing rule; how many riders advance per heat is chosen so that the rounds converge on
 * the Final without anyone advancing without riding (see `planSecondChance`).
 */
export function generateDingleElimination(n: number, p: DingleEliminationParams): RoundSpec[] {
  const limits = heatLimits(p.r1HeatSize, p.minHeatSize, p.maxHeatSize);
  const plan = planSecondChance(n, { limits, finalSize: p.finalSize, secondChancePlaces: p.secondChancePlaces });
  const sizing = { heatSize: p.r1HeatSize, minHeatSize: p.minHeatSize, maxHeatSize: p.maxHeatSize, uneven: "minimum_riders" as const };
  if (plan.r1.length === 1) return [finalRound([{ type: "seeds" }], n, p.finalMin, "by_original_seed")];

  const sc = plan.secondChance!;
  const lastMain = plan.main.length - 1;
  const mainIds = plan.main.map((r, i) => (i === lastMain && r.heats === 2 ? "SF" : `R${i + 3}`));
  const firstAfterSc = mainIds[0] ?? "F";
  const feeders: RoundSpec["entrantsFrom"] = [
    { type: "round_places", round: "R1", places: [1] },
    { type: "round_places", round: "R2", places: range(1, sc.advance) },
  ];
  const secondChancePlaces = p.secondChancePlaces === undefined ? range(2, 10) : range(2, 1 + p.secondChancePlaces);

  const rounds: RoundSpec[] = [
    spec({
      id: "R1",
      name: "Round 1",
      shortName: "R1",
      ...sizing,
      durationMin: p.r1Min,
      entrantsFrom: [{ type: "seeds" }],
      seeding: p.seeding,
      reseed: "by_original_seed",
      advance: [
        { places: [1], to: firstAfterSc },
        { places: secondChancePlaces, to: "R2" },
        ...(p.secondChancePlaces === undefined ? [] : [{ places: "rest" as const, to: "eliminated" }]),
      ],
    }),
    spec({
      id: "R2",
      name: "Second-chance round",
      shortName: "Second chance",
      ...sizing,
      heatCountOverride: sc.heats,
      durationMin: p.repMin,
      entrantsFrom: [{ type: "round_places", round: "R1", places: secondChancePlaces }],
      seeding: "snake",
      reseed: p.reseed,
      advance: [{ places: range(1, sc.advance), to: firstAfterSc }, { places: "rest", to: "eliminated" }],
    }),
  ];
  plan.main.forEach((r, i) => {
    const prev = mainIds[i - 1];
    rounds.push(
      spec({
        id: mainIds[i],
        name: mainIds[i] === "SF" ? "Semi-finals" : `Round ${i + 3}`,
        shortName: mainIds[i],
        ...sizing,
        heatCountOverride: r.heats,
        durationMin: p.koMin,
        entrantsFrom: i === 0 ? feeders : [{ type: "round_places", round: prev, places: range(1, plan.main[i - 1].advance) }],
        seeding: "snake",
        reseed: p.reseed,
        advance: [{ places: range(1, r.advance), to: mainIds[i + 1] ?? "F" }, { places: "rest", to: "eliminated" }],
      }),
    );
  });
  rounds.push(
    finalRound(
      plan.main.length ? [{ type: "round_places", round: mainIds[lastMain], places: range(1, plan.main[lastMain].advance) }] : feeders,
      plan.finalSize,
      p.finalMin,
      p.reseed,
    ),
  );
  return rounds;
}

/**
 * Pool heats (one or two rounds) ranked across pools, top `finalists` to one final (Decision 7).
 * Pool round 2 is a fresh draw seeded by the round-1 score.
 */
export function generatePoolsToFinal(n: number, p: PoolsToFinalParams): RoundSpec[] {
  const finalists = Math.min(p.finalists, n);
  if (n <= p.finalists) {
    return [finalRound([{ type: "seeds" }], n, p.finalMin, "by_original_seed")];
  }
  const ids = p.poolRounds === 2 ? ["P1", "P2"] : ["P1"];
  const rounds: RoundSpec[] = ids.map((id, i) =>
    spec({
      id,
      name: ids.length === 1 ? "Pools" : `Pool round ${i + 1}`,
      shortName: id,
      heatSize: p.heatSize,
      durationMin: p.poolMin,
      entrantsFrom: i === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: ids[i - 1], places: ALL_PLACES }],
      seeding: i === 0 ? p.seeding : "snake",
      uneven: p.uneven ?? "minimum_riders",
      minHeatSize: p.minHeatSize,
      maxHeatSize: p.maxHeatSize,
      reseed: i === 0 ? "by_original_seed" : "by_heat_score",
      advance: i < ids.length - 1 ? [{ places: "rest", to: ids[i + 1] }] : [],
      crossHeat: i === ids.length - 1 ? { advanceTop: finalists, to: "F", combine: p.poolCombine, tieBreak: p.crossPoolTieBreak } : undefined,
    }),
  );
  rounds.push(finalRound([{ type: "round_places", round: ids[ids.length - 1], places: ALL_PLACES }], finalists, p.finalMin, "by_heat_score"));
  return rounds;
}

/** One heat with everybody: that heat is the result. Above 10 riders the draw carries a warning (use pools instead). */
export function generateSingleFinal(n: number, p: SingleFinalParams): RoundSpec[] {
  return [finalRound([{ type: "seeds" }], n, p.finalMin, "by_original_seed", { uneven: "minimum_riders", minHeatSize: 1, maxHeatSize: 10 })];
}

/**
 * Qualifying heats rank everybody (the best or the sum of their heats); the best `finalSize` ride the Final, the next best
 * `smallFinalSize` a Small final (only when at least the minimum riders are left for it), the rest are placed by their qualifying rank.
 */
export function generateQualifyingToFinals(n: number, p: QualifyingToFinalsParams): RoundSpec[] {
  const limits = heatLimits(p.heatSize, p.minHeatSize, p.maxHeatSize);
  const final = Math.min(p.finalSize, n);
  if (n <= p.finalSize) return [finalRound([{ type: "seeds" }], n, p.finalMin, "by_original_seed", limitedFinal({}, limits))];
  const left = Math.min(p.smallFinalSize, n - final);
  const small = p.smallFinalSize > 0 && left >= limits.min ? left : 0;
  const ids = Array.from({ length: p.qualifyingRounds }, (_, i) => `Q${i + 1}`);
  const sizing = { heatSize: p.heatSize, minHeatSize: p.minHeatSize, maxHeatSize: p.maxHeatSize, uneven: "minimum_riders" as const };
  const rounds: RoundSpec[] = ids.map((id, i) =>
    spec({
      id,
      name: `Qualifying heat ${i + 1}`,
      shortName: id,
      ...sizing,
      durationMin: p.qualifyingMin,
      entrantsFrom: i === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: ids[i - 1], places: ALL_PLACES }],
      seeding: i === 0 ? p.seeding : "snake",
      reseed: i === 0 ? "by_original_seed" : "by_heat_score",
      advance: i < ids.length - 1 ? [{ places: "rest", to: ids[i + 1] }] : [],
      crossHeat:
        i === ids.length - 1
          ? { advanceTop: final, to: "F", combine: p.qualifyingCombine, ...(small > 0 ? { alsoTo: { count: small, to: "SF" } } : {}), tieBreak: "scoring_model_then_seed" }
          : undefined,
    }),
  );
  const from = (): RoundSpec["entrantsFrom"] => [{ type: "round_places", round: ids[ids.length - 1], places: ALL_PLACES }];
  if (small > 0) {
    rounds.push(
      finalRound(from(), small, p.smallFinalMin, "by_heat_score", limitedFinal({ id: "SF", name: "Small final", shortName: "SF", placeOffset: final }, limits)),
    );
  }
  rounds.push(finalRound(from(), final, p.finalMin, "by_heat_score", limitedFinal({}, limits)));
  return rounds;
}

/**
 * Round robin: `heatsPerRider` rounds, each with everybody in heats of the sizing rule. Round 1 is dealt like a snake; later rounds are
 * dealt so that riders meet riders they have not ridden against (`rotate`). Heat points add up to the ranking (the last round ranks).
 */
export function generateRoundRobin(n: number, p: RoundRobinParams): RoundSpec[] {
  const ids = Array.from({ length: p.heatsPerRider }, (_, i) => `RR${i + 1}`);
  const sizing = { heatSize: p.heatSize, minHeatSize: p.minHeatSize, maxHeatSize: p.maxHeatSize, uneven: "minimum_riders" as const };
  return ids.map((id, i) =>
    spec({
      id,
      name: `Round ${i + 1}`,
      shortName: id,
      ...sizing,
      durationMin: p.heatMin,
      entrantsFrom: [{ type: "seeds" }],
      seeding: i === 0 ? p.seeding : "rotate",
      reseed: "by_original_seed",
      advance: i < ids.length - 1 ? [{ places: "rest", to: ids[i + 1] }] : [],
      crossHeat:
        i === ids.length - 1
          ? { advanceTop: Math.max(1, n), to: "final_placing", combine: "points", ...(p.pointsTable ? { points: p.pointsTable } : {}), over: ids.slice(0, -1), tieBreak: "scoring_model_then_seed" }
          : undefined,
    }),
  );
}

/**
 * Double elimination (docs/04 decision 28): Main draw and Second-chance draw rounds in turn, then a Final of the top `finalSize / 2` of each
 * draw. In every heat the top half stay in their draw and the bottom half drop; every round follows the sizing rule (`planDoubleElimination`).
 */
export function generateDoubleElimination(n: number, p: DoubleEliminationParams): RoundSpec[] {
  const limits = heatLimits(p.heatSize, p.minHeatSize, p.maxHeatSize);
  const plan = planDoubleElimination(n, { limits, finalSize: p.finalSize, advancePerHeat: p.advancePerHeat });
  if (!plan) return [finalRound([{ type: "seeds" }], n, p.finalMin, "by_original_seed", limitedFinal({}, limits))];
  const sizing = { heatSize: p.heatSize, minHeatSize: p.minHeatSize, maxHeatSize: p.maxHeatSize, uneven: "minimum_riders" as const };
  const last = plan.stages.length - 1;
  const perDraw = plan.perDraw;
  const rounds: RoundSpec[] = [];
  plan.stages.forEach((st, t) => {
    const n1 = t + 1;
    const mId = `M${n1}`;
    const sId = `S${n1}`;
    const stay = t === last ? perDraw : st.main.advance;
    const staySecond = t === last ? perDraw : st.second.advance;
    const prev = plan.stages[t - 1];
    rounds.push(
      spec({
        id: mId,
        name: `Main draw ${n1}`,
        shortName: mId,
        ...sizing,
        heatCountOverride: st.main.heats,
        durationMin: p.mainMin,
        entrantsFrom: t === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: `M${t}`, places: range(1, prev.main.advance) }],
        seeding: t === 0 ? p.seeding : "snake",
        reseed: t === 0 ? "by_original_seed" : p.reseed,
        advance: [{ places: range(1, stay), to: t === last ? "F" : `M${n1 + 1}` }, { places: "rest", to: sId }],
      }),
    );
    rounds.push(
      spec({
        id: sId,
        name: `Second-chance draw ${n1}`,
        shortName: sId,
        ...sizing,
        heatCountOverride: st.second.heats,
        durationMin: p.secondMin,
        entrantsFrom: [
          { type: "round_places", round: mId, places: range(stay + 1, 10) },
          ...(t === 0 ? [] : [{ type: "round_places" as const, round: `S${t}`, places: range(1, prev.second.advance) }]),
        ],
        seeding: "snake",
        reseed: p.reseed,
        advance: [{ places: range(1, staySecond), to: t === last ? "F" : `S${n1 + 1}` }, { places: "rest", to: "eliminated" }],
      }),
    );
  });
  rounds.push(
    finalRound(
      [
        { type: "round_places", round: `M${last + 1}`, places: range(1, perDraw) },
        { type: "round_places", round: `S${last + 1}`, places: range(1, perDraw) },
      ],
      perDraw * 2,
      p.finalMin,
      p.reseed,
      limitedFinal({}, limits),
    ),
  );
  return rounds;
}
