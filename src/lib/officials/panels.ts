import { mergeOverrides } from "@/lib/scoring-ui/overrides";

/** How many judges a division's scoring rules ask for: the model's own number with the division's overrides applied (at least 1). */
export function minJudgesFor(modelJson: unknown, overrides: unknown): number {
  const merged = mergeOverrides((modelJson ?? {}) as Record<string, unknown>, overrides ?? {}) as { panel?: { minJudges?: unknown } };
  const n = Number(merged.panel?.minJudges);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
