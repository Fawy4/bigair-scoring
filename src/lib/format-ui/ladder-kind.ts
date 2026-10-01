import { effectiveMaxHeatSize, effectiveMinHeatSize } from "@/lib/engine/ladder/seeding";
import { GeneratorSchema } from "@/lib/schemas/format-template";

/** The seven ladder types the organiser chooses from; "custom" is a format with its own rounds. */
export type LadderKind = "knockout" | "second_chance" | "double_elimination" | "qualifying" | "pools" | "round_robin" | "single_final" | "custom" | "ladder";
export type GeneratedKind = Exclude<LadderKind, "custom" | "ladder">;

/** The order of the cards on the Format tab. */
export const KINDS: GeneratedKind[] = ["knockout", "second_chance", "double_elimination", "qualifying", "pools", "round_robin", "single_final"];

export const GENERATOR: Record<GeneratedKind, "single_elimination" | "dingle_elimination" | "double_elimination" | "qualifying_to_finals" | "pools_to_final" | "round_robin" | "single_final"> = {
  knockout: "single_elimination",
  second_chance: "dingle_elimination",
  double_elimination: "double_elimination",
  qualifying: "qualifying_to_finals",
  pools: "pools_to_final",
  round_robin: "round_robin",
  single_final: "single_final",
};

/** The built-in preset each card loads (its `id`/key), so choosing a card is choosing that preset. */
export const KIND_PRESET_KEY: Record<GeneratedKind, string> = {
  knockout: "heats4-top2-single-elim",
  second_chance: "kota-dingle",
  double_elimination: "double-elimination",
  qualifying: "qualifying-to-finals",
  pools: "pools-to-final",
  round_robin: "round-robin",
  single_final: "single-final",
};

/** Riders are guaranteed at least 2 heats in these ladder types (with their default settings); the others can drop riders after 1 heat. */
export const AT_LEAST_TWO: Record<GeneratedKind, boolean> = {
  knockout: false,
  second_chance: true,
  double_elimination: true,
  qualifying: true,
  pools: false,
  round_robin: true,
  single_final: false,
};

export function ladderKindOf(working: unknown): LadderKind {
  const w = working as { kind?: string; generator?: { type?: string } } | null;
  if (w?.kind === "ladder") return "ladder";
  if (w?.kind !== "generator") return "custom";
  return (Object.entries(GENERATOR).find(([, g]) => g === w.generator?.type)?.[0] as LadderKind | undefined) ?? "custom";
}

/** Switches the ladder type: the generator is replaced by the new type's defaults; timing and everything else stays. */
export function withLadderKind(working: Record<string, unknown>, kind: GeneratedKind): Record<string, unknown> {
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

/** The division's warm-up before each heat (minutes, default 0), stored in the format's timing. */
export function withWarmUp(working: Record<string, unknown>, minutes: number | ""): Record<string, unknown> {
  const timing = { ...((working.timing as Record<string, unknown> | undefined) ?? {}) };
  if (minutes === "") delete timing.warmUpBeforeHeatMin;
  else timing.warmUpBeforeHeatMin = minutes;
  return { ...working, timing };
}

export const warmUpOf = (working: Record<string, unknown>): number => {
  const v = (working.timing as { warmUpBeforeHeatMin?: unknown } | undefined)?.warmUpBeforeHeatMin;
  return typeof v === "number" ? v : 0;
};

/** One round's own warm-up; a value equal to the single warm-up clears the override (only real differences are stored). */
export function withRoundWarmUp(working: Record<string, unknown>, roundId: string, minutes: number | "", defaultMin: number): Record<string, unknown> {
  const current = { ...((working.roundWarmUpMin as Record<string, number> | undefined) ?? {}) };
  if (minutes === "" || minutes === defaultMin) delete current[roundId];
  else current[roundId] = minutes;
  const { roundWarmUpMin: _old, ...rest } = working;
  void _old;
  return Object.keys(current).length > 0 ? { ...rest, roundWarmUpMin: current } : rest;
}

export function withoutRoundWarmUps(working: Record<string, unknown>): Record<string, unknown> {
  const { roundWarmUpMin: _old, ...rest } = working;
  void _old;
  return rest;
}

/** Forget every per-round length: all rounds use the single settings again. */
export function withoutRoundLengths(working: Record<string, unknown>): Record<string, unknown> {
  const { roundDurationMin: _old, ...rest } = working;
  void _old;
  return rest;
}

/** The parameter that holds "Riders per heat (target)" for each ladder type (second chance: the first round). */
export const TARGET_KEY: Record<GeneratedKind, "heatSize" | "r1HeatSize" | null> = {
  knockout: "heatSize",
  second_chance: "r1HeatSize",
  double_elimination: "heatSize",
  qualifying: "heatSize",
  pools: "heatSize",
  round_robin: "heatSize",
  single_final: null,
};

/** Target and (effective) minimum and maximum riders per heat of a generated ladder; `explicit` = the organiser named the minimum. */
export function heatSizes(working: Record<string, unknown>): { target: number; min: number; max: number; explicit: boolean; explicitMax: boolean } | null {
  const kind = ladderKindOf(working);
  if (kind === "custom" || kind === "ladder") return null;
  const params = ((working.generator as { params?: Record<string, unknown> } | undefined)?.params ?? {}) as Record<string, number | undefined>;
  const key = TARGET_KEY[kind];
  const target = key ? params[key] : undefined;
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
  if (kind === "custom" || kind === "ladder") return working;
  return withParams(working, (p) => {
    const key = TARGET_KEY[kind];
    if (key) p[key] = target === "" ? undefined : target;
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

/** Sets one generator number; "" removes it (an optional number goes back to its automatic value). */
export function withParam(working: Record<string, unknown>, key: string, value: number | number[] | "" | undefined): Record<string, unknown> {
  if (ladderKindOf(working) === "custom") return working;
  const gen = working.generator as { type: string; params?: Record<string, unknown> };
  const params = { ...(gen.params ?? {}) };
  if (value === "" || value === undefined) delete params[key];
  else params[key] = value;
  return { ...working, generator: { ...gen, params } };
}

/** Reads one generator number (undefined when the format leaves it automatic). */
export function paramOf(working: Record<string, unknown>, key: string): number | number[] | undefined {
  const gen = working.generator as { params?: Record<string, unknown> } | undefined;
  const v = gen?.params?.[key];
  return typeof v === "number" || Array.isArray(v) ? (v as number | number[]) : undefined;
}

/** Gives a round (or heat) your own name; blank restores the default. An empty list of names disappears. Keyed by round or heat id. */
function withName(working: Record<string, unknown>, field: "roundNames" | "heatNames", id: string, name: string): Record<string, unknown> {
  const current = { ...((working[field] as Record<string, string> | undefined) ?? {}) };
  const clean = name.trim();
  if (clean === "") delete current[id];
  else current[id] = clean.slice(0, 40);
  const { [field]: _old, ...rest } = working;
  void _old;
  return Object.keys(current).length > 0 ? { ...rest, [field]: current } : rest;
}

export const withRoundName = (working: Record<string, unknown>, roundId: string, name: string) => withName(working, "roundNames", roundId, name);
export const withHeatName = (working: Record<string, unknown>, heatId: string, name: string) => withName(working, "heatNames", heatId, name);
