// Hands-on editing of a draw (Phase 4b, docs/06 §Draw step). Pure: each edit returns a new draw and a plain sentence for the audit log.
// The organiser is warned, never blocked, about what the whole ladder looks like afterwards (`checkDraw`). Heats that have started
// or finished cannot be edited except for their name. A heat or round changed by hand is marked, and a regenerate asks before it
// touches it.
import { RoundSpecSchema } from "@/lib/schemas/format-template";
import { makeSlot, resultOf, sourceSlots } from "./build";
import { recompute } from "./recompute";
import type { DivisionDraw, DrawHeat, DrawRound, Slot, SlotSource } from "./types";

export class DrawEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawEditError";
  }
}

export interface SeatRef {
  heatId: string;
  slot: number;
}

export type DrawEdit =
  | { op: "move"; from: SeatRef; to: SeatRef }
  | { op: "place"; heatId: string; slot: number; entrantId: string }
  | { op: "setPlace"; heatId: string; slot: number; from: SlotSource }
  | { op: "clear"; heatId: string; slot: number }
  | { op: "addSeat"; heatId: string }
  | { op: "removeSeat"; heatId: string; slot: number }
  | { op: "addHeat"; roundId: string }
  | { op: "removeHeat"; heatId: string }
  | { op: "addRound"; afterRoundId?: string; name?: string }
  | { op: "removeRound"; roundId: string }
  | { op: "renameRound"; roundId: string; name: string }
  | { op: "renameHeat"; heatId: string; name: string };

export interface EditResult {
  draw: DivisionDraw;
  /** One plain sentence for the audit log and the screen: "Moved Amr from Heat 2 to Heat 5 (swapped with Sam)". */
  summary: string;
}

const clone = <T>(x: T): T => structuredClone(x);

// ── lookups and labels ─────────────────────────────────────────────────────────────────

export function findHeat(draw: DivisionDraw, heatId: string): { round: DrawRound; heat: DrawHeat } {
  for (const round of draw.rounds) {
    const heat = round.heats.find((h) => h.id === heatId);
    if (heat) return { round, heat };
  }
  throw new DrawEditError("That heat is not in this draw.");
}

export const heatLabel = (heat: DrawHeat) => heat.name ?? (heat.number !== null ? `Heat ${heat.number}` : heat.id);

