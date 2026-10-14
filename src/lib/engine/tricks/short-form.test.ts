import { describe, expect, it } from "vitest";
import vocabulary from "../../../../presets/tricks/big-air-vocabulary.json";
import { attemptTrickText, initials, LEFT_OUT_OF_BOXES, normaliseTrickWord, shortFormCases, shortTrickName, TRICK_SHORT_FORMS } from "./short-form";

describe("shortTrickName: capitals only, the first letter of each part of the name", () => {
  it("puts the side first and shortens the trick", () => {
    expect(shortTrickName("×2 Backroll", "left")).toBe("L ×2 BR");
    expect(shortTrickName("×2 Backroll", "right")).toBe("R ×2 BR");
    expect(shortTrickName("Left ×2 Backroll", "left")).toBe("L ×2 BR");
  });

  it("the owner's examples", () => {
    const of = (name: string) => shortTrickName(name, null);
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

  it("no word survives in a box: a name of several parts is letters only", () => {
    for (const name of ["Late rotations", "Straight jump", "Tic-tac", "Stalefish", "One-foot", "Blind landing", "Toeside"]) expect(shortTrickName(name, null), name).toMatch(/^[A-Z]+$/);
  });

  it("the rotation count stays a number: ×2, ×3, ×4; a typed double, triple or quad becomes the number; a single rotation shows nothing", () => {
    expect(shortTrickName("×3 Frontroll", null)).toBe("×3 FR");
    expect(shortTrickName("Double Backroll", "left")).toBe("L ×2 BR");
    expect(shortTrickName("triple frontroll", "right")).toBe("R ×3 FR");
    expect(shortTrickName("quad Kiteloop", null)).toBe("×4 KL");
    expect(shortTrickName("×1 Backroll", null)).toBe("BR");
    expect(shortTrickName("single Backroll", "left")).toBe("L BR");
    expect(shortTrickName("Double loop", null)).toBe("DL");
  });

  it("ignores capitals, spaces and hyphens", () => {
    for (const typed of ["BACKROLL", "back roll", "Back-roll", "backRoll", "  Back   Roll "]) expect(shortTrickName(typed, "left")).toBe("L BR");
    expect(shortTrickName("kite loop", null)).toBe("KL");
    expect(shortTrickName("Board off", null)).toBe("BO");
  });

  it("takes the side from the name when the spotter set none, and shows none when there is none", () => {
    expect(shortTrickName("Left Backroll", null)).toBe("L BR");
    expect(shortTrickName("Right Kiteloop Board-off", null)).toBe("R KL BO");
    expect(shortTrickName("Backroll", null)).toBe("BR");
    expect(shortTrickName("Backroll", "")).toBe("BR");
  });

  it("the spotter's side wins over a side written in the name", () => {
    expect(shortTrickName("Left Backroll", "right")).toBe("R BR");
  });

  it("shortens every block of a longer trick, in the order tapped", () => {
    expect(shortTrickName("Left ×2 Backroll Board-off Handle pass", "left")).toBe("L ×2 BR BO HP");
    expect(shortTrickName("Right Kiteloop Late backroll", "right")).toBe("R KL LBR");
    expect(shortTrickName("Left ×2 Backroll Board-off Handle pass Late rotations Tic-tac Toeside Stalefish", "left")).toBe("L ×2 BR BO HP LR TT TS SF");
  });

  it("text that matches nothing follows the same rule: the first letter of each word", () => {
    expect(shortTrickName("Mystery Spin", null)).toBe("MS");
    expect(shortTrickName("Sam's special", "left")).toBe("L SS");
    expect(shortTrickName("hot-dog flip", null)).toBe("HDF");
    expect(shortTrickName("sam's", null)).toBe("S");
  });

  it("a count in front, or a bare number, stays as typed", () => {
    expect(shortTrickName("6x Frontroll", null)).toBe("6x FR");
    expect(shortTrickName("2x Backroll", "left")).toBe("L 2x BR");
    expect(shortTrickName("720 Mystery", null)).toBe("720 M");
  });

  it("Downloop is not a trick: it is left out of the box", () => {
    expect(shortTrickName("Left Backroll Downloop landing", "left")).toBe("L BR");
    expect(shortTrickName("Backroll Downloop", null)).toBe("BR");
    expect(shortTrickName("Downloop landing", null)).toBe("");
  });

  it("no trick logged gives nothing, even when a side was set", () => {
    expect(shortTrickName(null, "left")).toBe("");
    expect(shortTrickName("", "right")).toBe("");
    expect(shortTrickName("   ", null)).toBe("");
  });

  it("is deterministic: the same words always give the same short form", () => {
    expect(shortTrickName("Left ×2 Backroll", "left")).toBe(shortTrickName("Left ×2 Backroll", "left"));
  });
});

describe("attemptTrickText: what an attempt box may show", () => {
  const landed = { status: "landed" as const, trickName: "×2 Backroll", direction: "left", scored: true };
  it("a landed attempt whose score is shown gets its short trick", () => {
    expect(attemptTrickText(landed)).toBe("L ×2 BR");
  });
  it("a crash never shows a trick", () => {
    expect(attemptTrickText({ ...landed, status: "crashed" })).toBe("");
  });
  it("a trick never shows where its score does not", () => {
    expect(attemptTrickText({ ...landed, scored: false })).toBe("");
  });
  it("an attempt with no trick yet shows nothing", () => {
    expect(attemptTrickText({ ...landed, trickName: null })).toBe("");
  });
});

describe("the table", () => {
  const key = normaliseTrickWord;
  const lookup = (word: string) => TRICK_SHORT_FORMS.find((e) => e.words.some((w) => key(w) === key(word)));

  // what the owner approves in the pull request: every word of the spotter's Trick list and the letters it gets
  const APPROVED: Record<string, string> = {
    "Straight jump": "SJ",
    Backroll: "BR",
    Frontroll: "FR",
    Kiteloop: "KL",
    Megaloop: "ML",
    "Double loop": "DL",
    "Triple loop": "TL",
    "S-loop": "SL",
    "Contra loop": "CL",
    "Doobie loop": "DL",
    "Boogie loop": "BL",
    "Late backroll": "LBR",
    "Late frontroll": "LFR",
    "Heart attack": "HA",
    "Board-off": "BO",
    "One-foot": "OF",
    "Board spin": "BS",
    "Handle pass": "HP",
    "+ Kiteloop": "KL",
    Late: "L",
    "Late rotations": "LR",
    "Tic-tac": "TT",
    Grab: "G",
    "Blind landing": "BL",
    Toeside: "TS",
    Indy: "I",
    Tail: "T",
    Nose: "N",
    Melon: "M",
    Mute: "M",
    Stalefish: "SF",
    Method: "M",
    "×1": "",
    "×2": "×2",
    "×3": "×3",
    "×4": "×4",
  };

  const words = [
    ...vocabulary.baseTricks.map((b) => b.label),
    ...vocabulary.modifiers.map((m) => m.label),
    ...vocabulary.modifiers.flatMap((m) => ("variants" in m ? (m.variants as string[]) : [])),
    ...vocabulary.multipliers.map((m) => m.label),
  ].filter((w) => !LEFT_OUT_OF_BOXES.includes(w));

  it("has a line for every word of the Trick list (Downloop apart), and the owner's list names no word that is not in it", () => {
    expect(words.length).toBeGreaterThan(30);
    for (const w of words) expect(APPROVED[w], `"${w}" is missing from the approved table`).toBeDefined();
    for (const w of Object.keys(APPROVED)) expect(words, `"${w}" is not a word of the Trick list`).toContain(w);
  });

  it("every word of the Trick list maps to its entry in the table, and its letters are the first letters of its parts", () => {
    for (const w of words) {
      const entry = lookup(w);
      expect(entry, `"${w}" has no entry in the table`).toBeDefined();
      expect(entry!.short).toBe(APPROVED[w]);
      expect(shortTrickName(w, null)).toBe(APPROVED[w]);
      if (entry!.parts.length) expect(initials(entry!.parts)).toBe(entry!.short);
    }
  });

  it("Downloop is not in the table, and the Trick list's Downloop words are left out of the boxes", () => {
    expect(lookup("Downloop landing")).toBeUndefined();
    expect(lookup("Downloop")).toBeUndefined();
    const inList = vocabulary.modifiers.map((m) => m.label).filter((l) => LEFT_OUT_OF_BOXES.includes(l));
    expect(inList).toEqual(["Downloop landing"]);
    for (const w of LEFT_OUT_OF_BOXES) expect(shortTrickName(w, "left")).toBe("L");
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

  it("the cases the owner decides: tricks with the same letters, and letters that read as the side", () => {
    const c = shortFormCases();
    const bySort = <T extends { short: string }>(rows: T[]) => [...rows].sort((a, b) => a.short.localeCompare(b.short));
    expect(bySort(c.same)).toEqual([
      { short: "BL", words: ["Boogie loop", "Blind landing"] },
      { short: "DL", words: ["Double loop", "Doobie loop"] },
      { short: "KL", words: ["Kiteloop", "+ Kiteloop"] },
      { short: "M", words: ["Melon", "Mute", "Method"] },
    ]);
    expect(c.sideExact).toEqual([{ short: "L", words: ["Late"] }]);
    expect(bySort(c.sideStart)).toEqual([
      { short: "LBR", words: ["Late backroll"] },
      { short: "LFR", words: ["Late frontroll"] },
      { short: "LR", words: ["Late rotations"] },
    ]);
  });
});
