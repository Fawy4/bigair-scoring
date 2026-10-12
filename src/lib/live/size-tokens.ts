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
  /** Corner radius of a card or sheet that still has one (the New look uses rows and pills instead; buttons are fully round). */
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

export const NORMAL: SizeTokens = { body: 13, small: 12, name: 14, digit: 16, padHeight: 44, padGap: 4, tap: 44, timerSlim: 18, timerHead: 48, radius: 16, readout: 24, heading: 12, row: 44, composed: 14, bar: 44 };
/** "Large" is what Normal was before the New look (the owner found Normal still too large on an iPhone 14): the sizes of 0.20.0's Normal, with a 48 px tap size. */
export const LARGE: SizeTokens = { body: 14, small: 12, name: 15, digit: 17, padHeight: 48, padGap: 6, tap: 48, timerSlim: 20, timerHead: 48, radius: 16, readout: 26, heading: 12, row: 48, composed: 15, bar: 48 };

/**
 * The ranges for Normal. Round 4 (1 Oct 2026) made it calm; the New look (0.21.0) makes the text one step smaller again (owner: "Normal is still too large on my iPhone 14")
 * and every tap target at least 44 px (pad buttons, rows, chips, CRASH and Log), so a smaller Normal is smaller TEXT, never smaller buttons.
 */
export const SIZE_RANGES: Partial<Record<keyof SizeTokens, readonly [number, number]>> = {
  body: [12, 14],
  small: [11, 13],
  name: [13, 15],
  digit: [16, 16],
  padHeight: [44, 44],
  padGap: [4, 6],
  tap: [44, 44],
  timerSlim: [18, 22],
  heading: [11, 13],
  readout: [22, 26],
  radius: [8, 24],
  row: [44, 44],
  composed: [13, 15],
  bar: [44, 44],
};

/** CSS variable for a size: padHeight → --size-pad-height. */
export function cssVarName(key: string): string {
  return `--size-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
