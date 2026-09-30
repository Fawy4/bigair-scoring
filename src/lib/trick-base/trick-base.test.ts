import { describe, expect, it } from "vitest";
import vocabulary from "../../../presets/tricks/big-air-vocabulary.json";
import {
  FAMILIES,
  addLocalBlock,
  blockId,
  blocksFromVocabulary,
  changeAllowedAfterStart,
  deriveCategories,
  enabledBlocks,
  parseTrickBase,
  toggleBlock,
  type VocabularyJson,
} from "./index";

const vocab = vocabulary as unknown as VocabularyJson;

describe("the master vocabulary in five families", () => {
  const blocks = blocksFromVocabulary(vocab, []);
  it("has the five families in the owner's order", () => {
    expect(FAMILIES.map((f) => f.label)).toEqual(["Direction", "Multiplier", "Base trick", "Add-ons", "Grabs & landings"]);
  });
  it("puts every master block in exactly one family", () => {
    const total = vocab.directions.length + vocab.multipliers.length + vocab.baseTricks.length + vocab.modifiers.length;
    expect(blocks).toHaveLength(total);
    for (const f of FAMILIES) expect(blocks.filter((b) => b.family === f.key).length).toBeGreaterThan(0);
  });
  it("splits the modifiers: grabs and landings in their own family", () => {
    const grabs = blocks.filter((b) => b.family === "grab_landing").map((b) => b.key);
    expect(grabs).toEqual(expect.arrayContaining(["grab", "blind_landing", "toeside", "downloop"]));
    const addons = blocks.filter((b) => b.family === "addon").map((b) => b.key);
    expect(addons).toEqual(expect.arrayContaining(["board_off", "handle_pass", "one_foot", "kiteloop_mod"]));
  });
  it("every block has a unique id (family:key)", () => {
    expect(new Set(blocks.map(blockId)).size).toBe(blocks.length);
  });
  it("everything is on by default", () => {
    expect(enabledBlocks(blocks, parseTrickBase({}).disabled)).toHaveLength(blocks.length);
  });
});

describe("selection", () => {
  it("parseTrickBase tolerates nothing, junk and old shapes", () => {
    expect(parseTrickBase(null).disabled).toEqual([]);
    expect(parseTrickBase({ disabled: "x" }).disabled).toEqual([]);
    expect(parseTrickBase({ disabled: ["base:backroll", 4] }).disabled).toEqual(["base:backroll"]);
  });
  it("toggleBlock unticks and ticks", () => {
    let t = parseTrickBase({});
    t = toggleBlock(t, "base:backroll", false);
    expect(t.disabled).toEqual(["base:backroll"]);
    t = toggleBlock(t, "base:backroll", true);
    expect(t.disabled).toEqual([]);
  });
});

describe("categories are derived from the ticked blocks by the vocabulary's precedence", () => {
  const all = blocksFromVocabulary(vocab, []);
  it("precedence is handle pass > board-off > kiteloop > rotation > other", () => {
    expect(vocab.categoryPrecedence).toEqual(["handle_pass", "board_off", "kiteloop", "rotation", "other"]);
  });
  it("all blocks on: the categories used, in precedence order", () => {
    expect(deriveCategories(all, [], vocab.categoryPrecedence, []).map((c) => c.key)).toEqual(["handle_pass", "board_off", "kiteloop", "rotation", "other"]);
  });
  it("unticking every kiteloop block removes the kiteloop category", () => {
    const off = all.filter((b) => b.category === "kiteloop").map(blockId);
    const keys = deriveCategories(all, off, vocab.categoryPrecedence, []).map((c) => c.key);
    expect(keys).not.toContain("kiteloop");
    expect(keys).toContain("rotation");
  });
  it("unticking the handle pass add-on removes that category", () => {
    expect(deriveCategories(all, ["addon:handle_pass"], vocab.categoryPrecedence, []).map((c) => c.key)).not.toContain("handle_pass");
  });
  it("keeps the scoring model's own category settings where the key matches", () => {
    const model = [{ key: "kiteloop", label: "Kiteloops (model)", color: "#123456" }] as never;
    const c = deriveCategories(all, [], vocab.categoryPrecedence, model).find((x) => x.key === "kiteloop");
    expect(c?.label).toBe("Kiteloops (model)");
  });
  it("a category named by a block but unknown to the model still appears", () => {
    const blocks = [...all, { family: "addon" as const, key: "local_x", label: "Sloth roll", category: "sloth", local: true }];
    expect(deriveCategories(blocks, [], vocab.categoryPrecedence, []).map((c) => c.key)).toContain("sloth");
  });
  it("direction and multiplier blocks never create a category", () => {
    const only = all.filter((b) => b.family === "direction" || b.family === "multiplier");
    expect(deriveCategories(only, [], vocab.categoryPrecedence, [])).toEqual([]);
  });
});

describe("a local block", () => {
  it("is added to the event's own list, marked as proposed to the master base", () => {
    const r = addLocalBlock(vocab, [], { family: "base", label: "Sloth roll" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block).toMatchObject({ family: "base", label: "Sloth roll", status: "proposed" });
    expect(r.block.key).toMatch(/^local_sloth_roll$/);
  });
  it("refuses an empty name, a name that already exists in that family and an unknown family", () => {
    expect(addLocalBlock(vocab, [], { family: "base", label: "  " }).ok).toBe(false);
    expect(addLocalBlock(vocab, [], { family: "base", label: "backroll" }).ok).toBe(false);
    const first = addLocalBlock(vocab, [], { family: "addon", label: "Shark" });
    if (!first.ok) throw new Error("expected ok");
    expect(addLocalBlock(vocab, [first.block], { family: "addon", label: "SHARK" }).ok).toBe(false);
    expect(addLocalBlock(vocab, [], { family: "nonsense" as never, label: "X" }).ok).toBe(false);
  });
  it("the same label may exist in two different families", () => {
    const a = addLocalBlock(vocab, [], { family: "addon", label: "Late" });
    expect(a.ok).toBe(false); // "Late" already exists as an add-on in the master base
    expect(addLocalBlock(vocab, [], { family: "base", label: "Late" }).ok).toBe(true);
  });
  it("shows up in the block list and is on by default", () => {
    const r = addLocalBlock(vocab, [], { family: "grab_landing", label: "Sad grab" });
    if (!r.ok) throw new Error("expected ok");
    const blocks = blocksFromVocabulary(vocab, [r.block]);
    const b = blocks.find((x) => x.key === r.block.key)!;
    expect(b).toMatchObject({ family: "grab_landing", label: "Sad grab", local: true, proposed: true });
    expect(enabledBlocks(blocks, []).includes(b)).toBe(true);
  });
  it("a long name is cut at 40 characters", () => {
    const r = addLocalBlock(vocab, [], { family: "base", label: "x".repeat(80) });
    expect(r.ok).toBe(false);
  });
});

describe("once a heat has started: blocks can still be added but never removed", () => {
  it("unticking is refused, ticking is fine", () => {
    expect(changeAllowedAfterStart({ disabled: [] }, { disabled: ["base:backroll"] })).toBe(false);
    expect(changeAllowedAfterStart({ disabled: ["base:backroll"] }, { disabled: [] })).toBe(true);
    expect(changeAllowedAfterStart({ disabled: ["base:backroll"] }, { disabled: ["base:backroll"] })).toBe(true);
    expect(changeAllowedAfterStart({ disabled: ["base:backroll"] }, { disabled: ["base:backroll", "addon:late"] })).toBe(false);
  });
});
