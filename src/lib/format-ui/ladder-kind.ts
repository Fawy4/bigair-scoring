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
  const { rounds: _rounds, ...rest } = working;
  void _rounds;
  return { ...rest, kind: "generator", generator: GeneratorSchema.parse({ type: GENERATOR[kind] }) };
}
