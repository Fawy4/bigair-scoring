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
  /** The selected score: the only large number on the screen. */
  readout: number;
  /** Section headings, when there are any. */
  heading: number;
  /** Height of a list row (history, base tricks, rider detail). */
  row: number;
  /** The composed trick name in the spotter's bar. */
  composed: number;
  /** CRASH and Log, one row at the bottom. */
  bar: number;
}

export const NORMAL: SizeTokens = { body: 14, small: 12, name: 15, digit: 16, padHeight: 38, padGap: 4, tap: 36, timerSlim: 18, timerHead: 48, radius: 10, readout: 26, heading: 12, row: 38, composed: 15, bar: 44 };
/** "Large" is what Normal was in round 3 (the owner's request in round 4): every size there is one step up. */
export const LARGE: SizeTokens = { body: 15, small: 13, name: 17, digit: 19, padHeight: 46, padGap: 6, tap: 44, timerSlim: 20, timerHead: 48, radius: 12, readout: 30, heading: 14, row: 44, composed: 17, bar: 48 };

/**
 * The owner's ranges for Normal (round 4, 1 Oct 2026): pad digits 15–16 px on pad buttons 36–40 tall, rows 36–40, the composed trick name 14–15 px,
 * CRASH and Log 44 px high, headings small. Body, status words, names, gaps and the slim timer follow from that.
 */
export const SIZE_RANGES: Partial<Record<keyof SizeTokens, readonly [number, number]>> = {
  body: [13, 15],
  small: [11, 13],
  name: [14, 16],
  digit: [15, 16],
  padHeight: [36, 40],
  padGap: [4, 6],
  tap: [36, 40],
  timerSlim: [18, 22],
  heading: [11, 13],
  readout: [24, 28],
  radius: [8, 12],
  row: [36, 40],
  composed: [14, 15],
  bar: [44, 44],
};

/** CSS variable for a size: padHeight → --size-pad-height. */
export function cssVarName(key: string): string {
  return `--size-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