export function riderName(draw: DivisionDraw, entrantId: string | undefined): string {
  return draw.entrants.find((e) => e.id === entrantId)?.name ?? "a rider";
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** "1st H3" (previous round) or "1st R2 H3", as the owner's wording decision 24 says. */
export function placeholderText(draw: DivisionDraw, from: SlotSource, inRound: string): string {
  const order = (id: string) => draw.rounds.findIndex((r) => r.id === id);
  const previous = order(inRound) - 1 >= 0 && draw.rounds[order(inRound) - 1].id === from.round;
  const round = draw.rounds.find((r) => r.id === from.round);
  if (from.heat === 0) return `${ordinal(from.place)} of all heats`;
  return `${ordinal(from.place)} ${previous ? "" : `${round?.shortName ?? from.round} `}H${from.heat}`;
}

/**
 * A waiting seat whose source heat is already published: who is on the way, for display only ("Sam · 1st H1 · seat pending"). The seat itself stays a
 * placeholder until the round is dealt (a round that re-seeds from all its arrivals). Null when the heat has no result yet, the seat has its rider, or the
 * place is a place across all heats of a pool.
 */
export function provisionalSeat(draw: DivisionDraw, round: DrawRound, slot: Slot): { entrantId: string; name: string; placeholder: string } | null {
  if (slot.entrantId || !slot.from || slot.from.heat === 0) return null;
  const source = draw.rounds.find((r) => r.id === slot.from!.round)?.heats.find((h) => h.index === slot.from!.heat);
  const result = source ? resultOf(draw, source) : undefined;
  const won = result?.ranked.find((e) => e.place === slot.from!.place && e.modifier !== "DNS");
  if (!won) return null;
  return { entrantId: won.entrantId, name: riderName(draw, won.entrantId), placeholder: placeholderText(draw, slot.from, round.id) };
}

function seatText(draw: DivisionDraw, round: DrawRound, slot: Slot): string {
  if (slot.entrantId) return riderName(draw, slot.entrantId);
  if (slot.from) return placeholderText(draw, slot.from, round.id);
  return "an empty seat";
}

// ── guards ─────────────────────────────────────────────────────────────────────────────

function requireEditable(round: DrawRound, heat: DrawHeat): void {
  if (heat.status !== "pending") throw new DrawEditError(`${heatLabel(heat)} has already started or finished, so it cannot be changed (you can still rename it).`);
  void round;
}

function requireSeat(heat: DrawHeat, slot: number): Slot {
  const s = heat.slots[slot];
  if (!s) throw new DrawEditError("There is no such seat.");
  return s;
}

function reindex(draw: DivisionDraw, heat: DrawHeat): void {
  heat.slots = heat.slots.map((s, i) => {
    const fresh = makeSlot(draw, i, {});
    const next: Slot = { ...s, index: i };
    if (fresh.vestColour) next.vestColour = fresh.vestColour;
    else delete next.vestColour;
    return next;
  });
}

function markArranged(round: DrawRound, ...heats: DrawHeat[]): void {
  for (const h of heats) h.manualOverride = true;
  void round;
}

/** Hand-arranged structure: seats of this round name their own sources from now on, so the round's rule never re-deals them. */
function makeExplicit(round: DrawRound): void {
  round.explicit = true;
  round.arranged = true;
}

const started = (draw: DivisionDraw) => draw.rounds.some((r) => r.heats.some((h) => h.status !== "pending"));

/** Numbers follow the order of the ladder; once any heat has started the numbers are kept and new heats take the next free number. */
function renumber(draw: DivisionDraw, keepExisting: boolean): void {
  if (keepExisting) {
    let max = Math.max(0, ...draw.rounds.flatMap((r) => r.heats.map((h) => h.number ?? 0)));
    for (const r of draw.rounds) for (const h of r.heats) if (h.number === null && !h.bye) h.number = ++max;
  } else {
    let n = 1;
    for (const r of draw.rounds) for (const h of r.heats) h.number = h.bye ? null : n++;
  }
  for (const r of draw.rounds) {
    const riding = r.heats.filter((h) => !h.bye);
    r.heats.forEach((h) => (h.roundLast = false));
    if (riding.length) riding[riding.length - 1].roundLast = true;
  }
}

/** Heat ids are `${round}-H${index}`: after a heat is taken out, the heats behind it move up and every seat that names them follows. */
function renumberHeatsOfRound(draw: DivisionDraw, round: DrawRound, removedIndex: number): void {
  round.heats.forEach((h, i) => {
    h.index = i + 1;
    h.id = `${round.id}-H${i + 1}`;
  });
  for (const r of draw.rounds) {
    for (const h of r.heats) {
      for (const s of h.slots) {
        if (s.from && s.from.round === round.id && s.from.heat > removedIndex) s.from = { ...s.from, heat: s.from.heat - 1 };
      }
    }
  }
}

function refresh(draw: DivisionDraw): void {
  for (const r of draw.rounds) r.expectedEntrants = expectedFor(draw, r);
  recompute(draw);
}

// ── what a round should receive ────────────────────────────────────────────────────────

/** Riders the ladder sends into `round` by its rules (places that advance to it), or the field for a round fed by the seed list. */
export function expectedFor(draw: DivisionDraw, round: DrawRound): number {
  if (round.spec.entrantsFrom.every((s) => s.type === "seeds")) return draw.entrants.filter((e) => !e.withdrawn).length;
  let n = 0;
  for (const from of draw.rounds) {
    if (from.id === round.id) continue;
    const cross = from.spec.crossHeat;
    if (cross) {
      if (cross.to === round.id) n += Math.min(cross.advanceTop, from.expectedEntrants);
      if (cross.alsoTo?.to === round.id) n += Math.min(cross.alsoTo.count, Math.max(0, from.expectedEntrants - cross.advanceTop));
      continue;
    }
    for (const h of from.heats) {
      for (let place = 1; place <= h.slots.length; place++) {
        for (const rule of from.spec.advance) if (rule.to === round.id && rule.places !== "rest" && rule.places.includes(place)) n++;
      }
    }
  }
  return n;
}

// ── the edits ──────────────────────────────────────────────────────────────────────────

const SWAP_KEYS = ["entrantId", "seed", "from", "modifier", "history", "manual"] as const;

function swapSeats(a: Slot, b: Slot): void {
  for (const k of SWAP_KEYS) {
    const tmp = a[k];
    (a as unknown as Record<string, unknown>)[k] = b[k];
    (b as unknown as Record<string, unknown>)[k] = tmp;
    if (a[k] === undefined) delete a[k];
    if (b[k] === undefined) delete b[k];
  }
}

function emptySeat(draw: DivisionDraw, heat: DrawHeat, index: number): Slot {
  return makeSlot(draw, index, {});
}

function movePerson(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "move" }>): string {
  const a = findHeat(draw, edit.from.heatId);
  const b = findHeat(draw, edit.to.heatId);
  requireEditable(a.round, a.heat);
  requireEditable(b.round, b.heat);
  const sa = requireSeat(a.heat, edit.from.slot);
  const sb = requireSeat(b.heat, edit.to.slot);
  if (a.heat === b.heat && edit.from.slot === edit.to.slot) throw new DrawEditError("That is the same seat.");
  if (!sa.entrantId) throw new DrawEditError("There is nobody in that seat to move.");
  const name = riderName(draw, sa.entrantId);
  const fromText = `${heatLabel(a.heat)}`;
  const toText = `${heatLabel(b.heat)}`;
  if (sb.entrantId) {
    const other = riderName(draw, sb.entrantId);
    swapSeats(sa, sb);
    markArranged(a.round, a.heat, b.heat);
    sa.manual = true;
    sb.manual = true;
    return `Swapped ${name} (${fromText}) with ${other} (${toText})`;
  }
  // the destination is an empty seat or a place still waiting for a result: the rider goes there and the old seat is left empty
  const replaced = sb.from ? `, in the seat that waited for ${placeholderText(draw, sb.from, b.round.id)}` : "";
  const target = sb;
  Object.assign(target, { entrantId: sa.entrantId, manual: true });
  if (sa.seed !== undefined) target.seed = sa.seed;
  if (sa.history) target.history = sa.history;
  if (sa.modifier) target.modifier = sa.modifier;
  else delete target.modifier;
  b.heat.slots[edit.to.slot] = { ...target, index: edit.to.slot };
  a.heat.slots[edit.from.slot] = emptySeat(draw, a.heat, edit.from.slot);
  markArranged(a.round, a.heat, b.heat);
  if (!b.round.spec.entrantsFrom.every((s) => s.type === "seeds") || sb.from) makeExplicit(b.round);
  return `Moved ${name} from ${fromText} to ${toText}${replaced}`;
}

