import type { RiderRef } from "./custom-ladder-check";

/**
 * The riders the builder designs for. The "Preview with N riders" number decides how many there are: the division's real riders come
 * first (so a seat that names a real rider stays valid), placeholders ("Rider 23") make up the rest, and a preview number smaller than
 * the division uses only its first riders.
 */
export function previewRiders(real: readonly RiderRef[], n: number): RiderRef[] {
  const count = Math.max(1, Math.round(n));
  const out = real.slice(0, count).map((r) => ({ id: r.id, name: r.name }));
  const taken = new Set(out.map((r) => r.id));
  for (let i = out.length + 1; out.length < count; i++) {
    let id = `preview-${i}`;
    while (taken.has(id)) id = `${id}_`;
    taken.add(id);
    out.push({ id, name: `Rider ${i}` });
  }
  return out;
}

/** A placeholder made by `previewRiders`: it can be a seed, but never named as a rider in a saved ladder. */
export const isPreviewRider = (id: string) => id.startsWith("preview-");

export interface DesignDifference {
  designed: number;
  real: number;
  /** Seats of Round 1 that will stay empty because the division has fewer riders than the ladder was designed for. */
  emptySeats: number;
  /** Real riders who get no seat because the ladder was designed for fewer. */
  ridersWithoutSeat: number;
}

/** How "Apply to draw" differs from the design: null when the division has exactly as many riders as the design. */
export function designDifference(designed: number, real: number): DesignDifference | null {
  if (designed === real) return null;
  return { designed, real, emptySeats: Math.max(0, designed - real), ridersWithoutSeat: Math.max(0, real - designed) };
}
