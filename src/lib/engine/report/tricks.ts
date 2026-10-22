import { parseTrickText } from "@/lib/engine/tricks/parse";
import type { TrickBlock, TrickVocab } from "@/lib/engine/tricks/types";
import type { ReportAttempt, ReportBlock, ReportParts } from "./types";

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
  /** The trick base as the parser reads it (names only), to read a trick that was typed as plain words. */
  vocab: TrickVocab;
  allIds: string[];
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
  const vocabBlocks: TrickBlock[] = blocks.map((b) => ({
    id: b.id,
    family: (["direction", "multiplier", "base", "addon", "grab_landing"].includes(b.family) ? b.family : "addon") as TrickBlock["family"],
    key: b.key,
    label: b.label,
    aliases: [],
    category: b.category,
    takesMultiplier: b.family === "base" || b.family === "addon",
  }));
  const vocab: TrickVocab = { blocks: vocabBlocks, categoryPrecedence: [], hideMultiplierWhen: "x1", namingTemplate: "{direction} {blocks}" };
  return { canonical, blocks: new Map(blocks.map((b) => [b.id, b])), loopCategories: new Set(loopCategories), vocab, allIds: blocks.filter((b) => !b.retired).map((b) => b.id) };
}

/** Names the spotter's phone writes for a jump with no real trick. */
const PLACEHOLDERS = new Set(["missed", "missed trick", "trick not logged", "not logged"]);

export interface Resolved {
  /** The blocks of the trick: as logged, or read from the typed name; null when the line names no trick. */
  parts: ReportParts | null;
  /** The spotter logged it with the trick builder (at least one block): a line typed as plain words is "not logged" on the trick mix. */
  logged: boolean;
  /** The highest-up category among its blocks when the line carries none itself. */
  category: string | null;
}

/** A line's trick: its blocks when it has some, otherwise its typed name read by the same parser the spotter's box uses (a placeholder such as "Missed" is no trick). */
export function resolveAttempt(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "trick" | "category">): Resolved {
  const items = a.parts?.items ?? [];
  if (items.length) return { parts: a.parts, logged: true, category: a.category };
  const name = (a.trick ?? "").trim() || (a.parts?.freeText ?? "").trim();
  if (!name || PLACEHOLDERS.has(norm(name))) return { parts: null, logged: false, category: a.category };
  const parsed = parseTrickText(idx.vocab, name, idx.allIds).parts;
  if (!parsed.items.length && !parsed.freeText) return { parts: null, logged: false, category: a.category };
  const cat = a.category ?? parsed.items.map((i) => idx.blocks.get(i.id)?.category).find((c): c is string => Boolean(c)) ?? null;
  return { parts: { direction: parsed.direction, items: parsed.items, freeText: parsed.freeText }, logged: false, category: cat };
}

/** The identity of a logged trick, or null when the line names no trick at all. The multipliers belong to the trick as a whole: "×2 Backroll Tic-tac" and "Backroll ×2 Tic-tac" are one trick. */
export function trickKey(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "trick">): string | null {
  const items = a.parts?.items ?? [];
  const free = norm(a.parts?.freeText ?? "");
  if (items.length || free) {
    const ids = [...new Set(items.map((i) => idx.canonical.get(i.id) ?? i.id))].sort();
    const mults = items.flatMap((i) => (i.multiplier && i.multiplier !== "x1" ? [i.multiplier] : [])).sort();
    return [ids.join("+"), mults.length ? `|${mults.join(",")}` : "", free ? `~${free}` : ""].join("");
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

/** Is the trick a loop? Its category (the highest of the trick base's categories among its blocks) is one of the loop categories: the same as the "Loops" family of the trick mix. */
export function hasLoop(idx: TrickIndex, a: Pick<ReportAttempt, "parts" | "category">): boolean {
  return a.category ? idx.loopCategories.has(a.category) : false;
}

/** The family a trick is counted in on the trick mix: the category the trick base gave it, or "other". */
export const familyOf = (a: Pick<ReportAttempt, "category">): string => a.category || "other";
