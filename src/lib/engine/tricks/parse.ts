import type { BlockFamily, TrickBlock, TrickItem, TrickParts, TrickVocab } from "./types";

/** Lower case, "×" as "x", hyphens and punctuation as spaces. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FAMILY_RANK: Record<BlockFamily, number> = { direction: 0, multiplier: 1, base: 2, addon: 3, grab_landing: 4 };

interface Alias {
  tokens: string[];
  block: TrickBlock;
  /** Found only through a nickname, not through the block's own name. */
  loose: boolean;
}

const squash = (s: string) => s.replace(/ /g, "");

function aliasesOf(vocab: TrickVocab): Alias[] {
  const out = new Map<string, Alias>();
  const add = (text: string, block: TrickBlock, own: boolean) => {
    const n = normaliseText(text);
    if (!n) return;
    const loose = !own && squash(n) !== squash(normaliseText(block.label));
    const prev = out.get(n);
    const better = !prev || (prev.loose && !loose) || (prev.loose === loose && FAMILY_RANK[block.family] < FAMILY_RANK[prev.block.family]);
    if (better) out.set(n, { tokens: n.split(" "), block, loose });
  };
  for (const b of vocab.blocks) {
    add(b.label, b, true);
    for (const a of b.aliases) add(a, b, false);
  }
  return [...out.values()];
}

/** Edit distance (insert, delete, change one letter). */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** How many wrong letters a word may have and still be read: none under 5 letters, one at 5, two from 6 (docs/08 §1G-4: "dubble" is "double"). */
const allowedEdits = (len: number): number => (len < 5 ? 0 : len === 5 ? 1 : 2);

interface BlockSpan {
  type: "direction" | "multiplier" | "block";
  text: string;
  block: TrickBlock;
  loose: boolean;
}
interface WordSpan {
  type: "unknown" | "off";
  text: string;
}
type Span = BlockSpan | WordSpan;

export interface ParsedTrick {
  parts: TrickParts;
  /** Phrases nobody recognised (or that belong to a block the division has switched off). */
  unmatched: string[];
  needsReview: boolean;
}

/**
 * Typed or spoken text read as the same ordered sequence the builder makes (docs/08 §1G-4): tokens, longest alias first, then a few wrong letters
 * allowed in words of five letters or more (only when one block is the clear winner). Blocks the division has switched off count as unmatched but are
 * known words. A word nobody knows, right next to a block found only through a nickname ("jump"), is not guessed: the phrase stays free text.
 */
export function parseTrickText(vocab: TrickVocab, text: string, enabledIds: ReadonlySet<string> | readonly string[]): ParsedTrick {
  const enabled = enabledIds instanceof Set ? enabledIds : new Set(enabledIds);
  const tokens = normaliseText(text).split(" ").filter(Boolean);
  const aliases = aliasesOf(vocab);
  const single = aliases.filter((a) => a.tokens.length === 1);
  const longest = Math.max(1, ...aliases.map((a) => a.tokens.length));

  const spans: Span[] = [];
  const push = (consumed: string[], a: Alias | null) => {
    const phrase = consumed.join(" ");
    if (!a) spans.push({ type: "unknown", text: phrase });
    else if (!enabled.has(a.block.id)) spans.push({ type: "off", text: phrase });
    else spans.push({ type: a.block.family === "direction" ? "direction" : a.block.family === "multiplier" ? "multiplier" : "block", text: phrase, block: a.block, loose: a.loose });
  };

  for (let i = 0; i < tokens.length; ) {
    let hit: Alias | null = null;
    let len = 0;
    for (let n = Math.min(longest, tokens.length - i); n >= 1 && !hit; n--) {
      const slice = tokens.slice(i, i + n);
      const found = aliases.filter((a) => a.tokens.length === n && a.tokens.every((t, k) => t === slice[k]));
      if (found.length) {
        found.sort((a, b) => Number(a.loose) - Number(b.loose) || FAMILY_RANK[a.block.family] - FAMILY_RANK[b.block.family]);
        hit = found[0];
        len = n;
      }
    }
    if (!hit && allowedEdits(tokens[i].length) > 0) {
      const limit = allowedEdits(tokens[i].length);
      const near = single.map((a) => ({ a, d: editDistance(tokens[i], a.tokens[0]) })).filter((x) => x.d <= limit);
      const best = Math.min(...near.map((x) => x.d));
      const winners = near.filter((x) => x.d === best);
      if (winners.length && new Set(winners.map((x) => x.a.block.id)).size === 1) {
        hit = winners.map((x) => x.a).sort((a, b) => Number(a.loose) - Number(b.loose))[0];
        len = 1;
      }
    }
    if (hit) {
      push(tokens.slice(i, i + len), hit);
      i += len;
    } else {
      push([tokens[i]], null);
      i += 1;
    }
  }

  // the first direction wins; any later one is an unmatched word
  let seenDirection = false;
  for (let k = 0; k < spans.length; k++) {
    const s = spans[k];
    if (s.type !== "direction") continue;
    if (seenDirection) spans[k] = { type: "unknown", text: s.text };
    else seenDirection = true;
  }

  // an unknown word touching a nickname-only base trick: do not guess, keep the phrase as free text
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = 0; k < spans.length; k++) {
      const s = spans[k];
      if (s.type !== "block" || !s.loose || s.block.family !== "base") continue;
      if (spans[k - 1]?.type === "unknown" || spans[k + 1]?.type === "unknown") {
        spans[k] = { type: "unknown", text: s.text };
        changed = true;
      }
    }
  }

  // build the sequence; a multiplier goes on the next block that can take it, or (at the end) back on the block before it
  let direction: string | null = null;
  const items: TrickItem[] = [];
  const itemSpan: number[] = []; // which span each item came from
  let waiting = -1;
  const lose = (k: number) => {
    spans[k] = { type: "unknown", text: spans[k].text };
  };
  for (let k = 0; k < spans.length; k++) {
    const s = spans[k];
    if (s.type === "direction") {
      direction = s.block.key;
    } else if (s.type === "block") {
      if (waiting >= 0 && s.block.takesMultiplier) {
        items.push({ id: s.block.id, multiplier: (spans[waiting] as BlockSpan).block.key });
        waiting = -1;
      } else {
        items.push({ id: s.block.id });
      }
      itemSpan.push(k);
    } else if (s.type === "multiplier") {
      if (waiting >= 0) lose(waiting);
      waiting = k;
      const next = spans[k + 1];
      if (!next || next.type !== "block") {
        const prev = items.at(-1);
        const prevSpan: Span | undefined = spans[itemSpan.at(-1) ?? -1];
        if (prev && !prev.multiplier && prevSpan && prevSpan.type === "block" && prevSpan.block.takesMultiplier) {
          prev.multiplier = s.block.key;
          waiting = -1;
        }
      }
    }
  }
  if (waiting >= 0) lose(waiting);

  const unmatched = mergeRuns(spans);
  const parts: TrickParts = { direction, items };
  if (unmatched.length) {
    parts.freeText = unmatched.join(" ");
    parts.needsReview = true;
  }
  return { parts, unmatched, needsReview: unmatched.length > 0 };
}

/** Neighbouring words nobody could use (unknown, or from a block the division switched off) read as one phrase, in the order they were said. */
function mergeRuns(spans: Span[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push(run.join(" "));
    run = [];
  };
  for (const s of spans) {
    if (s.type === "unknown" || s.type === "off") run.push(s.text);
    else flush();
  }
  flush();
  return out;
}
