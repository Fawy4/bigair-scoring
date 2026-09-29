import {
  RoundSpecSchema,
  type DingleEliminationParams,
  type PoolsToFinalParams,
  type RoundSpec,
  type RoundSpecInput,
  type SingleEliminationParams,
} from "@/lib/schemas/format-template";
import { roundLayout } from "./seeding";

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
const ALL_PLACES = range(1, 10);
const spec = (input: RoundSpecInput): RoundSpec => RoundSpecSchema.parse(input);

function finalRound(entrantsFrom: RoundSpec["entrantsFrom"], size: number, durationMin: number, reseed: RoundSpec["reseed"]): RoundSpec {
  return spec({
    id: "F",
    name: "Final",
    shortName: "F",
    heatSize: size,
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
    const layout = roundLayout(riders, { heatSize: p.heatSize, uneven: p.uneven, seeding: p.seeding });
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
      durationMin: isSemi ? p.semiMin : p.earlyMin,
      entrantsFrom: i === 0 ? [{ type: "seeds" }] : [{ type: "round_places", round: ids[i - 1], places: range(1, p.advancePerHeat) }],
      seeding: i === 0 ? p.seeding : "snake",
      uneven: p.uneven,
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
 * KOTA-style dingle elimination (Decision 4): R1 heats → 1st to the next round, the rest to a repechage
 * (heats of 2, winner goes on). Then man-on-man rounds while more than 2 × finalSize riders remain, one semi
 * round with exactly `finalSize` heats, and the final. Heats with one rider are byes (top seeds).
 */
export function generateDingleElimination(n: number, p: DingleEliminationParams): RoundSpec[] {
  const base = { uneven: p.uneven };
  const r1Layout = roundLayout(n, { heatSize: p.r1HeatSize, seeding: p.seeding, ...base });
  const r1Heats = r1Layout.capacities.length;
  const repRiders = n - r1Heats;
  const repHeats = repRiders > 0 ? roundLayout(repRiders, { heatSize: 2, seeding: "snake", ...base }).capacities.length : 0;

  // Rounds after the repechage: KO rounds, optional SF, Final.
  type Later = { id: string; name: string; short: string; heatSize: number; heatCountOverride?: number; min: number };
  const later: Later[] = [];
  let pool = r1Heats + repHeats;
  let idx = repHeats > 0 ? 3 : 2;
  while (pool > 2 * p.finalSize) {
    later.push({ id: `R${idx}`, name: `Round ${idx}`, short: `R${idx}`, heatSize: 2, min: p.koMin });
    pool = roundLayout(pool, { heatSize: 2, seeding: "snake", ...base }).capacities.length;
    idx++;
  }
  if (pool > p.finalSize) {
    later.push({ id: "SF", name: "Semi-finals", short: "SF", heatSize: 2, heatCountOverride: p.finalSize, min: p.koMin });
    pool = p.finalSize;
  }
  const firstLater = later[0]?.id ?? "F";
  const rounds: RoundSpec[] = [];
  rounds.push(
    spec({
      id: "R1",
      name: "Round 1",
      shortName: "R1",
      heatSize: p.r1HeatSize,
      durationMin: p.r1Min,
      entrantsFrom: [{ type: "seeds" }],
      seeding: p.seeding,
      uneven: p.uneven,
      reseed: "by_original_seed",
      advance: [
        { places: [1], to: firstLater },
        ...(repHeats > 0 ? [{ places: range(2, p.r1HeatSize), to: "R2" }] : []),
      ],
    }),
  );
  if (repHeats > 0) {
    rounds.push(
      spec({
        id: "R2",
        name: "Round 2 (repechage)",
        shortName: "R2",
        heatSize: 2,
        durationMin: p.repMin,
        entrantsFrom: [{ type: "round_places", round: "R1", places: range(2, p.r1HeatSize) }],
        seeding: "snake",
        uneven: p.uneven,
        reseed: p.reseed,
        advance: [{ places: [1], to: firstLater }, { places: "rest", to: "eliminated" }],
      }),
    );
  }
  const feeders: RoundSpec["entrantsFrom"] = [
    { type: "round_places", round: "R1", places: [1] },
    ...(repHeats > 0 ? [{ type: "round_places" as const, round: "R2", places: [1] }] : []),
  ];
  later.forEach((r, i) => {
    rounds.push(
      spec({
        id: r.id,
        name: r.name,
        shortName: r.short,
        heatSize: r.heatSize,
        durationMin: r.min,
        entrantsFrom: i === 0 ? feeders : [{ type: "round_places", round: later[i - 1].id, places: [1] }],
        seeding: "snake",
        uneven: p.uneven,
        heatCountOverride: r.heatCountOverride,
        reseed: p.reseed,
        advance: [{ places: [1], to: later[i + 1]?.id ?? "F" }, { places: "rest", to: "eliminated" }],
      }),
    );
  });
  rounds.push(
    finalRound(later.length ? [{ type: "round_places", round: later[later.length - 1].id, places: [1] }] : feeders, Math.max(p.finalSize, pool), p.finalMin, p.reseed),
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
      uneven: p.uneven,
      reseed: i === 0 ? "by_original_seed" : "by_heat_score",
      advance: i < ids.length - 1 ? [{ places: "rest", to: ids[i + 1] }] : [],
      crossHeat: i === ids.length - 1 ? { advanceTop: finalists, to: "F", combine: p.poolCombine, tieBreak: p.crossPoolTieBreak } : undefined,
    }),
  );
  rounds.push(finalRound([{ type: "round_places", round: ids[ids.length - 1], places: ALL_PLACES }], finalists, p.finalMin, "by_heat_score"));
  return rounds;
}
