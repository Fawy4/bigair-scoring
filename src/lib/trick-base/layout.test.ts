// docs/08 §1G-5: the spotter's layout per division.
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { blockId, blocksFromVocabulary, type VocabularyJson } from ".";
import { defaultLayout, displayFamily, isDefaultLayout, nudgeBlock, nudgeFamily, parseLayout, placeBlock, resolveLayout, toggleFavourite } from "./layout";

const blocks = blocksFromVocabulary(vocabularyJson as unknown as VocabularyJson, []);
const byKey = (key: string) => blocks.find((b) => b.key === key)!;
const labels = (view: ReturnType<typeof resolveLayout>, family: string) => view.find((v) => v.family === family)!.blocks.map((b) => b.key);
const view = (layout = defaultLayout(), disabled: string[] = [], all = false) => resolveLayout(blocks, disabled, layout, all);

describe("default layout", () => {
  it("is the vocabulary's own order in the five families", () => {
    expect(view().map((v) => v.family)).toEqual(["direction", "multiplier", "base", "addon", "grab_landing"]);
    expect(labels(view(), "base").slice(0, 3)).toEqual(["straight_jump", "backroll", "frontroll"]);
    expect(isDefaultLayout(defaultLayout())).toBe(true);
  });
  it("Polish 2, item 11: the old breakdown is the default — Base trick (straight jump, backroll, frontroll, kiteloop, megaloop …), then Add-ons, then Grabs & landings", () => {
    const v = view();
    expect(v.filter((f) => ["base", "addon", "grab_landing"].includes(f.family)).map((f) => f.label)).toEqual(["Base trick", "Add-ons", "Grabs & landings"]);
    expect(labels(v, "base").slice(0, 5)).toEqual(["straight_jump", "backroll", "frontroll", "kiteloop", "megaloop"]);
    expect(labels(v, "addon")).toContain("board_off");
    expect(labels(v, "grab_landing")).toContain("grab");
  });
  it("reads anything stored without failing", () => {
    expect(parseLayout(null)).toEqual(defaultLayout());
    expect(parseLayout({ families: ["grab_landing", "bogus"], moved: { "base:x": "nowhere" }, order: { base: "no" }, favourites: [1, "a"] })).toEqual({ ...defaultLayout(), families: ["grab_landing", "direction", "multiplier", "base", "addon"], favourites: ["a"] });
  });
});

describe("moving blocks", () => {
  it("Tic-tac moved from Add-ons to Base trick is listed last there and no longer in Add-ons", () => {
    const tt = byKey("tic_tac");
    const layout = placeBlock(view(), defaultLayout(), tt, "base", 99);
    const v = view(layout);
    expect(labels(v, "base").at(-1)).toBe("tic_tac");
    expect(labels(v, "addon")).not.toContain("tic_tac");
    expect(displayFamily(tt, layout)).toBe("base");
  });
  it("moving it back to its own family forgets the move", () => {
    const tt = byKey("tic_tac");
    const there = placeBlock(view(), defaultLayout(), tt, "base", 0);
    const back = placeBlock(view(there), there, tt, "addon", 0);
    expect(back.moved).toEqual({});
    expect(labels(view(back), "addon")[0]).toBe("tic_tac");
  });
  it("up and down move one place; at the ends nothing happens", () => {
    const bk = byKey("backroll");
    const down = nudgeBlock(view(), defaultLayout(), bk, 1);
    expect(labels(view(down), "base").slice(0, 3)).toEqual(["straight_jump", "frontroll", "backroll"]);
    const first = byKey("straight_jump");
    expect(nudgeBlock(view(), defaultLayout(), first, -1)).toEqual(defaultLayout());
    const last = blocks.filter((b) => b.family === "base").at(-1)!;
    expect(nudgeBlock(view(), defaultLayout(), last, 1)).toEqual(defaultLayout());
  });
  it("Direction and Multiplier cannot receive or give blocks", () => {
    const left = byKey("left");
    expect(placeBlock(view(), defaultLayout(), left, "base", 0)).toEqual(defaultLayout());
    expect(placeBlock(view(), defaultLayout(), byKey("backroll"), "direction", 0)).toEqual(defaultLayout());
    const swapped = nudgeBlock(view(), defaultLayout(), left, 1);
    expect(labels(view(swapped), "direction")).toEqual(["right", "left"]);
  });
});

describe("favourites, ticks and families", () => {
  it("favourites come first in their family, in the order shown", () => {
    const layout = toggleFavourite(toggleFavourite(defaultLayout(), blockId(byKey("heart_attack"))), blockId(byKey("megaloop")));
    expect(labels(view(layout), "base").slice(0, 2)).toEqual(["megaloop", "heart_attack"]);
    expect(toggleFavourite(layout, blockId(byKey("megaloop"))).favourites).toEqual([blockId(byKey("heart_attack"))]);
  });
  it("unticked blocks never appear on the spotter; the organiser's panel can include them", () => {
    const off = [blockId(byKey("backroll"))];
    expect(labels(view(defaultLayout(), off), "base")).not.toContain("backroll");
    expect(labels(view(defaultLayout(), off, true), "base")).toContain("backroll");
  });
  it("a block that no longer exists is dropped; a new one appears at the end of its own family", () => {
    const layout = { ...defaultLayout(), order: { base: ["base:gone", blockId(byKey("frontroll"))] }, moved: { "addon:gone": "base" as const } };
    const v = view(layout);
    expect(labels(v, "base")[0]).toBe("frontroll");
    expect(labels(v, "base")).not.toContain("gone");
    expect(labels(v, "base").at(-1)).toBe(blocks.filter((b) => b.family === "base").at(-1)!.key);
  });
  it("a block added to any family is last in it", () => {
    const extra = [...blocks, { family: "grab_landing" as const, key: "local_new", label: "New", category: null, local: true }];
    const v = resolveLayout(extra, [], defaultLayout());
    expect(v.find((x) => x.family === "grab_landing")!.blocks.at(-1)!.key).toBe("local_new");
  });
  it("Grabs above Add-ons puts Grabs first", () => {
    const layout = nudgeFamily(defaultLayout(), "grab_landing", -1);
    expect(view(layout).map((v) => v.family)).toEqual(["direction", "multiplier", "base", "grab_landing", "addon"]);
    expect(nudgeFamily(defaultLayout(), "direction", -1)).toEqual(defaultLayout());
  });
});
