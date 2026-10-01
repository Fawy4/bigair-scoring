import { assertOnStep, ScoringInputError } from "@/lib/engine/scoring/round";
import type { Scale } from "@/lib/schemas/scoring-model";

/**
 * The score pad's rules (docs/06 §4: "Errors are impossible by design: no free typing, values snap to step, ranges enforced").
 * Pure: the component only draws what this says.
 */

const EPS = 1e-9;
/** A row never needs more than this many buttons; a longer scale becomes two taps (whole number, then decimal). */
export const MAX_ROW_BUTTONS = 12;

/** Digits after the decimal point that the step needs: 0.1 → 1, 0.5 → 1, 0.25 → 2, 1 → 0. */
export function decimalsOf(step: number): number {
  const s = String(step);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

/** Removes binary noise: 0.30000000000000004 → 0.3. */
function clean(x: number, step: number): number {
  return Number(x.toFixed(Math.max(decimalsOf(step), 0) + 3));
}

/** Every value the scale allows, from its own minimum, in steps. */
export function padValues(scale: Scale): number[] {
  const count = Math.floor((scale.max - scale.min) / scale.step + EPS);
  return Array.from({ length: count + 1 }, (_, i) => clean(scale.min + i * scale.step, scale.step));
}

export type PadLayout = { kind: "single"; values: number[] } | { kind: "split"; wholes: number[]; fractions: number[] };

/** One row for a short scale; for a long one, a row of whole numbers and a row of decimals. */
export function padLayout(scale: Scale): PadLayout {
  const values = padValues(scale);
  if (values.length <= MAX_ROW_BUTTONS) return { kind: "single", values };
  const wholes: number[] = [];
  for (let w = Math.floor(scale.min + EPS); w <= scale.max + EPS; w += 1) wholes.push(w);
  const perWhole = Math.max(1, Math.round(1 / scale.step));
  const fractions = Array.from({ length: perWhole }, (_, i) => clean(i * scale.step, scale.step));
  return { kind: "split", wholes, fractions };
}

/** The value for "whole number, then decimal", or null when that value does not exist on the scale. */
export function combinePad(whole: number, fraction: number, scale: Scale): number | null {
  const v = clean(whole + fraction, scale.step);
  return isAllowed(v, scale).ok ? v : null;
}

export type PadCheck = { ok: true; value: number } | { ok: false; reason: "not_a_number" | "out_of_range" | "off_step" };

/** Is this value on the scale: inside the range and on a step counted from the minimum. Uses the engine's own check. */
export function isAllowed(value: number, scale: Scale): PadCheck {
  if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" };
  try {
    assertOnStep(value, scale, "score");
    return { ok: true, value: clean(value, scale.step) };
  } catch (e) {
    if (!(e instanceof ScoringInputError)) throw e;
    return { ok: false, reason: /outside/.test(e.message) ? "out_of_range" : "off_step" };
  }
}

/** The nearest allowed value (halves round up), kept inside the range. */
export function snapToStep(value: number, scale: Scale): number {
  const clamped = Math.min(scale.max, Math.max(scale.min, value));
  const steps = Math.floor((clamped - scale.min) / scale.step + 0.5 + EPS);
  return clean(Math.min(scale.max, scale.min + steps * scale.step), scale.step);
}

/** How a value is written: always with the step's decimals, so 7 on a 0.1 pad reads 7.0. */
export function formatPadValue(value: number, scale: Scale): string {
  return value.toFixed(decimalsOf(scale.step));
}

export type PadParse = PadCheck | { ok: false; reason: "empty" };

/** A typed score (numeric keyboard): a comma counts as the decimal sign. It passes the same step and range check as a tap. */
export function parsePadInput(text: string, scale: Scale): PadParse {
  const t = text.trim().replace(",", ".");
  if (t === "") return { ok: false, reason: "empty" };
  if (!/^-?\d*\.?\d*$/.test(t) || t === "." || t === "-") return { ok: false, reason: "not_a_number" };
  return isAllowed(Number(t), scale);
}
