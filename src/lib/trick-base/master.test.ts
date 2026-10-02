// docs/08 §1I: the master trick base editor (validation in words, diff in words, versions, visibility).
import { describe, expect, it } from "vitest";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import { buildTrickVocab, composeTrick, parseTrickText, type VocabularyInput } from "@/lib/engine/tricks";
import { blocksFromVocabulary, effectiveDisabled, parseTrickBase, toggleBlock, type VocabularyJson } from ".";
import { parseLayout, resolveLayout } from "./layout";
import {
  addAlias,
  addBlock,
  addFamily,
  checkModel,
  diffModels,
  liveExample,
  moveBlock,
  nudgeBlock,
  nudgeCategory,
  nudgeFamily,
  planSave,
  publishedIds,
  removeAlias,
  removeBlock,
  renameBlock,
  renameFamily,
  setBlockField,
  setKey,
  toModel,
  toVocabulary,
  validateModel,
  vocabularyFamilies,
} from "./master";

const v5 = vocabularyJson as unknown as VocabularyJson;
const fresh = () => toModel(structuredClone(v5));
const idOf = (m: ReturnType<typeof toModel>, label: string) => Object.values(m.blocks).find((b) => b.label === label)!.id;
/** The published base without the one known duplicate ("KL" on + Kiteloop), so other checks start clean. */
const clean = () => removeAlias(fresh(), idOf(fresh(), "+ Kiteloop"), "KL");

describe("reading the master base into the editor", () => {
  it("has the five families in order, with every block in its own family", () => {
    const m = fresh();
    expect(m.families.map((f) => f.label)).toEqual(["Direction", "Multiplier", "Base trick", "Add-ons", "Grabs & landings"]);
    expect(m.families.find((f) => f.key === "addon")!.blocks).toContain("addon:tic_tac");
    expect(m.namingTemplate).toBe("{direction} {blocks}"); // the old sentence becomes the template it always meant
    expect(m.hideMultiplierWhen).toBe("x1");
  });

  it("round-trips: nothing changes, nothing is lost (variants, speech, examples)", () => {
    const back = toVocabulary(fresh());
    expect(diffModels(fresh(), toModel(back)).summary).toBe("No changes");
    expect((back.modifiers.find((x) => x.key === "grab") as unknown as Record<string, unknown>).variants).toEqual(["Indy", "Tail", "Nose", "Melon", "Mute", "Stalefish", "Method"]);
    expect(back.speech).toEqual(v5.speech);
    expect(buildTrickVocab(back as unknown as VocabularyInput).blocks.length).toBe(buildTrickVocab(v5 as unknown as VocabularyInput).blocks.length);
  });
});

describe("validation on save, in words (docs/08 §1I-2)", () => {
  it("a word two blocks already shared in the published base (KL) does not block a save; it is listed to tidy up", () => {
    expect(checkModel(fresh(), new Set(), fresh())).toEqual({ errors: [], warnings: ["Already so in the published version (not blocking; base tricks are read first): “kl” is already an alias of Kiteloop."] });
    expect(validateModel(fresh(), new Set())).toEqual(["“kl” is already an alias of Kiteloop."]); // with nothing to compare, every shared word counts
    expect(validateModel(clean(), new Set())).toEqual([]);
  });

  it("duplicate key", () => {
    let m = clean();
    m = addBlock(m, "addon", "Back roll").model;
    m = setKey(m, idOf(m, "Back roll"), "backroll");
    expect(setKey(m, "base:frontroll", "backroll")).toBe(m); // the same id twice cannot exist: refused at once
    expect(validateModel(m, new Set())).toContain("Two blocks use the key “backroll”: Backroll and Back roll. Each key must be unique.");
  });

  it("duplicate alias across blocks, an alias equal to another block's name", () => {
    // the sentence names the block that already had the word (the one the draft did not change)
    expect(validateModel(addAlias(clean(), idOf(clean(), "Megaloop"), "loop"), new Set(), clean())).toEqual(["“loop” is already an alias of Kiteloop."]);
    expect(validateModel(addAlias(clean(), idOf(clean(), "Megaloop"), "  LOOP "), new Set(), clean())).toEqual(["“loop” is already an alias of Kiteloop."]);
    expect(validateModel(addBlock(clean(), "base", "Tornado").model, new Set(), clean())).toEqual(["“tornado” is already an alias of Late rotations."]);
    expect(validateModel(addAlias(clean(), idOf(clean(), "Frontroll"), "backroll"), new Set(), clean())).toEqual(["“backroll” is already the name of Backroll."]);
  });

  it("an alias of the block's own name is fine (Megaloop renamed to Mega loop keeps 'mega loop')", () => {
    expect(validateModel(renameBlock(clean(), idOf(clean(), "Megaloop"), "Mega loop"), new Set())).toEqual([]);
  });

  it("empty label", () => {
    expect(validateModel(renameBlock(clean(), idOf(clean(), "Backroll"), "   "), new Set())).toEqual(["A block in Base trick has no name."]);
  });

  it("a category that does not exist; a base trick without one", () => {
    expect(validateModel(setBlockField(clean(), idOf(clean(), "Backroll"), { category: "spin" }), new Set())).toEqual(["Backroll has the category “spin”, which is not in the category list."]);
    const { model, id } = addBlock(clean(), "base", "Sloth");
    expect(validateModel(setBlockField(model, id, { category: null }), new Set())).toEqual(["Base trick “Sloth” needs a scoring category."]);
  });

  it("a published block cannot be removed, only retired", () => {
    const m = clean();
    const published = publishedIds([toVocabulary(m)]);
    expect(validateModel(removeBlock(m, idOf(m, "Heart attack")), published, m)).toEqual(["Heart attack is in a published version: retire it instead of removing it."]);
    expect(validateModel(setBlockField(m, idOf(m, "Heart attack"), { retired: true }), published, m)).toEqual([]);
  });

  it("the naming template and the hide rule", () => {
    expect(validateModel({ ...clean(), namingTemplate: "{direction}" }, new Set())).toEqual(["The naming template must contain {blocks}."]);
    expect(validateModel({ ...clean(), namingTemplate: "{direction} {blocks} {grab}" }, new Set())).toEqual(["The naming template has an unknown part: {grab}. Use {direction} and {blocks}."]);
    expect(validateModel({ ...clean(), hideMultiplierWhen: "x9" }, new Set())).toEqual(["“Hide this multiplier” must be one of the multipliers, or empty."]);
  });
});

