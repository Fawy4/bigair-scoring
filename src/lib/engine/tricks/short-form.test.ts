import { describe, expect, it } from "vitest";
import vocabulary from "../../../../presets/tricks/big-air-vocabulary.json";
import { attemptTrickText, normaliseTrickWord, shortTrickName, TRICK_SHORT_FORMS } from "./short-form";

describe("shortTrickName: the trick the way riders say it", () => {
  it("puts the side first and shortens the trick", () => {
    expect(shortTrickName("×2 Backroll", "left")).toBe("L ×2 BR");
    expect(shortTrickName("×2 Backroll", "right")).toBe("R ×2 BR");
    expect(shortTrickName("Left ×2 Backroll", "left")).toBe("L ×2 BR");
  });

  it("Backroll, Frontroll and Kiteloop become BR, FR and KL", () => {
    expect(shortTrickName("Backroll", "left")).toBe("L BR");
    expect(shortTrickName("Frontroll", "right")).toBe("R FR");
    expect(shortTrickName("Kiteloop", "left")).toBe("L KL");
  });

  it("×2 and ×3 stay, and a typed double or triple becomes ×2 or ×3", () => {
    expect(shortTrickName("×3 Frontroll", null)).toBe("×3 FR");
    expect(shortTrickName("Double Backroll", "left")).toBe("L ×2 BR");
    expect(shortTrickName("triple frontroll", "right")).toBe("R ×3 FR");
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
    expect(shortTrickName("Right Kiteloop Late backroll", "right")).toBe("R KL Late BR");
  });

  it("text that matches nothing shows as typed", () => {
    expect(shortTrickName("Mystery Spin", null)).toBe("Mystery Spin");
    expect(shortTrickName("Sam's special", "left")).toBe("L Sam's special");
    expect(shortTrickName("6x Frontroll", null)).toBe("6x FR");
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

  // what the owner approves in the pull request: every word of the spotter's Trick list and the short form it gets
  const APPROVED: Record<string, string> = {
    "Straight jump": "Jump",
    Backroll: "BR",
    Frontroll: "FR",
    Kiteloop: "KL",
    Megaloop: "Mega",
    "Double loop": "DL",
    "Triple loop": "TL",
    "S-loop": "S-loop",
    "Contra loop": "Contra",
    "Doobie loop": "Doobie",
    "Boogie loop": "Boogie",
    "Late backroll": "Late BR",
    "Late frontroll": "Late FR",
    "Heart attack": "Heart attack",
    "Board-off": "BO",
    "One-foot": "1ft",
    "Board spin": "Board spin",
    "Handle pass": "HP",
    "+ Kiteloop": "+KL",
    Late: "Late",
    "Late rotations": "Late rotations",
    "Tic-tac": "Tic-tac",
    Grab: "Grab",
    "Blind landing": "Blind",
    Toeside: "Toeside",
    "Downloop landing": "Downloop",
    Indy: "Indy",
    Tail: "Tail",
    Nose: "Nose",
    Melon: "Melon",
    Mute: "Mute",
    Stalefish: "Stalefish",
    Method: "Method",
    "×1": "×1",
    "×2": "×2",
    "×3": "×3",
    "×4": "×4",
  };

  const words = [
    ...vocabulary.baseTricks.map((b) => b.label),
    ...vocabulary.modifiers.map((m) => m.label),
    ...vocabulary.modifiers.flatMap((m) => ("variants" in m ? (m.variants as string[]) : [])),
    ...vocabulary.multipliers.map((m) => m.label),
  ];

  it("has a line for every word of the Trick list, and the owner's list names no word that is not in it", () => {
    expect(words.length).toBeGreaterThan(30);
    for (const w of words) expect(APPROVED[w], `"${w}" is missing from the approved table`).toBeDefined();
    for (const w of Object.keys(APPROVED)) expect(words, `"${w}" is not a word of the Trick list`).toContain(w);
  });

  it("every word of the Trick list maps to its entry in the table", () => {
    for (const w of words) {
      expect(lookup(w), `"${w}" has no entry in the table`).toBeDefined();
      expect(lookup(w)!.short).toBe(APPROVED[w]);
      expect(shortTrickName(w, null)).toBe(APPROVED[w]);
    }
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
});
