/**
 * The trick the way riders say it: "Left ×2 Backroll" with the spotter's L is "L ×2 BR". Pure: no I/O. One table, used by every public place that shows a trick
 * (the attempt boxes on the public pages and on Follow the heat; the rider reports will use it later).
 *
 * Matching ignores capitals, spaces and hyphens ("back roll", "Back-roll" and "BACKROLL" are the same word). A word the table does not know stays as typed, so a
 * trick a spotter typed freely is never lost. Counts in front of a trick ("6x") stay as they are.
 */

export interface TrickShortForm {
  /** Every spelling that gets this short form (the Trick list's own word first). Capitals, spaces and hyphens do not matter. */
  words: string[];
  short: string;
}

/** The table: the Trick list (presets/tricks/big-air-vocabulary.json) word by word. A word riders already say short is kept. */
export const TRICK_SHORT_FORMS: readonly TrickShortForm[] = [
  // base tricks
  { words: ["Straight jump", "Jump"], short: "Jump" },
  { words: ["Backroll", "BR"], short: "BR" },
  { words: ["Frontroll", "FR"], short: "FR" },
  { words: ["Kiteloop", "KL"], short: "KL" },
  { words: ["Megaloop", "Mega"], short: "Mega" },
  { words: ["Double loop", "Double kiteloop", "DL"], short: "DL" },
  { words: ["Triple loop", "Triple kiteloop", "TL"], short: "TL" },
  { words: ["S-loop"], short: "S-loop" },
  { words: ["Contra loop", "Contra"], short: "Contra" },
  { words: ["Doobie loop", "Doobie"], short: "Doobie" },
  { words: ["Boogie loop", "Boogie"], short: "Boogie" },
  { words: ["Late backroll"], short: "Late BR" },
  { words: ["Late frontroll"], short: "Late FR" },
  { words: ["Heart attack"], short: "Heart attack" },
  // add-ons
  { words: ["Board-off", "BO"], short: "BO" },
  { words: ["One-foot", "1ft"], short: "1ft" },
  { words: ["Board spin"], short: "Board spin" },
  { words: ["Handle pass", "HP"], short: "HP" },
  { words: ["+ Kiteloop", "+KL"], short: "+KL" },
  { words: ["Late"], short: "Late" },
  { words: ["Late rotations"], short: "Late rotations" },
  { words: ["Tic-tac"], short: "Tic-tac" },
  // grabs and landings
  { words: ["Grab"], short: "Grab" },
  { words: ["Indy"], short: "Indy" },
  { words: ["Tail"], short: "Tail" },
  { words: ["Nose"], short: "Nose" },
  { words: ["Melon"], short: "Melon" },
  { words: ["Mute"], short: "Mute" },
  { words: ["Stalefish"], short: "Stalefish" },
  { words: ["Method"], short: "Method" },
  { words: ["Blind landing", "Blind"], short: "Blind" },
  { words: ["Toeside"], short: "Toeside" },
  { words: ["Downloop landing", "Downloop"], short: "Downloop" },
  // multipliers: ×2 and ×3 stay as they are; a typed word becomes the sign
  { words: ["×1", "x1"], short: "×1" },
  { words: ["×2", "x2", "Double"], short: "×2" },
  { words: ["×3", "x3", "Triple"], short: "×3" },
  { words: ["×4", "x4", "Quad"], short: "×4" },
];

/** A word for matching: lower case, with spaces, hyphens and the like taken out. */
export const normaliseTrickWord = (s: string): string => s.toLowerCase().replace(/[\s\-–—_.]+/g, "");

const LOOKUP: ReadonlyMap<string, string> = new Map(TRICK_SHORT_FORMS.flatMap((e) => e.words.map((w) => [normaliseTrickWord(w), e.short] as const)));
/** The longest phrase of the table, in words as typed ("Downloop landing" is 2, "Double kiteloop" is 2). */
const LONGEST_PHRASE = 3;

const SIDE_WORD: Record<string, "L" | "R"> = { left: "L", right: "R", l: "L", r: "R" };

/** "left" / "right" (or L / R) from the spotter's L / R; null for anything else. */
function sideOf(value: string | null | undefined): "L" | "R" | null {
  return value ? (SIDE_WORD[normaliseTrickWord(value)] ?? null) : null;
}

/**
 * "L ×2 BR": the side first (the spotter's L / R, else the side written in the name; nothing when there is none), then the trick shortened word by word.
 * Empty when no trick was logged, even if a side was set.
 */
export function shortTrickName(name: string | null | undefined, side?: string | null): string {
  const tokens = (name ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  let named: "L" | "R" | null = null;
  const words: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const written = tokens[i].toLowerCase() === "left" ? "L" : tokens[i].toLowerCase() === "right" ? "R" : null;
    if (written && !named) {
      named = written;
      i += 1;
      continue;
    }
    let hit: { short: string; used: number } | null = null;
    for (let n = Math.min(LONGEST_PHRASE, tokens.length - i); n >= 1 && !hit; n--) {
      const short = LOOKUP.get(normaliseTrickWord(tokens.slice(i, i + n).join(" ")));
      if (short !== undefined) hit = { short, used: n };
    }
    if (hit) {
      words.push(hit.short);
      i += hit.used;
    } else {
      words.push(tokens[i]);
      i += 1;
    }
  }
  return [sideOf(side) ?? named, ...words].filter(Boolean).join(" ");
}

/**
 * What an attempt box may show of the trick. Nothing for a crash, and nothing where the score is not shown yet: a trick never shows where its score does not.
 */
export function attemptTrickText(a: { status: "landed" | "crashed"; trickName: string | null | undefined; direction?: string | null; scored: boolean }): string {
  if (a.status !== "landed" || !a.scored) return "";
  return shortTrickName(a.trickName, a.direction);
}
