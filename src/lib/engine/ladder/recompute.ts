// Derives every downstream round (arrival pools, seeded slots) from the published results.
// Internal: expandFormat, applyHeatResult, seedNow, withdrawEntrant and manualMove all go through here.
import type { RoundSpec } from "@/lib/schemas/format-template";
import {
  crossComplete,
  crossTier,
  isSeedFed,
  makeSlot,
  orderArrivals,
  rankAcross,
  refreshIdentifierWarnings,
  resultOf,
  roundComplete,
  sameSource,
  seedNumber,
  sourceRoundIds,
  sourceSlots,
} from "./build";
import { dealByRule, roundLayout } from "./seeding";
import type { Arrival, DivisionDraw, DrawHeat, DrawRound, HistoryEntry, Slot } from "./types";

export interface RoundConflict {
  round: string;
  heats: DrawHeat[];
}

export const effectiveSpec = (draw: DivisionDraw, round: DrawRound): RoundSpec => ({
  ...round.spec,
  heatCountOverride: draw.overrides.heatCountOverride?.[round.id] ?? round.spec.heatCountOverride,
});

function slotSignature(s: Slot): string {
  const from = s.from ? `${s.from.round}.${s.from.heat}.${s.from.place}` : "";
  if (s.entrantId) return `e:${s.entrantId}:${s.modifier ?? ""}:${(s.history ?? []).map((h) => h.total).join(",")}`;
  return `${s.modifier === "DNS" ? "w" : "p"}:${from}`;
}
const heatSignature = (slots: Slot[]) => slots.map(slotSignature).join("|");

function arrivalFrom(draw: DivisionDraw, from: DrawRound, h: DrawHeat, e: { entrantId: string; place: number; total: number | null; tieKeys?: number[]; modifier?: string }, implicit: boolean): Arrival {
  const slot = h.slots.find((s) => s.entrantId === e.entrantId);
  const tieKeys = e.tieKeys ?? [];
  const prior = slot?.history ?? [];
  const history: HistoryEntry[] = implicit ? prior : [...prior, { round: from.id, heat: h.index, total: e.total, tieKeys, place: e.place, size: h.slots.length }];
  return {
    entrantId: e.entrantId,
    originalSeed: seedNumber(draw, e.entrantId),
    from: { round: from.id, heat: h.index, place: e.place },
    place: e.place,
    total: e.total,
    tieKeys,
    ...(e.modifier === "DNS" || slot?.modifier === "DNS" ? { modifier: "DNS" as const } : {}),
    history,
  };
}

/** Riders that have reached `round` so far, from published results (and byes). Each rider appears once. */
export function collectArrivals(draw: DivisionDraw, round: DrawRound): Arrival[] {
  const out: Arrival[] = [];
  const seen = new Set<string>();
  const push = (a: Arrival) => {
    if (a.entrantId) {
      if (seen.has(a.entrantId)) return;
      seen.add(a.entrantId);
    }
    out.push(a);
  };
  for (const src of round.spec.entrantsFrom) {
    if (src.type !== "round_places") continue;
    const from = draw.rounds.find((r) => r.id === src.round)!;
    const cross = from.spec.crossHeat;
    if (cross) {
      const tier = crossTier(cross, round.id);
      if (!tier || !crossComplete(draw, from)) continue;
      rankAcross(draw, from)
        .slice(tier.start, tier.start + tier.count)
        .forEach((r, i) =>
          push({
            entrantId: r.entrantId,
            originalSeed: r.seed,
            from: { round: from.id, heat: 0, place: tier.start + i + 1 },
            place: tier.start + i + 1,
            total: r.combined,
            tieKeys: r.tieKeys,
            ...(r.modifier ? { modifier: r.modifier } : {}),
            history: r.history,
          }),
        );
      continue;
    }
    for (const h of from.heats) {
      const res = resultOf(draw, h);
      if (!res) continue;
      for (const e of res.ranked) if (src.places.includes(e.place)) push(arrivalFrom(draw, from, h, e, !draw.results[h.id]));
    }
  }
  return out;
}

