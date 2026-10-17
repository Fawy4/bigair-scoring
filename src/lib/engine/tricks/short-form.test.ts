import { describe, expect, it } from "vitest";
import vocabulary from "../../../../presets/tricks/big-air-vocabulary.json";
import { attemptTrickText, derivedLetters, initials, LEFT_OUT_OF_BOXES, makeShortener, normaliseTrickWord, notTheSide, shortFormCases, shortTrickName, TRICK_SHORT_FORMS, type PublicTrickBase } from "./short-form";
import type { VocabularyInput } from "./types";

const PRESET = vocabulary as unknown as VocabularyInput;
const of = (name: string, side: string | null = null) => shortTrickName(name, side);

describe("shortTrickName: capitals only, the first letter of each part of the name", () => {
  it("puts the side first and shortens the trick", () => {
    expect(of("×2 Backroll", "left")).toBe("L ×2 BR");
    expect(of("×2 Backroll", "right")).toBe("R ×2 BR");
    expect(of("Left ×2 Backroll", "left")).toBe("L ×2 BR");
  });

  it("the owner's examples", () => {
    expect(of("Backroll")).toBe("BR");
    expect(of("Frontroll")).toBe("FR");
    expect(of("Kiteloop")).toBe("KL");
    expect(of("Megaloop")).toBe("ML");
    expect(of("Doobie loop")).toBe("DL");
    expect(of("Boogie loop")).toBe("BL");
    expect(of("Contra loop")).toBe("CL");
    expect(of("Board-off")).toBe("BO");
    expect(of("Handle pass")).toBe("HP");
    expect(of("Heart attack")).toBe("HA");
  });

  it("Double loop and Triple loop are kiteloops: ×2 KL and ×3 KL", () => {
    expect(of("Double loop")).toBe("×2 KL");
    expect(of("Triple loop")).toBe("×3 KL");
    expect(of("Left Double loop", null)).toBe("L ×2 KL");
    expect(of("×2 Kiteloop")).toBe("×2 KL"); // the same trick written the other way
  });

  it("+ Kiteloop is KL, the same as Kiteloop", () => {
    expect(of("+ Kiteloop")).toBe("KL");
    expect(of("Backroll + Kiteloop")).toBe("BR KL");
  });

  it("Boogie loop is BL and Blind landing is B", () => {
    expect(of("Boogie loop")).toBe("BL");
    expect(of("Blind landing")).toBe("B");
  });

  it("every grab is G, however it is written; a grab with its kind is one G", () => {
    for (const grab of ["Grab", "Indy", "Tail", "Nose", "Melon", "Mute", "Method", "Stalefish", "tail grab", "indy grab"]) expect(of(grab), grab).toBe("G");
    expect(of("Left Backroll Grab Indy")).toBe("L BR G");
  });

  it("Late never stands alone: it joins the trick right after it, with no space", () => {
    expect(of("Late backroll")).toBe("LBR");
    expect(of("Late frontroll")).toBe("LFR");
    expect(of("Late + Kiteloop")).toBe("LKL");
    expect(of("Left Late Backroll")).toBe("L LBR");
    expect(of("Late ×2 Backroll")).toBe("×2 LBR");
    expect(of("Backroll Late Board-off")).toBe("BR LBO");
    expect(of("Late")).toBe("");
    expect(of("Backroll Late")).toBe("BR"); // nothing after it: dropped
    for (const name of ["Late", "Late backroll", "Late + Kiteloop", "Backroll Late"]) expect(of(name)).not.toMatch(/(^| )L( |$)/); // no lone L beside the side
  });

  it("Late rotations is left out, like Downloop, and so is its rotation count", () => {
    expect(of("Late rotations")).toBe("");
    expect(of("Left Backroll Late rotations")).toBe("L BR");
    expect(of("Backroll ×4 Late rotations")).toBe("BR");
    expect(of("Left Backroll Downloop landing")).toBe("L BR");
    expect(of("Downloop landing")).toBe("");
  });

  it("the rotation count stays a number; a typed double, triple or quad becomes the number; a single rotation shows nothing", () => {
    expect(of("×3 Frontroll")).toBe("×3 FR");
    expect(of("Double Backroll", "left")).toBe("L ×2 BR");
    expect(of("triple frontroll", "right")).toBe("R ×3 FR");
    expect(of("quad Kiteloop")).toBe("×4 KL");
    expect(of("×1 Backroll")).toBe("BR");
    expect(of("single Backroll", "left")).toBe("L BR");
  });

  it("ignores capitals, spaces and hyphens, and reads a slip of the pen the way the spotter's suggestions do", () => {
    for (const typed of ["BACKROLL", "back roll", "Back-roll", "backRoll", "  Back   Roll "]) expect(of(typed, "left")).toBe("L BR");
    expect(of("kite loop")).toBe("KL");
    expect(of("Board off")).toBe("BO");
    expect(of("dubble backroll")).toBe("×2 BR");
  });

  it("takes the side from the name when the spotter set none, and shows none when there is none; the spotter's side wins", () => {
    expect(of("Left Backroll")).toBe("L BR");
    expect(of("Right Kiteloop Board-off")).toBe("R KL BO");
    expect(of("Backroll", "")).toBe("BR");
    expect(of("Left Backroll", "right")).toBe("R BR");
  });

  it("shortens every block of a longer trick, in the order tapped", () => {
    expect(of("Left ×2 Backroll Board-off Handle pass", "left")).toBe("L ×2 BR BO HP");
    expect(of("Right Kiteloop Late backroll", "right")).toBe("R KL LBR");
    expect(of("Left ×2 Backroll Board-off Handle pass Late rotations Tic-tac Toeside Stalefish", "left")).toBe("L ×2 BR BO HP TT TS G");
  });

  it("a count in front, or a bare number, stays as typed", () => {
    expect(of("6x Frontroll")).toBe("6x FR");
    expect(of("2x Backroll", "left")).toBe("L 2x BR");
    expect(of("720 Mystery")).toBe("720 MY");
  });

  it("no trick logged gives nothing, even when a side was set", () => {
    expect(shortTrickName(null, "left")).toBe("");
    expect(shortTrickName("", "right")).toBe("");
    expect(shortTrickName("   ", null)).toBe("");
  });

  it("a corrected trick gives its new letters at once", () => {
    expect(of("Left Backroll")).toBe("L BR");
    expect(of("Left Frontroll Board-off")).toBe("L FR BO");
  });
});

