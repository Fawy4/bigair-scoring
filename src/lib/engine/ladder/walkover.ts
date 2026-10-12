import type { HeatResultInput, LadderModifier, RankedEntry } from "./types";

/** One seat of a heat as the database holds it: the rider (if any) and the mark on the seat. */
export interface WalkoverSeat {
  entrantId?: string | null;
  modifier?: LadderModifier | string | null;
}

export type WalkoverState =
  /** Two or more riders can ride: the heat is ridden as usual. */
  | { kind: "ride" }
  /** A seat is still waiting for a result of an earlier heat: nothing can be decided yet. */
  | { kind: "waiting" }
  /** Only one rider can ride: the head judge may send him through without riding. `others` are the riders who did not start. */
  | { kind: "walkover"; winner: string; others: string[] }
  /** Every rider is Did not start or Out of the event: nobody goes through. */
  | { kind: "nobody"; others: string[] };

const cannotRide = (s: WalkoverSeat) => s.modifier === "DNS" || s.modifier === "DSQ";

/**
 * What a heat that has not started offers the head judge (Console – Walkover): a walkover once exactly one rider can ride, "No rider" when none can, otherwise
 * nothing (a heat of three with one rider missing runs with two). A seat with no rider and no walkover mark is still waiting for an earlier heat. Pure.
 */
export function heatCanWalkover(seats: readonly WalkoverSeat[]): WalkoverState {
  if (seats.some((s) => !s.entrantId && !cannotRide(s))) return { kind: "waiting" };
  const riders = seats.filter((s) => s.entrantId);
  const able = riders.filter((s) => !cannotRide(s));
  const others = riders.filter(cannotRide).map((s) => s.entrantId as string);
  if (able.length >= 2) return { kind: "ride" };
  if (able.length === 1) return { kind: "walkover", winner: able[0].entrantId as string, others };
  return riders.length === 0 ? { kind: "waiting" } : { kind: "nobody", others };
}

/**
 * The result of a heat that is not ridden, as the ladder takes it: the only rider who could ride is 1st with no total and the walkover mark, the others follow as
 * Did not start. When nobody can ride the result is empty: nobody goes through and the seats the heat feeds are walkovers. Throws when the heat can still be ridden.
 */
export function walkoverRanking(seats: readonly WalkoverSeat[]): HeatResultInput {
  const state = heatCanWalkover(seats);
  if (state.kind === "nobody") return { ranked: [] };
  if (state.kind !== "walkover") throw new Error("A walkover needs only one rider who can ride, and this heat can still be ridden.");
  const ranked: RankedEntry[] = [
    { entrantId: state.winner, place: 1, total: null, walkover: true, tieKeys: [] },
    ...state.others.map((id, i): RankedEntry => ({ entrantId: id, place: i + 2, total: null, modifier: "DNS" })),
  ];
  return { ranked };
}