const walkover = (from: Arrival["from"]): Arrival => ({ originalSeed: Number.MAX_SAFE_INTEGER, from, place: from.place, total: null, tieKeys: [], modifier: "DNS", history: [] });

function slotFromArrival(draw: DivisionDraw, index: number, a: Arrival): Slot {
  const entrant = a.entrantId ? draw.entrants.find((e) => e.id === a.entrantId) : undefined;
  const dns = a.modifier === "DNS" || entrant?.withdrawn;
  return makeSlot(draw, index, {
    ...(a.entrantId ? { entrantId: a.entrantId, seed: a.originalSeed, history: a.history } : {}),
    from: a.from,
    ...(dns ? { modifier: "DNS" as const } : {}),
  });
}

/** Deals the arrivals (best first, walkovers last) into the round's heats. `null` = a hand-arranged heat no longer fits. */
function dealArrivals(draw: DivisionDraw, round: DrawRound, list: Arrival[]): Slot[][] | null {
  const spec = effectiveSpec(draw, round);
  const layout = roundLayout(round.expectedEntrants, spec);
  if (layout.capacities.length !== round.heats.length) throw new Error(`Round ${round.id} changed its number of heats`);
  const pinned = new Set(round.heats.flatMap((h, i) => (h.manualOverride && h.status === "pending" ? [i] : [])));
  if (pinned.size === 0) {
    return dealByRule(list, layout, spec.seeding).map((heat) => heat.map((a, i) => slotFromArrival(draw, i, a)));
  }
  const pinnedIds = new Set([...pinned].flatMap((i) => round.heats[i].slots.flatMap((s) => (s.entrantId ? [s.entrantId] : []))));
  const present = new Set(list.flatMap((a) => (a.entrantId ? [a.entrantId] : [])));
  for (const id of pinnedIds) if (!present.has(id)) return null;
  const free = round.heats.map((_, i) => i).filter((i) => !pinned.has(i));
  const rest = list.filter((a) => !(a.entrantId && pinnedIds.has(a.entrantId)));
  const dealt = dealByRule(rest, { capacities: free.map((i) => layout.capacities[i]), byes: 0 }, spec.seeding);
  return round.heats.map((h, i) => (pinned.has(i) ? h.slots : dealt[free.indexOf(i)].map((a, k) => slotFromArrival(draw, k, a))));
}

/** Placeholder slots ("Winner H2") in provisional order. */
function provisionalSlots(draw: DivisionDraw, round: DrawRound): Slot[][] {
  const spec = effectiveSpec(draw, round);
  const layout = roundLayout(round.expectedEntrants, spec);
  const found = sourceSlots(draw.rounds, round.spec).slice(0, round.expectedEntrants);
  const sources = spec.seeding === "adjacent" ? orderAdjacent(draw, found, (x) => x) : found;
  return dealByRule(sources, layout, spec.seeding).map((heat) => heat.map((from, i) => makeSlot(draw, i, { from })));
}

/** Riders (or placeholder sources) in the order they left their heats: source round, then heat, then place (for "adjacent" pairing). */
function orderAdjacent<T>(draw: DivisionDraw, list: T[], source: (item: T) => { round: string; heat: number; place: number }): T[] {
  const order = (id: string) => draw.rounds.findIndex((r) => r.id === id);
  return [...list].sort((a, b) => {
    const x = source(a);
    const y = source(b);
    return order(x.round) - order(y.round) || x.heat - y.heat || x.place - y.place;
  });
}

function walkoversFor(draw: DivisionDraw, round: DrawRound, arrivals: Arrival[]): Arrival[] {
  const missing = sourceSlots(draw.rounds, round.spec).filter((s) => !arrivals.some((a) => sameSource(a.from, s)));
  const list = missing.map(walkover);
  const src = sourceRoundIds(round.spec)[0];
  while (arrivals.length + list.length < round.expectedEntrants) list.push(walkover({ round: src, heat: 0, place: list.length + 1 }));
  return list;
}

/**
 * A round whose seats name their own sources (custom ladders and hand-arranged rounds): the seat that names "1st of Heat 3" takes
 * whoever won Heat 3 once that heat is published, and goes back to the placeholder if the result is taken back. Seats put there by
 * hand (`manual`) and seats that name no source are never touched. A heat that has started and would change is reported as a conflict.
 */
