import type { RoundSpec } from "@/lib/schemas/format-template";

type LayoutSpec = Pick<RoundSpec, "heatSize" | "uneven" | "heatCountOverride" | "seeding"> & { minHeatSize?: number };

export interface RoundLayout {
  /** Riders per heat, smallest heats first (top seeds land in the smaller heats). */
  capacities: number[];
  /** `byes_top_seeds`: the first `byes` heats are one-rider byes dealt individually to the top seeds. */
  byes: number;
}

/** Number of byes when `uneven = byes_top_seeds` (Decision 6): every heat that rides is full. */
export function byeCount(n: number, heatSize: number): number {
  return n <= heatSize ? 0 : n % heatSize;
}

/** base = floor(N / H); the last `N mod H` heats hold one more rider (docs/04 §3 step 3). */
export function capacities(n: number, heats: number): number[] {
  if (heats < 1) return [];
  const base = Math.floor(n / heats);
  const extra = n % heats;
  return Array.from({ length: heats }, (_, i) => (i < heats - extra ? base : base + 1));
}

/** The minimum riders per heat: what the organiser set, else the target − 1 (never below 2, never above the target). */
export function effectiveMinHeatSize(target: number, min?: number): number {
  return Math.min(target, Math.max(1, min ?? Math.max(2, target - 1)));
}

/**
 * "Riders per heat (target)" and "Minimum riders per heat" (docs/04 decision 23). The target number of heats when every heat can
 * meet the minimum, otherwise fewer heats (the last heats one rider bigger); a field smaller than the minimum is one heat with
 * everyone. The minimum is never broken, even when that means one large heat. Smaller heats come first (top seeds).
 */
export function minimumRuleCapacities(n: number, target: number, min: number): number[] {
  if (n <= 0) return [];
  if (n < min) return [n];
  let heats = Math.max(1, Math.ceil(n / target));
  while (heats > 1 && Math.floor(n / heats) < min) heats--;
  return capacities(n, heats);
}

/** How many heats and how big — docs/04 §3 step 3 and Decisions 2 and 6. */
export function roundLayout(n: number, spec: LayoutSpec): RoundLayout {
  if (n <= 0) return { capacities: [], byes: 0 };
  const size = spec.heatSize;
  if (spec.heatCountOverride) return { capacities: capacities(n, Math.min(spec.heatCountOverride, n)), byes: 0 };
  if (spec.uneven === "minimum_riders") return { capacities: minimumRuleCapacities(n, size, effectiveMinHeatSize(size, spec.minHeatSize)), byes: 0 };
  if (spec.uneven === "byes_top_seeds") {
    const b = byeCount(n, size);
    if (b === 0) return { capacities: capacities(n, Math.ceil(n / size)), byes: 0 };
    return { capacities: [...Array<number>(b).fill(1), ...Array<number>((n - b) / size).fill(size)], byes: b };
  }
  if (spec.uneven === "one_larger_heat") {
    const floor = Math.floor(n / size);
    const heats = floor >= 1 && Math.ceil(n / floor) <= size + 1 ? floor : Math.ceil(n / (size + 1));
    return { capacities: capacities(n, heats), byes: 0 };
  }
  return { capacities: capacities(n, Math.ceil(n / size)), byes: 0 };
}

export function heatCount(n: number, spec: LayoutSpec): number {
  return roundLayout(n, spec).capacities.length;
}

/** Deal items 1..N in snake order (heats 1→H, then H→1, …), skipping heats that are already full. */
export function dealSnake<T>(items: T[], caps: number[]): T[][] {
  if (items.length > caps.reduce((a, b) => a + b, 0)) throw new Error("More riders than places in the heats");
  const heats: T[][] = caps.map(() => []);
  let next = 0;
  for (let pass = 0; next < items.length; pass++) {
    const order = caps.map((_, i) => i);
    if (pass % 2 === 1) order.reverse();
    for (const h of order) {
      if (next >= items.length) break;
      if (heats[h].length < caps[h]) heats[h].push(items[next++]);
    }
  }
  return heats;
}

/** Fill heat 1, then heat 2, … in item order. */
export function dealSequential<T>(items: T[], caps: number[]): T[][] {
  if (items.length > caps.reduce((a, b) => a + b, 0)) throw new Error("More riders than places in the heats");
  const heats: T[][] = [];
  let at = 0;
  for (const c of caps) {
    heats.push(items.slice(at, at + c));
    at += c;
  }
  return heats;
}

/** Deal items (best first) into the round's heats according to its layout and seeding rule. */
export function dealByRule<T>(items: T[], layout: RoundLayout, seeding: RoundSpec["seeding"]): T[][] {
  const deal = seeding === "sequential" || seeding === "manual" ? dealSequential : dealSnake;
  if (layout.byes > 0) {
    const b = layout.byes;
    return [...items.slice(0, b).map((x) => [x]), ...deal(items.slice(b), layout.capacities.slice(b))];
  }
  return deal(items, layout.capacities);
}

/** Small seeded PRNG (mulberry32): the same seed always gives the same shuffle. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle with a stored seed, so a random draw is reproducible and auditable. */
export function shuffleSeeds<T>(items: T[], rngSeed: number): T[] {
  const out = [...items];
  const rand = mulberry32(rngSeed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic default rng seed (FNV-1a over the entrant ids) when the caller supplies none. */
export function defaultRngSeed(ids: string[]): number {
  let h = 2166136261;
  for (const ch of ids.join("|")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
