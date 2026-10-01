import { copy } from "@/lib/ui-copy";

/** 160 → "2 h 40", 120 → "2 h", 45 → "45 min". To the nearest 5 minutes, plain words (the Format sentence's time). */
export function aboutHoursMinutes(totalMin: number): string {
  const rounded = Math.max(5, Math.round(totalMin / 5) * 5);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export interface FormatSentenceInput {
  kindTitle: string;
  heatSize?: number | null;
  advance?: number | null;
  finalSize?: number | null;
  riders: number;
  rounds: number;
  /** Everything counted: warm-ups, heats and the breaks between them. */
  totalMin: number;
}

/** "Knockout, heats of 4, top 2 advance, final of 4 — 14 riders: 4 rounds, about 2 h 40". The live sentence at the top of the Format panel. */
export function formatSentence(i: FormatSentenceInput): string {
  const T = copy.formatSentence;
  const parts = [i.kindTitle];
  if (i.heatSize) parts.push(T.heats(i.heatSize));
  if (i.advance) parts.push(T.advance(i.advance));
  if (i.finalSize) parts.push(T.final(i.finalSize));
  return `${parts.join(", ")} — ${T.tail(i.riders, i.rounds, aboutHoursMinutes(i.totalMin))}`;
}
