/**
 * The sizes of the official screens, in px (docs/06 §00.2). "Normal" is the default; "Large" (roughly the sizes of the first preview) is a per-device switch
 * next to Daylight / Dark. `src/app/globals.css` (.beach-text-normal, .beach-text-large) carries exactly these values and a test fails if they differ.
 * Contrast, not size, is what makes a screen readable in the sun, so both keep 7:1 for essential text.
 */
export interface SizeTokens {
  /** Body text. */
  body: number;
  /** Status words in pills (Synced, Landed, Repeat …). */
  small: number;
  /** Rider names. */
  name: number;
  /** Digits on the score pad. */
  digit: number;
  /** Height of a pad button. */
  padHeight: number;
  /** Gap between pad buttons. */
  padGap: number;
  /** Smallest tap target that is not a pad button. */
  tap: number;
  /** The timer in a slim header (judge, spotter). */
  timerSlim: number;
  /** The timer on the head console and the big screen. */
  timerHead: number;
  /** Corner radius of cards. */
  radius: number;
}

export const NORMAL: SizeTokens = { body: 16, small: 14, name: 18, digit: 24, padHeight: 50, padGap: 6, tap: 44, timerSlim: 22, timerHead: 48, radius: 14 };
export const LARGE: SizeTokens = { body: 18, small: 15, name: 20, digit: 28, padHeight: 56, padGap: 8, tap: 48, timerSlim: 24, timerHead: 48, radius: 16 };

/** The owner's ranges for Normal (1 Oct 2026): body 15–16, status words 13–14, names 17–18, digits 22–24, pad buttons 48–52, gaps 6–8, slim timer 20–24. */
export const SIZE_RANGES: Partial<Record<keyof SizeTokens, readonly [number, number]>> = {
  body: [15, 16],
  small: [13, 14],
  name: [17, 18],
  digit: [22, 24],
  padHeight: [48, 52],
  padGap: [6, 8],
  radius: [12, 16],
};

/** CSS variable for a size: padHeight → --size-pad-height. */
export function cssVarName(key: string): string {
  return `--size-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
