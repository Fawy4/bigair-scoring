import { z } from "zod";

/**
 * Custom ladder — the whiteboard ladder of Phase 4b: rounds, heats inside them and every seat named by its source.
 * It is stored inside a FormatTemplate (`kind: "ladder"`), so it saves as an organisation format preset and round-trips as JSON.
 * Every number that could differ between events is a field here.
 */

/** What fills a seat: a seed or a rider (Round 1 only), or a place of a heat of an earlier round ("1st H1", "1st R2 H3"). */
export const SeatSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("seed"), seed: z.number().int().min(1) }),
  z.object({ type: z.literal("rider"), entrantId: z.string().min(1) }),
  z.object({
    type: z.literal("place"),
    round: z.string().min(1),
    /** 1-based number of the heat inside its round. */
    heat: z.number().int().min(1),
    place: z.number().int().min(1),
  }),
]);

export const LadderHeatSchema = z.object({
  /** The organiser's own name for the heat ("Semi 1"); absent = "H2". */
  name: z.string().min(1).max(40).optional(),
  seats: z.array(SeatSourceSchema).max(10),
});

export const LadderRoundSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  shortName: z.string().min(1).max(24),
  heats: z.array(LadderHeatSchema),
  /** How many places of every heat go on (the top N). The last round is the final: nobody goes on from it. */
  advance: z.number().int().min(0).max(10).default(1),
  /** Overrides of the ladder's three numbers for this round. */
  minHeatSize: z.number().int().min(1).max(10).optional(),
  maxHeatSize: z.number().int().min(1).max(10).optional(),
  /** Heat length and warm-up for this round; absent = the ladder's. */
  durationMin: z.number().positive().optional(),
  warmUpMin: z.number().min(0).optional(),
  breakAfterHeatMin: z.number().min(0).optional(),
  breakAfterRoundMin: z.number().min(0).optional(),
});

export const CustomLadderSchema = z
  .object({
    /** The division's riders per heat: new heats get this many seats. */
    targetHeatSize: z.number().int().min(1).max(10).default(3),
    minHeatSize: z.number().int().min(1).max(10).default(2),
    maxHeatSize: z.number().int().min(1).max(10).default(4),
    rounds: z.array(LadderRoundSchema),
  })
  .superRefine((l, ctx) => {
    const ids = new Set<string>();
    l.rounds.forEach((r, i) => {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", message: `duplicate round id "${r.id}"`, path: ["rounds", i, "id"] });
      ids.add(r.id);
    });
    if (l.minHeatSize > l.targetHeatSize) ctx.addIssue({ code: "custom", message: "the minimum riders per heat cannot be above the target", path: ["minHeatSize"] });
    if (l.maxHeatSize < l.targetHeatSize) ctx.addIssue({ code: "custom", message: "the maximum riders per heat cannot be below the target", path: ["maxHeatSize"] });
  });

export type SeatSource = z.infer<typeof SeatSourceSchema>;
export type LadderHeat = z.infer<typeof LadderHeatSchema>;
export type LadderRound = z.infer<typeof LadderRoundSchema>;
export type CustomLadder = z.infer<typeof CustomLadderSchema>;
export type CustomLadderInput = z.input<typeof CustomLadderSchema>;
