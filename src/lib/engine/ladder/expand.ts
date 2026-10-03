import { RoundSpecSchema, type FormatTemplate, type RoundSpec } from "@/lib/schemas/format-template";
import { makeSlot, outcomeOf, refreshIdentifierWarnings, sourceSlots } from "./build";
import {
  generateDingleElimination,
  generateDoubleElimination,
  generatePoolsToFinal,
  generateQualifyingToFinals,
  generateRoundRobin,
  generateSingleElimination,
  generateSingleFinal,
} from "./generators";
import { ladderToDraw } from "./custom-ladder-draw";
import { recompute } from "./recompute";
import { dealByRule, dealRotate, defaultRngSeed, heatLimits, roundLayout, shuffleSeeds } from "./seeding";
import type { DivisionDraw, DrawHeat, DrawOverrides, DrawRound, Entrant, LadderWarning } from "./types";

/** Concrete rounds for `n` riders: the fixed list, or whatever the generator produces. */
function roundSpecsFor(template: FormatTemplate, n: number, warnings: LadderWarning[]): RoundSpec[] {
  const { min, max } = template.entrants;
  if (max !== null && n > max) {
    if (template.kind === "fixed") throw new Error(`${template.name} takes at most ${max} riders (this division has ${n}).`);
    warnings.push({ type: "above_template_max", message: `${n} riders is above the template maximum of ${max}.` });
  }
  if (n < min) {
    warnings.push({ type: "below_template_min", message: `${n} riders is below the template minimum of ${min}.` });
    if (template.kind === "fixed") {
      if (n > 10) throw new Error(`${template.name} needs at least ${min} riders (this division has ${n}).`);
      warnings.push({ type: "small_division_single_final", message: `All ${n} riders will ride one final.` });
      const last = template.rounds![template.rounds!.length - 1];
      return [
        RoundSpecSchema.parse({ id: "F", name: "Final", shortName: "F", heatSize: Math.max(n, 1), durationMin: last.durationMin, seeding: "sequential", advance: [{ places: "rest", to: "final_placing" }] }),
      ];
    }
  }
  if (template.kind === "fixed") return template.rounds!;
  const g = template.generator!;
  return withRoundBreaks(withRoundWarmUps(withRoundDurations(generateRounds(g, n), template.roundDurationMin), template.roundWarmUpMin), template.roundBreakAfterHeatMin);
}

/** The organiser's optional heat length per round replaces the generator's; unknown round ids are ignored. */
function withRoundDurations(specs: RoundSpec[], overrides: FormatTemplate["roundDurationMin"]): RoundSpec[] {
  if (!overrides) return specs;
  return specs.map((r) => (overrides[r.id] !== undefined ? { ...r, durationMin: overrides[r.id] } : r));
}

/** The organiser's optional warm-up per round replaces the division's; unknown round ids are ignored. */
function withRoundWarmUps(specs: RoundSpec[], overrides: FormatTemplate["roundWarmUpMin"]): RoundSpec[] {
  if (!overrides) return specs;
  return specs.map((r) => (overrides[r.id] !== undefined ? { ...r, warmUpMin: overrides[r.id] } : r));
}

/** The organiser's optional break after each heat per round replaces the division's; unknown round ids are ignored. */
function withRoundBreaks(specs: RoundSpec[], overrides: FormatTemplate["roundBreakAfterHeatMin"]): RoundSpec[] {
  if (!overrides) return specs;
  return specs.map((r) => (overrides[r.id] !== undefined ? { ...r, breakAfterHeatMin: overrides[r.id] } : r));
}

function generateRounds(g: NonNullable<FormatTemplate["generator"]>, n: number): RoundSpec[] {
  switch (g.type) {
    case "single_elimination":
      return generateSingleElimination(n, g.params);
    case "dingle_elimination":
      return generateDingleElimination(n, g.params);
    case "pools_to_final":
      return generatePoolsToFinal(n, g.params);
    case "double_elimination":
      return generateDoubleElimination(n, g.params);
    case "qualifying_to_finals":
      return generateQualifyingToFinals(n, g.params);
    case "round_robin":
      return generateRoundRobin(n, g.params);
    case "single_final":
      return generateSingleFinal(n, g.params);
  }
}

