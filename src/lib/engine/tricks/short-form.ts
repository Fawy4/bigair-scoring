/**
 * The trick in a few capital letters, the way it sits in an attempt box: "Left ×2 Backroll Board-off" with the spotter's L is "L ×2 BR BO". Pure: no I/O. One table, used
 * by every public place that shows a trick (the attempt boxes on the public pages and on Follow the heat, the Highest jump line; the rider reports will use it later).
 *
 * The rule has no words in it: a trick is the first letter of each part of its name, in capitals (Backroll is back + roll, so BR). The side stays first (L or R).
 * A rotation count stays a number: ×2, ×3, ×4 (a typed double, triple or quad becomes the number; a single rotation shows nothing). A count in front ("6x") stays as typed.
 *
 * The table below holds the special cases the owner decided; nothing else is special:
 *  - Double loop and Triple loop are kiteloops: ×2 KL and ×3 KL. "+ Kiteloop" is KL like Kiteloop. Every grab is G. Blind landing is B.
 *  - Late never stands alone: it joins the trick right after it with no space (Late backroll LBR, Late + Kiteloop LKL). Late rotations is left out, like Downloop.
 * A block of the event's trick base that is not in the table gets the first letter of each word of its name, a word ending in "roll" or "loop" counting as two parts.
 * Text that matches nothing in the trick base is the first letter of each word, never a single letter: a one-word unknown trick shows its first two letters.
 *
 * Typed text is matched against the event's trick base (names and aliases) by the parser the spotter's suggestions use, so a block added to the trick base later
 * needs no code change. Capitals, spaces and hyphens do not matter.
 */
import vocabularyJson from "../../../../presets/tricks/big-air-vocabulary.json";
import { parseTrickText } from "./parse";
import { buildTrickVocab, type LocalBlockInput, type TrickVocab, type VocabularyInput } from "./types";

export interface TrickShortForm {
  /** Every spelling that gets this short form (the Trick list's own word first). Capitals, spaces and hyphens do not matter. */
  words: string[];
  /** The parts of the name the letters come from, when the letters are just their first letters. */
  parts?: string[];
  short: string;
  /** "joins": the letters go in front of the trick that follows, with no space (Late). */
  joins?: true;
}

const firstLetter = (part: string): string => /\p{L}/u.exec(part)?.[0].toUpperCase() ?? "";
/** The first letter of each part, in capitals. */
export const initials = (parts: string[]): string => parts.map(firstLetter).join("");

const trick = (label: string, parts: string[]): TrickShortForm => ({ words: [label], parts, short: initials(parts) });
const GRABS = ["Grab", "Indy", "Tail", "Nose", "Melon", "Mute", "Method", "Stalefish"];

/** The table: the Trick list (presets/tricks/big-air-vocabulary.json) word by word. */
export const TRICK_SHORT_FORMS: readonly TrickShortForm[] = [
  // base tricks
  trick("Straight jump", ["Straight", "jump"]),
  trick("Backroll", ["Back", "roll"]),
  trick("Frontroll", ["Front", "roll"]),
  trick("Kiteloop", ["Kite", "loop"]),
  trick("Megaloop", ["Mega", "loop"]),
  { words: ["Double loop"], short: "×2 KL" }, // a kiteloop, twice
  { words: ["Triple loop"], short: "×3 KL" }, // a kiteloop, three times
  trick("S-loop", ["S", "loop"]),
  trick("Contra loop", ["Contra", "loop"]),
  trick("Doobie loop", ["Doobie", "loop"]),
  trick("Boogie loop", ["Boogie", "loop"]),
  trick("Late backroll", ["Late", "back", "roll"]),
  trick("Late frontroll", ["Late", "front", "roll"]),
  trick("Heart attack", ["Heart", "attack"]),
  // the judges' codes (WoS_tricks_judges2026): these are their letters, not first letters, so Snakeloop does not clash with S-loop
  { words: ["Loop back rotation invert"], short: "BRI" },
  { words: ["Snakeloop"], short: "SnL" },
  { words: ["KGB"], short: "KGB" },
  { words: ["Straight dangle pass"], short: "DP" },
  { words: ["Double dangle pass"], short: "DDP" },
  { words: ["36 Kung-Fu HP"], short: "36HP" },
  { words: ["36 Kung-Fu 2 HP"], short: "362HP" },
  { words: ["KL3"], short: "KL3" },
  // add-ons
  trick("Board-off", ["Board", "off"]),
  trick("One-foot", ["One", "foot"]),
  trick("Board spin", ["Board", "spin"]),
  trick("Osmosis", ["Osmosis"]),
  trick("Unhook", ["Unhook"]),
  trick("Handle pass", ["Handle", "pass"]),
  trick("+ Kiteloop", ["Kite", "loop"]),
  { words: ["Late"], short: "L", joins: true },
  trick("Tic-tac", ["Tic", "tac"]),
  // grabs and landings
  { words: GRABS, short: "G" },
  trick("Blind landing", ["Blind"]),
  trick("Toeside", ["Toe", "side"]),
];

