import { copy } from "@/lib/ui-copy";

const W = copy.walkover;

/** The words a result line, a rider card or the ladder uses instead of a score. */
export type NoRideWord = "walkover" | "didNotStart" | "outOfEvent";

/** Same shape the heat's timestamps come in from every reader. */
export interface HeatTimes {
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

/**
 * A walkover heat is a published heat that was started and ended at the same instant: the walkover gives it one moment (started = ended = published), a ridden heat always
 * has a length. This is the only place that says so; the run order, the public timetable and Re-open all ask here.
 */
export const isWalkoverHeat = (h: HeatTimes): boolean => h.status === "published" && Boolean(h.started_at) && h.started_at === h.ended_at;

/** The stored breakdown of a rider in a heat that was not ridden (what the public pages, the downloads and the backup read). */
export interface NoRideBreakdown {
  /** WO = Walkover, DNS = Did not start, OUT = Out of the event. The public function passes `status` through, so the pages and the downloads read it from here. */
  status: "WO" | "DNS" | "OUT";
}

export const walkoverBreakdown = (): NoRideBreakdown => ({ status: "WO" });
export const didNotStartBreakdown = (outOfEvent: boolean): NoRideBreakdown => ({ status: outOfEvent ? "OUT" : "DNS" });

/** What a stored breakdown says about a rider who did not ride; null for a rider with a score. */
export function noRideWord(b: { status?: string | null } | null | undefined): NoRideWord | null {
  if (b?.status === "WO") return "walkover";
  if (b?.status === "OUT") return "outOfEvent";
  if (b?.status === "DNS") return "didNotStart";
  return null;
}

export const noRideText = (w: NoRideWord): string => W.word[w];

/** The head judge's / organiser's sentence for the audit log: "Head judge gave a walkover in R3 · H11: Adam Arrow goes through; Mariam Graff did not start (injured)". */
export function walkoverSentence(input: { who: "head" | "organiser"; heat: string; winner: string | null; others: Array<{ name: string; outOfEvent: boolean; reason: string | null }> }): string {
  const who = W.audit.who[input.who];
  const others = input.others.map((o) => (o.outOfEvent ? W.audit.outOfEvent(o.name, o.reason) : W.audit.didNotStart(o.name, o.reason)));
  return input.winner ? W.audit.gave(who, input.heat, input.winner, others) : W.audit.nobody(who, input.heat, others);
}

/** "R3 · H11": the round's short name and the heat's number. */
export const heatShortTitle = (round: string, number: number, suffix?: string | null): string => `${round} · H${number}${suffix ?? ""}`;

/** The reason a rider was marked (typed or picked), or null when none was given. */
export const meaningfulReason = (reason: string | null | undefined): string | null => {
  const r = (reason ?? "").trim();
  return !r || r.toLowerCase() === "no reason given" ? null : r;
};
