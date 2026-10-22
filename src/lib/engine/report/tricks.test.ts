import { describe, expect, it } from "vitest";
import { att, BLOCKS, P } from "./fixture";
import { buildTrickIndex, hasLoop, trickKey, trickLabel } from "./tricks";

const idx = buildTrickIndex(BLOCKS, ["kiteloop"]);
const key = (parts: NonNullable<Parameters<typeof att>[1]>["kind"]) => trickKey(idx, att(1, { kind: parts }));

describe("report: trick names are grouped by meaning (item 5)", () => {
  it("'Double backroll board off' and '×2 Backroll Board-off' are one trick, whatever the order they were tapped in", () => {
    expect(key("backroll2BoardOff")).toBe(key("boardOffBackroll2"));
    expect(key("backroll2BoardOff")).not.toBe(key("backroll"));
  });
  it("the typed words do not matter once the blocks are known: the key comes from the blocks", () => {
    const a = att(1, { kind: "backroll2BoardOff", parts: P.backroll2BoardOff });
    const b = { ...att(2, { kind: "boardOffBackroll2" }), trick: "×2 Backroll Board-off" };
    expect(trickKey(idx, a)).toBe(trickKey(idx, b));
  });
  it("the event's retired copy of a block is the same trick as the master block", () => {
    expect(key("localKiteloop")).toBe(key("kiteloop"));
  });
  it("the side is not part of the trick", () => {
    expect(trickKey(idx, att(1, { kind: "kiteloop", side: "left" }))).toBe(trickKey(idx, att(2, { kind: "kiteloop", side: "right" })));
  });
  it("a multiplier of ×1 is no multiplier", () => {
    const one = { parts: { items: [{ id: "base:backroll", multiplier: "x1" }] }, trick: null };
    expect(trickKey(idx, one)).toBe(key("backroll"));
  });
  it("text the trick base did not recognise stays as typed and counts as its own trick, however it is capitalised", () => {
    const k1 = trickKey(idx, att(1, { kind: null, parts: P.typed("Shark Atack") }));
    const k2 = trickKey(idx, att(2, { kind: null, parts: P.typed("shark  atack") }));
    expect(k1).toBe(k2);
    expect(k1).not.toBe(key("backroll"));
    expect(trickLabel(idx, att(1, { kind: null, parts: P.typed("Shark Atack") }))).toBe("Shark Atack");
  });
  it("a trick with typed words next to known blocks is neither the plain block nor the plain words", () => {
    const mixed = trickKey(idx, att(1, { kind: null, parts: { items: [{ id: "base:backroll" }], freeText: "doobie" } }));
    expect(mixed).not.toBe(key("backroll"));
    expect(mixed).not.toBe(trickKey(idx, att(2, { kind: null, parts: P.typed("doobie") })));
  });
  it("a line with no trick at all has no key", () => {
    expect(trickKey(idx, att(1, { kind: null, parts: null }))).toBeNull();
  });
  it("a line without parts but with a name falls back to the name as typed", () => {
    expect(trickKey(idx, { parts: null, trick: "Old Line" })).toBe(trickKey(idx, { parts: null, trick: "old line" }));
  });
  it("the label writes the blocks in the order they were logged, ×2 in front of its block, without the side", () => {
    expect(trickLabel(idx, att(1, { kind: "backroll2BoardOff" }))).toBe("×2 Backroll Board-off");
  });
  it("a trick is a loop when the category the trick base gave it (the highest of its blocks') is a loop category: the same as the Loops family of the trick mix", () => {
    expect(hasLoop(idx, { parts: { items: [{ id: "base:backroll" }, { id: "base:kiteloop" }] }, category: "kiteloop" })).toBe(true);
    expect(hasLoop(idx, { parts: { items: [{ id: "base:backroll" }, { id: "base:kiteloop" }, { id: "addon:board_off" }] }, category: "board_off" })).toBe(false);
    expect(hasLoop(idx, att(1, { kind: "backroll" }))).toBe(false);
    expect(hasLoop(idx, att(1, { kind: "megaloop" }))).toBe(true);
  });
});