/** Rotation counts as numbers: a single rotation shows nothing. */
export const ROTATION_COUNTS: ReadonlyArray<{ words: string[]; short: string }> = [
  { words: ["×1", "x1", "Single"], short: "" },
  { words: ["×2", "x2", "Double"], short: "×2" },
  { words: ["×3", "x3", "Triple"], short: "×3" },
  { words: ["×4", "x4", "Quad"], short: "×4" },
];

/** Words that are in the spotter's Trick list but are not tricks (or are not shown): they are left out of every box. */
export const LEFT_OUT_OF_BOXES: readonly string[] = ["Downloop landing", "Downloop", "Late rotations"];

/** A word for matching: lower case, with spaces, hyphens and the like taken out. */
export const normaliseTrickWord = (s: string): string => s.toLowerCase().replace(/[\s\-–—_.]+/g, "");

const TABLE: ReadonlyMap<string, TrickShortForm> = new Map(TRICK_SHORT_FORMS.flatMap((e) => e.words.map((w) => [normaliseTrickWord(w), e] as const)));
const LEFT_OUT: ReadonlySet<string> = new Set(LEFT_OUT_OF_BOXES.map(normaliseTrickWord));
const GRAB_WORDS: ReadonlySet<string> = new Set(GRABS.map(normaliseTrickWord));
const COUNT_WORDS: ReadonlyMap<string, string> = new Map(ROTATION_COUNTS.flatMap((e) => e.words.map((w) => [normaliseTrickWord(w), e.short] as const)));
/** A count in front of a trick, or a bare number: kept as typed ("6x", "720"). */
const KEPT_AS_TYPED = /^\d+[x×]?$/i;
const LEADING_COUNT = /^\s*(\d{1,2})\s*[x×]\s+(?=\S)/;

const SIDE_WORD: Record<string, "L" | "R"> = { left: "L", right: "R", l: "L", r: "R" };
/** "left" / "right" (or L / R) from the spotter's L / R; null for anything else. */
function sideOf(value: string | null | undefined): "L" | "R" | null {
  return value ? (SIDE_WORD[normaliseTrickWord(value)] ?? null) : null;
}

/** The letters of a block of the trick base that is not in the table: the first letter of each word of its name; a word ending in "roll" or "loop" is two parts. */
export function derivedLetters(label: string): string {
  const parts = label
    .split(/[\s\-–—]+/)
    .filter((w) => /\p{L}/u.test(w))
    .flatMap((w) => {
      const m = /^(.+?)(roll|loop)$/i.exec(w);
      return m && /\p{L}/u.test(m[1]) ? [m[1], m[2]] : [w];
    });
  return initials(parts);
}

/** Text that matches nothing in the trick base: the first letter of each word, but never a single letter ("Rodeo" is RO). */
function freeLetters(run: string): string[] {
  const out: string[] = [];
  let words: string[] = [];
  const flush = () => {
    if (words.length === 1) out.push([...words[0]].filter((c) => /\p{L}/u.test(c)).slice(0, 2).join("").toUpperCase());
    else if (words.length > 1) out.push(initials(words));
    words = [];
  };
  for (const w of run.split(/\s+/).filter(Boolean)) {
    const orphan = /^[x×](\d)$/i.exec(w); // a rotation count that found no trick to belong to
    if (GRAB_WORDS.has(normaliseTrickWord(w))) {
      flush();
      out.push("G");
    } else if (orphan) {
      flush();
      if (orphan[1] !== "1") out.push(`×${orphan[1]}`);
    } else if (KEPT_AS_TYPED.test(w)) {
      flush();
      out.push(w);
    } else words.push(w);
  }
  flush();
  return out.filter(Boolean);
}

export type Shortener = (name: string | null | undefined, side?: string | null) => string;

/** The event's trick base as the public rules function sends it: the master vocabulary the event uses and the blocks the event added itself. */
export interface PublicTrickBase {
  vocabulary: VocabularyInput;
  local?: LocalBlockInput[];
}

const PRESET = vocabularyJson as unknown as VocabularyInput;

/** A trick's letters are never just L or R (they would read as the side): then its first two letters instead ("Rodeo" is RO, not R). */
export function notTheSide(letters: string, name: string): string {
  if (letters !== "L" && letters !== "R") return letters;
  const two = [...name].filter((c) => /\p{L}/u.test(c)).slice(0, 2).join("").toUpperCase();
  return two.length === 2 ? two : letters;
}

