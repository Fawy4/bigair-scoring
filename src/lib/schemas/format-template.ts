import { z } from "zod";

/**
 * FormatTemplate — how a division's riders are split into heats and how they progress.
 * Spec: docs/04-FORMAT-LADDER-SPEC.md §2 (+ Decisions log §9). Presets: presets/formats/*.json.
 * Every field that could differ between events is a field here, with a default.
 */

export const DEFAULT_VEST_COLOURS = ["red", "yellow", "blue", "green", "white", "black", "orange", "pink", "purple", "grey"];

export const SeedingSchema = z.enum(["snake", "sequential", "manual", "random"]);
export const UnevenSchema = z.enum(["smaller_heats_for_top_seeds", "one_larger_heat", "byes_top_seeds"]);
export const ReseedSchema = z.enum(["by_original_seed", "by_heat_score", "by_place_then_score"]);

export const EntrantSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seeds") }),
  z.object({
    type: z.literal("round_places"),
    round: z.string().min(1),
    places: z.array(z.number().int().min(1)).min(1),
  }),
]);

export const AdvanceRuleSchema = z.object({
  places: z.union([z.array(z.number().int().min(1)).min(1), z.literal("rest")]),
  /** A round id, or "eliminated" (shared/ranked placing) or "final_placing" (ranking of the last heat). */
  to: z.string().min(1),
});

/** Rank every rider of the round across all its heats (pools). Top `advanceTop` go to `to`, the rest are eliminated. */
export const CrossHeatSchema = z.object({
  advanceTop: z.number().int().min(1),
  to: z.string().min(1),
  combine: z.enum(["best", "sum"]).default("best"),
  tieBreak: z.literal("scoring_model_then_seed").default("scoring_model_then_seed"),
});

export const RoundSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  heatSize: z.number().int().min(1).max(10),
  /** Falls back to the template's `timing.defaultHeatMin`. */
  durationMin: z.number().positive().optional(),
  breakAfterHeatMin: z.number().min(0).optional(),
  breakAfterRoundMin: z.number().min(0).optional(),
  entrantsFrom: z.array(EntrantSourceSchema).min(1).default([{ type: "seeds" }]),
  seeding: SeedingSchema.default("snake"),
  uneven: UnevenSchema.default("smaller_heats_for_top_seeds"),
  heatCountOverride: z.number().int().min(1).optional(),
  reseed: ReseedSchema.default("by_original_seed"),
  advance: z.array(AdvanceRuleSchema).default([]),
  crossHeat: CrossHeatSchema.optional(),
  minRidersToRun: z.number().int().min(1).default(1),
});

const SEEDING_DEFAULTS = {
  seeding: SeedingSchema.default("snake"),
  uneven: UnevenSchema.default("smaller_heats_for_top_seeds"),
};

export const SingleEliminationParamsSchema = z
  .object({
    heatSize: z.number().int().min(2).max(10).default(4),
    advancePerHeat: z.number().int().min(1).default(2),
    finalSize: z.number().int().min(2).max(10).default(4),
    earlyMin: z.number().positive().default(10),
    semiMin: z.number().positive().default(12),
    finalMin: z.number().positive().default(15),
    ...SEEDING_DEFAULTS,
    reseed: ReseedSchema.default("by_place_then_score"),
  })
  .refine((p) => p.advancePerHeat < p.heatSize, {
    message: "advancePerHeat must be smaller than heatSize (the ladder has to shrink)",
    path: ["advancePerHeat"],
  });

export const DingleEliminationParamsSchema = z.object({
  r1HeatSize: z.number().int().min(2).max(10).default(3),
  finalSize: z.number().int().min(2).max(10).default(3),
  r1Min: z.number().positive().default(13),
  repMin: z.number().positive().default(10),
  koMin: z.number().positive().default(10),
  finalMin: z.number().positive().default(15),
  ...SEEDING_DEFAULTS,
  reseed: ReseedSchema.default("by_place_then_score"),
});

export const PoolsToFinalParamsSchema = z
  .object({
    heatSize: z.number().int().min(1).max(10).default(10),
    finalists: z.number().int().min(1).default(6),
    poolMin: z.number().positive().default(12),
    finalMin: z.number().positive().default(15),
    poolRounds: z.union([z.literal(1), z.literal(2)]).default(1),
    poolCombine: z.enum(["best", "sum"]).default("best"),
    ...SEEDING_DEFAULTS,
    crossPoolTieBreak: z.literal("scoring_model_then_seed").default("scoring_model_then_seed"),
  })
  .refine((p) => p.finalists <= 10, { message: "finalists must fit in one heat (max 10)", path: ["finalists"] });

export const GeneratorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single_elimination"), params: SingleEliminationParamsSchema.prefault({}) }),
  z.object({ type: z.literal("dingle_elimination"), params: DingleEliminationParamsSchema.prefault({}) }),
  z.object({ type: z.literal("pools_to_final"), params: PoolsToFinalParamsSchema.prefault({}) }),
]);

