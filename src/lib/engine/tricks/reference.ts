import type { ReferenceTable } from "@/lib/schemas/reference-scores";
import type { TrickParts, TrickVocab } from "./types";

/** One line of the breakdown: the trick itself, a variation that was added, or one that was left out because a higher one of its group counted. */
export interface ReferencePart {
  label: string;
  value: number;
  kind: "trick" | "add" | "not-added";
}

export interface ReferenceScore {
  value: number;
  parts: ReferencePart[];
  /** The trick has a multiplier (×2…) or a count: the hint is for one, and the judge accounts for the rest. */
  multiplied: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The reference score of a logged trick: a HINT for the judge, never a score and never counted. It is the value of the trick as the judges' sheet lists it,
 * plus what each variation adds; the board variations of one group (Board Off, Board Flip, Osmosis) do not stack, the highest counts. Multipliers are not
 * included (the judge accounts for them). Null whenever the number would be a guess: no table, no trick of the sheet in it, a block the sheet has no value
 * for (so a Tic-tac gives no hint rather than a wrong one), a repeated block, or words nobody recognised.
 */
export function referenceScore(vocab: TrickVocab, table: ReferenceTable | null, parts: TrickParts): ReferenceScore | null {
  if (!table || parts.freeText?.trim() || parts.items.length === 0) return null;
  const ids = parts.items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) return null;
  const label = (id: string) => vocab.blocks.find((b) => b.id === id)?.label ?? id;

  const adderOf = new Map(table.adders.map((a) => [a.block, a]));
  const core = ids.filter((id) => !adderOf.has(id));
  const trick = table.tricks.find((t) => t.blocks.length === core.length && t.blocks.every((id) => core.includes(id)));
  if (!trick) return null;

  const added = ids.filter((id) => adderOf.has(id)).map((id) => ({ id, adder: adderOf.get(id)! }));
  const best = new Map<string, string>();
  for (const { id, adder } of added) {
    if (!adder.group) continue;
    const now = best.get(adder.group);
    if (!now || adder.value > adderOf.get(now)!.value) best.set(adder.group, id);
  }
  const counts = (id: string) => {
    const g = adderOf.get(id)!.group;
    return !g || best.get(g) === id;
  };

  const lines: ReferencePart[] = [
    { label: trick.label, value: trick.value, kind: "trick" },
    ...added.filter((a) => counts(a.id)).map((a) => ({ label: label(a.id), value: a.adder.value, kind: "add" as const })),
    ...added.filter((a) => !counts(a.id)).map((a) => ({ label: label(a.id), value: 0, kind: "not-added" as const })),
  ];
  const hidden = vocab.hideMultiplierWhen;
  const multiplied = parts.items.some((i) => Boolean(i.multiplier) && i.multiplier !== hidden) || (parts.count ?? 1) > 1;
  return { value: round(lines.reduce((s, l) => s + l.value, 0)), parts: lines, multiplied };
}
