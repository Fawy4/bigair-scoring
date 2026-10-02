// docs/08 §1I-1: the naming template. The default reproduces every §1G-3 name exactly.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, checkNamingTemplate, composeTrick, DEFAULT_NAMING_TEMPLATE, renderTrickName, type TrickParts, type VocabularyInput } from ".";

const base = vocabularyJson as unknown as VocabularyInput;
const withTemplate = (namingTemplate: string, extra: Partial<VocabularyInput> = {}) => buildTrickVocab({ ...base, namingTemplate, ...extra } as VocabularyInput);
const id = (key: string) => buildTrickVocab(base).blocks.find((b) => b.key === key)!.id;
const parts = (direction: string | null, ...items: Array<[string, string?]>): TrickParts => ({ direction, items: items.map(([k, m]) => (m ? { id: id(k), multiplier: m } : { id: id(k) })) });

describe("naming template (docs/08 §1I-1)", () => {
  it("the default is {direction} {blocks}", () => expect(DEFAULT_NAMING_TEMPLATE).toBe("{direction} {blocks}"));

  it("the default gives today's name", () => {
    expect(composeTrick(withTemplate("{direction} {blocks}"), parts("left", ["backroll", "x2"], ["board_off"])).name).toBe("Left ×2 Backroll Board-off");
  });

  it("an older vocabulary whose template is a sentence names exactly as the default", () => {
    const old = buildTrickVocab(base); // the file still holds the sentence
    expect(old.namingTemplate).toBe(DEFAULT_NAMING_TEMPLATE);
    for (const p of [parts("left", ["backroll", "x2"], ["board_off"], ["handle_pass"]), parts("right", ["frontroll", "x1"]), parts(null, ["backroll"])]) {
      expect(composeTrick(old, p).name).toBe(composeTrick(withTemplate("{direction} {blocks}"), p).name);
    }
  });

  it("{blocks} {direction} puts the direction last, and leaves no gap without one", () => {
    const v = withTemplate("{blocks} {direction}");
    expect(composeTrick(v, parts("left", ["backroll", "x2"], ["board_off"])).name).toBe("×2 Backroll Board-off Left");
    expect(composeTrick(v, parts(null, ["backroll", "x2"], ["board_off"])).name).toBe("×2 Backroll Board-off");
  });

  it("an empty hide rule writes ×1", () => {
    expect(composeTrick(withTemplate("{direction} {blocks}", { hideMultiplierWhen: "" }), parts("right", ["frontroll", "x1"])).name).toBe("Right ×1 Frontroll");
  });

  it("free text always comes last", () => {
    expect(composeTrick(withTemplate("{blocks} {direction}"), { direction: "left", items: [], freeText: "banana", needsReview: true }).name).toBe("Left banana");
  });

  it("renderTrickName collapses spaces and trims", () => {
    expect(renderTrickName("  {direction}   {blocks} ", "", ["Backroll"], "")).toBe("Backroll");
  });

  it("refuses a template without {blocks} or with an unknown part", () => {
    expect(checkNamingTemplate("{direction} {blocks}")).toBeNull();
    expect(checkNamingTemplate("{direction}")).toEqual({ code: "missing_blocks" }); // the sentences are in ui-copy (master.test.ts)
    expect(checkNamingTemplate("{direction} {blocks} {grab}")).toEqual({ code: "unknown_part", part: "{grab}" });
  });
});