function placeRider(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "place" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  const seat = requireSeat(heat, edit.slot);
  const entrant = draw.entrants.find((e) => e.id === edit.entrantId);
  if (!entrant) throw new DrawEditError("That rider is not in this division.");
  if (entrant.withdrawn) throw new DrawEditError(`${entrant.name} has withdrawn and cannot be placed.`);
  const replaced = seat.entrantId ? ` (replacing ${riderName(draw, seat.entrantId)})` : seat.from ? ` (in the seat that waited for ${placeholderText(draw, seat.from, round.id)})` : "";
  const fresh = makeSlot(draw, edit.slot, { entrantId: edit.entrantId, manual: true, seed: draw.seedOrder.indexOf(edit.entrantId) + 1, ...(seat.from ? { from: seat.from } : {}) });
  heat.slots[edit.slot] = fresh;
  markArranged(round, heat);
  if (seat.from || !round.spec.entrantsFrom.every((s) => s.type === "seeds")) makeExplicit(round);
  return `Placed ${entrant.name} in ${heatLabel(heat)}, seat ${edit.slot + 1}${replaced}`;
}

function setPlaceSeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "setPlace" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  requireSeat(heat, edit.slot);
  const src = draw.rounds.find((r) => r.id === edit.from.round);
  if (!src) throw new DrawEditError("That round is not in this draw.");
  if (draw.rounds.indexOf(src) >= draw.rounds.indexOf(round)) throw new DrawEditError("A seat can only wait for a place from an earlier round.");
  const srcHeat = src.heats.find((h) => h.index === edit.from.heat);
  if (!srcHeat) throw new DrawEditError("That heat does not exist.");
  if (edit.from.place < 1 || edit.from.place > srcHeat.slots.length) throw new DrawEditError(`${heatLabel(srcHeat)} has no ${ordinal(edit.from.place)} place.`);
  heat.slots[edit.slot] = makeSlot(draw, edit.slot, { from: { ...edit.from } });
  markArranged(round, heat);
  makeExplicit(round);
  return `Seat ${edit.slot + 1} of ${heatLabel(heat)} now waits for ${placeholderText(draw, edit.from, round.id)}`;
}

function clearSeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "clear" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  const seat = requireSeat(heat, edit.slot);
  const text = seatText(draw, round, seat);
  heat.slots[edit.slot] = emptySeat(draw, heat, edit.slot);
  markArranged(round, heat);
  if (seat.from) makeExplicit(round);
  return `Cleared seat ${edit.slot + 1} of ${heatLabel(heat)} (it held ${text})`;
}

function addSeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "addSeat" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  if (heat.slots.length >= 10) throw new DrawEditError("A heat holds at most 10 riders.");
  heat.slots.push(makeSlot(draw, heat.slots.length, {}));
  markArranged(round, heat);
  makeExplicit(round);
  return `Added a seat to ${heatLabel(heat)} (now ${heat.slots.length})`;
}

function removeSeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "removeSeat" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  const seat = requireSeat(heat, edit.slot);
  if (heat.slots.length <= 1) throw new DrawEditError("A heat needs at least one seat. Take the heat out instead.");
  const text = seatText(draw, round, seat);
  heat.slots.splice(edit.slot, 1);
  reindex(draw, heat);
  markArranged(round, heat);
  makeExplicit(round);
  return `Took seat ${edit.slot + 1} (${text}) out of ${heatLabel(heat)} (now ${heat.slots.length})`;
}

function typicalSize(round: DrawRound): number {
  const sizes = round.heats.map((h) => h.slots.length);
  if (sizes.length === 0) return round.spec.heatSize;
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function uniqueUid(draw: DivisionDraw, base: string): string {
  const used = new Set(draw.rounds.flatMap((r) => r.heats.map((h) => h.uid ?? h.id)));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function addHeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "addHeat" }>): string {
  const round = draw.rounds.find((r) => r.id === edit.roundId);
  if (!round) throw new DrawEditError("That round is not in this draw.");
  const last = round.heats[round.heats.length - 1];
  const index = round.heats.length + 1;
  const id = `${round.id}-H${index}`;
  const heat: DrawHeat = {
    id,
    uid: uniqueUid(draw, id),
    round: round.id,
    index,
    number: null,
    bye: false,
    slots: Array.from({ length: typicalSize(round) }, (_, i) => makeSlot(draw, i, {})),
    durationMin: last?.durationMin ?? round.spec.durationMin ?? draw.template.timing.defaultHeatMin,
    warmUpMin: last?.warmUpMin ?? round.spec.warmUpMin ?? draw.template.timing.warmUpBeforeHeatMin ?? 0,
    breakAfterHeatMin: last?.breakAfterHeatMin ?? draw.template.timing.defaultBreakAfterHeatMin,
    breakAfterRoundMin: last?.breakAfterRoundMin ?? draw.template.timing.defaultBreakAfterRoundMin,
    roundLast: false,
    status: "pending",
    manualOverride: true,
  };
  round.heats.push(heat);
  makeExplicit(round);
  renumber(draw, started(draw));
  return `Added a heat to ${round.name} (${heatLabel(heat)}, ${heat.slots.length} seats)`;
}

