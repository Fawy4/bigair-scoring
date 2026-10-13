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
  /** The thin light-grey edge of a control at rest. Decoration: the control's words and icon carry it. */
  border: string;
  /** A control at rest: white in Day, near-black in Dark, with the thin `border` edge. Never a grey block. */
  fill: string;
  /** The filled keys of the score pad (the Queue): light grey in Day, dark grey in Dark. */
  key: string;
  /** The light-grey hint in an empty box (the "0.0" in an empty score box): clearly lighter than a real score. */
  hint: string;
  /** Keyboard focus ring. */
  focus: string;
  /** The one accent colour (teal): every button, selected state, focus ring and progress. */
  accent: string;
  /** Text on an `accent` fill. */
  onAccent: string;
  /** The accent as text (teal reads at 7:1 on the page in both themes). */
  accentText: string;
  /** The selected-state colour: the same teal as the accent. */
  selected: string;
  /** Text on a `selected` fill. */
  onSelected: string;
  /** Orange is kept for one thing: "Needs your score" (the bar, the tag border and the glow). A shape, never text; the words stay ink (7:1). Day #E65F00 (3.5:1 on white; #FF6A00 is only 2.87:1), Dark #FF6A00 (7.31:1 on black). */
  attention: string;
  /** The header bar of the officials' screens: plain white with near-black text in Day (all white, as before), the brand near-black #111111 with white and grey text in Dark. */
  board: string;
  onBoard: string;
  boardMuted: string;
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
    border: "#b0b0b0",
    fill: "#ffffff",
    key: "#f2f2f2",
    hint: "#b0b0b0",
    focus: "#0b4a46",
    accent: "#0f5c57",
    onAccent: "#ffffff",
    accentText: "#0f5c57",
    selected: "#0f5c57",
    onSelected: "#ffffff",
    attention: "#e65f00",
    board: "#ffffff",
    onBoard: "#111111",
    boardMuted: "#3a3a3a",
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
    border: "#4d4d4d",
    fill: "#111111",
    key: "#1c1c1c",
    hint: "#6b6b6b",
    focus: "#9ee7de",
    accent: "#5fd3c6",
    onAccent: "#04211e",
    accentText: "#5fd3c6",
    selected: "#5fd3c6",
    onSelected: "#04211e",
    attention: "#ff6a00",
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
  ["accentText", "surface"],
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
