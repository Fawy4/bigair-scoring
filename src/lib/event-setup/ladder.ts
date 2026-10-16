// Turns the ladder of an event description into the app's own custom ladder and format (RB1). Pure: no database, no clock.
import { ladderTemplate } from "@/lib/engine/ladder/custom-ladder-draw";
import type { CustomLadder, LadderRound, SeatSource } from "@/lib/schemas/custom-ladder";
import { CustomLadderSchema } from "@/lib/schemas/custom-ladder";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import type { EventDescription, LadderDescription } from "./schema";

const ORDINAL: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6 };

/** A seat as the printed sheet writes it: "seed 5" or "3rd H5". `heat` of a place is the sheet's number (across the rounds) until `ladderFromDescription` turns it into the number inside its round. */
export function seatFromText(text: string): { type: "seed"; seed: number } | { type: "place"; heat: number; place: number } {
  const seed = /^seed\s+(\d{1,3})$/i.exec(text.trim());
  if (seed) return { type: "seed", seed: Number(seed[1]) };
  const place = /^(\d)(?:st|nd|rd|th)\s+H(\d{1,3})$/i.exec(text.trim());
  if (place && ORDINAL[`${place[1]}${["", "st", "nd", "rd"][Number(place[1])] ?? "th"}`] !== undefined) return { type: "place", place: Number(place[1]), heat: Number(place[2]) };
  throw new Error(`I cannot read the seat "${text}". A seat is written "seed 5" or "3rd H5".`);
}

/** The ladder of the description, seat for seat. Heat numbers on the sheet run across the rounds; the app counts heats inside their round, so each "H10" becomes round + position. */
export function ladderFromDescription(d: LadderDescription): CustomLadder {
  const where = new Map<number, { round: string; index: number; roundIndex: number }>();
  let expected = 1;
  d.rounds.forEach((r, roundIndex) =>
    r.heats.forEach((h, i) => {
      if (h.number !== expected) throw new Error(`Heat numbers must run 1, 2, 3 … across the rounds: expected H${expected}, found H${h.number} in ${r.name}.`);
      where.set(h.number, { round: r.id, index: i + 1, roundIndex });
      expected++;
    }),
  );
  const rounds: LadderRound[] = d.rounds.map((r, roundIndex) => ({
    id: r.id,
    name: r.name,
    shortName: r.shortName,
    advance: r.advance,
    durationMin: r.heatLengthMin,
    warmUpMin: r.startSequenceMin,
    breakAfterHeatMin: d.breakAfterHeatMin,
    breakAfterRoundMin: d.breakAfterRoundMin,
    heats: r.heats.map((h) => ({
      seats: h.seats.map((text): SeatSource => {
        const s = seatFromText(text);
        if (s.type === "seed") {
          if (roundIndex > 0) throw new Error(`H${h.number}: seeds can only go in the first round.`);
          return s;
        }
        const from = where.get(s.heat);
        if (!from) throw new Error(`H${h.number}: there is no heat H${s.heat}.`);
        if (from.roundIndex >= roundIndex) throw new Error(`H${h.number}: "${text}" must be a heat of an earlier round.`);
        return { type: "place", round: from.round, heat: from.index, place: s.place };
      }),
    })),
  }));
  return CustomLadderSchema.parse({ targetHeatSize: d.heatSize.target, minHeatSize: d.heatSize.min, maxHeatSize: d.heatSize.max, rounds });
}

/** The format the division uses: the custom ladder with the event's timing (a start sequence before every heat, no other breaks) and the Lycra colour list. */
export function formatTemplateFor(desc: EventDescription): FormatTemplate {
  return ladderTemplate(ladderFromDescription(desc.ladder), {
    id: desc.id,
    name: `${desc.event.name} ladder`,
    description: "Built from the printed sheet, seat for seat.",
    vestColours: desc.lycra,
    timing: { defaultHeatMin: desc.ladder.rounds[0].heatLengthMin, defaultBreakAfterHeatMin: desc.ladder.breakAfterHeatMin, defaultBreakAfterRoundMin: desc.ladder.breakAfterRoundMin, warmUpBeforeHeatMin: desc.ladder.rounds[0].startSequenceMin },
  });
}
