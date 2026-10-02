import { z } from "zod";

/**
 * ScoringModel — the single source of truth for how a heat is scored.
 * Spec: docs/03-SCORING-ENGINE-SPEC.md §3 (+ Decisions log). Presets: presets/scoring/*.json.
 * Every field that could differ between events lives here, with a default.
 */

const TOLERANCE = 1e-9;

export const ScaleSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
  })
  .refine((s) => s.max > s.min, { message: "scale.max must be greater than scale.min" });

export const CriterionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "criterion key must be snake_case"),
  label: z.string().min(1),
  help: z.string().optional(),
  scale: ScaleSchema,
  weight: z.number().positive("criterion weight must be > 0"),
  sensorFill: z.literal("height").optional(),
});

export const TrickCategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  examples: z.array(z.string()).optional(),
  colour: z.string().optional(),
});

export const CountingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("best_n"),
    n: z.number().int().min(1),
    /** Only the best of identically-named tricks may count. */
    distinctTrickNames: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("best_per_category"),
    maxPerCategory: z.number().int().min(1),
    /** Per-category limits that override maxPerCategory for the categories named here (keys = category keys). */
    perCategoryMax: z.record(z.string(), z.number().int().min(1)).optional(),
    /** Default: all categories of the model. */
    categoriesCounted: z.number().int().min(1).optional(),
    requireDistinctCategories: z.boolean().default(true),
  }),
  z.object({ type: z.literal("single_best") }),
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("none") }),
]);

export const ImpressionSchema = z.object({
  label: z.string().min(1),
  help: z.string().optional(),
  scale: ScaleSchema,
  weight: z.number().min(0),
  /** Publishing waits until every panel judge has marked every rider. */
  required: z.boolean().default(true),
});

export const TieBreakerSchema = z.enum([
  "highest_counted_trick",
  "next_counted_trick",
  "impression",
  "most_landed",
  "highest_any_trick",
  "head_judge",
  "share_place",
]);

export const HeightMappingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("linear"),
    fromM: z.number(),
    toM: z.number(),
    toScore: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal("bands"),
    bands: z.array(z.object({ minM: z.number(), score: z.number() })).min(1),
  }),
]);

const HeightSensorSchema = z.object({
  enabled: z.boolean().default(false),
  source: z.enum(["manual", "woo_api"]).default("manual"),
  use: z.enum(["display", "height_criterion", "bonus"]).default("display"),
  mapping: HeightMappingSchema.optional(),
  bonus: z
    .object({
      perMetreAbove: z.number().min(0),
      thresholdM: z.number(),
      capPoints: z.number().min(0),
    })
    .optional(),
  award: z.object({ highestJump: z.boolean().default(false) }).default({ highestJump: false }),
});

