import type { ReportAttempt, ReportBlock } from "./types";

/**
 * Trick identity for the report (RA1, item 5). The same matcher the reference scores use: a trick is the SET of blocks it is made of, so "Double backroll board off" and
 * "×2 Backroll Board-off" (stored as the same blocks) are one trick, and so are two spellings that name one block twice over (the event's own retired copy of a block
 * and the master one). The side is NOT part of the trick (it is counted separately). Text the trick base did not recognise stays as typed (letters and digits, lower case)
 * and is its own trick.
 */
const norm = (s: string): string => s.toLowerCase().replace(/×/g, "x").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export interface TrickIndex {
  /** block id → the id its group of same-named blocks is known by (a live block before a retired one). */
  canonical: Map<string, string>;
  blocks: Map<string, ReportBlock>;
  loopCategories: Set<string>;
}

export function buildTrickIndex(blocks: ReportBlock[], loopCategories: string[] = ["kiteloop"]): TrickIndex {
  const byName = new Map<string, ReportBlock[]>();
  for (const b of blocks) {
    const k = `${b.family}|${norm(b.label)}`;
    byName.set(k, [...(byName.get(k) ?? []), b]);
  }
  const canonical = new Map<string, string>();
  for (const group of byName.values()) {
    const pick = group.find((b) => !b.retired) ?? group[0];
    for (const b of group) canonical.set(b.id, pick.id);
  }
  return { canonical, blocks: new Map(blocks.map((b) => [b.id, b])), loopCategories: new Set(loopCategories) };
}

const itemKey = (idx: TrickIndex, id: string, multiplier?: string | null): string => {
  const c = idx.canonical.get(id) ?? id;
  return multiplier && multiplier !== "x1" ? `${c}*${multiplier}` : c;
};

/** The identity of a logged trick, or null when the line names no trick at all. */
export function trickKey(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "trick">): string | null {
  const items = a.parts?.items ?? [];
  const free = norm(a.parts?.freeText ?? "");
  if (items.length || free) {
    const set = [...new Set(items.map((i) => itemKey(idx, i.id, i.multiplier)))].sort();
    return [set.join("+"), free ? `~${free}` : ""].join("");
  }
  const name = norm(a.trick ?? "");
  return name ? `~${name}` : null;
}

/** The trick written out without its side: blocks in the order they were logged, "×2" in front of its block. */
export function trickLabel(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "trick">): string {
  const items = a.parts?.items ?? [];
  const words = items.flatMap((i) => {
    const b = idx.blocks.get(idx.canonical.get(i.id) ?? i.id) ?? idx.blocks.get(i.id);
    if (!b) return [];
    const m = i.multiplier && i.multiplier !== "x1" ? idx.blocks.get(`multiplier:${i.multiplier}`) : undefined;
    return [m ? `${m.label} ${b.label}` : b.label];
  });
  const free = (a.parts?.freeText ?? "").trim();
  if (words.length || free) return [...words, free].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return (a.trick ?? "").trim();
}

/** Does the trick contain a block of a loop category? */
export function hasLoop(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "category">): boolean {
  const items = a.parts?.items ?? [];
  if (items.length) return items.some((i) => {
    const cat = idx.blocks.get(i.id)?.category;
    return cat ? idx.loopCategories.has(cat) : false;
  });
  return a.category ? idx.loopCategories.has(a.category) : false;
}

/** The family a trick is counted in on the trick mix: the category the trick base gave it, or "other". */
export const familyOf = (a: Pick<ReportAttempt, "category">): string => a.category || "other";