function removeHeat(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "removeHeat" }>): string {
  const { round, heat } = findHeat(draw, edit.heatId);
  requireEditable(round, heat);
  if (round.heats.some((h) => h.index > heat.index && h.status !== "pending")) {
    throw new DrawEditError(`A later heat of ${round.name} has already started, so ${heatLabel(heat)} cannot be taken out (the heat numbers behind it would change).`);
  }
  const riders = heat.slots.filter((s) => s.entrantId).map((s) => riderName(draw, s.entrantId));
  const label = heatLabel(heat);
  const at = round.heats.indexOf(heat);
  const index = heat.index;
  round.heats.splice(at, 1);
  // seats elsewhere that waited for this heat are left empty
  for (const r of draw.rounds) {
    for (const h of r.heats) {
      h.slots = h.slots.map((s) => (s.from && s.from.round === round.id && s.from.heat === index && !s.manual ? makeSlot(draw, s.index, {}) : s));
    }
  }
  renumberHeatsOfRound(draw, round, index);
  makeExplicit(round);
  renumber(draw, started(draw));
  return `Took ${label} out of ${round.name}${riders.length ? ` (${riders.join(", ")} now have no heat in it)` : ""}`;
}

function addRound(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "addRound" }>): string {
  const afterAt = edit.afterRoundId ? draw.rounds.findIndex((r) => r.id === edit.afterRoundId) : draw.rounds.length - 1;
  if (edit.afterRoundId && afterAt < 0) throw new DrawEditError("That round is not in this draw.");
  const used = new Set(draw.rounds.map((r) => r.id));
  let n = draw.rounds.length + 1;
  while (used.has(`R${n}`)) n++;
  const id = `R${n}`;
  const after = draw.rounds[afterAt];
  const name = edit.name?.trim() || `Round ${n}`;
  const spec = RoundSpecSchema.parse({
    id,
    name,
    shortName: id,
    heatSize: after?.spec.heatSize ?? 3,
    durationMin: after?.spec.durationMin,
    entrantsFrom: [{ type: "round_places", round: after?.id ?? draw.rounds[0]?.id ?? "R1", places: [1] }],
    advance: [{ places: "rest", to: "final_placing" }],
    seeding: "manual",
  });
  const round: DrawRound = { id, name, shortName: id, spec, expectedEntrants: 0, heats: [], seeded: false, seededNow: false, arrivals: [], explicit: true, arranged: true };
  draw.rounds.splice(afterAt + 1, 0, round);
  renumber(draw, started(draw));
  return `Added ${name} after ${after?.name ?? "the start"}`;
}

function removeRound(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "removeRound" }>): string {
  const round = draw.rounds.find((r) => r.id === edit.roundId);
  if (!round) throw new DrawEditError("That round is not in this draw.");
  if (round.heats.length > 0) throw new DrawEditError(`${round.name} still has heats. Take its heats out first.`);
  draw.rounds = draw.rounds.filter((r) => r !== round);
  return `Took ${round.name} out of the ladder`;
}

const NAME_MAX = 40;

function rename(draw: DivisionDraw, edit: Extract<DrawEdit, { op: "renameRound" | "renameHeat" }>): string {
  const name = edit.name.trim();
  if (name.length > NAME_MAX) throw new DrawEditError(`Names are at most ${NAME_MAX} characters.`);
  if (edit.op === "renameRound") {
    const round = draw.rounds.find((r) => r.id === edit.roundId);
    if (!round) throw new DrawEditError("That round is not in this draw.");
    const before = round.name;
    round.name = name || round.spec.name;
    draw.template = { ...draw.template, roundNames: nameMap(draw.template.roundNames, round.id, name) };
    return name ? `Renamed ${before} to ${name}` : `${before} goes back to its default name`;
  }
  const { heat } = findHeat(draw, edit.heatId);
  const before = heatLabel(heat);
  if (name) heat.name = name;
  else delete heat.name;
  draw.template = { ...draw.template, heatNames: nameMap(draw.template.heatNames, heat.id, name) };
  return name ? `Renamed ${before} to ${name}` : `${before} goes back to its default name`;
}

