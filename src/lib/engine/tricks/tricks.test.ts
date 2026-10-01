// docs/08 §1G-3 (composer), §1G-4 (reader). A trick is an ordered sequence of blocks.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, composeTrick, emptyBuilder, parseTrickText, removeTrickItem, tapBlock, tapDirection, tapMultiplier, toParts, canLog, type TrickParts, type VocabularyInput } from ".";

const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const all = new Set(vocab.blocks.map((b) => b.id));
const b = (key: string, multiplier?: string) => ({ id: vocab.blocks.find((x) => x.key === key)!.id, ...(multiplier ? { multiplier } : {}) });
const parts = (direction: string | null, ...items: Array<ReturnType<typeof b>>): TrickParts => ({ direction, items });

describe("composeTrick (docs/08 §1G-3)", () => {
  const cases: Array<[string, TrickParts, string, string | null]> = [
    ["Left ×2 Backroll Board-off Handle pass", parts("left", b("backroll", "x2"), b("board_off"), b("handle_pass")), "Left ×2 Backroll Board-off Handle pass", "handle_pass"],
    ["Right Megaloop", parts("right", b("megaloop")), "Right Megaloop", "kiteloop"],
    ["×1 is hidden", parts("right", b("frontroll", "x1")), "Right Frontroll", "rotation"],
    ["order matters", parts("left", b("backroll"), b("handle_pass"), b("board_off")), "Left Backroll Handle pass Board-off", "handle_pass"],
    ["blocks repeat", parts("left", b("backroll"), b("backroll")), "Left Backroll Backroll", "rotation"],
    ["the owner's long example", parts("left", b("backroll"), b("kiteloop"), b("board_off"), b("tic_tac"), b("late_rotations", "x4")), "Left Backroll Kiteloop Board-off Tic-tac ×4 Late rotations", "board_off"],
    ["no direction", parts(null, b("backroll")), "Backroll", "rotation"],
    ["free text", { direction: "left", items: [], freeText: "banana jump", needsReview: true }, "Left banana jump", null],
    ["nothing", parts(null), "", null],
  ];
  for (const [label, input, name, category] of cases) {
    it(label, () => expect(composeTrick(vocab, input)).toEqual({ name, categoryKey: category }));
  }

  it("the same blocks in another order are a different trick", () => {
    const a = composeTrick(vocab, parts("left", b("backroll"), b("board_off"), b("handle_pass"))).name.toLowerCase();
    const c = composeTrick(vocab, parts("left", b("backroll"), b("handle_pass"), b("board_off"))).name.toLowerCase();
    expect(a).not.toBe(c);
  });
});

describe("the spotter's taps (docs/08 §1G-3)", () => {
  const id = (key: string) => vocab.blocks.find((x) => x.key === key)!.id;
  it("a multiplier tapped after a block belongs to that block; tapping it again removes it", () => {
    let s = tapBlock(vocab, tapDirection(emptyBuilder(), "left"), id("backroll"));
    s = tapMultiplier(vocab, s, "x2");
    expect(composeTrick(vocab, toParts(s)).name).toBe("Left ×2 Backroll");
    s = tapMultiplier(vocab, s, "x2");
    expect(composeTrick(vocab, toParts(s)).name).toBe("Left Backroll");
  });
  it("a multiplier tapped first, or after Board-off, waits for the next block that can take one", () => {
    let s = tapMultiplier(vocab, emptyBuilder(), "x2");
    s = tapBlock(vocab, s, id("backroll"));
    expect(composeTrick(vocab, toParts(s)).name).toBe("×2 Backroll");
    let t = tapBlock(vocab, emptyBuilder(), id("board_off"));
    t = tapMultiplier(vocab, t, "x4");
    expect(t.pendingMultiplier).toBe("x4");
    t = tapBlock(vocab, t, id("late_rotations"));
    expect(composeTrick(vocab, toParts(t)).name).toBe("Board-off ×4 Late rotations");
  });
  it("direction is pick-one: the other one swaps, the same one clears", () => {
    let s = tapDirection(emptyBuilder(), "left");
    s = tapDirection(s, "right");
    expect(s.direction).toBe("right");
    expect(tapDirection(s, "right").direction).toBeNull();
  });
  it("one tap on a block of the name removes it before Log", () => {
    let s = tapBlock(vocab, tapBlock(vocab, emptyBuilder(), id("backroll")), id("board_off"));
    s = removeTrickItem(s, 0);
    expect(composeTrick(vocab, toParts(s)).name).toBe("Board-off");
    expect(canLog(removeTrickItem(s, 0))).toBe(false);
    expect(canLog(emptyBuilder(), "banana")).toBe(true);
  });
  it("tapping Handle pass before Board-off gives the order tapped", () => {
    const s = [id("backroll"), id("handle_pass"), id("board_off")].reduce((st, x) => tapBlock(vocab, st, x), tapDirection(emptyBuilder(), "left"));
    expect(composeTrick(vocab, toParts(s)).name).toBe("Left Backroll Handle pass Board-off");
  });
});