function eliminatesNobodyWarnings(round: DrawRound): LadderWarning[] {
  const real = round.heats.filter((h) => !h.bye);
  const eliminates = (h: DrawHeat) => Array.from({ length: h.slots.length }, (_, i) => outcomeOf(round.spec, i + 1)).filter((o) => o === "eliminated").length;
  if (round.spec.crossHeat || !real.some((h) => eliminates(h) > 0)) return [];
  const advancing = Math.max(...real.map((h) => h.slots.length - eliminates(h)));
  const suggested = Math.floor(round.expectedEntrants / (advancing + 1));
  return real
    .filter((h) => eliminates(h) === 0)
    .map((h) => ({
      type: "eliminates_nobody" as const,
      round: round.id,
      heatId: h.id,
      message: `Heat ${h.number} eliminates nobody (${h.slots.length} riders, top ${advancing} advance)`,
      suggestion:
        suggested >= 1 && suggested < round.heats.length
          ? `Set heatCountOverride for ${round.shortName} to ${suggested} so every heat eliminates somebody.`
          : `Set heatCountOverride for ${round.shortName} to change the number of heats.`,
    }));
}

/**
 * A heat above the maximum, or below the minimum in a round with several heats, means the three sizing numbers cannot be kept
 * for this many riders (the minimum wins). Only rounds that follow the sizing rule are checked.
 */
function heatSizeWarnings(round: DrawRound): LadderWarning[] {
  const spec = round.spec;
  if (spec.uneven !== "minimum_riders") return [];
  const { min, max } = heatLimits(spec.heatSize, spec.minHeatSize, spec.maxHeatSize);
  const riding = round.heats.filter((h) => !h.bye);
  return riding.flatMap((h) => {
    const size = h.slots.length;
    const why = size > max ? `is more than the maximum of ${max} per heat` : size < min && riding.length > 1 ? `is fewer than the minimum of ${min} per heat` : null;
    return why
      ? [
          {
            type: "heat_size_limits" as const,
            round: round.id,
            heatId: h.id,
            message: `Heat ${h.number ?? h.id} has ${size} riders, which ${why}: with ${round.expectedEntrants} riders in ${round.shortName} the target, minimum and maximum cannot all be kept.`,
            suggestion: "Change the target, minimum or maximum riders per heat.",
          },
        ]
      : [];
  });
}

/**
 * Turns a template and the entry list (in seed order) into a full draw: rounds, heats, slots (riders or
 * placeholders), division-wide heat numbers, vest colours, warnings. docs/04 §3.
 */
