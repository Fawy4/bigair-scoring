import { copy } from "@/lib/ui-copy";

/** A judge on the head judge's console: the seat's own name ("Fawy") and the short tag of its place on the panel ("J1"). */
export interface JudgeName {
  id: string;
  /** The seat name the organiser gave the judge; null while it is not known (a phone that may not read other seats). */
  name: string | null;
  /** "J1", "J2" … in panel order. A sub-label next to the name, and the whole name when the seat has none. */
  tag: string;
}

/** The panel in seat order, each with the seat's name. Two judges with the same name stay apart by their tags. */
export function judgeNames(panelSeatIds: string[], seatNames: Record<string, string | undefined>): JudgeName[] {
  return panelSeatIds.map((id, i) => ({ id, name: seatNames[id]?.trim() || null, tag: copy.live.matrix.judgeTag(i + 1) }));
}

/** How a judge reads in a sentence ("Fawy has not submitted"): the seat name, else the tag. Never "Judge 1". */
export const judgeWordOf = (j: Pick<JudgeName, "name" | "tag">): string => j.name ?? j.tag;

/** One function for every sentence of the console: seat id → "Fawy" (or "J1" when the name is not known; an id that is not on the panel reads as "A judge"). */
export function judgeWordFor(panelSeatIds: string[], seatNames: Record<string, string | undefined>): (seatId: string) => string {
  const byId = new Map(judgeNames(panelSeatIds, seatNames).map((j) => [j.id, j] as const));
  return (seatId) => {
    const j = byId.get(seatId);
    return j ? judgeWordOf(j) : copy.live.matrix.aJudge;
  };
}