function nameMap(map: Record<string, string> | undefined, key: string, name: string): Record<string, string> | undefined {
  const next = { ...(map ?? {}) };
  if (name) next[key] = name;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
}

/**
 * From the first hand edit on, every round of the draw keeps the seats it has (each seat names its source) instead of being laid out
 * again by the round's rule: changing one round must not silently reshuffle the ones after it. Only the rounds the organiser really
 * changed are marked as arranged.
 */
function freeze(draw: DivisionDraw): void {
  for (const r of draw.rounds) r.explicit = true;
}

/** Applies one edit to a copy of the draw. Throws `DrawEditError` with a plain sentence when the edit is not allowed. */
export function applyDrawEdit(draw: DivisionDraw, edit: DrawEdit): EditResult {
  const next = clone(draw);
  if (edit.op !== "renameRound" && edit.op !== "renameHeat") freeze(next);
  let summary: string;
  switch (edit.op) {
    case "move":
      summary = movePerson(next, edit);
      break;
    case "place":
      summary = placeRider(next, edit);
      break;
    case "setPlace":
      summary = setPlaceSeat(next, edit);
      break;
    case "clear":
      summary = clearSeat(next, edit);
      break;
    case "addSeat":
      summary = addSeat(next, edit);
      break;
    case "removeSeat":
      summary = removeSeat(next, edit);
      break;
    case "addHeat":
      summary = addHeat(next, edit);
      break;
    case "removeHeat":
      summary = removeHeat(next, edit);
      break;
    case "addRound":
      summary = addRound(next, edit);
      break;
    case "removeRound":
      summary = removeRound(next, edit);
      break;
    case "renameRound":
    case "renameHeat":
      summary = rename(next, edit);
      break;
  }
  if (edit.op !== "renameRound" && edit.op !== "renameHeat") refresh(next);
  return { draw: next, summary };
}

// ── the whole-ladder check ─────────────────────────────────────────────────────────────

export type DrawCheckCode = "round_size" | "heat_size" | "rider_twice" | "rider_unplaced" | "round_empty" | "empty_seat" | "orphan_seat" | "withdrawn_placed";

export interface DrawCheckWarning {
  code: DrawCheckCode;
  message: string;
  roundId?: string;
  heatId?: string;
  slot?: number;
  entrantId?: string;
}

/**
 * Looks at the whole ladder after every change and says what is wrong in plain words. It warns, it never blocks:
 * "Round 2 expects 6 riders, 7 placed", "Heat 3 has 4 riders, maximum is 3", "Amr is in two heats of Round 1", "Round 3 is empty".
 */
