import { composeTrick, type TrickParts, type TrickVocab } from "@/lib/engine/tricks";

export interface PracticeRider {
  entryId: string;
  /** Attempts logged so far (not deleted). */
  used: number;
}

export interface PracticeAttempt {
  entryId: string;
  status: "landed" | "crashed";
  direction: "left" | "right";
  trickName: string;
  categoryKey: string | null;
  parts: TrickParts;
}

/** A small seeded random source: the same seed always gives the same numbers. */
export function rng(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomTrick {
  parts: TrickParts;
  trickName: string;
  categoryKey: string | null;
  /** The key of the direction block used ("left" | "right"), or null when the trick base has none switched on. */
  directionKey: string | null;
}

/**
 * A trick built from the blocks ticked in a division's trick base: a direction, a base block (sometimes with a multiplier), sometimes an add-on and a grab or landing.
 * `forceDirection` asks for one direction when the trick base has it switched on. Pure: the same random source gives the same trick.
 */
export function randomTrick(rnd: () => number, vocab: TrickVocab, enabledIds: string[], forceDirection?: "left" | "right"): RandomTrick {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const on = new Set(enabledIds);
  const blocks = vocab.blocks.filter((b) => on.has(b.id));
  const of = (family: string) => blocks.filter((b) => b.family === family);

  const directions = of("direction");
  const forced = forceDirection ? directions.find((b) => b.key === forceDirection) : undefined;
  const direction = forced ?? (directions.length ? pick(directions) : null);
  const bases = of("base");
  const items: TrickParts["items"] = [];
  const multipliers = of("multiplier");
  const first = bases.length ? pick(bases) : null;
  if (first) {
    const m = first.takesMultiplier && multipliers.length && rnd() < 0.5 ? pick(multipliers) : null;
    items.push({ id: first.id, ...(m ? { multiplier: m.key } : {}) });
  }
  const addons = of("addon");
  if (addons.length && rnd() < 0.5) items.push({ id: pick(addons).id });
  const grabs = of("grab_landing");
  if (grabs.length && rnd() < 0.4) items.push({ id: pick(grabs).id });

  const parts: TrickParts = { direction: direction?.key ?? null, items };
  const composed = composeTrick(vocab, parts);
  return { parts, trickName: composed.name || "Jump", categoryKey: composed.categoryKey, directionKey: direction?.key ?? null };
}

/**
 * One made-up attempt for the Practice heat (docs/08 §1H-12): a rider still below the cap, a trick built from the blocks ticked in the division's trick
 * base, and about one attempt in five crashes. Pure: the same seed gives the same feed, so a test can replay it.
 */
export function practiceAttempt(seed: number, vocab: TrickVocab, enabledIds: string[], riders: PracticeRider[], cap: number | null): PracticeAttempt | null {
  const rnd = rng(seed);
  const open = riders.filter((r) => cap === null || r.used < cap);
  if (open.length === 0) return null;
  const rider = open[Math.floor(rnd() * open.length)];
  const trick = randomTrick(rnd, vocab, enabledIds);
  const crashed = rnd() < 0.2;
  return {
    entryId: rider.entryId,
    status: crashed ? "crashed" : "landed",
    direction: trick.directionKey === "right" ? "right" : trick.directionKey === "left" ? "left" : rnd() < 0.5 ? "left" : "right",
    trickName: trick.trickName,
    categoryKey: trick.categoryKey,
    parts: trick.parts,
  };
}
