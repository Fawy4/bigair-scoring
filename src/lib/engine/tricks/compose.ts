import type { TrickBlock, TrickItem, TrickParts, TrickVocab } from "./types";
import { renderTrickName } from "./naming";

const find = (vocab: TrickVocab, id: string): TrickBlock | undefined => vocab.blocks.find((b) => b.id === id);
const findKey = (vocab: TrickVocab, family: "direction" | "multiplier", key: string | null | undefined): TrickBlock | undefined =>
  key ? vocab.blocks.find((b) => b.family === family && b.key === key) : undefined;

/** The first category of the precedence list present among the blocks; failing that the first category met; else null. */
export function categoryOf(vocab: TrickVocab, itemIds: string[]): string | null {
  const present = itemIds.map((id) => find(vocab, id)?.category).filter((c): c is string => Boolean(c));
  return vocab.categoryPrecedence.find((k) => present.includes(k)) ?? present[0] ?? null;
}

/**
 * The name and category of a trick (docs/08 §1G-3, §1I-1). The vocabulary's naming template places the direction and the blocks (by default the direction
 * first); the blocks keep the order they were tapped in; a multiplier is written before its block and "×1" is hidden; words nobody recognised come last.
 * Tapping order is meaningful: the name is the sequence.
 */
export function composeTrick(vocab: TrickVocab, parts: TrickParts): { name: string; categoryKey: string | null } {
  const direction = findKey(vocab, "direction", parts.direction);
  const words = parts.items.flatMap((item) => {
    const block = find(vocab, item.id);
    if (!block) return [];
    const mult = item.multiplier && item.multiplier !== vocab.hideMultiplierWhen ? findKey(vocab, "multiplier", item.multiplier) : undefined;
    return [mult ? `${mult.label} ${block.label}` : block.label];
  });
  const name = renderTrickName(vocab.namingTemplate, direction?.label ?? "", words, parts.freeText?.trim() ?? "");
  return { name, categoryKey: categoryOf(vocab, parts.items.map((i) => i.id)) };
}

// ---- the spotter's taps -------------------------------------------------------------------------------------------------------------------------

export interface BuilderState {
  direction: string | null;
  items: TrickItem[];
  /** A multiplier tapped before any block that can take it: it goes on the next block that can. */
  pendingMultiplier: string | null;
}

export const emptyBuilder = (): BuilderState => ({ direction: null, items: [], pendingMultiplier: null });

/** Direction is pick-one: tapping the other one swaps, tapping the same one again clears it. */
export function tapDirection(s: BuilderState, key: string): BuilderState {
  return { ...s, direction: s.direction === key ? null : key };
}

/** A block is added at the end of the sequence (the same block may be added again). A waiting multiplier goes on it when it can take one. */
export function tapBlock(vocab: TrickVocab, s: BuilderState, id: string): BuilderState {
  const block = find(vocab, id);
  if (!block || block.family === "direction" || block.family === "multiplier") return s;
  if (s.pendingMultiplier && block.takesMultiplier) return { ...s, items: [...s.items, { id, multiplier: s.pendingMultiplier }], pendingMultiplier: null };
  return { ...s, items: [...s.items, { id }] };
}

/** A multiplier tapped after a block sets it on that block (tap it again to remove it); otherwise it waits for the next block that can take one. */
export function tapMultiplier(vocab: TrickVocab, s: BuilderState, key: string): BuilderState {
  const last = s.items.at(-1);
  const lastBlock = last ? find(vocab, last.id) : undefined;
  if (last && lastBlock?.takesMultiplier) {
    const items = s.items.map((it, i) => (i === s.items.length - 1 ? { ...it, multiplier: it.multiplier === key ? null : key } : it));
    return { ...s, items };
  }
  return { ...s, pendingMultiplier: s.pendingMultiplier === key ? null : key };
}

/** One tap on a block of the name takes it out of the sequence. */
export function removeTrickItem(s: BuilderState, index: number): BuilderState {
  return { ...s, items: s.items.filter((_, i) => i !== index) };
}

export const toParts = (s: BuilderState, extra: Pick<TrickParts, "freeText" | "needsReview"> = {}): TrickParts => ({
  direction: s.direction,
  items: s.items.map((i) => (i.multiplier ? { id: i.id, multiplier: i.multiplier } : { id: i.id })),
  ...extra,
});

/** The builder holds something worth logging when it has at least one block or some free text. */
export const canLog = (s: BuilderState, freeText = ""): boolean => s.items.length > 0 || freeText.trim().length > 0;
