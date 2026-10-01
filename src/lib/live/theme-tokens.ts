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
  /** Cards and pads. */
  surface: string;
  /** Normal text. */
  ink: string;
  /** Secondary text. Never light grey. */
  muted: string;
  /** Frames of cards, pads and buttons. */
  border: string;
  /** Keyboard focus ring. */
  focus: string;
  /** Live / synced. */
  live: string;
  /** Waiting to be sent. */
  pending: string;
  /** Could not be sent. */
  failed: string;
  /** Crash. Also the fill of the CRASH button. */
  crash: string;
  /** A score far from the other judges. */
  outlier: string;
  /** A score that is not there (yet). */
  missing: string;
  /** The selected rider, attempt or pad button: its fill. */
  selected: string;
  /** Text on a `selected` fill. */
  onSelected: string;
  /** Text on a `crash` fill. */
  onCrash: string;
}

export const BEACH_THEMES: { day: BeachTokens; dark: BeachTokens } = {
  day: {
    bg: "#ffffff",
    surface: "#f2f2f2",
    ink: "#111111",
    muted: "#3b3b3b",
    border: "#111111",
    focus: "#0b2e8a",
    live: "#14532d",
    pending: "#1e3a8a",
    failed: "#9f1239",
    crash: "#991b1b",
    outlier: "#7c3f00",
    missing: "#404040",
    selected: "#0b2e8a",
    onSelected: "#ffffff",
    onCrash: "#ffffff",
  },
  dark: {
    bg: "#0a0a0a",
    surface: "#1c1c1c",
    ink: "#fafafa",
    muted: "#d4d4d4",
    border: "#fafafa",
    focus: "#9ec5ff",
    live: "#86efac",
    pending: "#9ec5ff",
    failed: "#fda4af",
    crash: "#fca5a5",
    outlier: "#fcd34d",
    missing: "#c4c4c4",
    selected: "#9ec5ff",
    onSelected: "#0a0a0a",
    onCrash: "#0a0a0a",
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
  ["onSelected", "selected"],
  ["onCrash", "crash"],
  ["selected", "bg"],
  ["selected", "surface"],
];

/** The plain plate that carries the colour name on a Lycra colour block (same in both themes). */
export const NAMEPLATE = { bg: "#ffffff", ink: "#111111" } as const;

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
