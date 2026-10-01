import type { ScoringModel } from "@/lib/schemas/scoring-model";

/** How far a judge's score may be from the panel score before it is called an outlier: the scoring model's own threshold (a percentage of the trick scale). */
export function outlierTolerance(model: ScoringModel): number {
  return (model.panel.outlierWarnPct / 100) * (model.trick.scale.max - model.trick.scale.min);
}

/** 0 = within tolerance (green), 1 = yellow (up to 1.5 × tolerance), 2 = orange (up to 2 ×), 3 = red (further). */
export function distanceBand(distance: number, tolerance: number): 0 | 1 | 2 | 3 {
  const d = Math.abs(distance) / tolerance;
  if (d <= 1 + 1e-9) return 0;
  if (d <= 1.5 + 1e-9) return 1;
  if (d <= 2 + 1e-9) return 2;
  return 3;
}

/** A judge's cell: its band, and the signed distance as text (colour is never alone): "+0.4", "−1.6", or nothing when it equals the panel score. */
export function cellTone(score: number, panel: number, tolerance: number): { band: 0 | 1 | 2 | 3; delta: string } {
  const d = score - panel;
  const delta = Math.abs(d) < 0.05 ? "" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`;
  return { band: distanceBand(d, tolerance), delta };
}
