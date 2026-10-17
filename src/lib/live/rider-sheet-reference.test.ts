// The reference hint on the judge's Rider sheet (docs/08 §1J): shown on a landed trick that is on the judges' list, nowhere else.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, type VocabularyInput } from "@/lib/engine/tricks";
import { parseReferenceTable } from "@/lib/schemas/reference-scores";
import { buildLines, withReferences, type SheetAttempt } from "./rider-sheet";

const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const table = parseReferenceTable((vocabularyJson as { reference?: unknown }).reference);
const id = (key: string) => vocab.blocks.find((b) => b.key === key)!.id;
const names: Record<number, string> = { 1: "Doobie loop Board spin blind", 2: "Boogie loop", 3: "Frontroll", 4: "x", 5: "Board-off doobie", 6: "Doobie board off", 7: "Banana jump", 8: "Boogie loop Tic-tac" };
const attempt = (seq: number, status: "landed" | "crashed"): SheetAttempt => ({ id: `a${seq}`, seq, status, trickName: names[seq] ?? "x", direction: "left", deleted: false });
const partsById: Record<string, unknown> = {
  a1: { direction: "left", items: [{ id: id("boogie_loop") }, { id: id("board_flip") }, { id: id("blind_landing") }] },
  a2: { direction: "left", items: [{ id: id("boogie_loop") }] }, // crashed
  a3: { direction: "left", items: [{ id: id("frontroll") }] }, // not on the list
  a4: null, // a trick logged with no parts
  a5: {}, // typed by the head judge: the name only
  a6: { direction: null, items: [], freeText: "doobie board off", needsReview: true },
  a7: { direction: null, items: [], freeText: "banana jump", needsReview: true },
  a8: { direction: "left", items: [{ id: id("boogie_loop") }, { id: id("tic_tac") }] },
};
const lines = buildLines({ attempts: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => attempt(n, n === 2 ? "crashed" : "landed")), notes: [], cap: 8, mine: new Map(), ahead: new Map() });
const hinted = withReferences(lines, (a) => partsById[a], vocab, table);

describe("withReferences", () => {
  it("a landed trick on the list gets its reference, with the breakdown", () => {
    expect(hinted[0].reference?.value).toBe(7);
    expect(hinted[0].reference?.parts.map((p) => p.label)).toEqual(["Boogie loop", "Board flip", "Blind landing"]);
  });
  it("a crash gets none (no score is given for it)", () => expect(hinted[1].reference).toBeUndefined());
  it("a trick that is not on the list, or has no parts, gets none", () => {
    expect(hinted[2].reference).toBeUndefined();
    expect(hinted[3].reference).toBeUndefined();
  });
  it("a trick the head judge typed (name only, no blocks) is read from its name", () => {
    expect(hinted[4].reference?.value).toBe(7.5); // Board-off doobie: 5.5 + 2
    expect(hinted[5].reference?.value).toBe(7.5); // stored as unrecognised words, but they read fine with the trick base
  });
  it("words that still match nothing, or a block with no value, give none", () => {
    expect(hinted[6].reference).toBeUndefined();
    expect(hinted[7].reference).toBeUndefined();
  });
  it("empty lines get none", () => expect(hinted.slice(8).every((l) => l.reference === undefined)).toBe(true));
  it("the hint never changes what the judge scored", () => {
    for (const [i, l] of hinted.entries()) expect({ ...l, reference: undefined }).toEqual({ ...lines[i], reference: undefined });
  });
  it("with no list in the trick base, the lines are returned as they were", () => expect(withReferences(lines, (a) => partsById[a], vocab, null)).toBe(lines));
});
