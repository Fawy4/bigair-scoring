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
}

const round = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The block of the judges' list a logged block stands for. A block the list names stands for itself. A block it does not name (an event's own copy of a trick, kept
 * after the master list got the same trick, or a retired one) stands for the listed block of the same family whose name or one of whose words is its name, when
 * exactly one has: a Doobie the event added itself is the master Doobie, so its tricks keep their hint.
 */
function listed(vocab: TrickVocab, known: Set<string>, id: string): string {
  if (known.has(id)) return id;
  const block = vocab.blocks.find((b) => b.id === id);
  if (!block) return id;
  const name = norm(block.label);
  const same = vocab.blocks.filter((b) => known.has(b.id) && b.family === block.family && [b.label, ...b.aliases].some((w) => norm(w) === name));
  return same.length === 1 ? same[0].id : id;
}

/**
 * The reference score of a logged trick: a HINT for the judge, never a score and never counted. It is the value of the trick as the judges' sheet lists it,
 * plus what each variation adds; the board variations of one group (Board Off, Board Flip, Osmosis) do not stack, the highest counts. Multipliers play no part
 * (left out for now: a ×2 trick shows the same hint as the single). Null whenever the number would be a guess: no table, no trick of the sheet in it, a block the sheet has no value
 * for (so a Tic-tac gives no hint rather than a wrong one), a repeated block, or words nobody recognised.
 */
export function referenceScore(vocab: TrickVocab, table: ReferenceTable | null, parts: TrickParts): ReferenceScore | null {
  if (!table || parts.freeText?.trim() || parts.items.length === 0) return null;
  const known = new Set([...table.tricks.flatMap((t) => t.blocks), ...table.adders.map((a) => a.block)]);
  const ids = parts.items.map((i) => listed(vocab, known, i.id));
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
    // a trick of one block is named as the spotter's list names it now (the owner may have renamed it); a combination keeps the list's own name
    { label: trick.blocks.length === 1 ? label(trick.blocks[0]) : trick.label, value: trick.value, kind: "trick" },
    ...added.filter((a) => counts(a.id)).map((a) => ({ label: label(a.id), value: a.adder.value, kind: "add" as const })),
    ...added.filter((a) => !counts(a.id)).map((a) => ({ label: label(a.id), value: 0, kind: "not-added" as const })),
  ];
  return { value: round(lines.reduce((s, l) => s + l.value, 0)), parts: lines };
}