export function checkDraw(draw: DivisionDraw): DrawCheckWarning[] {
  const out: DrawCheckWarning[] = [];
  const active = draw.entrants.filter((e) => !e.withdrawn);
  const nameOf = (id: string) => riderName(draw, id);

  for (const round of draw.rounds) {
    const seats = round.heats.reduce((n, h) => n + h.slots.length, 0);
    if (round.heats.length === 0 || seats === 0) {
      out.push({ code: "round_empty", roundId: round.id, message: `${round.name} is empty.` });
      continue;
    }
    const seedFed = round.spec.entrantsFrom.every((s) => s.type === "seeds");
    const placedRiders = round.heats.flatMap((h) => h.slots.flatMap((s) => (s.entrantId ? [s.entrantId] : [])));
    const expected = expectedFor(draw, round);
    if (seedFed) {
      const placed = new Set(placedRiders);
      if (placed.size !== active.length || seats !== active.length) {
        if (seats !== active.length) out.push({ code: "round_size", roundId: round.id, message: `${round.name} expects ${active.length} riders, ${seats} placed.` });
      }
      for (const e of active) {
        if (!placed.has(e.id)) out.push({ code: "rider_unplaced", roundId: round.id, entrantId: e.id, message: `${e.name} has no heat in ${round.name}.` });
      }
    } else if ((expected > 0 || !round.arranged) && seats !== expected) {
      out.push({ code: "round_size", roundId: round.id, message: `${round.name} expects ${expected} riders, ${seats} placed.` });
    }

    const limits = round.limits ?? { min: Math.max(1, (round.spec.minHeatSize ?? Math.max(2, round.spec.heatSize - 1))), max: round.spec.maxHeatSize ?? Math.min(10, round.spec.heatSize + 1) };
    const isFinal = round === draw.rounds[draw.rounds.length - 1];
    for (const heat of round.heats) {
      if (heat.bye) continue;
      const size = heat.slots.length;
      if (size > limits.max) out.push({ code: "heat_size", roundId: round.id, heatId: heat.id, message: `${heatLabel(heat)} has ${size} riders, maximum is ${limits.max}.` });
      else if (size < limits.min && !(isFinal && round.heats.length === 1 && size >= 2)) {
        out.push({ code: "heat_size", roundId: round.id, heatId: heat.id, message: `${heatLabel(heat)} has ${size} ${size === 1 ? "rider" : "riders"}, minimum is ${limits.min}.` });
      }
      heat.slots.forEach((s, i) => {
        if (!s.entrantId && !s.from) out.push({ code: "empty_seat", roundId: round.id, heatId: heat.id, slot: i, message: `${heatLabel(heat)} has an empty seat (seat ${i + 1}).` });
        if (s.entrantId && draw.entrants.find((e) => e.id === s.entrantId)?.withdrawn && s.modifier !== "DNS") {
          out.push({ code: "withdrawn_placed", roundId: round.id, heatId: heat.id, slot: i, entrantId: s.entrantId, message: `${nameOf(s.entrantId)} has withdrawn but still has a seat in ${heatLabel(heat)}.` });
        }
        if (s.from && !s.entrantId) {
          const src = draw.rounds.find((r) => r.id === s.from!.round);
          if (!src || (s.from!.heat > 0 && !src.heats.some((h) => h.index === s.from!.heat))) {
            out.push({ code: "orphan_seat", roundId: round.id, heatId: heat.id, slot: i, message: `Seat ${i + 1} of ${heatLabel(heat)} waits for a heat that no longer exists.` });
          }
        }
      });
    }

    const heatsOf = new Map<string, number[]>();
    round.heats.forEach((h) => h.slots.forEach((s) => s.entrantId && heatsOf.set(s.entrantId, [...(heatsOf.get(s.entrantId) ?? []), h.index])));
    for (const [id, heats] of heatsOf) {
      if (heats.length > 1) {
        const distinct = new Set(heats).size;
        const words = ["", "", "two", "three", "four", "five"];
        const where = distinct > 1 ? `${words[distinct] ?? distinct} heats of ${round.name}` : `the same heat of ${round.name} twice`;
        out.push({ code: "rider_twice", roundId: round.id, entrantId: id, message: `${nameOf(id)} is in ${where}.` });
      }
    }
  }
  return out;
}

// ── riders at a glance (the hand-place list) ───────────────────────────────────────────

/** Where every active rider sits in a round: heat ids. An empty list means the rider has no heat there. */
export function ridersInRound(draw: DivisionDraw, roundId: string): Array<{ entrantId: string; name: string; heats: string[] }> {
  const round = draw.rounds.find((r) => r.id === roundId);
  return draw.entrants
    .filter((e) => !e.withdrawn)
    .map((e) => ({
      entrantId: e.id,
      name: e.name,
      heats: (round?.heats ?? []).filter((h) => h.slots.some((s) => s.entrantId === e.id)).map((h) => h.id),
    }));
}