describe("editing", () => {
  it("rename keeps the key; a new block gets a key from its name", () => {
    const m = renameBlock(clean(), "base:megaloop", "Mega loop");
    expect(m.blocks["base:megaloop"].label).toBe("Mega loop");
    const added = addBlock(m, "base", "Tornado");
    expect(added.id).toBe("base:tornado");
    expect(added.model.families.find((f) => f.key === "base")!.blocks.at(-1)).toBe("base:tornado");
    expect(added.model.blocks["base:tornado"].category).toBe("other");
  });

  it("aliases: Enter adds one (trimmed, no repeats on the same block), × removes it", () => {
    let m = addAlias(clean(), "base:megaloop", " megaboost ");
    m = addAlias(m, "base:megaloop", "MEGABOOST");
    expect(m.blocks["base:megaloop"].aliases.filter((a) => a.toLowerCase() === "megaboost")).toHaveLength(1);
    expect(removeAlias(m, "base:megaloop", "megaboost").blocks["base:megaloop"].aliases).not.toContain("megaboost");
  });

  it("moving Tic-tac to Grabs & landings keeps its identity and its name; Direction and Multiplier keep their own", () => {
    const m = moveBlock(clean(), "addon:tic_tac", "grab_landing", 99);
    expect(m.families.find((f) => f.key === "grab_landing")!.blocks.at(-1)).toBe("addon:tic_tac");
    expect(m.families.find((f) => f.key === "addon")!.blocks).not.toContain("addon:tic_tac");
    const v = toVocabulary(m);
    const vocab = buildTrickVocab(v as unknown as VocabularyInput);
    expect(vocab.blocks.find((b) => b.key === "tic_tac")!.id).toBe("addon:tic_tac"); // stored attempts still find it
    expect(moveBlock(clean(), "direction:left", "base", 0)).toEqual(clean());
    expect(moveBlock(clean(), "base:backroll", "direction", 0)).toEqual(clean());
  });

  it("reorder within a family, families renamed, reordered and added; a block added to a new family behaves like an add-on", () => {
    let m = nudgeBlock(clean(), "base:backroll", -1);
    expect(m.families.find((f) => f.key === "base")!.blocks.slice(0, 2)).toEqual(["base:backroll", "base:straight_jump"]);
    m = renameFamily(m, "grab_landing", "Grabs");
    m = nudgeFamily(m, "grab_landing", -1);
    expect(m.families.map((f) => f.label)).toEqual(["Direction", "Multiplier", "Base trick", "Grabs", "Add-ons"]);
    const f = addFamily(m, "Spins");
    expect(f.key).toBe("fam_spins");
    const added = addBlock(f.model, "fam_spins", "Pop shove");
    expect(added.id).toBe("addon:pop_shove");
    expect(added.model.families.at(-1)!.blocks).toEqual(["addon:pop_shove"]);
  });

  it("category precedence can be reordered, not extended", () => {
    const m = nudgeCategory(clean(), "kiteloop", -1);
    expect(m.categoryPrecedence).toEqual(["handle_pass", "kiteloop", "board_off", "rotation", "other"]);
  });

  it("the live example follows the names, the hide rule and the template", () => {
    expect(liveExample(clean())).toBe("Left ×2 Backroll Board-off");
    expect(liveExample(renameBlock(clean(), "base:backroll", "Back roll"))).toBe("Left ×2 Back roll Board-off");
    expect(liveExample({ ...clean(), namingTemplate: "{blocks} {direction}" })).toBe("×2 Backroll Board-off Left");
  });
});

