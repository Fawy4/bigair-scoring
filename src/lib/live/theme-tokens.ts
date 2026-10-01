/**
 * The two colour themes of the official screens (docs/06 §00.1, §00.5, §00.6): Daylight (default) and Dark.
 * These hex values are the single source of truth for the contrast tests; `src/app/globals.css` (.beach-day, .beach-dark) carries
 * exactly the same values, and a test fails if the two drift apart.
 *
 * Every text colour must read at 7:1 or better on the colour it sits on (TEXT_PAIRS). Status colours are never used alone:
 * each comes with an icon and a word (docs/06 §00.5).
 */
export interface BeachTokens {
  /** Page background. */
  bg: string;
  /** Cards, sheets and the resting state of pads. */
  surface: string;
  /** The soft 1 px line around cards. Decoration only: nothing is read from it. */
  line: string;
  /** Normal text. */
  ink: string;
  /** Secondary text. Never light grey. */
  muted: string;
  /** The frame of a control (pad button, field, toggle): 4.5:1 so a button is findable in the sun. */
  border: string;
  /** Keyboard focus ring. */
  focus: string;
  /** The one accent colour (deep teal): selected state, primary button and progress. Text is never accent-coloured. */
  accent: string;
  /** Text on an `accent` fill. */
  onAccent: string;
  /** Live / synced. */
  live: string;
  /** Waiting to be sent. */
  pending: string;
  /** Could not be sent. */
  failed: string;
  /** Crash. Also the fill of the CRASH button. */
  crash: string;
  /** Text on a `crash` fill. */
  onCrash: string;
  /** A score far from the other judges. */
  outlier: string;
  /** A score that is not there (yet). */
  missing: string;
}

export const BEACH_THEMES: { day: BeachTokens; dark: BeachTokens } = {
  day: {
    bg: "#ffffff",
    surface: "#f4f6f6",
    line: "#d5dadc",
    ink: "#111111",
    muted: "#3d4246",
    border: "#5f6970",
    focus: "#0b4a46",
    accent: "#0f5c57",
    onAccent: "#ffffff",
    live: "#14532d",
    pending: "#1e3a8a",
    failed: "#9f1239",
    crash: "#991b1b",
    onCrash: "#ffffff",
    outlier: "#7c3f00",
    missing: "#404040",
  },
  dark: {
    bg: "#0b0e0f",
    surface: "#151a1b",
    line: "#2b3436",
    ink: "#f2f5f5",
    muted: "#c9d1d3",
    border: "#8d999c",
    focus: "#9ee7de",
    accent: "#5fd3c6",
    onAccent: "#04211e",
    live: "#86efac",
    pending: "#9ec5ff",
    failed: "#fda4af",
    crash: "#fca5a5",
    onCrash: "#0b0e0f",
    outlier: "#fcd34d",
    missing: "#c4c4c4",
  },
};

export type TokenName = keyof BeachTokens;

/** Every (text colour, background colour) pair the components use. Each must reach 7:1 in both themes. */
export const TEXT_PAIRS: ReadonlyArray<readonly [TokenName, TokenName]> = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["live", "bg"],
  ["live", "surface"],
  ["pending", "bg"],
  ["pending", "surface"],
  ["failed", "bg"],
  ["failed", "surface"],
  ["crash", "bg"],
  ["crash", "surface"],
  ["outlier", "bg"],
  ["outlier", "surface"],
  ["missing", "bg"],
  ["missing", "surface"],
  ["onAccent", "accent"],
  ["onCrash", "crash"],
];

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1 to 21), the same whichever is on top. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
