export interface NumberRange {
  min?: number;
  max: number;
  step?: number;
}

/** Digits after the decimal point that a step allows: 0.5 → 1, 0.25 → 2, 1 → 0. */
export function decimalsOf(step: number | undefined): number {
  if (!step) return 0;
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

const digitsOf = (n: number) => String(Math.trunc(Math.abs(n))).length;

/** How many characters the longest allowed value takes: its digits, a point and the decimals, and one more when it can be negative. */
export function numberFieldChars({ min = 0, max, step }: NumberRange): number {
  const decimals = decimalsOf(step);
  return Math.max(digitsOf(max), digitsOf(min)) + (decimals > 0 ? decimals + 1 : 0) + (min < 0 ? 1 : 0);
}

/** The CSS width of a number field: its characters (digits are equally wide) plus the box (2 px frame, 12 px padding each side). Never full width. */
export function numberFieldWidth(range: NumberRange): string {
  return `calc(${numberFieldChars(range)}ch + 28px)`;
}