function lettersOfBlock(label: string): { short: string; joins: boolean } | null {
  const k = normaliseTrickWord(label);
  if (LEFT_OUT.has(k)) return null;
  const hit = TABLE.get(k);
  if (hit) return { short: hit.joins ? hit.short : notTheSide(hit.short, label), joins: Boolean(hit.joins) };
  return { short: notTheSide(derivedLetters(label), label), joins: false };
}

/**
 * A shortener for one trick base. Typed text is read by the spotter's parser against the base's names and aliases; each block becomes its letters, the rotation
 * count a number, what no block matches the first letters of its words. Answers are remembered, so a screen that asks again every second reads each name once.
 */
export function makeShortener(base?: PublicTrickBase | null): Shortener {
  let vocab: TrickVocab;
  try {
    vocab = buildTrickVocab({ ...(base?.vocabulary ?? PRESET), categoryPrecedence: base?.vocabulary?.categoryPrecedence ?? [] }, base?.local ?? []); // the public answer holds words only: no scoring categories
  } catch {
    vocab = buildTrickVocab(PRESET);
  }
  const everyBlock = vocab.blocks.map((b) => b.id);
  const byId = new Map(vocab.blocks.map((b) => [b.id, b]));
  const remembered = new Map<string, string>();

  const compute = (name: string, sideArg: string | null | undefined): string => {
    let text = name.replace(/['’]/g, "").trim();
    let count = "";
    const lead = LEADING_COUNT.exec(text);
    if (lead) {
      count = `${lead[1]}x`;
      text = text.slice(lead[0].length);
    }
    const parsed = parseTrickText(vocab, text, everyBlock);
    const side = sideOf(sideArg) ?? sideOf(parsed.parts.direction);
    const tokens: string[] = [];
    let late = false;
    for (const item of parsed.parts.items) {
      const block = byId.get(item.id);
      if (!block) continue;
      const letters = lettersOfBlock(block.label);
      if (!letters) continue; // left out, with its rotation count
      if (letters.joins) {
        late = true;
        continue;
      }
      const times = item.multiplier ? COUNT_WORDS.get(normaliseTrickWord(item.multiplier)) : undefined;
      if (times) tokens.push(times);
      if (letters.short) tokens.push(late ? `L${letters.short}` : letters.short);
      late = false; // a Late with nothing after it is dropped: it never stands alone
    }
    for (const run of parsed.unmatched) {
      for (const t of freeLetters(run)) {
        if (!(t === "G" && tokens.at(-1) === "G")) tokens.push(t);
      }
    }
    const letters = tokens.filter((t, i) => !(t === "G" && tokens[i - 1] === "G")); // Grab Indy is one grab
    return [side, count, ...letters].filter(Boolean).join(" ");
  };

  return (name, side) => {
    if (!name || !name.trim()) return "";
    const k = `${name}\u0000${side ?? ""}`;
    let out = remembered.get(k);
    if (out === undefined) {
      out = compute(name, side);
      if (remembered.size > 2000) remembered.clear();
      remembered.set(k, out);
    }
    return out;
  };
}

const made = new WeakMap<object, Shortener>();
/** The shortener of a trick base (one per base the server holds, so the work is done once for everybody asking within the shared 3 seconds); the built-in Trick list without one. */
export function shortenerFor(base: PublicTrickBase | null | undefined): Shortener {
  if (!base) return shortTrickName;
  let s = made.get(base);
  if (!s) {
    s = makeShortener(base);
    made.set(base, s);
  }
  return s;
}

/** The shortener of the built-in Trick list. */
export const shortTrickName: Shortener = makeShortener(null);

/**
 * What an attempt box may show of the trick. Nothing for a crash, and nothing where the score is not shown yet: a trick never shows where its score does not.
 */
export function attemptTrickText(a: { status: "landed" | "crashed"; trickName: string | null | undefined; direction?: string | null; scored: boolean }, shorten: Shortener = shortTrickName): string {
  if (a.status !== "landed" || !a.scored) return "";
  return shorten(a.trickName, a.direction);
}

/**
 * The cases where the rule's letters are not unambiguous, listed for the owner (the letters are kept as the rule gives them):
 * `same` — Trick list words that end up with the same letters; `sideStart` — letters that begin with L or R after the side.
 */
export function shortFormCases(): { same: Array<{ short: string; words: string[] }>; sideExact: string[]; sideStart: Array<{ short: string; words: string[] }> } {
  const tricks = TRICK_SHORT_FORMS.filter((e) => !e.joins);
  const byShort = new Map<string, string[]>();
  for (const e of tricks) byShort.set(e.short, [...(byShort.get(e.short) ?? []), ...e.words]);
  const rows = [...byShort].map(([short, words]) => ({ short, words }));
  return {
    same: rows.filter((r) => r.words.length > 1),
    sideExact: rows.filter((r) => r.short === "L" || r.short === "R").map((r) => r.short),
    sideStart: rows.filter((r) => r.short.length > 1 && /^[LR]/.test(r.short)),
  };
}