export const ScoringModelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    version: z.number().int().min(1),
    basedOn: z.string().optional(),
    trick: z.object({
      entry: z.enum(["criteria", "single", "none"]),
      scale: ScaleSchema,
      criteria: z.array(CriterionSchema).default([]),
      combine: z.enum(["weighted_mean", "sum"]).default("weighted_mean"),
      crash: z.enum(["not_counted", "zero"]).default("not_counted"),
      allowNoScore: z.boolean().default(true),
    }),
    panel: z.object({
      minJudges: z.number().int().min(1).default(3),
      maxJudges: z.number().int().min(1).default(7),
      aggregate: z.enum(["mean", "trimmed_mean", "median"]).default("mean"),
      trimMinJudges: z.number().int().min(3).default(5),
      decimals: z.number().int().min(0).max(4).default(2),
      outlierWarnPct: z.number().min(0).max(100).default(15),
      requireAllJudges: z.boolean().default(true),
    }),
    heat: z.object({
      counting: CountingSchema,
      trickWeight: z.number().min(0).default(1),
      /** Weights on the counted tricks in rank order (best first); missing entries = 1; absent = all 1. */
      countedWeights: z.array(z.number().min(0)).optional(),
      impression: ImpressionSchema.nullable().default(null),
      total: z.object({
        display: z.enum(["raw", "percent", "both"]).default("raw"),
        maxRaw: z.union([z.number().positive(), z.literal("auto")]).default("auto"),
      }),
      landedRatioHint: z.boolean().default(false),
      /** Cap on non-deleted attempts per rider per heat; null = unlimited. Overridable per division. */
      maxAttemptsPerRider: z.number().int().min(1).nullable().default(null),
      /** Two attempts for one rider from different spotter seats within this many seconds are flagged. */
      duplicateWindowSec: z.number().positive().default(20),
    }),
    categories: z.array(TrickCategorySchema).default([]),
    tieBreakers: z
      .array(TieBreakerSchema)
      .default(["highest_counted_trick", "next_counted_trick", "impression", "head_judge"]),
    modifiers: z.object({
      interference: z.object({
        penalty: z.enum(["drop_best_trick", "percent", "points", "none"]),
        value: z.number().min(0).optional(),
        allowMultiple: z.boolean().default(false),
      }),
      dns: z.object({ placing: z.literal("last"), total: z.literal(0) }),
      dnf: z.object({ keepScores: z.boolean().default(true) }),
      dsq: z.object({ placing: z.literal("last"), total: z.literal(0) }),
    }),
    heightSensor: HeightSensorSchema.default({
      enabled: false,
      source: "manual",
      use: "display",
      award: { highestJump: false },
    }),
  })
  .superRefine((m, ctx) => {
    const { trick } = m;

    const keys = trick.criteria.map((c) => c.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["trick", "criteria"],
        message: `criterion keys must be unique (duplicate: ${[...new Set(dupes)].join(", ")})`,
      });
    }

    if (trick.entry === "criteria" && trick.criteria.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["trick", "criteria"],
        message: 'trick.entry = "criteria" needs at least one criterion',
      });
    }

    if (trick.entry === "criteria" && trick.combine === "sum") {
      const sumMax = trick.criteria.reduce((s, c) => s + c.scale.max, 0);
      if (Math.abs(sumMax - trick.scale.max) > TOLERANCE) {
        ctx.addIssue({
          code: "custom",
          path: ["trick", "combine"],
          message: `combine = "sum": the criteria maximums add up to ${sumMax} but trick.scale.max is ${trick.scale.max}`,
        });
      }
    }

    const counting = m.heat.counting;
    if (counting.type === "best_per_category" && counting.perCategoryMax) {
      const known = new Set(m.categories.map((c) => c.key));
      for (const key of Object.keys(counting.perCategoryMax)) {
        if (!known.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["heat", "counting", "perCategoryMax", key],
            message: `perCategoryMax names "${key}", which is not a category of this model (${[...known].join(", ") || "none defined"})`,
          });
        }
      }
    }

    if (m.panel.minJudges > m.panel.maxJudges) {
      ctx.addIssue({
        code: "custom",
        path: ["panel", "minJudges"],
        message: "panel.minJudges cannot be greater than panel.maxJudges",
      });
    }

    const hs = m.heightSensor;
    if (hs.use === "height_criterion") {
      const filled = trick.criteria.filter((c) => c.sensorFill === "height").length;
      if (filled !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["heightSensor", "use"],
          message: `heightSensor.use = "height_criterion" needs exactly one criterion with sensorFill = "height" (found ${filled})`,
        });
      }
      if (!hs.mapping) {
        ctx.addIssue({
          code: "custom",
          path: ["heightSensor", "mapping"],
          message: 'heightSensor.use = "height_criterion" needs a mapping from metres to score',
        });
      }
    }
    if (hs.use === "bonus" && !hs.bonus) {
      ctx.addIssue({
        code: "custom",
        path: ["heightSensor", "bonus"],
        message: 'heightSensor.use = "bonus" needs a bonus setting',
      });
    }

    const pen = m.modifiers.interference;
    if ((pen.penalty === "percent" || pen.penalty === "points") && pen.value === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["modifiers", "interference", "value"],
        message: `interference penalty "${pen.penalty}" needs a value`,
      });
    }
  });

export type Scale = z.infer<typeof ScaleSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type TrickCategory = z.infer<typeof TrickCategorySchema>;
export type Counting = z.infer<typeof CountingSchema>;
export type Impression = z.infer<typeof ImpressionSchema>;
export type TieBreaker = z.infer<typeof TieBreakerSchema>;
export type HeightMapping = z.infer<typeof HeightMappingSchema>;
export type ScoringModel = z.infer<typeof ScoringModelSchema>;
/** Raw JSON shape (defaults not yet applied), e.g. a preset file. */
export type ScoringModelInput = z.input<typeof ScoringModelSchema>;

export class ScoringModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringModelError";
  }
}

/** Validates a scoring model and applies defaults. Throws ScoringModelError with readable text. */
export function parseScoringModel(json: unknown): ScoringModel {
  const result = ScoringModelSchema.safeParse(json);
  if (!result.success) {
    throw new ScoringModelError(`Invalid scoring model:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