export function expandFormat(template: FormatTemplate, entrants: Entrant[], overrides: DrawOverrides = {}): DivisionDraw {
  if (template.kind === "ladder") return ladderToDraw(template, entrants, overrides);
  const active = entrants.filter((e) => !e.withdrawn);
  if (active.length === 0) throw new Error("A division needs at least one rider.");
  const warnings: LadderWarning[] = [];
  const specs = roundSpecsFor(template, active.length, warnings);

  for (const s of specs) {
    if (s.entrantsFrom.some((x) => x.type === "seeds") && s.entrantsFrom.some((x) => x.type === "round_places")) {
      throw new Error(`Round ${s.id} mixes the seed list with earlier rounds, which is not supported yet.`);
    }
  }

  // Seed order (a random draw shuffles the entry list once and stores the seed).
  let ordered = active;
  let rngSeed = overrides.rngSeed;
  if (specs.some((s) => s.seeding === "random" && s.entrantsFrom.every((x) => x.type === "seeds"))) {
    if (rngSeed === undefined) {
      rngSeed = defaultRngSeed(active.map((e) => e.id));
      warnings.push({ type: "random_seed_defaulted", message: `No shuffle seed was given, so seed ${rngSeed} (from the entry list) was used and stored.` });
    }
    ordered = shuffleSeeds(active, rngSeed);
  }

  const draw: DivisionDraw = {
    templateId: template.id,
    template,
    overrides: { ...overrides },
    status: "draft",
    entrants: entrants.map((e) => ({ ...e })),
    seedOrder: ordered.map((e) => e.id),
    ...(rngSeed !== undefined ? { rngSeed } : {}),
    rounds: [],
    results: {},
    warnings,
  };

  // Structure: heat counts and sizes of every round, with placeholder slots.
  specs.forEach((spec, ri) => {
    const seedFed = spec.entrantsFrom.every((s) => s.type === "seeds");
    const expectedEntrants = seedFed ? ordered.length : sourceSlots(draw.rounds, spec).length;
    const layout = roundLayout(expectedEntrants, { ...spec, heatCountOverride: overrides.heatCountOverride?.[spec.id] ?? spec.heatCountOverride });
    const isLastRound = ri === specs.length - 1;
    const heats: DrawHeat[] = layout.capacities.map((cap, i) => ({
      id: `${spec.id}-H${i + 1}`,
      uid: `${spec.id}-H${i + 1}`,
      round: spec.id,
      index: i + 1,
      number: null,
      bye: cap === 1 && !isLastRound,
      ...(template.heatNames?.[`${spec.id}-H${i + 1}`] ? { name: template.heatNames[`${spec.id}-H${i + 1}`] } : {}),
      slots: Array.from({ length: cap }, (_, k) => makeSlot(draw, k, {})),
      durationMin: spec.durationMin ?? template.timing.defaultHeatMin,
      warmUpMin: spec.warmUpMin ?? template.timing.warmUpBeforeHeatMin ?? 0,
      breakAfterHeatMin: spec.breakAfterHeatMin ?? template.timing.defaultBreakAfterHeatMin,
      breakAfterRoundMin: spec.breakAfterRoundMin ?? template.timing.defaultBreakAfterRoundMin,
      roundLast: false,
      status: "pending",
      manualOverride: false,
    }));
    const round: DrawRound = { id: spec.id, name: template.roundNames?.[spec.id] ?? spec.name, shortName: spec.shortName, spec, expectedEntrants, heats, seeded: false, seededNow: false, arrivals: [] };
    draw.rounds.push(round);

    if (seedFed) {
      // "rotate" (round robin): meet riders you have not yet ridden against; the first round is dealt like "snake"
      const prior = draw.rounds.filter((r) => r.seeded).flatMap((r) => r.heats.map((h) => h.slots.flatMap((sl) => (sl.entrantId ? [sl.entrantId] : []))));
      const dealt = spec.seeding === "rotate" && prior.length > 0 ? dealRotate(ordered, layout.capacities, prior) : dealByRule(ordered, layout, spec.seeding);
      round.heats.forEach((h, i) => {
        h.slots = dealt[i].map((e, k) => makeSlot(draw, k, { entrantId: e.id, seed: ordered.indexOf(e) + 1 }));
        h.manualOverride = spec.seeding === "manual";
      });
      round.seeded = true;
    }
  });

  // Division-wide heat numbers (byes have none) and the last riding heat of each round.
  let number = 1;
  for (const r of draw.rounds) {
    for (const h of r.heats) h.number = h.bye ? null : number++;
    const riding = r.heats.filter((h) => !h.bye);
    if (riding.length) riding[riding.length - 1].roundLast = true;
    warnings.push(...eliminatesNobodyWarnings(r), ...heatSizeWarnings(r));
    // the smallest and largest heat the generator made for this round: the whole-ladder check (hand editing) warns outside them
    const sizes = riding.map((h) => h.slots.length);
    if (sizes.length) {
      const lim = heatLimits(r.spec.heatSize, r.spec.minHeatSize, r.spec.maxHeatSize);
      r.limits = { min: Math.min(lim.min, ...sizes), max: Math.max(lim.max, ...sizes) };
    }
  }

  recompute(draw); // byes advance, rounds whose sources are all byes get seeded, placeholders, identifier warnings
  refreshIdentifierWarnings(draw);
  return draw;
}
