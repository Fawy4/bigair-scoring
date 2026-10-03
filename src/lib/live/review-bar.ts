import type { ChecklistItem } from "./publish-checklist";

/** One panel judge as the review bar needs them: the seat's name, whether the phone is connected, whether the sheet is submitted. */
export interface BarJudge {
  id: string;
  word: string;
  live: boolean;
  submitted: boolean;
}

export type ReviewBarState =
  /** The heat is on the water: a quiet line, no colour. */
  | { kind: "running"; scoring: number; total: number }
  /** Ended, and the only thing missing is judges who have not submitted yet (amber). */
  | { kind: "waiting"; waiting: Array<{ seatId: string; word: string }>; total: number }
  /** Ended, and something blocks Publish: the first blocker in the Publish list's own words, with how many more there are (red). */
  | { kind: "blocked"; item: ChecklistItem; more: number; total: number }
  /** Ended and nothing blocks Publish (green). */
  | { kind: "ready"; total: number };

/**
 * The review bar of the head judge's console (from End heat until Publish). The text it shows is the Publish blocker list's own, shown earlier: the same lines,
 * in the same order (submitted sheets, scores, Impression / Variety scores, ties). A judge who simply has not submitted is "waiting" (amber); anything else that
 * blocks Publish (a missing score or Impression / Variety score, a tie) is "blocked" (red), with its first line. No bar for a heat that has not started or is published.
 */
export function reviewBarState(input: { status: string; judges: BarJudge[]; items: ChecklistItem[] }): ReviewBarState | null {
  const total = input.judges.length;
  if (input.status === "running" || input.status === "paused") return { kind: "running", scoring: input.judges.filter((j) => j.live).length, total };
  if (input.status !== "ended" && input.status !== "under_review") return null;
  const blocking = input.items.filter((i) => i.kind !== "sheet");
  if (blocking.length > 0) return { kind: "blocked", item: blocking[0], more: blocking.length - 1, total };
  const sheets = input.items.filter((i) => i.kind === "sheet");
  if (sheets.length > 0) {
    const word = (id: string | undefined) => input.judges.find((j) => j.id === id)?.word ?? "";
    return { kind: "waiting", waiting: sheets.map((i) => ({ seatId: i.judge ?? "", word: word(i.judge) })), total };
  }
  return { kind: "ready", total };
}
