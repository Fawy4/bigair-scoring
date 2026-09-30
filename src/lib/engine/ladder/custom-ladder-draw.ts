// Custom ladder ⇄ draw (Phase 4b). A finished ladder becomes exactly the records a generated format makes (rounds, heats, slots with
// placeholders), so scoring, the timetable and the public pages need no special case. Any generated format can be loaded into
// the builder ("Start from Knockout and edit").
import { RoundSpecSchema, type FormatTemplate, type RoundSpec } from "@/lib/schemas/format-template";
import { CustomLadderSchema, type CustomLadder, type LadderRound, type SeatSource } from "@/lib/schemas/custom-ladder";
import { makeSlot, refreshIdentifierWarnings } from "./build";
import { advancingPlaces, rankTarget, receives, roundIndex } from "./custom-ladder";
import { limitsOf } from "./custom-ladder-check";
import { recompute } from "./recompute";
import type { DivisionDraw, DrawHeat, DrawOverrides, DrawRound, Entrant, Slot } from "./types";

export class LadderConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LadderConvertError";
  }
}

/** A format template that carries a custom ladder, for saving as an organisation format preset. */
export function ladderTemplate(ladder: CustomLadder, meta: { id?: string; name: string; description?: string; basedOn?: string; timing?: Partial<FormatTemplate["timing"]>; vestColours?: string[] }): FormatTemplate {
  const parsed = CustomLadderSchema.parse(ladder);
  return {
    id: meta.id ?? "custom-ladder",
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.basedOn ? { basedOn: meta.basedOn } : {}),
    entrants: { min: 2, max: null },
    vestColours: meta.vestColours ?? ["red", "yellow", "blue", "green", "white", "black", "orange", "pink", "purple", "grey"],
    timing: { defaultHeatMin: 10, defaultBreakAfterHeatMin: 3, defaultBreakAfterRoundMin: 5, warmUpBeforeHeatMin: 0, ...meta.timing },
    kind: "ladder",
    ladder: parsed,
    placings: { eliminated: "shared", finalHeatIsRanking: true },
  };
}

const typical = (sizes: number[]): number => {
  if (sizes.length === 0) return 3;
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
};

/** The round's rules as the progression engine reads them: where each place goes, and which places arrive from which round. */
function specFor(ladder: CustomLadder, round: LadderRound, ri: number, template: FormatTemplate): RoundSpec {
  const last = ri === ladder.rounds.length - 1;
  const { min, max } = limitsOf(ladder, round);
  const heatSize = Math.min(10, Math.max(1, typical(round.heats.map((h) => h.seats.length))));
  const byTarget = new Map<string, number[]>();
  if (!last) {
    for (let p = 1; p <= round.advance; p++) {
      const target = rankTarget(ladder, round.id, p);
      if (target) byTarget.set(target, [...(byTarget.get(target) ?? []), p]);
    }
  }
  const sources = new Map<string, Set<number>>();
  ladder.rounds.slice(0, ri).forEach((from) => {
    for (const p of advancingPlaces(ladder, from.id)) {
      if (rankTarget(ladder, from.id, p.place) === round.id) sources.set(from.id, (sources.get(from.id) ?? new Set()).add(p.place));
    }
  });
  return RoundSpecSchema.parse({
    id: round.id,
    name: round.name,
    shortName: round.shortName,
    heatSize,
    minHeatSize: Math.min(min, heatSize),
    maxHeatSize: Math.max(max, heatSize),
    ...(round.durationMin !== undefined ? { durationMin: round.durationMin } : {}),
    ...(round.warmUpMin !== undefined ? { warmUpMin: round.warmUpMin } : {}),
    ...(round.breakAfterHeatMin !== undefined ? { breakAfterHeatMin: round.breakAfterHeatMin } : {}),
    ...(round.breakAfterRoundMin !== undefined ? { breakAfterRoundMin: round.breakAfterRoundMin } : {}),
    entrantsFrom: ri === 0 ? [{ type: "seeds" }] : [...sources.entries()].map(([from, places]) => ({ type: "round_places", round: from, places: [...places].sort((a, b) => a - b) })),
    seeding: "manual",
    uneven: "minimum_riders",
    advance: [...[...byTarget.entries()].map(([to, places]) => ({ places, to })), { places: "rest", to: last ? "final_placing" : "eliminated" }],
    minRidersToRun: 1,
  }) as RoundSpec;
  void template;
}

/**
 * Makes the draw of a custom ladder for these riders (in seed order). Seeds and riders fill the first round, every other seat
 * waits for the place it names ("1st H1") until that heat is published.
 */
