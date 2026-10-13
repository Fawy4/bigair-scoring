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
  /** The thin hairline of a control at rest (a shape, not text): 3:1 on the page so a button is still findable in the sun. */
  border: string;
  /** The soft fill of a control at rest (button, field, rider card): light grey in Day, dark grey in Dark. */
  fill: string;
  /** Keyboard focus ring. */
  focus: string;
  /** The one accent colour (electric orange #FF6A00, the brand): the main button, selected state, bars and glows. A fill, never text on a light page. */
  accent: string;
  /** The selected-state colour (teal): selected switch, tab, chip, step, rider card. Orange is "act now" only. */
  selected: string;
  /** Text on a `selected` fill. */
  onSelected: string;
  /** The scoreboard bar (the header of the officials' screens): near-black in both themes, with white and grey text. */
  board: string;
  onBoard: string;
  boardMuted: string;
  /** Text on an `accent` fill: black (7.31:1); white on orange is only 2.87:1. */
  onAccent: string;
  /** The accent as text. In Day it is the page ink (orange on white is 2.87:1, so orange is never text there); in Dark it is the orange itself, and only on `bg` (#000000, 7.31:1). */
  accentText: string;
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
  /** Result rows: a crash is red. Text on it is ink. */
  tintCrash: string;
  /** Result rows: a trick that did not count is grey. */
  tintGrey: string;
  /** Public heat summary: counted scores graded across the heat, grade 0 the yellowest (the lowest counted score) to grade 4 the greenest (the highest). Text on them is ink. */
  tintGrade0: string;
  tintGrade1: string;
  tintGrade2: string;
  tintGrade3: string;
  tintGrade4: string;
  /** Head judge's table: a judge's score by its distance from the panel score: within tolerance (0, green), then yellow (1), orange (2), red (3). Text on them is ink. */
  tintDist0: string;
  tintDist1: string;
  tintDist2: string;
  tintDist3: string;
}

export const BEACH_THEMES: { day: BeachTokens; dark: BeachTokens } = {
  day: {
    bg: "#ffffff",
    surface: "#f4f4f4",
    line: "#dcdcdc",
    ink: "#111111",
    muted: "#3a3a3a",
    border: "#8c8c8c",
    fill: "#f2f2f2",
    focus: "#111111",
    accent: "#ff6a00",
    onAccent: "#000000",
    accentText: "#111111",
    selected: "#115e59",
    onSelected: "#ffffff",
    board: "#111111",
    onBoard: "#ffffff",
    boardMuted: "#b0b0b0",
    live: "#14532d",
    pending: "#1e3a8a",
    failed: "#9f1239",
    crash: "#991b1b",
    onCrash: "#ffffff",
    outlier: "#7c3f00",
    missing: "#404040",
    tintCrash: "#f8cfcf",
    tintGrey: "#e2e5e6",
    tintGrade0: "#f3dc6b",
    tintGrade1: "#d6e275",
    tintGrade2: "#b4e08a",
    tintGrade3: "#8fd79a",
    tintGrade4: "#6fcf97",
    tintDist0: "#b7e8c6",
    tintDist1: "#f3e27a",
    tintDist2: "#f6b86b",
    tintDist3: "#f29a9a",
  },
  dark: {
    bg: "#000000",
    surface: "#111111",
    line: "#2a2a2a",
    ink: "#ffffff",
    muted: "#b0b0b0",
    border: "#5a5a5a",
    fill: "#1c1c1c",
    focus: "#ffffff",
    accent: "#ff6a00",
    onAccent: "#000000",
    accentText: "#ff6a00",
    selected: "#2dd4bf",
    onSelected: "#000000",
    board: "#111111",
    onBoard: "#ffffff",
    boardMuted: "#b0b0b0",
    live: "#86efac",
    pending: "#9ec5ff",
    failed: "#fda4af",
    crash: "#ff6b6b",
    onCrash: "#000000",
    outlier: "#fcd34d",
    missing: "#c4c4c4",
    tintCrash: "#5a1f1f",
    tintGrey: "#1f1f1f",
    tintGrade0: "#5a4a0c",
    tintGrade1: "#4a5410",
    tintGrade2: "#38581a",
    tintGrade3: "#265a27",
    tintGrade4: "#165c35",
    tintDist0: "#165c35",
    tintDist1: "#5a4a0c",
    tintDist2: "#6b3a0e",
    tintDist3: "#6b1f1f",
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
  // crash words sit on the page itself (Dark #FF6B6B is 8.6:1 on #000000, but only 6.8:1 on #111111), never on a grey surface
  ["crash", "bg"],
  ["outlier", "bg"],
  ["outlier", "surface"],
  ["missing", "bg"],
  ["missing", "surface"],
  ["onAccent", "accent"],
  ["accentText", "bg"],
  ["onSelected", "selected"],
  ["onBoard", "board"],
  ["boardMuted", "board"],
  ["ink", "fill"],
  ["muted", "fill"],
  ["onCrash", "crash"],
  ["ink", "tintCrash"],
  ["ink", "tintGrey"],
  ["muted", "tintGrey"],
  ["ink", "tintGrade0"],
  ["ink", "tintGrade1"],
  ["ink", "tintGrade2"],
  ["ink", "tintGrade3"],
  ["ink", "tintGrade4"],
  ["ink", "tintDist0"],
  ["ink", "tintDist1"],
  ["ink", "tintDist2"],
  ["ink", "tintDist3"],
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
