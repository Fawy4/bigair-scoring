/** A row of the Riders table, as far as ordering is concerned. */
export interface OrderRow {
  id: string;
  name: string;
  seed: number | null;
}

/** Small, fast, seedable random numbers (mulberry32): the same seed always gives the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh shuffle code: a positive whole number a person can read out and type again. */
export function newShuffleSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 999_999);
}

/**
 * Shuffles riders so that the same code on the same riders always gives the same order, whatever order they were in before
 * (the riders are first put in a fixed order: name, then id). Returns a new list.
 */
export function shuffleSeeded<T extends { id: string; name: string }>(items: readonly T[], seed: number): T[] {
  const out = [...items].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "Sort by seed number": by the typed seed, riders without one last, ties keep their current order. */
export function sortBySeedNumber<T extends OrderRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.seed ?? Infinity) - (b.row.seed ?? Infinity) || a.index - b.index)
    .map((x) => x.row);
}

/** Gives the riders seeds 1…n in the order they are in. */
export function renumber<T extends OrderRow>(rows: readonly T[]): T[] {
  return rows.map((r, i) => ({ ...r, seed: i + 1 }));
}

/** Moves one rider up or down by one place (the tap alternative to dragging). */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length || from === to) return [...rows];
  const out = [...rows];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
