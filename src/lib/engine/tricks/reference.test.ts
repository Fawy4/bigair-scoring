// The reference score: a hint for the judge, worked out from the sheet the judges compiled (docs/08 §1J). Never a score.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../../presets/tricks/big-air-vocabulary.json";
import { parseReferenceTable } from "@/lib/schemas/reference-scores";
import { buildTrickVocab, referenceScore, type TrickParts, type VocabularyInput } from ".";

const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const table = parseReferenceTable((vocabularyJson as { reference?: unknown }).reference)!;
const b = (key: string, multiplier?: string) => ({ id: vocab.blocks.find((x) => x.key === key)!.id, ...(multiplier ? { multiplier } : {}) });
const parts = (...items: Array<ReturnType<typeof b>>): TrickParts => ({ direction: "left", items });
const value = (...items: Array<ReturnType<typeof b>>) => referenceScore(vocab, table, parts(...items))?.value ?? null;

describe("the base tricks of the sheet", () => {
  const cases: Array<[string, number]> = [
    ["kiteloop", 2], ["boogie_loop", 4], ["doobie_loop", 5.5], ["late_backroll", 4.2], ["late_frontroll", 4.5], ["s_loop", 4], ["kgb", 7.5], ["double_loop", 5], ["snakeloop", 6], ["loop_back_rot_invert", 3.5],
    ["straight_dangle_pass", 5], ["double_dangle_pass", 6.5], ["kung_fu_36_hp", 6], ["kung_fu_36_2_hp", 7.5], ["kl3", 7],
  ];
  for (const [key, v] of cases) it(`${key} is ${v}`, () => expect(value(b(key))).toBe(v));
  it("Back rotation(s) is a backroll with a kiteloop", () => expect(value(b("backroll"), b("kiteloop_mod"))).toBe(3));
  it("a grabbed kiteloop is 2.5", () => expect(value(b("kiteloop"), b("grab"))).toBe(2.5));
});

describe("what a variation adds", () => {
  it("Board Off +2", () => expect(value(b("boogie_loop"), b("board_off"))).toBe(6));
  it("Board flip +2.5", () => expect(value(b("boogie_loop"), b("board_flip"))).toBe(6.5));
  it("Osmosis +2.7", () => expect(value(b("kiteloop"), b("osmosis"))).toBe(4.7));
  it("Unhook +1.5", () => expect(value(b("kiteloop"), b("unhook"))).toBe(3.5));
  it("a grabbed kiteloop takes the variations too (2.5 + 2 = 4.5)", () => expect(value(b("kiteloop"), b("grab"), b("board_off"))).toBe(4.5));
  it("the grab is worth something on the kiteloop only: on any other trick there is no hint", () => {
    expect(value(b("boogie_loop"), b("grab"))).toBeNull();
    expect(value(b("kgb"), b("grab"))).toBeNull();
  });
  it("Board spin is another trick than Board flip: +2.2, and in the same group", () => {
    expect(value(b("kiteloop"), b("board_spin"))).toBe(4.2);
    expect(value(b("kiteloop"), b("board_flip"))).toBe(4.5);
    expect(value(b("kiteloop"), b("board_off"), b("board_spin"))).toBe(4.2);
    expect(value(b("kiteloop"), b("board_spin"), b("board_flip"))).toBe(4.5);
  });
  it("to Blind +0.5, on any trick", () => {
    expect(value(b("kiteloop"), b("blind_landing"))).toBe(2.5);
    expect(value(b("kgb"), b("blind_landing"))).toBe(8);
    expect(value(b("straight_dangle_pass"), b("blind_landing"))).toBe(5.5);
  });
  it("the board variations do not stack: the highest counts", () => {
    expect(value(b("kiteloop"), b("board_off"), b("board_flip"))).toBe(4.5);
    expect(value(b("kiteloop"), b("board_off"), b("osmosis"))).toBe(4.7);
    expect(value(b("kiteloop"), b("board_flip"), b("board_off"))).toBe(4.5);
  });
  it("Unhook stacks with a board variation", () => expect(value(b("kiteloop"), b("unhook"), b("board_flip"))).toBe(6));
  it("a board-off on an unhook trick adds the board variation score", () => {
    expect(value(b("straight_dangle_pass"), b("board_off"))).toBe(7);
    expect(value(b("straight_dangle_pass"), b("board_flip"))).toBe(7.5);
  });
  it("everything together", () => expect(value(b("boogie_loop"), b("unhook"), b("board_flip"), b("blind_landing"))).toBe(8.5));
  it("the order of the taps does not matter", () => expect(value(b("blind_landing"), b("board_flip"), b("boogie_loop"))).toBe(7));
});

describe("the breakdown explains the number", () => {
  it("lists every part and says which board variation was not added", () => {
    const r = referenceScore(vocab, table, parts(b("boogie_loop"), b("board_off"), b("board_flip"), b("blind_landing")))!;
    expect(r.value).toBe(7);
    expect(r.parts).toEqual([
      { label: "Boogie loop", value: 4, kind: "trick" },
      { label: "Board flip", value: 2.5, kind: "add" },
      { label: "Blind landing", value: 0.5, kind: "add" },
      { label: "Board-off", value: 0, kind: "not-added" },
    ]);
  });
});

describe("when there is no hint", () => {
  it("a multiplier plays no part (left out for now): the hint is the same", () => expect(value(b("boogie_loop", "x2"))).toBe(4));
  it("Innovation / a trick that is not on the sheet: nothing", () => {
    expect(value(b("frontroll"))).toBeNull();
    expect(value(b("heart_attack"))).toBeNull();
    expect(value(b("kiteloop"), b("frontroll"))).toBeNull();
  });
  it("a block with no value (Tic-tac) means the hint would be wrong, so none is shown", () => expect(value(b("kiteloop"), b("tic_tac"))).toBeNull());
  it("a variation alone, or nothing at all", () => {
    expect(value(b("board_off"))).toBeNull();
    expect(value()).toBeNull();
  });
  it("words nobody recognised, or a repeated block", () => {
    expect(referenceScore(vocab, table, { direction: "left", items: [b("kiteloop")], freeText: "banana", needsReview: true })).toBeNull();
    expect(value(b("kiteloop"), b("kiteloop"))).toBeNull();
  });
  it("no table in the vocabulary: nothing", () => expect(referenceScore(vocab, null, parts(b("kiteloop")))).toBeNull());
});

describe("rounding", () => {
  it("4.2 + 2.7 is 6.9, not 6.9000000000000004", () => expect(value(b("late_backroll"), b("osmosis"))).toBe(6.9));
});