describe("parseTrickText (docs/08 §1G-4)", () => {
  const read = (text: string, enabled: ReadonlySet<string> = all) => {
    const r = parseTrickText(vocab, text, enabled);
    return { ...r, ...composeTrick(vocab, r.parts) };
  };
  it("left double backroll board off handle", () => {
    const r = read("left double backroll board off handle");
    expect(r.name).toBe("Left ×2 Backroll Board-off Handle pass");
    expect(r.categoryKey).toBe("handle_pass");
    expect(r.unmatched).toEqual([]);
    expect(r.needsReview).toBe(false);
  });
  it("right mega", () => expect(read("right mega")).toMatchObject({ name: "Right Megaloop", categoryKey: "kiteloop" }));
  it("left banana jump: no block, free text, needs review", () => {
    const r = read("left banana jump");
    expect(r.parts.items).toEqual([]);
    expect(r.parts.direction).toBe("left");
    expect(r.unmatched).toEqual(["banana jump"]);
    expect(r.parts.freeText).toBe("banana jump");
    expect(r.needsReview).toBe(true);
    expect(r.name).toBe("Left banana jump");
  });
  it("a nickname on its own is still read: left jump is a Straight jump", () => {
    expect(read("left jump").name).toBe("Left Straight jump");
  });
  it("left dubble backroll: edit distance 1 on 'double'", () => expect(read("left dubble backroll").name).toBe("Left ×2 Backroll"));
  it("an unticked block is unmatched but known (it never voids a neighbour)", () => {
    const off = new Set([...all].filter((x) => x !== "addon:board_off"));
    const r = read("left backroll board off", off);
    expect(r.parts.items).toEqual([{ id: "base:backroll" }]);
    expect(r.unmatched).toEqual(["board off"]);
    expect(r.needsReview).toBe(true);
    const nick = read("left back board off", off);
    expect(nick.parts.items).toEqual([{ id: "base:backroll" }]);
  });
  it("text order is kept", () => expect(read("right backroll handle pass board off").name).toBe("Right Backroll Handle pass Board-off"));
  it("the owner's long example, spoken", () => {
    const r = read("left backroll kiteloop board off tic tac four late rotations");
    expect(r.name).toBe("Left Backroll Kiteloop Board-off Tic-tac ×4 Late rotations");
    expect(r.categoryKey).toBe("board_off");
    expect(r.unmatched).toEqual([]);
  });
  it("a trailing multiplier goes to the block before it", () => expect(read("left backroll double").name).toBe("Left ×2 Backroll"));
  it("blocks repeat", () => expect(read("left backroll backroll").name).toBe("Left Backroll Backroll"));
  it("two directions: the first wins, the other is unmatched", () => {
    const r = read("left right backroll");
    expect(r.parts.direction).toBe("left");
    expect(r.unmatched).toEqual(["right"]);
    expect(r.needsReview).toBe(true);
  });
  it("only unknown words, and nothing at all", () => {
    expect(read("banana")).toMatchObject({ unmatched: ["banana"], needsReview: true, name: "banana" });
    expect(read("")).toMatchObject({ unmatched: [], needsReview: false, name: "" });
  });
  it("a multiplier nobody can use is unmatched, not lost", () => {
    const r = read("left double");
    expect(r.unmatched).toEqual(["double"]);
  });
  it("two clear misspellings never guess between two blocks", () => {
    expect(read("left kiteloo").parts.items).toEqual([{ id: "base:kiteloop" }]);
  });
  it("Late rotations only answers to its own words; plain Late is its own block", () => {
    expect(read("left late rotation").name).toBe("Left Late rotations");
    expect(read("left late").name).toBe("Left Late");
    expect(read("left late backroll").name).toBe("Left Late backroll");
  });
});
