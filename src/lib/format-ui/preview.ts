import { expandFormat, minHeatsPerRider, type DivisionDraw, type Entrant } from "@/lib/engine/ladder";
import { aboutHours, ladderTime } from "@/lib/engine/schedule";
import type { FormatTemplate } from "@/lib/schemas/format-template";
import { copy } from "@/lib/ui-copy";

const t = copy.ladder;

export interface RoundPreview {
  id: string;
  shortName: string;
  name: string;
  /** Heats that actually ride (byes are not counted). */
  heats: number;
  byes: number;
  minSize: number;
  maxSize: number;
  minutes: number;
  /** Heat length in minutes (a range when the heats of a round differ). */
  heatMin: string;
}

/** One column of the ladder diagram. */
export interface LadderColumn {
  id: string;
  shortName: string;
  name: string;
  /** The name the app gives the round when the organiser has not renamed it. */
  defaultName: string;
  /** "4 heats · 3–4 riders" */
  summary: string;
  heats: Array<{
    id: string;
    /** The organiser's own name, else "R1 H1", "Second chance H2": the round and the heat's place inside it. */
    name: string;
    /** "R1 H1": what a blank name goes back to. */
    defaultName: string;
    size: number;
    /** The rider advances without riding. */
    advancing: boolean;
    /** Where riders come from, for heats fed by earlier rounds: ["1st H1", "1st R2 H5"]. Empty for the first round. */
    from: string[];
  }>;
  /** Where riders go from here, e.g. "1st–2nd → SF", "the rest → out". */
  routes: string[];
}

export interface FormatPreview {
  riders: number;
  ok: boolean;
  /** "With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)" */
  sentence: string;
  /** "Final of 3 — 3 riders remain after Round 2": the size the Final really has (its setting is only a target). Empty when the draw cannot run. */
  finalNote: string;
  rounds: RoundPreview[];
  ladder: LadderColumn[];
  totalHeats: number;
  /** The fewest heats any rider is guaranteed to ride, whatever the results. */
  minHeatsPerRider: number;
  /** Riding time only, without breaks. */
  ridingMinutes: number;
  /** "15 heats · 5 + 10 min · about 4 h with 2-minute breaks": warm-up, heat length and breaks all counted. */
  timeSentence: string;
  /** Warm-ups, heats and breaks, in minutes: the number behind the Format sentence's "about 2 h 40". */
  totalMinutes: number;
  warnings: string[];
}

const range = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);

/** [1,2,3] → "1st–3rd"; [1,3] → "1st, 3rd". */
export function placesLabel(places: number[]): string {
  const sorted = [...new Set(places)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(t.place(sorted[i], sorted[j]));
    i = j + 1;
  }
  return parts.join(", ");
}

function routesOf(draw: DivisionDraw, roundIndex: number): string[] {
  const round = draw.rounds[roundIndex];
  const nameOf = (to: string) => (to === "eliminated" ? t.out : to === "final_placing" ? t.finalPlacing : (draw.rounds.find((r) => r.id === to)?.shortName ?? to));
  const routes: string[] = [];
  const cross = round.spec.crossHeat;
  if (cross) {
    if (cross.to === "final_placing") {
      routes.push(`${cross.combine === "points" ? t.rankedByPoints : t.rankedByScores} ${t.arrow} ${t.finalPlacing}`);
      return routes;
    }
    routes.push(`${t.bestOfAll(cross.advanceTop)} ${t.arrow} ${nameOf(cross.to)}`);
    if (cross.alsoTo) routes.push(`${t.nextBest(cross.alsoTo.count)} ${t.arrow} ${nameOf(cross.alsoTo.to)}`);
    routes.push(draw.template.placings.eliminated === "by_heat_score" ? t.restKeepRank : `${t.rest} ${t.arrow} ${t.out}`);
    return routes;
  }
  // Name the actual places ("4th → out"), not just "the rest": only places that exist in this round's heats are listed.
  const biggest = Math.max(1, ...round.heats.map((h) => h.slots.length));
  const named = new Set(round.spec.advance.flatMap((r) => (r.places === "rest" ? [] : r.places)));
  const others = Array.from({ length: biggest }, (_, i) => i + 1).filter((p) => !named.has(p));
  for (const rule of round.spec.advance) {
    const places = rule.places === "rest" ? others : rule.places.filter((p) => p <= biggest);
    if (places.length === 0) continue;
    const label = rule.places === "rest" && named.size === 0 ? t.rest : placesLabel(places); // "the rest" only when nothing else is named
    routes.push(`${label} ${t.arrow} ${nameOf(rule.to)}`);
  }
  return routes;
}

function finalNoteOf(draw: DivisionDraw): string {
  const last = draw.rounds.at(-1);
  if (!last) return "";
  const before = draw.rounds.length > 1 ? draw.rounds[draw.rounds.length - 2] : null;
  return t.finalNote(last.expectedEntrants, before ? before.name : null);
}

