import { expandFormat, type DivisionDraw, type Entrant } from "@/lib/engine/ladder";
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
  /** "4 heats · 3–4 riders" */
  summary: string;
  heats: Array<{ id: string; number: number | null; size: number; bye: boolean }>;
  /** Where riders go from here, e.g. "1st–2nd → SF", "the rest → out". */
  routes: string[];
}

export interface FormatPreview {
  riders: number;
  ok: boolean;
  /** "With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)" */
  sentence: string;
  rounds: RoundPreview[];
  ladder: LadderColumn[];
  totalHeats: number;
  /** Riding time only, without breaks. */
  ridingMinutes: number;
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
    routes.push(`${t.bestOfAll(cross.advanceTop)} ${t.arrow} ${nameOf(cross.to)}`);
    routes.push(`${t.rest} ${t.arrow} ${t.out}`);
    return routes;
  }
  for (const rule of round.spec.advance) {
    routes.push(`${rule.places === "rest" ? t.rest : placesLabel(rule.places)} ${t.arrow} ${nameOf(rule.to)}`);
  }
  return routes;
}

/** Deals `riderCount` placeholder riders through the format (the same engine the real draw uses) and describes the result. */
export function previewFormat(template: FormatTemplate, riderCount: number): FormatPreview {
  const entrants: Entrant[] = Array.from({ length: riderCount }, (_, i) => ({ id: `p${i + 1}`, name: `Rider ${i + 1}` }));
  let draw: DivisionDraw;
  try {
    draw = expandFormat(template, entrants);
  } catch (e) {
    return { riders: riderCount, ok: false, sentence: t.cannotRun(riderCount, (e as Error).message), rounds: [], ladder: [], totalHeats: 0, ridingMinutes: 0, warnings: [] };
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

  const parts = rounds.map((r) => (r.heats === 0 ? t.partByes(r.shortName, r.byes) : t.partHeats(r.shortName, r.heats, range(r.minSize, r.maxSize), r.byes)));
  const totalHeats = rounds.reduce((s, r) => s + r.heats, 0);
  const ridingMinutes = rounds.reduce((s, r) => s + r.minutes, 0);

  const ladder: LadderColumn[] = draw.rounds.map((r, i) => ({
    id: r.id,
    shortName: r.shortName,
    name: r.name,
    summary: t.heatSizes(rounds[i].heats, range(rounds[i].minSize, rounds[i].maxSize), rounds[i].heatMin),
    heats: r.heats.map((h) => ({ id: h.id, number: h.number, size: h.slots.length, bye: h.bye })),
    routes: routesOf(draw, i),
  }));

  return {
    riders: riderCount,
    ok: true,
    sentence: t.sentence(riderCount, parts.join(t.arrowText), totalHeats),
    rounds,
    ladder,
    totalHeats,
    ridingMinutes,
    warnings: draw.warnings.map((w) => w.message + (w.suggestion ? ` ${w.suggestion}` : "")),
  };
}
