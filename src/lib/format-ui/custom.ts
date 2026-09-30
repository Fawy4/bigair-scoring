import { FormatTemplateSchema, type FormatTemplateInput } from "@/lib/schemas/format-template";

/**
 * Starting point of the custom format builder: heats of 4 where the top 2 go through, then one final heat.
 * The organiser adds, removes and edits rounds from here; the live preview shows what any field size does.
 */
export function newCustomFormat(name = "My format"): FormatTemplateInput {
  return {
    id: "custom",
    name,
    description: "Custom format built by the organiser.",
    entrants: { min: 2, max: null },
    vestColours: ["red", "yellow", "blue", "green", "white", "black"],
    timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 3, defaultBreakAfterRoundMin: 5 },
    kind: "fixed",
    rounds: [
      {
        id: "R1",
        name: "Round 1",
        shortName: "R1",
        heatSize: 4,
        entrantsFrom: [{ type: "seeds" }],
        advance: [
          { places: [1, 2], to: "F" },
          { places: "rest", to: "eliminated" },
        ],
      },
      {
        id: "F",
        name: "Final",
        shortName: "F",
        heatSize: 6,
        heatCountOverride: 1,
        entrantsFrom: [{ type: "round_places", round: "R1", places: [1, 2] }],
        advance: [{ places: "rest", to: "final_placing" }],
      },
    ],
  };
}

/** A round with sensible defaults, added after the last round; its source is the previous round's top places. */
export function newRound(existingIds: readonly string[], previousId: string | null): Record<string, unknown> {
  let n = existingIds.length + 1;
  while (existingIds.includes(`R${n}`)) n++;
  const id = `R${n}`;
  return {
    id,
    name: `Round ${n}`,
    shortName: id,
    heatSize: 4,
    entrantsFrom: previousId ? [{ type: "round_places", round: previousId, places: [1, 2] }] : [{ type: "seeds" }],
    advance: [{ places: "rest", to: "final_placing" }],
  };
}

/** Where a place can be sent: the other rounds plus the two special targets. */
export function advanceTargets(roundIds: readonly string[], self: string): string[] {
  return [...roundIds.filter((id) => id !== self), "eliminated", "final_placing"];
}

export function validateFormat(json: unknown) {
  return FormatTemplateSchema.safeParse(json);
}
