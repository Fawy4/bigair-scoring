import type { FormatTemplateInput, RoundSpecInput } from "@/lib/schemas/format-template";
import { expandFormat } from "@/lib/engine/ladder/expand";
import { heatLimits } from "@/lib/engine/ladder/seeding";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";
import { copy } from "@/lib/ui-copy";
import { newRound } from "./custom";

// The visual builder edits `rounds` of a fixed template. Where riders come from is never typed: it is worked out from where the
// earlier rounds send each place (`relink`), so the two can never disagree.

type Round = RoundSpecInput;
type Template = FormatTemplateInput & { rounds?: Round[] };

const PLACES = 10;
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** The rounds of a template (empty for a generated ladder). */
export const roundsOf = (t: Template): Round[] => (t.rounds ?? []) as Round[];

/** How many places of a round can exist: the biggest heat it can have (at most 10). */
export function placeCount(r: Round): number {
  const target = r.heatSize ?? 4;
  return Math.min(PLACES, Math.max(target, r.maxHeatSize ?? target + 1));
}

/** Where places 1…placeCount go, and where everybody after them goes ("rest"). */
export function placeTargets(r: Round): { places: string[]; rest: string } {
  const advance = r.advance ?? [];
  const rest = advance.find((a) => a.places === "rest")?.to ?? "eliminated";
  const to = (place: number) => {
    for (const rule of advance) if (rule.places !== "rest" && rule.places.includes(place)) return rule.to;
    return rest;
  };
  return { places: range(1, placeCount(r)).map(to), rest };
}

/** Rebuilds a round's advance rules from a place → target list (places with the same target are grouped) and the target of the rest. */
export function advanceFromTargets(places: string[], rest: string): Array<{ places: number[] | "rest"; to: string }> {
  const order: string[] = [];
  const byTarget = new Map<string, number[]>();
  places.forEach((to, i) => {
    if (to === rest) return; // the rest rule already covers it
    if (!byTarget.has(to)) order.push(to);
    byTarget.set(to, [...(byTarget.get(to) ?? []), i + 1]);
  });
  return [...order.map((to) => ({ places: byTarget.get(to)!, to })), { places: "rest" as const, to: rest }];
}

/** Works out `entrantsFrom` of every round from the places the earlier rounds send to it; the first round rides from the seed list. */
export function relink(t: Template): Template {
  const rounds = roundsOf(t);
  const linked = rounds.map((r, i) => {
    if (r.crossHeat) return r;
    const sources: Array<{ type: "round_places"; round: string; places: number[] }> = [];
    for (const src of rounds.slice(0, i)) {
      if (src.crossHeat) continue;
      const { places, rest } = placeTargets(src);
      const named = places.map((to, k) => (to === r.id ? k + 1 : 0)).filter(Boolean);
      const restPlaces = rest === r.id ? range(places.length + 1, PLACES) : [];
      const all = [...named, ...restPlaces];
      if (all.length > 0) sources.push({ type: "round_places", round: src.id, places: all });
    }
    return { ...r, entrantsFrom: sources.length > 0 ? sources : [{ type: "seeds" as const }] };
  });
  return { ...t, rounds: linked };
}

/** Sets where one place (or "rest") of a round goes. */
export function setPlaceTarget(t: Template, roundId: string, place: number | "rest", to: string): Template {
  const rounds = roundsOf(t).map((r) => {
    if (r.id !== roundId) return r;
    const cur = placeTargets(r);
    const places = [...cur.places];
    let rest = cur.rest;
    if (place === "rest") rest = to;
    else places[place - 1] = to;
    return { ...r, advance: advanceFromTargets(places, rest) };
  });
  return relink({ ...t, rounds });
}

/** Adds a round after `afterId` (null = at the start). The round before it sends its 1st and 2nd to it; the new round's own places go out. */
export function addRoundAfter(t: Template, afterId: string | null): Template {
  const rounds = roundsOf(t);
  const at = afterId === null ? 0 : rounds.findIndex((r) => r.id === afterId) + 1;
  const taken = new Set(rounds.map((r) => r.id));
  let n = 1;
  while (taken.has(`R${n}`)) n++;
  const fresh = { ...newRound([...taken], null), id: `R${n}`, name: `Round ${n}`, shortName: `R${n}`, uneven: "minimum_riders", advance: [{ places: "rest", to: "eliminated" }] } as unknown as Round;
  const next = [...rounds.slice(0, at), fresh, ...rounds.slice(at)];
  const before = next[at - 1];
  if (before && !before.crossHeat) {
    const cur = placeTargets(before);
    const places = cur.places.map((to, i) => (i < 2 && to !== "eliminated" ? (fresh.id as string) : to));
    if (!places.includes(fresh.id as string)) places[0] = fresh.id as string;
    next[at - 1] = { ...before, advance: advanceFromTargets(places, cur.rest) };
  }
  return relink({ ...t, rounds: next });
}

