import type { Scale } from "@/lib/schemas/scoring-model";

const STEP_TOLERANCE = 1e-6;

/** Thrown when judge input breaks the model's rules (off-step or out-of-range values, unknown criteria). */
export class ScoringInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringInputError";
  }
}

/**
 * Round half-up (half away from zero) to `decimals`, immune to binary noise:
 * 1.005 is stored as 1.00499999…, so we round the scaled value to 12 significant digits first.
 */
export function roundHalfUp(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return x;
  const factor = 10 ** decimals;
  const scaled = Number((Math.abs(x) * factor).toPrecision(12));
  const rounded = (Math.sign(x) * Math.round(scaled)) / factor;
  return rounded === 0 ? 0 : rounded; // no -0
}

/** Throws ScoringInputError unless `value` lies inside the scale and on its step. */
export function assertOnStep(value: number, scale: Scale, label: string): void {
  if (!Number.isFinite(value)) {
    throw new ScoringInputError(`${label}: ${value} is not a number`);
  }
  if (value < scale.min - STEP_TOLERANCE || value > scale.max + STEP_TOLERANCE) {
    throw new ScoringInputError(`${label}: ${value} is outside ${scale.min}–${scale.max}`);
  }
  const steps = (value - scale.min) / scale.step;
  if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
    throw new ScoringInputError(`${label}: ${value} is not on the ${scale.step} step`);
  }
}

export type ScaleProblem = "off_step" | "out_of_range" | "not_a_number";

/**
 * The value the engine uses for a mark that may not be on the scale (audit A1a-3): a value on the step is kept; an off-step value goes to the nearest step
 * (halves up, steps counted from the scale's minimum); a value outside the scale goes to the nearest end; something that is not a number gives no value.
 * `problem` says what was wrong, null when nothing was.
 */
export function nearestOnScale(value: number, scale: Scale): { value: number | null; problem: ScaleProblem | null } {
  if (!Number.isFinite(value)) return { value: null, problem: "not_a_number" };
  const outside = value < scale.min - STEP_TOLERANCE || value > scale.max + STEP_TOLERANCE;
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  const rawSteps = Number(((clamped - scale.min) / scale.step).toPrecision(12));
  let steps = Math.floor(rawSteps + 0.5);
  const lastStep = Math.floor(Number(((scale.max - scale.min) / scale.step).toPrecision(12)) + STEP_TOLERANCE);
  steps = Math.min(steps, lastStep); // a maximum that is not on the step: the highest step below it
  const used = roundHalfUp(scale.min + steps * scale.step, 8);
  const problem: ScaleProblem | null = outside ? "out_of_range" : Math.abs(rawSteps - Math.round(rawSteps)) > STEP_TOLERANCE ? "off_step" : null;
  return { value: used, problem };
}

export function formatScore(value: number, decimals: number): string {
  return roundHalfUp(value, decimals).toFixed(decimals);
}