describe("diff in words (docs/08 §1I-3)", () => {
  it("3 renamed, 1 added, 1 retired", () => {
    let m = clean();
    m = renameBlock(m, "base:megaloop", "Mega loop");
    m = renameBlock(m, "base:frontroll", "Front roll");
    m = renameBlock(m, "base:backroll", "Back roll");
    m = addBlock(m, "base", "Tornado").model;
    m = setBlockField(m, "base:heart_attack", { retired: true });
    const d = diffModels(clean(), m);
    expect(d.summary).toBe("3 renamed, 1 added, 1 retired");
    expect(d.lines).toEqual(["Renamed: Backroll → Back roll", "Renamed: Frontroll → Front roll", "Renamed: Megaloop → Mega loop", "Added: Tornado (Base trick)", "Retired: Heart attack"]);
  });

  it("moved, aliases, other changes, families, category order, naming; restore", () => {
    let m = moveBlock(clean(), "addon:tic_tac", "grab_landing", 99);
    m = addAlias(m, "base:megaloop", "megaboost");
    m = setBlockField(m, "base:backroll", { rotation: "backward" });
    m = renameFamily(m, "grab_landing", "Grabs");
    m = nudgeCategory(m, "kiteloop", -1);
    m = { ...m, namingTemplate: "{blocks} {direction}" };
    const d = diffModels(clean(), m);
    expect(d.summary).toBe("1 moved, 1 with changed aliases, 1 with other changes, families changed, category order changed, naming changed");
    expect(d.lines).toContain("Moved: Tic-tac → Grabs");
    expect(diffModels(setBlockField(clean(), "base:heart_attack", { retired: true }), clean()).summary).toBe("1 restored");
    expect(diffModels(clean(), clean()).summary).toBe("No changes");
  });
});

describe("versions (docs/08 §1I-4)", () => {
  const published = [1, 2, 3, 4, 5].map((version) => ({ version, published_at: "2026-10-01", hash: `h${version}` }));
  it("a save is the next number after every version, drafts included; identical content makes nothing", () => {
    expect(planSave(published, "new")).toEqual({ action: "insert", version: 6 });
    const withDraft = [...published, { version: 6, published_at: null, hash: "h6" }];
    expect(planSave(withDraft, "newer")).toEqual({ action: "insert", version: 7 });
    expect(planSave(withDraft, "h6")).toEqual({ action: "unchanged" });
    expect(planSave([], "x")).toEqual({ action: "insert", version: 1 });
  });
});

describe("visibility and retiring (docs/08 §1I-5)", () => {
  it("a default-off block is unticked until ticked (stored in enabled); a retired block is never on", () => {
    let m = setBlockField(clean(), "addon:tic_tac", { defaultOn: false });
    m = setBlockField(m, "base:heart_attack", { retired: true });
    const v = toVocabulary(m);
    const blocks = blocksFromVocabulary(v, []);
    expect(effectiveDisabled(blocks, parseTrickBase({}))).toEqual(["base:heart_attack", "addon:tic_tac"].sort());
    const ticked = toggleBlock(parseTrickBase({}), "addon:tic_tac", true, false);
    expect(ticked).toEqual({ disabled: [], enabled: ["addon:tic_tac"] });
    expect(effectiveDisabled(blocks, ticked)).toEqual(["base:heart_attack"]);
    expect(toggleBlock(ticked, "addon:tic_tac", false, false)).toEqual({ disabled: ["addon:tic_tac"], enabled: [] });
  });

  it("a retired block reads as an unticked word, yet a stored attempt with it keeps its name", () => {
    const v = toVocabulary(setBlockField(clean(), "base:heart_attack", { retired: true }));
    const vocab = buildTrickVocab(v as unknown as VocabularyInput);
    const off = effectiveDisabled(blocksFromVocabulary(v, []), parseTrickBase({}));
    const enabled = vocab.blocks.map((b) => b.id).filter((id) => !off.includes(id));
    expect(parseTrickText(vocab, "left heart attack", enabled).unmatched).toEqual(["heart attack"]);
    expect(composeTrick(vocab, { direction: "left", items: [{ id: "base:heart_attack" }] }).name).toBe("Left Heart attack");
  });

  it("the spotter's screen shows the master's families, names and order; retired blocks are left out", () => {
    let m = moveBlock(clean(), "addon:tic_tac", "grab_landing", 0);
    m = renameFamily(m, "grab_landing", "Grabs");
    m = setBlockField(m, "base:heart_attack", { retired: true });
    const v = toVocabulary(m);
    const blocks = blocksFromVocabulary(v, []);
    const fams = vocabularyFamilies(v);
    const view = resolveLayout(blocks, effectiveDisabled(blocks, parseTrickBase({})), parseLayout(null, fams.map((f) => f.key)), false, fams);
    const grabs = view.find((x) => x.family === "grab_landing")!;
    expect(grabs.label).toBe("Grabs");
    expect(grabs.blocks[0].key).toBe("tic_tac");
    expect(view.find((x) => x.family === "base")!.blocks.map((b) => b.key)).not.toContain("heart_attack");
  });
});