export const FormatTemplateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    basedOn: z.string().optional(),
    entrants: z.object({ min: z.number().int().min(1), max: z.number().int().min(1).nullable() }),
    vestColours: z.array(z.string().min(1)).min(1).default(DEFAULT_VEST_COLOURS),
    timing: z.object({
      defaultHeatMin: z.number().positive(),
      defaultBreakAfterHeatMin: z.number().min(0),
      defaultBreakAfterRoundMin: z.number().min(0),
    }),
    kind: z.enum(["fixed", "generator"]),
    rounds: z.array(RoundSpecSchema).min(1).optional(),
    generator: GeneratorSchema.optional(),
    placings: z
      .object({
        eliminated: z.enum(["shared", "by_heat_score"]).default("shared"),
        finalHeatIsRanking: z.literal(true).default(true),
      })
      .prefault({}),
    /** Generated ladders only: heat length per round id (e.g. { R1: 10, F: 15 }); other rounds keep the generator's length. Breaks stay global. */
    roundDurationMin: z.record(z.string().min(1), z.number().positive()).optional(),
    flagOut: z
      .object({ rounds: z.array(z.string()).min(1), atMin: z.number().positive(), count: z.number().int().min(1) })
      .optional(),
  })
  .superRefine((t, ctx) => {
    if (t.entrants.max !== null && t.entrants.max < t.entrants.min) {
      ctx.addIssue({ code: "custom", message: "entrants.max must not be smaller than entrants.min", path: ["entrants", "max"] });
    }
    if (t.roundDurationMin && t.kind !== "generator") {
      ctx.addIssue({ code: "custom", message: "a heat length per round only applies to a generated ladder (a custom ladder sets it on each round)", path: ["roundDurationMin"] });
    }
    if (t.kind === "fixed") {
      if (!t.rounds) ctx.addIssue({ code: "custom", message: "a fixed template needs `rounds`", path: ["rounds"] });
      if (t.generator) ctx.addIssue({ code: "custom", message: "a fixed template must not have a `generator`", path: ["generator"] });
    } else {
      if (!t.generator) ctx.addIssue({ code: "custom", message: "a generator template needs `generator`", path: ["generator"] });
      if (t.rounds) ctx.addIssue({ code: "custom", message: "a generator template must not list `rounds`", path: ["rounds"] });
    }
    if (t.rounds) checkRounds(t.rounds, ctx);
  });

/** Round-level rules shared by fixed templates and (in tests) generated rounds. */
export function checkRounds(rounds: RoundSpec[], ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  rounds.forEach((r, i) => {
    if (ids.has(r.id)) ctx.addIssue({ code: "custom", message: `duplicate round id "${r.id}"`, path: ["rounds", i, "id"] });
    ids.add(r.id);
  });
  rounds.forEach((r, i) => {
    const fedBySeedsOnly = r.entrantsFrom.every((s) => s.type === "seeds");
    if (r.seeding === "random" && !fedBySeedsOnly) {
      ctx.addIssue({ code: "custom", message: `round ${r.id}: "random" seeding only works on a round fed by the seed list`, path: ["rounds", i, "seeding"] });
    }
    for (const s of r.entrantsFrom) {
      if (s.type === "round_places" && !ids.has(s.round)) {
        ctx.addIssue({ code: "custom", message: `round ${r.id}: entrantsFrom names unknown round "${s.round}"`, path: ["rounds", i, "entrantsFrom"] });
      }
    }
    for (const a of r.advance) {
      if (a.to !== "eliminated" && a.to !== "final_placing" && !ids.has(a.to)) {
        ctx.addIssue({ code: "custom", message: `round ${r.id}: advance.to names unknown round "${a.to}"`, path: ["rounds", i, "advance"] });
      }
    }
    if (r.crossHeat && !ids.has(r.crossHeat.to)) {
      ctx.addIssue({ code: "custom", message: `round ${r.id}: crossHeat.to names unknown round "${r.crossHeat.to}"`, path: ["rounds", i, "crossHeat"] });
    }
  });
}

export type RoundSpec = z.infer<typeof RoundSpecSchema>;
export type RoundSpecInput = z.input<typeof RoundSpecSchema>;
export type EntrantSource = z.infer<typeof EntrantSourceSchema>;
export type AdvanceRule = z.infer<typeof AdvanceRuleSchema>;
export type CrossHeat = z.infer<typeof CrossHeatSchema>;
export type Generator = z.infer<typeof GeneratorSchema>;
export type SingleEliminationParams = z.infer<typeof SingleEliminationParamsSchema>;
export type DingleEliminationParams = z.infer<typeof DingleEliminationParamsSchema>;
export type PoolsToFinalParams = z.infer<typeof PoolsToFinalParamsSchema>;
export type FormatTemplate = z.infer<typeof FormatTemplateSchema>;
export type FormatTemplateInput = z.input<typeof FormatTemplateSchema>;
export type Seeding = z.infer<typeof SeedingSchema>;
export type Uneven = z.infer<typeof UnevenSchema>;
export type Reseed = z.infer<typeof ReseedSchema>;

export class FormatTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatTemplateError";
  }
}

/** Validates a format template and applies defaults. Throws FormatTemplateError with readable text. */
export function parseFormatTemplate(json: unknown): FormatTemplate {
  const result = FormatTemplateSchema.safeParse(json);
  if (!result.success) {
    throw new FormatTemplateError(`Invalid format template:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