/** Removes a round; the places that went to it are out. */
export function removeRound(t: Template, roundId: string): Template {
  const rounds = roundsOf(t)
    .filter((r) => r.id !== roundId)
    .map((r) => ({ ...r, advance: (r.advance ?? []).map((a) => (a.to === roundId ? { ...a, to: "eliminated" } : a)) }));
  return relink({ ...t, rounds });
}

/** Sets a round's target, minimum and maximum riders per heat (defaults follow the target; only differences are stored). */
export function setRoundSizes(t: Template, roundId: string, sizes: { target?: number; min?: number | ""; max?: number | "" }): Template {
  const rounds = roundsOf(t).map((r) => {
    if (r.id !== roundId) return r;
    const target = sizes.target ?? r.heatSize ?? 4;
    const out: Round = { ...r, heatSize: target, uneven: "minimum_riders" };
    const defMin = Math.min(target, Math.max(2, target - 1));
    const defMax = Math.min(10, target + 1);
    const min = sizes.min === undefined ? out.minHeatSize : sizes.min;
    const max = sizes.max === undefined ? out.maxHeatSize : sizes.max;
    if (min === "" || min === undefined || min === defMin) delete out.minHeatSize;
    else out.minHeatSize = Math.min(min, target);
    if (max === "" || max === undefined || max === defMax) delete out.maxHeatSize;
    else out.maxHeatSize = Math.max(max, target);
    return out;
  });
  return { ...t, rounds };
}

export const renameRoundField = (t: Template, roundId: string, name: string): Template => ({
  ...t,
  rounds: roundsOf(t).map((r) => (r.id === roundId ? { ...r, name } : r)),
});

/** How many places of a round go on to a later round (not out, not the final placing). */
export function advanceCount(r: Round, laterIds: string[]): number {
  return placeTargets(r).places.filter((to) => laterIds.includes(to)).length;
}

/**
 * Plain-language checks of a custom ladder for `riders` riders, naming the round and the counts. Empty = nothing to fix.
 * Schema errors come first (they stop the preview); then what the preview draw shows.
 */
export function ladderProblems(template: Template, riders: number): string[] {
  const parsed = FormatTemplateSchema.safeParse(template);
  const t = copy.customBuilder;
  if (!parsed.success) return parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(" › ")}: ${i.message}`);
  const rounds = roundsOf(template);
  const problems: string[] = [];
  rounds.forEach((r, i) => {
    if (i > 0 && !r.crossHeat && (r.entrantsFrom ?? []).every((s) => s.type === "seeds")) problems.push(t.noRiders(r.name));
  });
  let draw;
  try {
    draw = expandFormat(parsed.data, Array.from({ length: riders }, (_, i) => ({ id: `p${i + 1}`, name: `Rider ${i + 1}` })));
  } catch (e) {
    return [...problems, (e as Error).message];
  }
  for (const round of draw.rounds) {
    const sizes = round.heats.map((h) => h.slots.length);
    if (sizes.length === 0) continue;
    const limits = heatLimits(round.spec.heatSize, round.spec.minHeatSize, round.spec.maxHeatSize);
    const uses = round.spec.uneven === "minimum_riders";
    if (uses && round.expectedEntrants > 0 && (Math.max(...sizes) > limits.max || (sizes.length > 1 && Math.min(...sizes) < limits.min))) {
      problems.push(t.sizes(round.name, round.expectedEntrants, sizes.length, Math.min(...sizes), Math.max(...sizes), limits.min, limits.max));
    }
  }
  const last = draw.rounds.at(-1);
  if (last && last.heats.length > 1) problems.push(t.lastRound(last.name, last.heats.length));
  for (const w of draw.warnings) {
    if (w.type === "eliminates_nobody") problems.push(t.eliminatesNobody(draw.rounds.find((r) => r.id === w.round)?.name ?? w.round ?? "", w.message));
  }
  return problems;
}
