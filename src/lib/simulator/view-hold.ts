import { copy } from "@/lib/ui-copy";
import type { SeatView } from "./types";

/** How often a View-as tab tells the simulator it is still open. */
export const SIM_VIEW_BEAT_MS = 5_000;
/** A View-as seat whose tab has said nothing for this long goes back to the simulator (a crashed browser, a phone that slept). */
export const SIM_VIEW_SILENT_SEC = 90;
/** After "I am leaving", the seat goes back unless the tab beats again within this many seconds (a reload). */
export const SIM_VIEW_LEAVE_GRACE_SEC = 6;

export const simLeaveHref = (eventId: string): string => `/org/events/${eventId}/simulate/leave`;

/** Who holds a seat, from the panel's point of view: the simulator, you through View as, a phone that joined with the PIN, or nobody (a real seat waiting). */
export function heldByOf(seat: { mode: "virtual" | "real"; boundUser: string | null; virtualUser: string | null }, me: string): SeatView["heldBy"] {
  if (seat.boundUser && seat.boundUser === me) return "you";
  if (seat.mode === "virtual" && (!seat.boundUser || seat.boundUser === seat.virtualUser)) return "simulator";
  if (seat.boundUser && seat.boundUser !== seat.virtualUser) return "phone";
  return "nobody";
}

/** The words of the "held by" pill: "Simulator", "You (View as) · seen 4 s ago", "A phone (PIN)", "Waiting for a phone". */
export function heldWords(s: Pick<SeatView, "heldBy" | "viewSeenSec">): string {
  const R = copy.simulator.roles;
  if (s.heldBy === "simulator") return R.heldSimulator;
  if (s.heldBy === "you") return s.viewSeenSec === null ? R.you : R.youSeen(s.viewSeenSec);
  if (s.heldBy === "phone") return R.person;
  return R.waiting;
}