function recomputeExplicit(draw: DivisionDraw, round: DrawRound): RoundConflict[] {
  const conflicts: DrawHeat[] = [];
  for (const heat of round.heats) {
    const next = heat.slots.map((slot): Slot => {
      if (slot.manual || !slot.from || slot.from.heat === 0) return slot;
      const source = draw.rounds.find((r) => r.id === slot.from!.round)?.heats.find((h) => h.index === slot.from!.heat);
      const res = source ? resultOf(draw, source) : undefined;
      const won = res?.ranked.find((e) => e.place === slot.from!.place);
      if (!won) {
        if (!slot.entrantId) return slot;
        const { entrantId: _e, seed: _s, history: _h, modifier: _m, ...rest } = slot;
        void _e; void _s; void _h; void _m;
        return { ...rest };
      }
      const entrant = draw.entrants.find((e) => e.id === won.entrantId);
      const prior = source!.slots.find((s) => s.entrantId === won.entrantId)?.history ?? [];
      const history = draw.results[source!.id] ? [...prior, { round: source!.round, heat: source!.index, total: won.total, tieKeys: won.tieKeys ?? [], place: won.place, size: source!.slots.length }] : prior;
      const dns = won.modifier === "DNS" || entrant?.withdrawn;
      const { modifier: _old, ...rest } = slot;
      void _old;
      return makeSlot(draw, slot.index, { ...rest, entrantId: won.entrantId, seed: seedNumber(draw, won.entrantId), history, ...(dns ? { modifier: "DNS" as const } : {}) });
    });
    if (heatSignature(next) === heatSignature(heat.slots)) continue;
    if (heat.status !== "pending") conflicts.push(heat);
    else heat.slots = next;
  }
  round.seeded = round.heats.every((h) => h.slots.every((s) => s.entrantId));
  return conflicts.length ? [{ round: round.id, heats: conflicts }] : [];
}

/**
 * Brings every non-seed-fed round in line with the published results. Mutates `draw` (callers pass a clone).
 * A round is (re)dealt when all its source heats are published or "Seed now" was pressed; otherwise it shows
 * placeholders. A round with started heats is never changed: the difference is returned as a conflict.
 */
export function recompute(draw: DivisionDraw): RoundConflict[] {
  const conflicts: RoundConflict[] = [];
  for (const round of draw.rounds) {
    if (round.explicit) {
      conflicts.push(...recomputeExplicit(draw, round));
      continue;
    }
    if (isSeedFed(round.spec)) continue;
    const arrivals = collectArrivals(draw, round);
    round.arrivals = arrivals;
    const ready = sourceRoundIds(round.spec).every((id) => roundComplete(draw, draw.rounds.find((r) => r.id === id)!));
    const wantSeeded = ready || round.seededNow;

    let next: Slot[][] | null;
    if (wantSeeded) {
      const walkovers = walkoversFor(draw, round, arrivals);
      const ordered = (effectiveSpec(draw, round).seeding === "adjacent" ? orderAdjacent(draw, [...arrivals, ...walkovers], (a) => a.from) : [...orderArrivals(arrivals, round.spec.reseed), ...walkovers]).slice(0, round.expectedEntrants);
      next = dealArrivals(draw, round, ordered);
    } else {
      next = provisionalSlots(draw, round);
    }

    const changedHeats = (target: Slot[][]) => round.heats.filter((h, i) => heatSignature(h.slots) !== heatSignature(target[i]));
    if (next === null) {
      conflicts.push({ round: round.id, heats: round.heats.filter((h) => h.manualOverride) });
      continue;
    }
    if (changedHeats(next).length === 0) {
      round.seeded = wantSeeded;
      continue;
    }
    if (round.heats.some((h) => h.status !== "pending")) {
      conflicts.push({ round: round.id, heats: round.heats.filter((h) => h.status !== "pending" || h.manualOverride) });
      continue;
    }
    round.heats.forEach((h, i) => (h.slots = next![i]));
    round.seeded = wantSeeded;
  }
  refreshIdentifierWarnings(draw);
  return conflicts;
}