export function ladderToDraw(template: FormatTemplate, entrants: Entrant[], overrides: DrawOverrides = {}): DivisionDraw {
  if (!template.ladder) throw new LadderConvertError("This format has no custom ladder.");
  const ladder = template.ladder;
  const active = entrants.filter((e) => !e.withdrawn);
  if (active.length === 0) throw new Error("A division needs at least one rider.");
  const draw: DivisionDraw = {
    templateId: template.id,
    template,
    overrides: { ...overrides },
    status: "draft",
    entrants: entrants.map((e) => ({ ...e })),
    seedOrder: active.map((e) => e.id),
    rounds: [],
    results: {},
    warnings: [],
  };
  const arriving = receives(ladder);
  let number = 1;
  ladder.rounds.forEach((lr, ri) => {
    const spec = specFor(ladder, lr, ri, template);
    const last = ri === ladder.rounds.length - 1;
    const { min, max } = limitsOf(ladder, lr);
    const heats: DrawHeat[] = lr.heats.map((lh, hi) => {
      const id = `${lr.id}-H${hi + 1}`;
      const bye = lh.seats.length === 1 && !last;
      const slots: Slot[] = lh.seats.map((s, k) => {
        if (s.type === "seed") {
          const e = active[s.seed - 1];
          return makeSlot(draw, k, e ? { entrantId: e.id, seed: s.seed } : {});
        }
        if (s.type === "rider") {
          const at = active.findIndex((e) => e.id === s.entrantId);
          return makeSlot(draw, k, at >= 0 ? { entrantId: s.entrantId, seed: at + 1 } : {});
        }
        if (s.type === "place") return makeSlot(draw, k, { from: { round: s.round, heat: s.heat, place: s.place } });
        return makeSlot(draw, k, {});
      });
      return {
        id,
        uid: id,
        round: lr.id,
        index: hi + 1,
        number: bye ? null : number++,
        bye,
        ...(lh.name ? { name: lh.name } : {}),
        slots,
        durationMin: lr.durationMin ?? template.timing.defaultHeatMin,
        warmUpMin: lr.warmUpMin ?? template.timing.warmUpBeforeHeatMin ?? 0,
        breakAfterHeatMin: lr.breakAfterHeatMin ?? template.timing.defaultBreakAfterHeatMin,
        breakAfterRoundMin: lr.breakAfterRoundMin ?? template.timing.defaultBreakAfterRoundMin,
        roundLast: false,
        status: "pending",
        manualOverride: false,
      };
    });
    const riding = heats.filter((h) => !h.bye);
    if (riding.length) riding[riding.length - 1].roundLast = true;
    const round: DrawRound = {
      id: lr.id,
      name: lr.name,
      shortName: lr.shortName,
      spec,
      expectedEntrants: ri === 0 ? active.length : (arriving.get(lr.id) ?? 0),
      heats,
      seeded: ri === 0,
      seededNow: false,
      arrivals: [],
      explicit: true,
      limits: { min, max },
    };
    draw.rounds.push(round);
  });
  recompute(draw);
  refreshIdentifierWarnings(draw);
  return draw;
}

/** The seat source a slot of a generated draw stands for. */
function sourceOfSlot(slot: Slot, roundId: string, seedFed: boolean): SeatSource {
  if (slot.from) {
    if (slot.from.heat === 0) throw new LadderConvertError("This format ranks riders across all heats of a round, which the builder cannot show yet. Pick a knockout-style format to start from.");
    return { type: "place", round: slot.from.round, heat: slot.from.heat, place: slot.from.place };
  }
  if (slot.seed !== undefined && seedFed) return { type: "seed", seed: slot.seed };
  if (slot.entrantId && seedFed) return { type: "rider", entrantId: slot.entrantId };
  void roundId;
  return { type: "empty" };
}

/**
 * "Start from Knockout and edit": any generated draw becomes a custom ladder. Structure only: from here the seats follow the
 * places they name (winners of H1 and H2 meet …), whatever the generator's own dealing rule was.
 */
export function drawToLadder(draw: DivisionDraw): CustomLadder {
  const first = draw.rounds[0];
  if (!first) throw new LadderConvertError("The draw has no rounds.");
  const target = Math.min(10, Math.max(1, first.spec.heatSize));
  const min = first.spec.minHeatSize ?? Math.max(1, Math.min(target, target - 1));
  const max = first.spec.maxHeatSize ?? Math.min(10, target + 1);
  const rounds: LadderRound[] = draw.rounds.map((r, ri) => {
    const seedFed = ri === 0;
    const last = ri === draw.rounds.length - 1;
    // every place that goes on to another round (a "rest" rule with a round as target sends all the places not named elsewhere on)
    const biggest = Math.max(1, ...r.heats.map((h) => h.slots.length));
    const named = new Set(r.spec.advance.flatMap((a) => (a.places === "rest" ? [] : a.places)));
    const advancing = r.spec.advance.flatMap((a) => {
      if (a.to === "eliminated" || a.to === "final_placing") return [];
      return a.places === "rest" ? Array.from({ length: biggest }, (_, i) => i + 1).filter((p) => !named.has(p)) : a.places;
    });
    const heats = r.heats.map((h) => ({ ...(h.name ? { name: h.name } : {}), seats: h.slots.map((s) => sourceOfSlot(s, r.id, seedFed)) }));
    const limits = r.limits ?? { min, max };
    const h0 = r.heats[0];
    return {
      id: r.id,
      name: r.name,
      shortName: r.shortName,
      heats,
      advance: last ? 0 : advancing.length ? Math.max(...advancing) : 0,
      ...(limits.min !== min ? { minHeatSize: limits.min } : {}),
      ...(limits.max !== max ? { maxHeatSize: limits.max } : {}),
      ...(h0 ? { durationMin: h0.durationMin, breakAfterHeatMin: h0.breakAfterHeatMin, breakAfterRoundMin: h0.breakAfterRoundMin, ...(h0.warmUpMin ? { warmUpMin: h0.warmUpMin } : {}) } : {}),
    };
  });
  return CustomLadderSchema.parse({ targetHeatSize: target, minHeatSize: Math.min(min, target), maxHeatSize: Math.max(max, target), rounds });
}

export { roundIndex };
