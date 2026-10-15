// A drawn division read back in the notation of the printed sheet: "seed 5" in Round 1, "3rd H5" after it. Pure; used to check what was really saved.
import type { DivisionDraw } from "@/lib/engine/ladder";

const ORD = ["", "1st", "2nd", "3rd"];

/** heat number (across the rounds) → its seats in seat order, e.g. { 7: ["3rd H5", "2nd H4"] }. */
export function sheetOfDraw(draw: DivisionDraw): Record<number, string[]> {
  const first = new Map<string, number>(); // round id → number of the heat before its first heat
  let before = 0;
  for (const r of draw.rounds) {
    first.set(r.id, before);
    before += r.heats.filter((h) => !h.bye).length;
  }
  const out: Record<number, string[]> = {};
  for (const r of draw.rounds) {
    for (const h of r.heats) {
      if (h.number === null) continue;
      out[h.number] = h.slots.map((s) => {
        if (s.from) return `${ORD[s.from.place] ?? `${s.from.place}th`} H${(first.get(s.from.round) ?? 0) + s.from.heat}`;
        return s.seed !== undefined ? `seed ${s.seed}` : "empty";
      });
    }
  }
  return out;
}

/** The Lycra colour word of each seat of each heat, by heat number. */
export function coloursOfDraw(draw: DivisionDraw): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const r of draw.rounds) for (const h of r.heats) if (h.number !== null) out[h.number] = h.slots.map((s) => s.vestColour ?? "none");
  return out;
}
