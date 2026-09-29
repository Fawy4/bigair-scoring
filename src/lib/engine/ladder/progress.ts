import { expandFormat } from "./expand";
import { recompute, type RoundConflict } from "./recompute";
import type { ApplyResult, Conflict, DivisionDraw, DrawHeat, HeatResultInput, HeatStatus, Slot } from "./types";

const clone = <T>(x: T): T => structuredClone(x);

function findHeat(draw: DivisionDraw, heatId: string): DrawHeat {
  for (const r of draw.rounds) for (const h of r.heats) if (h.id === heatId) return h;
  throw new Error(`No heat ${heatId} in this draw.`);
}

const label = (h: DrawHeat) => (h.number !== null ? `Heat ${h.number}` : h.id);

function toConflict(draw: DivisionDraw, heatId: string, conflicts: RoundConflict[]): Conflict {
  const affected = conflicts.flatMap((c) => c.heats).map((h) => ({ heatId: h.id, status: h.status, manualOverride: h.manualOverride }));
  const names = affected.map((a) => label(findHeat(draw, a.heatId))).join(", ");
  return {
    type: "downstream_started",
    heatId,
    affectedHeats: affected,
    message: `Changing ${label(findHeat(draw, heatId))} would change later heats that have already started or been arranged by hand (${names}). Nothing was changed; decide manually.`,
  };
}

function settle(original: DivisionDraw, next: DivisionDraw, heatId: string): ApplyResult {
  const conflicts = recompute(next);
  if (conflicts.length) return { draw: original, conflict: toConflict(original, heatId, conflicts) };
  return { draw: next };
}

/**
 * Publishes (or corrects) a heat: writes places/totals into its slots, fills the arrival pools and deals every
 * round whose source heats are all published. A correction that would change a later heat that has already
 * started returns `conflict` and leaves the draw untouched (docs/04 §4).
 */
export function applyHeatResult(draw: DivisionDraw, heatId: string, result: HeatResultInput): ApplyResult {
  const target = findHeat(draw, heatId);
  if (target.bye) throw new Error(`${label(target)} is a bye: the rider goes on automatically.`);
  const riders = new Set(target.slots.flatMap((s) => (s.entrantId ? [s.entrantId] : [])));
  if (riders.size === 0) throw new Error(`${label(target)} has not been seeded yet.`);
  for (const r of result.ranked) if (!riders.has(r.entrantId)) throw new Error(`Rider ${r.entrantId} is not in heat ${heatId}.`);
  const next = clone(draw);
  next.results[heatId] = clone(result);
  findHeat(next, heatId).status = "published";
  return settle(draw, next, heatId);
}

/** Takes a published result back. Same conflict rule as a correction. */
export function unpublishHeat(draw: DivisionDraw, heatId: string): ApplyResult {
  findHeat(draw, heatId);
  const next = clone(draw);
  delete next.results[heatId];
  findHeat(next, heatId).status = "pending";
  return settle(draw, next, heatId);
}

/** "Seed now": deal the round with what has arrived; missing places become DNS walkovers. */
export function seedNow(draw: DivisionDraw, roundId: string): DivisionDraw {
  const round = draw.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error(`No round ${roundId} in this draw.`);
  if (round.spec.entrantsFrom.every((s) => s.type === "seeds")) throw new Error(`${round.name} is seeded from the entry list; there is nothing to wait for.`);
  const next = clone(draw);
  next.rounds.find((r) => r.id === roundId)!.seededNow = true;
  const conflicts = recompute(next);
  if (conflicts.length) throw new Error(`Cannot seed ${round.name} now: ${toConflict(draw, `${roundId}-H1`, conflicts).message}`);
  return next;
}

/** Confirms the draw: from now on a withdrawal becomes a walkover instead of a re-seed. */
export function lockDraw(draw: DivisionDraw): DivisionDraw {
  return { ...clone(draw), status: "locked" };
}

/** Test/UI hook: the live heat status comes from the database; the engine only needs to know whether a heat has started. */
export function setHeatStatus(draw: DivisionDraw, heatId: string, status: HeatStatus): DivisionDraw {
  const next = clone(draw);
  findHeat(next, heatId).status = status;
  return next;
}

/**
 * Withdrawal / no-show. Before the draw is locked (and nothing has started) the field is re-seeded without the
 * rider; afterwards the rider keeps the slot with modifier DNS and the heat still runs (docs/04 §4.7).
 */
export function withdrawEntrant(draw: DivisionDraw, entrantId: string): DivisionDraw {
  const entrant = draw.entrants.find((e) => e.id === entrantId);
  if (!entrant) throw new Error(`No entrant ${entrantId} in this draw.`);
  if (entrant.withdrawn) return clone(draw);
  const started = draw.rounds.some((r) => r.heats.some((h) => h.status !== "pending"));
  if (draw.status === "draft" && !started) {
    const entrants = draw.entrants.map((e) => (e.id === entrantId ? { ...e, withdrawn: true } : e));
    return expandFormat(draw.template, entrants, { ...draw.overrides, ...(draw.rngSeed !== undefined ? { rngSeed: draw.rngSeed } : {}) });
  }
  const next = clone(draw);
  next.entrants.find((e) => e.id === entrantId)!.withdrawn = true;
  for (const r of next.rounds) for (const h of r.heats) for (const s of h.slots) if (s.entrantId === entrantId) s.modifier = "DNS";
  recompute(next);
  return next;
}

/** A heat runs when at least `minRidersToRun` slots are not DNS. */
export function heatCanRun(draw: DivisionDraw, heatId: string): boolean {
  const h = findHeat(draw, heatId);
  const round = draw.rounds.find((r) => r.id === h.round)!;
  return h.slots.filter((s) => s.modifier !== "DNS").length >= round.spec.minRidersToRun;
}

interface SlotRef {
  heatId: string;
  slot: number;
}

/** Drag a rider into another slot before the heat starts (swaps the two riders). Both heats stop being auto-seeded. */
export function manualMove(draw: DivisionDraw, move: { from: SlotRef; to: SlotRef }): DivisionDraw {
  const next = clone(draw);
  const a = findHeat(next, move.from.heatId);
  const b = findHeat(next, move.to.heatId);
  for (const h of [a, b]) {
    if (h.status !== "pending") throw new Error(`${label(h)} has already started; riders cannot be moved.`);
    if (!next.rounds.find((r) => r.id === h.round)!.seeded) throw new Error(`${label(h)} has not been seeded yet; there are no riders to move.`);
  }
  const sa = a.slots[move.from.slot];
  const sb = b.slots[move.to.slot];
  if (!sa || !sb) throw new Error("No such slot.");
  const swap = (x: Slot, y: Slot) => {
    for (const k of ["entrantId", "seed", "from", "modifier", "history"] as const) {
      const tmp = x[k];
      (x as unknown as Record<string, unknown>)[k] = y[k];
      (y as unknown as Record<string, unknown>)[k] = tmp;
      if (x[k] === undefined) delete x[k];
      if (y[k] === undefined) delete y[k];
    }
  };
  swap(sa, sb);
  a.manualOverride = true;
  b.manualOverride = true;
  recompute(next);
  return next;
}

