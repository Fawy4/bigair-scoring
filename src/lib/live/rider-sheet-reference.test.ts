// The reference hint on the judge's Rider sheet (docs/08 §1J): shown on a landed trick that is on the judges' list, nowhere else.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, type VocabularyInput } from "@/lib/engine/tricks";
import { parseReferenceTable } from "@/lib/schemas/reference-scores";
import { buildLines, withReferences, type SheetAttempt } from "./rider-sheet";

const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const table = parseReferenceTable((vocabularyJson as { reference?: unknown }).reference);
const id = (key: string) => vocab.blocks.find((b) => b.key === key)!.id;
const attempt = (seq: number, status: "landed" | "crashed"): SheetAttempt => ({ id: `a${seq}`, seq, status, trickName: "x", direction: "left", deleted: false });
const partsById: Record<string, unknown> = {
  a1: { direction: "left", items: [{ id: id("boogie_loop") }, { id: id("board_flip") }, { id: id("blind_landing") }] },
  a2: { direction: "left", items: [{ id: id("boogie_loop") }] }, // crashed
  a3: { direction: "left", items: [{ id: id("frontroll") }] }, // not on the list
  a4: null, // a trick logged with no parts
};
const lines = buildLines({ attempts: [attempt(1, "landed"), attempt(2, "crashed"), attempt(3, "landed"), attempt(4, "landed")], notes: [], cap: 6, mine: new Map(), ahead: new Map() });
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
  it("empty lines get none", () => expect(hinted.slice(4).every((l) => l.reference === undefined)).toBe(true));
  it("the hint never changes what the judge scored", () => {
    for (const [i, l] of hinted.entries()) expect({ ...l, reference: undefined }).toEqual({ ...lines[i], reference: undefined });
  });
  it("with no list in the trick base, the lines are returned as they were", () => expect(withReferences(lines, (a) => partsById[a], vocab, null)).toBe(lines));
});
