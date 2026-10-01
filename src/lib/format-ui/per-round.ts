import type { FormatTemplate } from "@/lib/schemas/format-template";
import { previewFormat } from "./preview";

export interface RoundLengthRow {
  id: string;
  shortName: string;
  name: string;
  /** The length the ladder's own settings give this round (the "single settings", without any per-round override). */
  defaultMin: number;
}

/**
 * The rows of "Heat length per round": the rounds of the preview that have heats to ride, each pre-filled with the heat length the single
 * settings give it. Pure, so the table can be checked against every built-in format and rider count.
 */
export function perRoundRows(template: FormatTemplate, riders: number): RoundLengthRow[] {
  const preview = previewFormat(template, riders);
  const plain = previewFormat({ ...template, roundDurationMin: undefined }, riders);
  const defaults = new Map(plain.rounds.map((r) => [r.id, Number(r.heatMin.split("–")[0])]));
  return preview.rounds
    .filter((r) => r.heats > 0)
    .map((r) => ({ id: r.id, shortName: r.shortName, name: r.name, defaultMin: defaults.get(r.id) ?? Number(r.heatMin.split("–")[0]) }));
}