describe("text that matches nothing in the trick base: the first letter of each word, never a single letter", () => {
  it("a one-word unknown trick shows its first two letters, so it can never be mistaken for the side", () => {
    expect(of("Rodeo")).toBe("RO");
    expect(of("Rodeo", "left")).toBe("L RO");
    expect(of("Lasso")).toBe("LA");
    expect(of("Sushi")).toBe("SU");
  });
  it("several words: the first letter of each word", () => {
    expect(of("Shark Attack", "right")).toBe("R SA");
    expect(of("sushi roll", "right")).toBe("R SR");
    expect(of("Mystery Spin")).toBe("MS");
    expect(of("Sam's special", "left")).toBe("L SS");
    expect(of("hot-dog flip")).toBe("HDF");
  });
  it("beside known tricks, the unknown words are read together and come last", () => {
    expect(of("Sushi Backroll")).toBe("BR SU");
    expect(of("Left Shark attack Board-off")).toBe("L BO SA");
  });
  it("never a lone L or R from unknown text", () => {
    for (const name of ["Rodeo", "Lasso", "Rail", "Lurch"]) expect(of(name), name).not.toMatch(/^[LR]$/);
  });
});

describe("the event's trick base: a block added later needs no code change", () => {
  const base = (extra: { baseTricks?: object[]; modifiers?: object[] }, local: PublicTrickBase["local"] = []): PublicTrickBase => ({
    vocabulary: { ...PRESET, baseTricks: [...PRESET.baseTricks, ...(extra.baseTricks ?? [])], modifiers: [...PRESET.modifiers, ...(extra.modifiers ?? [])] } as VocabularyInput,
    local,
  });

  it("a block that is not in the table gets the first letter of each word of its name; a word ending in roll or loop counts as two parts", () => {
    expect(derivedLetters("Backroll")).toBe("BR");
    expect(derivedLetters("Kiteloop")).toBe("KL");
    expect(derivedLetters("Sushi roll")).toBe("SR");
    expect(derivedLetters("Cartwheelroll")).toBe("CR"); // Cartwheel + roll
    expect(derivedLetters("Shark Attack")).toBe("SA");
    expect(derivedLetters("Hot-dog flip")).toBe("HDF");
    expect(initials(["Back", "roll"])).toBe("BR");
    const s = makeShortener(base({ baseTricks: [{ key: "shark_attack", label: "Shark Attack", category: "other", aliases: ["shark"] }, { key: "sushi_roll", label: "Sushi roll", category: "rotation", aliases: ["sushi"] }] }));
    expect(s("Left Shark Attack", null)).toBe("L SA");
    expect(s("sushi", "right")).toBe("R SR"); // found through its alias
    expect(s("×2 Sushi roll", null)).toBe("×2 SR");
  });

  it("a block the event added itself is read by its name", () => {
    const s = makeShortener(base({}, [{ family: "addon", key: "tweak", label: "Tweaked indy", category: null }, { family: "base", key: "wake", label: "Wakeloop", category: "other" }]));
    expect(s("Left Wakeloop Tweaked indy", null)).toBe("L WL TI");
    expect(s("Wakeloop", null)).toBe("WL");
  });

  it("the table still wins for the words it holds, and the base's aliases of them mean the same letters", () => {
    const s = makeShortener(base({}));
    expect(s("BR", null)).toBe("BR"); // an alias of Backroll in the Trick list
    expect(s("KL", null)).toBe("KL");
    expect(s("Late backroll", null)).toBe("LBR");
  });

  it("letters that would be only L or R become the first two letters, a one-word trick-base block included", () => {
    const s = makeShortener(base({ baseTricks: [{ key: "rodeo", label: "Rodeo", category: "other", aliases: ["rod"] }, { key: "lasso", label: "Lasso", category: "other", aliases: [] }], modifiers: [{ key: "roost", family: "addon", label: "Roost", category: null, aliases: [] }] }, [{ family: "base", key: "reef", label: "Reef", category: "other" }]));
    expect(s("Rodeo", null)).toBe("RO");
    expect(s("Left Lasso", null)).toBe("L LA");
    expect(s("rod", null)).toBe("RO"); // found through its alias
    expect(s("Roost", "right")).toBe("R RO");
    expect(s("Reef", null)).toBe("RE");
    // everything with more letters is untouched, and so is a block of one letter that is neither
    expect(derivedLetters("Rodeo")).toBe("R");
    expect(notTheSide("BR", "Backroll")).toBe("BR");
    expect(notTheSide("G", "Grab")).toBe("G");
    expect(notTheSide("R", "R")).toBe("R"); // nothing longer to take
  });
  it("no trick, built-in or added, is ever shown as only L or R", () => {
    for (const w of ["Rodeo", "Lasso", "Rail", "Lurch", "Late", "Roll", "Loop"]) expect(shortTrickName(w, null), w).not.toMatch(/^[LR]$/);
  });

  it("without a trick base the built-in Trick list is used", () => {
    expect(makeShortener(null)("Left ×2 Backroll", null)).toBe("L ×2 BR");
    expect(makeShortener({ vocabulary: {} as VocabularyInput })("Backroll", null)).toBe("BR");
  });
});

