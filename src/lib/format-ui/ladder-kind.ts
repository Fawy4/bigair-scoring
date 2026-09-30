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
