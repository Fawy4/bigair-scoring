import { effectiveMaxHeatSize, effectiveMinHeatSize } from "@/lib/engine/ladder/seeding";
import { GeneratorSchema } from "@/lib/schemas/format-template";

/** The three ladder types the organiser chooses from; "custom" is a format with its own rounds. */
export type LadderKind = "knockout" | "second_chance" | "pools" | "custom";

export const GENERATOR: Record<Exclude<LadderKind, "custom">, "single_elimination" | "dingle_elimination" | "pools_to_final"> = {
  knockout: "single_elimination",
  second_chance: "dingle_elimination",
  pools: "pools_to_final",
};

export function ladderKindOf(working: unknown): LadderKind {
  const w = working as { kind?: string; generator?: { type?: string } } | null;
  if (w?.kind !== "generator") return "custom";
  return (Object.entries(GENERATOR).find(([, g]) => g === w.generator?.type)?.[0] as LadderKind | undefined) ?? "custom";
}

/** Switches the ladder type: the generator is replaced by the new type's defaults; timing and everything else stays. */
export function withLadderKind(working: Record<string, unknown>, kind: Exclude<LadderKind, "custom">): Record<string, unknown> {
  // rounds belong to the old type, and so do per-round lengths (round ids differ between ladder types)
  const { rounds: _rounds, roundDurationMin: _lengths, ...rest } = working;
  void _rounds;
  void _lengths;
  return { ...rest, kind: "generator", generator: GeneratorSchema.parse({ type: GENERATOR[kind] }) };
}

/**
 * Sets (or clears) one round's own heat length. A value equal to the single-setting default clears the override, so the
 * table stays "pre-filled from the single setting" and only real differences are stored. An empty map disappears.
 */
export function withRoundLength(working: Record<string, unknown>, roundId: string, minutes: number | "", defaultMin: number): Record<string, unknown> {
  const current = { ...((working.roundDurationMin as Record<string, number> | undefined) ?? {}) };
  if (minutes === "" || minutes === defaultMin) delete current[roundId];
  else current[roundId] = minutes;
  const { roundDurationMin: _old, ...rest } = working;
  void _old;
  return Object.keys(current).length > 0 ? { ...rest, roundDurationMin: current } : rest;
}

/** Forget every per-round length: all rounds use the single settings again. */
export function withoutRoundLengths(working: Record<string, unknown>): Record<string, unknown> {
  const { roundDurationMin: _old, ...rest } = working;
  void _old;
  return rest;
}

/** The parameter that holds "Riders per heat (target)" for each ladder type (second chance: the first round). */
export const TARGET_KEY: Record<Exclude<LadderKind, "custom">, "heatSize" | "r1HeatSize"> = { knockout: "heatSize", second_chance: "r1HeatSize", pools: "heatSize" };

/** Target and (effective) minimum and maximum riders per heat of a generated ladder; `explicit` = the organiser named the minimum. */
export function heatSizes(working: Record<string, unknown>): { target: number; min: number; max: number; explicit: boolean; explicitMax: boolean } | null {
  const kind = ladderKindOf(working);
  if (kind === "custom") return null;
  const params = ((working.generator as { params?: Record<string, unknown> } | undefined)?.params ?? {}) as Record<string, number | undefined>;
  const target = params[TARGET_KEY[kind]];
  if (typeof target !== "number") return null;
  return {
    target,
    min: effectiveMinHeatSize(target, params.minHeatSize),
    max: effectiveMaxHeatSize(target, params.maxHeatSize),
    explicit: params.minHeatSize !== undefined,
    explicitMax: params.maxHeatSize !== undefined,
  };
}

function withParams(working: Record<string, unknown>, change: (p: Record<string, number | undefined>) => Record<string, number | undefined>): Record<string, unknown> {
  const gen = working.generator as { type: string; params?: Record<string, number | undefined> };
  return { ...working, generator: { ...gen, params: change({ ...(gen.params ?? {}) }) } };
}

/**
 * Sets "Riders per heat (target)". A stored minimum that would now be above the target is lowered to it and a stored maximum
 * below it is raised to it; a minimum or maximum that was only ever the default keeps following the target (it is not stored).
 */
export function withHeatTarget(working: Record<string, unknown>, target: number | ""): Record<string, unknown> {
  const kind = ladderKindOf(working);
  if (kind === "custom") return working;
  return withParams(working, (p) => {
    p[TARGET_KEY[kind]] = target === "" ? undefined : target;
    if (typeof target === "number" && p.minHeatSize !== undefined && p.minHeatSize > target) p.minHeatSize = target;
    if (typeof target === "number" && p.maxHeatSize !== undefined && p.maxHeatSize < target) p.maxHeatSize = target;
    return p;
  });
}

/** Sets "Minimum per heat". A value equal to the default (target − 1, at least 2) is not stored; "" clears it. */
export function withMinRiders(working: Record<string, unknown>, min: number | ""): Record<string, unknown> {
  const sizes = heatSizes(working);
  if (!sizes) return working;
  return withParams(working, (p) => {
    p.minHeatSize = min === "" || min === effectiveMinHeatSize(sizes.target) ? undefined : min;
    return p;
  });
}

/** Sets "Maximum per heat". A value equal to the default (target + 1, at most 10) is not stored; "" clears it. */
export function withMaxRiders(working: Record<string, unknown>, max: number | ""): Record<string, unknown> {
  const sizes = heatSizes(working);
  if (!sizes) return working;
  return withParams(working, (p) => {
    p.maxHeatSize = max === "" || max === effectiveMaxHeatSize(sizes.target) ? undefined : max;
    return p;
  });
}

/** Second-chance ladders only: how many riders per heat, after the winner, get a second chance. "" = everyone who did not win. */
export function withSecondChancePlaces(working: Record<string, unknown>, places: number | ""): Record<string, unknown> {
  if (ladderKindOf(working) !== "second_chance") return working;
  return withParams(working, (p) => {
    p.secondChancePlaces = places === "" ? undefined : places;
    return p;
  });
}
