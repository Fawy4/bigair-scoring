import type { RoundSpec } from "@/lib/schemas/format-template";

type LayoutSpec = Pick<RoundSpec, "heatSize" | "uneven" | "heatCountOverride" | "seeding"> & { minHeatSize?: number; maxHeatSize?: number };

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

/** The largest heat size the app allows (the palette and the water both run out somewhere). */
export const MAX_HEAT_SIZE = 10;

/** The minimum riders per heat: what the organiser set, else the target − 1 (never below 2, never above the target). */
export function effectiveMinHeatSize(target: number, min?: number): number {
  return Math.min(target, Math.max(1, min ?? Math.max(2, target - 1)));
}

/** The maximum riders per heat: what the organiser set, else the target + 1 (never below the target, never above 10). */
export function effectiveMaxHeatSize(target: number, max?: number): number {
  return Math.max(target, Math.min(MAX_HEAT_SIZE, max ?? target + 1));
}

export interface HeatLimits {
  target: number;
  min: number;
  max: number;
}

export const heatLimits = (target: number, min?: number, max?: number): HeatLimits => ({
  target,
  min: effectiveMinHeatSize(target, min),
  max: effectiveMaxHeatSize(target, max),
});

/**
 * How far a set of heat sizes is from the target, lower is closer: riders above the target count far more than riders
 * below it (a heat bigger than the target is worse than a heat smaller than it), so 13 riders at target 4 make 3/3/3/4
 * rather than 4/4/5 whenever the minimum allows.
 */
export const sizeDeviation = (caps: number[], target: number): number =>
  caps.reduce((s, c) => s + (c > target ? 1000 * (c - target) : target - c), 0);

/**
 * Every number of heats that lets each heat hold between the minimum and the maximum riders (docs/04 decision 23).
 * Empty when there is no such number; a field smaller than the minimum is one heat with everyone.
 */
export function feasibleHeatCounts(n: number, { min, max }: HeatLimits): number[] {
  if (n <= 0) return [];
  if (n < min) return [1];
  const out: number[] = [];
  for (let h = 1; h <= Math.floor(n / min); h++) if (Math.ceil(n / h) <= max) out.push(h);
  return out;
}

/**
 * The heat count used when no split fits between the minimum and the maximum: the minimum still wins, so the heats are as
 * small as the minimum allows (11 riders, 4 to 4 → 5 and 6; 7 riders, 4 to 4 → one heat of 7).
 */
export const fallbackHeatCount = (n: number, { min }: HeatLimits): number => Math.max(1, Math.floor(n / Math.max(1, min)));

/**
 * "Riders per heat (target)", "Minimum per heat" and "Maximum per heat" (docs/04 decision 23). Pick the number of heats so
 * that every heat holds between the minimum and the maximum, with sizes closest to the target (see `sizeDeviation`: not above
 * the target if it can be helped, then as little below it as possible); with two equally close options, the one with fewer
 * heats. Smaller heats come first (top seeds).
 */
export function heatSizeRule(n: number, limits: HeatLimits): number[] {
  if (n <= 0) return [];
  const feasible = feasibleHeatCounts(n, limits);
  if (feasible.length === 0) return capacities(n, fallbackHeatCount(n, limits));
  let best = feasible[0];
  let bestDev = sizeDeviation(capacities(n, best), limits.target);
  for (const h of feasible.slice(1)) {
    const dev = sizeDeviation(capacities(n, h), limits.target);
    if (dev < bestDev) [best, bestDev] = [h, dev]; // strictly closer only: on a tie the earlier (fewer) heat count stays
  }
  return capacities(n, best);
}

/** How many heats and how big — docs/04 §3 step 3 and Decisions 2 and 6. */
export function roundLayout(n: number, spec: LayoutSpec): RoundLayout {
  if (n <= 0) return { capacities: [], byes: 0 };
  const size = spec.heatSize;
  if (spec.heatCountOverride) return { capacities: capacities(n, Math.min(spec.heatCountOverride, n)), byes: 0 };
  if (spec.uneven === "minimum_riders") return { capacities: heatSizeRule(n, heatLimits(size, spec.minHeatSize, spec.maxHeatSize)), byes: 0 };
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

/**
 * "Rotate" deal for round robin: riders (best seed first) go to the heat where they meet the fewest riders they have already
 * ridden against, then pairs of riders are swapped between heats while that lowers the number of repeated meetings. Heat sizes
 * stay as given. Deterministic: no clock, no randomness.
 */
export function dealRotate<T extends { id: string }>(items: T[], caps: number[], prior: string[][]): T[][] {
  if (items.length > caps.reduce((a, b) => a + b, 0)) throw new Error("More riders than places in the heats");
  const met = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const heat of prior) for (let i = 0; i < heat.length; i++) for (let j = i + 1; j < heat.length; j++) met.set(key(heat[i], heat[j]), (met.get(key(heat[i], heat[j])) ?? 0) + 1);
  const meetings = (id: string, heat: T[]) => heat.reduce((s, o) => s + (met.get(key(id, o.id)) ?? 0), 0);

  const heats: T[][] = caps.map(() => []);
  for (const item of items) {
    let best = -1;
    let bestCost = Infinity;
    heats.forEach((h, i) => {
      if (h.length >= caps[i]) return;
      const cost = meetings(item.id, h);
      if (cost < bestCost) [best, bestCost] = [i, cost];
    });
    heats[best].push(item);
  }

  // swap riders between heats while it lowers the repeats (at most a few hundred passes; every swap strictly improves)
  for (let pass = 0; pass < 500; pass++) {
    let improved = false;
    for (let a = 0; a < heats.length; a++) {
      for (let b = a + 1; b < heats.length; b++) {
        for (let i = 0; i < heats[a].length; i++) {
          for (let j = 0; j < heats[b].length; j++) {
            const x = heats[a][i];
            const y = heats[b][j];
            const restA = heats[a].filter((_, k) => k !== i);
            const restB = heats[b].filter((_, k) => k !== j);
            const before = meetings(x.id, restA) + meetings(y.id, restB);
            const after = meetings(y.id, restA) + meetings(x.id, restB);
            if (after < before) {
              [heats[a][i], heats[b][j]] = [y, x];
              improved = true;
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  const order = new Map(items.map((it, i) => [it.id, i]));
  return heats.map((h) => [...h].sort((p, q) => order.get(p.id)! - order.get(q.id)!));
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
  // "adjacent" fills heat 1, then heat 2, … from a list already ordered by source heat (the winners of H1 and H2 meet)
  const deal = seeding === "sequential" || seeding === "manual" || seeding === "adjacent" ? dealSequential : dealSnake;
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