describe("attemptTrickText: what an attempt box may show", () => {
  const landed = { status: "landed" as const, trickName: "×2 Backroll", direction: "left", scored: true };
  it("a landed attempt whose score is shown gets its short trick", () => expect(attemptTrickText(landed)).toBe("L ×2 BR"));
  it("a crash never shows a trick", () => expect(attemptTrickText({ ...landed, status: "crashed" })).toBe(""));
  it("a trick never shows where its score does not", () => expect(attemptTrickText({ ...landed, scored: false })).toBe(""));
  it("an attempt with no trick yet shows nothing", () => expect(attemptTrickText({ ...landed, trickName: null })).toBe(""));
});

describe("the table", () => {
  const key = normaliseTrickWord;
  const lookup = (word: string) => TRICK_SHORT_FORMS.find((e) => e.words.some((w) => key(w) === key(word)));

  // what the owner approves in the pull request: every word of the spotter's Trick list and what a box shows for it
  const APPROVED: Record<string, string> = {
    "Straight jump": "SJ",
    Backroll: "BR",
    Frontroll: "FR",
    Kiteloop: "KL",
    Megaloop: "ML",
    "Double loop": "×2 KL",
    "Triple loop": "×3 KL",
    "S-loop": "SL",
    "Contra loop": "CL",
    "Doobie loop": "DL",
    "Boogie loop": "BL",
    "Late backroll": "LBR",
    "Late frontroll": "LFR",
    "Heart attack": "HA",
    "Loop back rotation invert": "BRI",
    Snakeloop: "SnL",
    KGB: "KGB",
    "Straight dangle pass": "DP",
    "Double dangle pass": "DDP",
    "36 Kung-Fu HP": "36HP",
    "36 Kung-Fu 2 HP": "362HP",
    KL3: "KL3",
    "Board-off": "BO",
    "One-foot": "OF",
    "Board spin": "BS",
    Osmosis: "O",
    Unhook: "U",
    "Handle pass": "HP",
    "+ Kiteloop": "KL",
    Late: "", // joins the trick after it; alone it shows nothing
    "Tic-tac": "TT",
    Grab: "G",
    "Blind landing": "B",
    Toeside: "TS",
    Indy: "G",
    Tail: "G",
    Nose: "G",
    Melon: "G",
    Mute: "G",
    Stalefish: "G",
    Method: "G",
  };

  const words = [
    ...vocabulary.baseTricks.map((b) => b.label),
    ...vocabulary.modifiers.map((m) => m.label),
    ...vocabulary.modifiers.flatMap((m) => ("variants" in m ? (m.variants as string[]) : [])),
  ].filter((w) => !LEFT_OUT_OF_BOXES.includes(w));

  it("has a line for every word of the Trick list (the left-out ones apart), and the owner's list names no word that is not in it", () => {
    expect(words.length).toBeGreaterThan(25);
    for (const w of words) expect(APPROVED[w], `"${w}" is missing from the approved table`).toBeDefined();
    for (const w of Object.keys(APPROVED)) expect(words, `"${w}" is not a word of the Trick list`).toContain(w);
  });

  it("every word of the Trick list shows what the table says, and the letters of a plain entry are the first letters of its parts", () => {
    for (const w of words) expect(shortTrickName(w, null), w).toBe(APPROVED[w]);
    for (const e of TRICK_SHORT_FORMS) if (e.parts) expect(initials(e.parts), e.words[0]).toBe(e.short);
  });

  it("the rotation words are numbers", () => {
    for (const m of vocabulary.multipliers) expect(shortTrickName(`${m.label} Backroll`, null), m.label).toBe(m.label === "×1" ? "BR" : `${m.label} BR`);
  });

  it("every left-out word shows nothing, and none of them is in the table", () => {
    for (const w of LEFT_OUT_OF_BOXES) {
      expect(lookup(w), w).toBeUndefined();
      expect(shortTrickName(w, "left"), w).toBe("L");
    }
    expect(vocabulary.modifiers.map((m) => m.label)).toEqual(expect.arrayContaining(["Downloop landing", "Late rotations"]));
  });

  it("no two entries claim the same word", () => {
    const seen = new Map<string, string>();
    for (const e of TRICK_SHORT_FORMS)
      for (const w of e.words) {
        const k = key(w);
        expect(seen.has(k) && seen.get(k) !== e.short, `"${w}" is claimed twice`).toBe(false);
        seen.set(k, e.short);
      }
  });

  it("the cases the owner decided: words with the same letters, and letters that begin like the side", () => {
    const c = shortFormCases();
    const bySort = <T extends { short: string }>(rows: T[]) => [...rows].sort((a, b) => a.short.localeCompare(b.short));
    expect(bySort(c.same)).toEqual([
      { short: "G", words: ["Grab", "Indy", "Tail", "Nose", "Melon", "Mute", "Method", "Stalefish"] },
      { short: "KL", words: ["Kiteloop", "+ Kiteloop"] },
    ]);
    expect(c.sideExact).toEqual([]);
    expect(bySort(c.sideStart)).toEqual([
      { short: "LBR", words: ["Late backroll"] },
      { short: "LFR", words: ["Late frontroll"] },
    ]);
  });
});
