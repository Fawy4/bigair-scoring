import {
  RoundSpecSchema,
  type DingleEliminationParams,
  type PoolsToFinalParams,
  type RoundSpec,
  type RoundSpecInput,
  type SingleEliminationParams,
} from "@/lib/schemas/format-template";
import { planSecondChance } from "./second-chance-plan";
import { heatLimits, roundLayout } from "./seeding";

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
const ALL_PLACES = range(1, 10);
const spec = (input: RoundSpecInput): RoundSpec => RoundSpecSchema.parse(input);

function finalRound(entrantsFrom: RoundSpec["entrantsFrom"], size: number, durationMin: number, reseed: RoundSpec["reseed"]): RoundSpec {
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
  });
}

/** Rounds until one heat of `finalSize` remains. The round before the Final is the "Semi-final" when it has exactly 2 heats. */
export function generateSingleElimination(n: number, p: SingleEliminationParams): RoundSpec[] {
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
