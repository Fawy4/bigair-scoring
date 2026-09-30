// The custom ladder builder's model and editing functions (Phase 4b). Pure: nothing here reads a clock or the database.
import { CustomLadderSchema, type CustomLadder, type LadderHeat, type LadderRound, type SeatSource } from "@/lib/schemas/custom-ladder";

export type { CustomLadder, LadderHeat, LadderRound, SeatSource };

export class LadderEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LadderEditError";
  }
}

const clone = <T>(x: T): T => structuredClone(x);
export const EMPTY: SeatSource = { type: "empty" };

/** A place of a heat: "1st H1". `heat` is the 1-based number of the heat inside its round. */
export interface PlaceRef {
  round: string;
  heat: number;
  place: number;
}

export interface SeatRef {
  round: string;
  heat: number;
  seat: number;
}

export const samePlace = (a: PlaceRef, b: PlaceRef) => a.round === b.round && a.heat === b.heat && a.place === b.place;

export function newLadder(target = 3, min = Math.max(2, target - 1), max = Math.min(10, target + 1)): CustomLadder {
  return CustomLadderSchema.parse({ targetHeatSize: target, minHeatSize: min, maxHeatSize: max, rounds: [] });
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

const roundOf = (l: CustomLadder, id: string): LadderRound => {
  const r = l.rounds.find((x) => x.id === id);
  if (!r) throw new LadderEditError("That round is not in the ladder.");
  return r;
};

const heatOf = (l: CustomLadder, roundId: string, heat: number): LadderHeat => {
  const h = roundOf(l, roundId).heats[heat - 1];
  if (!h) throw new LadderEditError("That heat is not in the round.");
  return h;
};

export const roundIndex = (l: CustomLadder, id: string) => l.rounds.findIndex((r) => r.id === id);

/** "H2" for a heat of the previous round, "R2 H3" for a heat further back; the place in front: "1st H2", "1st R2 H3". */
export function placeText(l: CustomLadder, from: PlaceRef, inRound: string): string {
  const at = roundIndex(l, inRound);
  const previous = at > 0 && l.rounds[at - 1].id === from.round;
  const src = l.rounds.find((r) => r.id === from.round);
  return `${ordinal(from.place)} ${previous ? "" : `${src?.shortName ?? from.round} `}H${from.heat}`;
}

export function heatName(round: LadderRound, heat: number): string {
  return round.heats[heat - 1]?.name ?? `H${heat}`;
}

// ── rounds ─────────────────────────────────────────────────────────────────────────────

export function addRound(l: CustomLadder, name?: string): CustomLadder {
  const next = clone(l);
  const used = new Set(next.rounds.map((r) => r.id));
  let n = next.rounds.length + 1;
  while (used.has(`R${n}`)) n++;
  const id = `R${n}`;
  next.rounds.push({ id, name: name?.trim() || `Round ${next.rounds.length + 1}`, shortName: id, heats: [], advance: 1 });
  return next;
}

export function renameRound(l: CustomLadder, roundId: string, name: string): CustomLadder {
  const text = name.trim();
  if (!text) throw new LadderEditError("A round needs a name.");
  if (text.length > 40) throw new LadderEditError("Names are at most 40 characters.");
  const next = clone(l);
  roundOf(next, roundId).name = text;
  return next;
}

export function renameHeat(l: CustomLadder, roundId: string, heat: number, name: string): CustomLadder {
  const text = name.trim();
  if (text.length > 40) throw new LadderEditError("Names are at most 40 characters.");
  const next = clone(l);
  const h = heatOf(next, roundId, heat);
  if (text) h.name = text;
  else delete h.name;
  return next;
}

/** Takes a round out. Seats elsewhere that waited for its places become empty. */
export function removeRound(l: CustomLadder, roundId: string): CustomLadder {
  const next = clone(l);
  roundOf(next, roundId);
  next.rounds = next.rounds.filter((r) => r.id !== roundId);
  for (const r of next.rounds) for (const h of r.heats) h.seats = h.seats.map((s) => (s.type === "place" && s.round === roundId ? EMPTY : s));
  return next;
}

export function moveRound(l: CustomLadder, roundId: string, direction: -1 | 1): CustomLadder {
  const next = clone(l);
  const at = roundIndex(next, roundId);
  if (at < 0) throw new LadderEditError("That round is not in the ladder.");
  const to = at + direction;
  if (to < 0 || to >= next.rounds.length) return next;
  const [r] = next.rounds.splice(at, 1);
  next.rounds.splice(to, 0, r);
  return next;
}

export function setAdvance(l: CustomLadder, roundId: string, n: number): CustomLadder {
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new LadderEditError("Places that go on must be a whole number from 0 to 10.");
  const next = clone(l);
  roundOf(next, roundId).advance = n;
  return next;
}

/** Changes one of the three numbers for the whole ladder, or for one round (`roundId`). */
export function setLimits(l: CustomLadder, limits: { targetHeatSize?: number; minHeatSize?: number; maxHeatSize?: number }, roundId?: string): CustomLadder {
  const next = clone(l);
  if (roundId) {
    const r = roundOf(next, roundId);
    if (limits.minHeatSize !== undefined) r.minHeatSize = limits.minHeatSize;
    if (limits.maxHeatSize !== undefined) r.maxHeatSize = limits.maxHeatSize;
    return next;
  }
  Object.assign(next, limits);
  return CustomLadderSchema.parse(next);
}

// ── heats and seats ────────────────────────────────────────────────────────────────────

const seats = (n: number): SeatSource[] => Array.from({ length: n }, () => EMPTY);

/** "+ Add heat": a new heat with the division's riders per heat as empty seats. */
export function addHeat(l: CustomLadder, roundId: string, seatCount?: number): CustomLadder {
  const next = clone(l);
  roundOf(next, roundId).heats.push({ seats: seats(seatCount ?? next.targetHeatSize) });
  return next;
}

/** Takes a heat out. The heats behind it move up, so every seat that names a later heat of this round follows; seats that waited for it become empty. */
export function removeHeat(l: CustomLadder, roundId: string, heat: number): CustomLadder {
  const next = clone(l);
  const round = roundOf(next, roundId);
  heatOf(next, roundId, heat);
  round.heats.splice(heat - 1, 1);
  for (const r of next.rounds) {
    for (const h of r.heats) {
      h.seats = h.seats.map((s) => {
        if (s.type !== "place" || s.round !== roundId) return s;
        if (s.heat === heat) return EMPTY;
        return s.heat > heat ? { ...s, heat: s.heat - 1 } : s;
      });
    }
  }
  return next;
}

/** The + / − of a heat: seats are added empty at the end or taken from the end. */
export function setSeatCount(l: CustomLadder, roundId: string, heat: number, n: number): CustomLadder {
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new LadderEditError("A heat holds 0 to 10 seats.");
  const next = clone(l);
  const h = heatOf(next, roundId, heat);
  h.seats = h.seats.length >= n ? h.seats.slice(0, n) : [...h.seats, ...seats(n - h.seats.length)];
  return next;
}

/** Puts a source in a seat. Only Round 1 takes seeds and riders; later rounds take places of earlier rounds. */
export function setSeat(l: CustomLadder, at: SeatRef, source: SeatSource): CustomLadder {
  const next = clone(l);
  const h = heatOf(next, at.round, at.heat);
  if (at.seat < 0 || at.seat >= h.seats.length) throw new LadderEditError("There is no such seat.");
  const ri = roundIndex(next, at.round);
  if ((source.type === "seed" || source.type === "rider") && ri > 0) throw new LadderEditError("Seeds and riders can only go in the first round.");
  if (source.type === "place") {
    const si = roundIndex(next, source.round);
    if (si < 0) throw new LadderEditError("That round is not in the ladder.");
    if (si >= ri) throw new LadderEditError("A seat can only take a place from an earlier round.");
  }
  h.seats[at.seat] = source;
  return next;
}

export const clearSeat = (l: CustomLadder, at: SeatRef) => setSeat(l, at, EMPTY);

/** The reverse gesture: "1st →" on a heat sends that place to a seat. A place sits in one seat only, so it leaves the seat it had. */
export function sendPlace(l: CustomLadder, place: PlaceRef, to: SeatRef): CustomLadder {
  let next = clone(l);
  for (const r of next.rounds) {
    for (const h of r.heats) {
      h.seats = h.seats.map((s) => (s.type === "place" && samePlace(s, place) ? EMPTY : s));
    }
  }
  next = setSeat(next, to, { type: "place", round: place.round, heat: place.heat, place: place.place });
  return next;
}

// ── reading the ladder ─────────────────────────────────────────────────────────────────

export const seatCount = (round: LadderRound) => round.heats.reduce((n, h) => n + h.seats.length, 0);

export interface Use {
  at: SeatRef;
}

/** Every place / seed / rider that sits in a seat, with where it sits. */
export function uses(l: CustomLadder): Map<string, Use[]> {
  const out = new Map<string, Use[]>();
  for (const r of l.rounds) {
    r.heats.forEach((h, hi) => {
      h.seats.forEach((s, si) => {
        if (s.type === "empty") return;
        const key = s.type === "place" ? `p:${s.round}:${s.heat}:${s.place}` : s.type === "seed" ? `s:${s.seed}` : `r:${s.entrantId}`;
        out.set(key, [...(out.get(key) ?? []), { at: { round: r.id, heat: hi + 1, seat: si } }]);
      });
    });
  }
  return out;
}

export const placeKey = (p: PlaceRef) => `p:${p.round}:${p.heat}:${p.place}`;

/** Places of every heat of `round` that go on (the top `advance` of each heat; the final sends nobody on). */
export function advancingPlaces(l: CustomLadder, roundId: string): PlaceRef[] {
  const at = roundIndex(l, roundId);
  if (at < 0 || at === l.rounds.length - 1) return [];
  const r = l.rounds[at];
  return r.heats.flatMap((h, hi) => Array.from({ length: Math.min(r.advance, h.seats.length) }, (_, p) => ({ round: roundId, heat: hi + 1, place: p + 1 })));
}

/** Where the rank `place` of a round goes: the round whose seats name it, else the next round. */
export function rankTarget(l: CustomLadder, roundId: string, place: number): string | null {
  const at = roundIndex(l, roundId);
  if (at < 0 || at === l.rounds.length - 1) return null;
  for (const r of l.rounds.slice(at + 1)) {
    for (const h of r.heats) for (const s of h.seats) if (s.type === "place" && s.round === roundId && s.place === place) return r.id;
  }
  return l.rounds[at + 1].id;
}

/** Riders that arrive in each round (Round 1: nobody arrives, the field is the seed list). */
export function receives(l: CustomLadder): Map<string, number> {
  const out = new Map<string, number>(l.rounds.map((r) => [r.id, 0]));
  for (const r of l.rounds) {
    for (const p of advancingPlaces(l, r.id)) {
      const target = rankTarget(l, r.id, p.place);
      if (target) out.set(target, (out.get(target) ?? 0) + 1);
    }
  }
  return out;
}

/** Places that can still be chosen for a seat of `roundId`: advancing places of earlier rounds, each with where it already sits. */
export interface PlaceOption {
  place: PlaceRef;
  label: string;
  /** Where it is used now, for "→ R2 H1"; null = free. */
  usedAt: SeatRef | null;
}

export function placeOptions(l: CustomLadder, roundId: string): PlaceOption[] {
  const at = roundIndex(l, roundId);
  const used = uses(l);
  const out: PlaceOption[] = [];
  for (const r of l.rounds.slice(0, Math.max(0, at))) {
    for (const p of advancingPlaces(l, r.id)) {
      out.push({ place: p, label: placeText(l, p, roundId), usedAt: used.get(placeKey(p))?.[0]?.at ?? null });
    }
  }
  return out.sort((a, b) => roundIndex(l, a.place.round) - roundIndex(l, b.place.round) || a.place.place - b.place.place || a.place.heat - b.place.heat);
}

/** "R2 H1" for the tag that says where a used place went. */
export function seatText(l: CustomLadder, at: SeatRef): string {
  const r = l.rounds.find((x) => x.id === at.round);
  return `${r?.shortName ?? at.round} ${heatName(r ?? { heats: [] } as unknown as LadderRound, at.heat)}`;
}

/** The number of seats the ladder's first round must have: one per rider. */
export function totalHeats(l: CustomLadder): number {
  return l.rounds.reduce((n, r) => n + r.heats.length, 0);
}
