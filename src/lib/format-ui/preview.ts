import { expandFormat, type DivisionDraw, type Entrant } from "@/lib/engine/ladder";
import type { FormatTemplate } from "@/lib/schemas/format-template";

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
}

export interface FormatPreview {
  riders: number;
  ok: boolean;
  /** "With 14 riders: R1 4 heats of 3–4 → SF 2 heats of 4 → F 1 heat of 4 (7 heats)" */
  sentence: string;
  rounds: RoundPreview[];
  totalHeats: number;
  /** Riding time only, without breaks. */
  ridingMinutes: number;
  warnings: string[];
}

const range = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Deals `riderCount` placeholder riders through the format (the same engine the real draw uses) and describes the result. */
export function previewFormat(template: FormatTemplate, riderCount: number): FormatPreview {
  const entrants: Entrant[] = Array.from({ length: riderCount }, (_, i) => ({ id: `p${i + 1}`, name: `Rider ${i + 1}` }));
  let draw: DivisionDraw;
  try {
    draw = expandFormat(template, entrants);
  } catch (e) {
    return { riders: riderCount, ok: false, sentence: `With ${riderCount} ${plural(riderCount, "rider", "riders")}: this format cannot run (${(e as Error).message})`, rounds: [], totalHeats: 0, ridingMinutes: 0, warnings: [] };
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
    };
  });

  const parts = rounds.map((r) => {
    const heats = `${r.heats} ${plural(r.heats, "heat", "heats")}`;
    const bye = r.byes > 0 ? ` + ${r.byes} ${plural(r.byes, "bye", "byes")}` : "";
    return r.heats === 0 ? `${r.shortName} ${r.byes} ${plural(r.byes, "bye", "byes")}` : `${r.shortName} ${heats} of ${range(r.minSize, r.maxSize)}${bye}`;
  });
  const totalHeats = rounds.reduce((s, r) => s + r.heats, 0);
  const ridingMinutes = rounds.reduce((s, r) => s + r.minutes, 0);

  return {
    riders: riderCount,
    ok: true,
    sentence: `With ${riderCount} ${plural(riderCount, "rider", "riders")}: ${parts.join(" → ")} (${totalHeats} ${plural(totalHeats, "heat", "heats")})`,
    rounds,
    totalHeats,
    ridingMinutes,
    warnings: draw.warnings.map((w) => w.message + (w.suggestion ? ` ${w.suggestion}` : "")),
  };
}