/** Deals `riderCount` placeholder riders through the format (the same engine the real draw uses) and describes the result. */
export function previewFormat(template: FormatTemplate, riderCount: number): FormatPreview {
  const entrants: Entrant[] = Array.from({ length: riderCount }, (_, i) => ({ id: `p${i + 1}`, name: `Rider ${i + 1}` }));
  let draw: DivisionDraw;
  try {
    draw = expandFormat(template, entrants);
  } catch (e) {
    return { riders: riderCount, ok: false, sentence: t.cannotRun(riderCount, (e as Error).message), finalNote: "", rounds: [], ladder: [], totalHeats: 0, minHeatsPerRider: 0, ridingMinutes: 0, timeSentence: "", totalMinutes: 0, warnings: [] };
  }

  const rounds: RoundPreview[] = draw.rounds.map((r) => {
    const riding = r.heats.filter((h) => !h.bye);
    const sizes = riding.map((h) => h.slots.length);
    return {
      id: r.id,
      shortName: r.shortName,
      name: r.name,
      heats: riding.length,
      byes: r.heats.length - riding.length,
      minSize: sizes.length ? Math.min(...sizes) : 0,
      maxSize: sizes.length ? Math.max(...sizes) : 0,
      minutes: riding.reduce((s, h) => s + h.durationMin, 0),
      heatMin: riding.length ? range(Math.min(...riding.map((h) => h.durationMin)), Math.max(...riding.map((h) => h.durationMin))) : "0",
    };
  });

  const parts = rounds.map((r) => (r.heats === 0 ? t.partAdvancing(r.shortName, r.byes) : t.partHeats(r.shortName, r.heats, range(r.minSize, r.maxSize), r.byes)));
  const totalHeats = rounds.reduce((s, r) => s + r.heats, 0);
  const ridingMinutes = rounds.reduce((s, r) => s + r.minutes, 0);
  const riding = draw.rounds.flatMap((r) => r.heats.filter((h) => !h.bye));
  const timeSentence = riding.length ? timeText(riding) : "";

  const ladder: LadderColumn[] = draw.rounds.map((r, i) => ({
    id: r.id,
    shortName: r.shortName,
    name: r.name,
    defaultName: r.spec.name,
    summary: t.heatSizes(rounds[i].heats, range(rounds[i].minSize, rounds[i].maxSize), rounds[i].heatMin, rounds[i].heats > 1 && rounds[i].maxSize === 2),
    heats: r.heats.map((h) => ({
      id: h.id,
      name: h.name ?? t.heatName(r.shortName, h.index),
      defaultName: t.heatName(r.shortName, h.index),
      size: h.slots.length,
      advancing: h.bye,
      from: h.slots.flatMap((sl) => (sl.from ? [t.slotFrom(sl.from.place, sl.from.round === draw.rounds[i - 1]?.id ? null : (draw.rounds.find((x) => x.id === sl.from!.round)?.shortName ?? sl.from.round), sl.from.heat)] : [])),
    })),
    routes: routesOf(draw, i),
  }));

  return {
    riders: riderCount,
    ok: true,
    sentence: t.sentence(riderCount, parts.join(t.arrowText), totalHeats),
    finalNote: finalNoteOf(draw),
    rounds,
    ladder,
    totalHeats,
    minHeatsPerRider: minHeatsPerRider(draw),
    ridingMinutes,
    timeSentence,
    totalMinutes: riding.length ? ladderTime(riding.map((h) => ({ warmUpMin: h.warmUpMin ?? 0, durationMin: h.durationMin, breakAfterMin: h.roundLast ? h.breakAfterRoundMin : h.breakAfterHeatMin }))).totalMin : 0,
    warnings: draw.warnings.map((w) => w.message + (w.suggestion ? ` ${w.suggestion}` : "")),
  };
}

/** "15 heats · 5 + 10 min · about 4 h with 2-minute breaks" from the heats the draw really makes. */
export function timeText(heats: Array<{ warmUpMin?: number; durationMin: number; breakAfterHeatMin: number; breakAfterRoundMin: number; roundLast: boolean }>): string {
  const list = heats.map((h) => ({ warmUpMin: h.warmUpMin ?? 0, durationMin: h.durationMin, breakAfterMin: h.roundLast ? h.breakAfterRoundMin : h.breakAfterHeatMin }));
  const total = ladderTime(list);
  const span = (xs: number[]) => (Math.min(...xs) === Math.max(...xs) ? String(xs[0]) : `${Math.min(...xs)}–${Math.max(...xs)}`);
  const warm = list.some((h) => h.warmUpMin > 0) ? span(list.map((h) => h.warmUpMin)) : "";
  const gaps = list.slice(0, -1).map((h) => h.breakAfterMin);
  const breaks = gaps.length ? copy.formatSimple.breaksText(Math.min(...gaps), Math.max(...gaps)) : "";
  return copy.formatSimple.totalTime(total.heats, warm, span(list.map((h) => h.durationMin)), aboutHours(total.totalMin), breaks);
}
