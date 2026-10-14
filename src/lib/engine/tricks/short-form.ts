/**
 * The trick in a few capital letters, the way it sits in an attempt box: "Left ×2 Backroll Board-off" with the spotter's L is "L ×2 BR BO". Pure: no I/O. One table, used
 * by every public place that shows a trick (the attempt boxes on the public pages and on Follow the heat, the Highest jump line; the rider reports will use it later).
 *
 * The rule has no words in it: every trick is the first letter of each part of its name, in capitals. A compound word is read as its parts (Backroll is Back + roll, so BR).
 * The side stays first (L or R). A rotation count stays a number (×2, ×3, ×4; a typed double, triple or quad becomes the same); a single rotation shows nothing.
 * Text that matches nothing in the Trick list follows the same rule: the first letter of each word. Matching ignores capitals, spaces and hyphens ("back roll",
 * "Back-roll" and "BACKROLL" are one word). A count in front ("6x") stays as typed.
 *
 * Where two tricks end up with the same letters, or letters look like the side, the rule's letters are kept: `shortFormCases()` lists those cases for the owner.
 */

export interface TrickShortForm {
  /** Every spelling that gets this short form (the Trick list's own word first). Capitals, spaces and hyphens do not matter. */
  words: string[];
  /** The parts of the name the letters come from (empty for a rotation count). */
  parts: string[];
  short: string;
}

const firstLetter = (part: string): string => /\p{L}/u.exec(part)?.[0].toUpperCase() ?? "";
/** The first letter of each part, in capitals. */
export const initials = (parts: string[]): string => parts.map(firstLetter).join("");

const trick = (label: string, parts: string[]): TrickShortForm => ({ words: [label], parts, short: initials(parts) });
const count = (short: string, ...words: string[]): TrickShortForm => ({ words, parts: [], short });

/** The table: the Trick list (presets/tricks/big-air-vocabulary.json) word by word, with the parts each name is read in. */
export const TRICK_SHORT_FORMS: readonly TrickShortForm[] = [
  // base tricks
  trick("Straight jump", ["Straight", "jump"]),
  trick("Backroll", ["Back", "roll"]),
  trick("Frontroll", ["Front", "roll"]),
  trick("Kiteloop", ["Kite", "loop"]),
  trick("Megaloop", ["Mega", "loop"]),
  trick("Double loop", ["Double", "loop"]),
  trick("Triple loop", ["Triple", "loop"]),
  trick("S-loop", ["S", "loop"]),
  trick("Contra loop", ["Contra", "loop"]),
  trick("Doobie loop", ["Doobie", "loop"]),
  trick("Boogie loop", ["Boogie", "loop"]),
  trick("Late backroll", ["Late", "back", "roll"]),
  trick("Late frontroll", ["Late", "front", "roll"]),
  trick("Heart attack", ["Heart", "attack"]),
  // add-ons
  trick("Board-off", ["Board", "off"]),
  trick("One-foot", ["One", "foot"]),
  trick("Board spin", ["Board", "spin"]),
  trick("Handle pass", ["Handle", "pass"]),
  trick("+ Kiteloop", ["Kite", "loop"]),
  trick("Late", ["Late"]),
  trick("Late rotations", ["Late", "rotations"]),
  trick("Tic-tac", ["Tic", "tac"]),
  // grabs and landings
  trick("Grab", ["Grab"]),
  trick("Indy", ["Indy"]),
  trick("Tail", ["Tail"]),
  trick("Nose", ["Nose"]),
  trick("Melon", ["Melon"]),
  trick("Mute", ["Mute"]),
  trick("Stalefish", ["Stale", "fish"]),
  trick("Method", ["Method"]),
  trick("Blind landing", ["Blind", "landing"]),
  trick("Toeside", ["Toe", "side"]),
  // rotation counts: a number, never letters; a single rotation shows nothing
  count("", "×1", "x1", "Single"),
  count("×2", "×2", "x2", "Double"),
  count("×3", "×3", "x3", "Triple"),
  count("×4", "×4", "x4", "Quad"),
];