/** Places of earlier rounds that can be put into a seat (for "this seat waits for …"). */
export function placesBefore(draw: DivisionDraw, roundId: string): SlotSource[] {
  const at = draw.rounds.findIndex((r) => r.id === roundId);
  const out: SlotSource[] = [];
  for (const r of draw.rounds.slice(0, Math.max(0, at))) for (const h of r.heats) for (let p = 1; p <= h.slots.length; p++) out.push({ round: r.id, heat: h.index, place: p });
  return out;
}

export { sourceSlots };

// ── regenerate that leaves hand-arranged heats alone ───────────────────────────────────

export interface ArrangedSummary {
  heats: Array<{ heatId: string; label: string; roundId: string }>;
  rounds: Array<{ roundId: string; name: string }>;
}

/** Everything the organiser arranged by hand: the regenerate confirmation names it and asks before overriding. */
export function arrangedParts(draw: DivisionDraw): ArrangedSummary {
  return {
    heats: draw.rounds.flatMap((r) => r.heats.filter((h) => h.manualOverride && !(r.spec.seeding === "manual" && !r.arranged)).map((h) => ({ heatId: h.id, label: heatLabel(h), roundId: r.id }))),
    rounds: draw.rounds.filter((r) => r.arranged).map((r) => ({ roundId: r.id, name: r.name })),
  };
}

export interface KeepResult {
  draw: DivisionDraw;
  kept: string[];
  /** Hand-arranged heats that could not be kept (the heat no longer exists or the riders in it are no longer in the field). */
  dropped: string[];
}

/**
 * A regenerate that keeps the organiser's hand-arranged heats of the seed-fed round: `fresh` is the new draw made from the current
 * riders; each arranged heat of `old` that still exists with the same number of seats and only riders still in the field is copied
 * in, and the riders it displaced take the seats the copied riders would have had (so every rider keeps exactly one heat).
 * Structure changes (added or removed heats and seats) cannot be carried over, so those heats are listed as dropped.
 */
export function regenerateKeeping(old: DivisionDraw, fresh: DivisionDraw): KeepResult {
  const next = clone(fresh);
  const kept: string[] = [];
  const dropped: string[] = [];
  const active = new Set(next.entrants.filter((e) => !e.withdrawn).map((e) => e.id));
  for (const oldRound of old.rounds) {
    const newRound = next.rounds.find((r) => r.id === oldRound.id);
    const seedFed = oldRound.spec.entrantsFrom.every((s) => s.type === "seeds");
    for (const oh of oldRound.heats.filter((h) => h.manualOverride)) {
      const label = heatLabel(oh);
      const nh = newRound?.heats.find((h) => h.id === oh.id);
      const riders = oh.slots.map((s) => s.entrantId);
      const fits = nh && seedFed && nh.slots.length === oh.slots.length && riders.every((id) => id !== undefined && active.has(id)) && new Set(riders).size === riders.length;
      if (!fits || !nh || !newRound) {
        dropped.push(label);
        continue;
      }
      // riders this heat now brings in leave the seats the fresh deal gave them; the riders it displaces take those seats
      const incoming = new Set(riders as string[]);
      const displaced = nh.slots.filter((s) => s.entrantId && !incoming.has(s.entrantId));
      const vacated: Array<{ heat: DrawHeat; slot: Slot }> = [];
      for (const h of newRound.heats) {
        if (h === nh) continue;
        for (const s of h.slots) if (s.entrantId && incoming.has(s.entrantId)) vacated.push({ heat: h, slot: s });
      }
      vacated.forEach((v, i) => {
        const d = displaced[i];
        if (d) Object.assign(v.slot, { entrantId: d.entrantId, seed: d.seed });
      });
      nh.slots = oh.slots.map((s, i) => ({ ...makeSlot(next, i, {}), entrantId: s.entrantId, ...(s.seed !== undefined ? { seed: s.seed } : {}), manual: true }));
      nh.manualOverride = true;
      kept.push(label);
    }
  }
  return { draw: next, kept, dropped };
}