/** Words that are in the spotter's Trick list but are not tricks: they are left out of every box (not shortened, not shown). */
export const LEFT_OUT_OF_BOXES: readonly string[] = ["Downloop landing", "Downloop"];

/** A word for matching: lower case, with spaces, hyphens and the like taken out. */
export const normaliseTrickWord = (s: string): string => s.toLowerCase().replace(/[\s\-–—_.]+/g, "");

const LOOKUP: ReadonlyMap<string, string> = new Map([
  ...TRICK_SHORT_FORMS.flatMap((e) => e.words.map((w) => [normaliseTrickWord(w), e.short] as const)),
  ...LEFT_OUT_OF_BOXES.map((w) => [normaliseTrickWord(w), ""] as const),
]);
/** The longest phrase of the table, in words as typed. */
const LONGEST_PHRASE = 3;
/** A count in front of a trick, or a bare number: kept as typed ("6x", "720"). */
const KEPT_AS_TYPED = /^\d+[x×]?$/i;

const SIDE_WORD: Record<string, "L" | "R"> = { left: "L", right: "R", l: "L", r: "R" };

/** "left" / "right" (or L / R) from the spotter's L / R; null for anything else. */
function sideOf(value: string | null | undefined): "L" | "R" | null {
  return value ? (SIDE_WORD[normaliseTrickWord(value)] ?? null) : null;
}

/**
 * "L ×2 BR": the side first (the spotter's L / R, else the side written in the name; nothing when there is none), then the rotation count, then the initials of
 * each part of the trick. Empty when no trick was logged, even if a side was set.
 */
export function shortTrickName(name: string | null | undefined, side?: string | null): string {
  const tokens = (name ?? "").split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  let named: "L" | "R" | null = null;
  const words: string[] = [];
  // words the Trick list does not know are read together as one piece of text: "Mystery Spin" is MS
  let free: string[] = [];
  const flush = () => {
    if (free.length) words.push(initials(free.flatMap((t) => t.split(/[-–—]+/))));
    free = [];
  };
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
      flush();
      words.push(hit.short);
      i += hit.used;
    } else if (KEPT_AS_TYPED.test(tokens[i])) {
      flush();
      words.push(tokens[i]);
      i += 1;
    } else {
      free.push(tokens[i]);
      i += 1;
    }
  }
  flush();
  return [sideOf(side) ?? named, ...words].filter(Boolean).join(" ");
}

/**
 * What an attempt box may show of the trick. Nothing for a crash, and nothing where the score is not shown yet: a trick never shows where its score does not.
 */
export function attemptTrickText(a: { status: "landed" | "crashed"; trickName: string | null | undefined; direction?: string | null; scored: boolean }): string {
  if (a.status !== "landed" || !a.scored) return "";
  return shortTrickName(a.trickName, a.direction);
}

/**
 * The cases where the rule's letters are not unambiguous, for the owner to decide (the letters are kept as the rule gives them):
 * `same` — tricks that end up with the same letters; `side` — letters that read as the side (exactly L or R, or beginning with L or R after the side).
 */
export function shortFormCases(): { same: Array<{ short: string; words: string[] }>; sideExact: Array<{ short: string; words: string[] }>; sideStart: Array<{ short: string; words: string[] }> } {
  const tricks = TRICK_SHORT_FORMS.filter((e) => e.parts.length > 0);
  const byShort = new Map<string, string[]>();
  for (const e of tricks) byShort.set(e.short, [...(byShort.get(e.short) ?? []), e.words[0]]);
  const rows = [...byShort].map(([short, words]) => ({ short, words }));
  return {
    same: rows.filter((r) => r.words.length > 1),
    sideExact: rows.filter((r) => r.short === "L" || r.short === "R"),
    sideStart: rows.filter((r) => r.short.length > 1 && /^[LR]/.test(r.short)),
  };
}
