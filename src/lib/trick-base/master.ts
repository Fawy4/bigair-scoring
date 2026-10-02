import { buildTrickVocab, checkNamingTemplate, composeTrick, effectiveNamingTemplate, type VocabularyInput } from "@/lib/engine/tricks";
import { copy } from "@/lib/ui-copy";
import { FAMILIES, type BuiltInFamily, type VocabularyJson } from ".";

/**
 * The master trick base as the owner edits it (docs/08 §1I). A block's identity is `home:key`, where home is the list it is stored in (direction,
 * multiplier, base, addon, grab_landing); it never changes, so stored attempts and every division's ticks keep working. Where the spotter sees a block
 * is the family whose list holds it: moving a block only moves it between those lists. Direction and Multiplier keep their own blocks.
 */
export type Rotation = "backward" | "forward" | "none";

export interface MasterBlock {
  id: string;
  home: BuiltInFamily;
  key: string;
  label: string;
  aliases: string[];
  category: string | null;
  takesMultiplier: boolean;
  rotation: Rotation;
  defaultOn: boolean;
  retired: boolean;
  /** Anything else the item carries (grab variants…), kept as it is. */
  extra: Record<string, unknown>;
}

export interface MasterFamily {
  key: string;
  label: string;
  builtIn: boolean;
  /** Ids of the blocks shown in this family, in order. */
  blocks: string[];
}

export interface MasterModel {
  families: MasterFamily[];
  blocks: Record<string, MasterBlock>;
  categoryPrecedence: string[];
  namingTemplate: string;
  /** Key of the multiplier that is not written; "" = always written. */
  hideMultiplierWhen: string;
  /** Other top-level parts of the file (examples, speech…), kept as they are. */
  rest: Record<string, unknown>;
}

const BUILT_IN = FAMILIES.map((f) => f.key) as BuiltInFamily[];
const FIXED: BuiltInFamily[] = ["direction", "multiplier"];
const KNOWN_ITEM = new Set(["key", "label", "aliases", "category", "family", "takesMultiplier", "rotation", "defaultOn", "retired"]);
const KNOWN_TOP = new Set(["families", "directions", "multipliers", "baseTricks", "modifiers", "categoryPrecedence", "namingTemplate", "hideMultiplierWhen"]);
export const KEY_PATTERN = /^[a-z0-9_]{1,80}$/;

type Item = Record<string, unknown> & { key: string; label: string };
const isFixed = (f: string) => (FIXED as string[]).includes(f);
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The families of a vocabulary file, in order, with their names (an older file has the five built-in ones). */
export function vocabularyFamilies(vocab: Pick<VocabularyJson, "families"> | null | undefined): Array<{ key: string; label: string }> {
  return toFamilies(vocab?.families).map(({ key, label }) => ({ key, label }));
}

function toFamilies(raw: unknown): MasterFamily[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: MasterFamily[] = [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const { key, label, blocks } = f as { key?: unknown; label?: unknown; blocks?: unknown };
    if (typeof key !== "string" || out.some((x) => x.key === key)) continue;
    const builtIn = (BUILT_IN as string[]).includes(key);
    out.push({ key, label: typeof label === "string" && label.trim() ? label : (FAMILIES.find((b) => b.key === key)?.label ?? key), builtIn, blocks: Array.isArray(blocks) ? blocks.filter((x): x is string => typeof x === "string") : [] });
  }
  for (const f of FAMILIES) if (!out.some((x) => x.key === f.key)) out.push({ key: f.key, label: f.label, builtIn: true, blocks: [] });
  return out;
}

/** The file → the editor's model. */
export function toModel(vocab: VocabularyJson): MasterModel {
  const blocks: Record<string, MasterBlock> = {};
  const order: string[] = [];
  const read = (items: unknown, home: (i: Item) => BuiltInFamily, takes: boolean) => {
    for (const raw of Array.isArray(items) ? (items as Item[]) : []) {
      if (!raw || typeof raw.key !== "string") continue;
      const h = home(raw);
      const id = `${h}:${raw.key}`;
      if (blocks[id]) continue;
      const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !KNOWN_ITEM.has(k)));
      blocks[id] = {
        id,
        home: h,
        key: raw.key,
        label: typeof raw.label === "string" ? raw.label : raw.key,
        aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((a): a is string => typeof a === "string") : [],
        category: typeof raw.category === "string" ? raw.category : null,
        takesMultiplier: takes || raw.takesMultiplier === true,
        rotation: raw.rotation === "backward" || raw.rotation === "forward" ? raw.rotation : "none",
        defaultOn: raw.defaultOn !== false,
        retired: raw.retired === true,
        extra,
      };
      order.push(id);
    }
  };
  read(vocab.directions, () => "direction", false);
  read(vocab.multipliers, () => "multiplier", false);
  read(vocab.baseTricks, () => "base", true);
  read(vocab.modifiers, (i) => (i.family === "grab_landing" ? "grab_landing" : "addon"), false);

  const families = toFamilies(vocab.families);
  const placed = new Set<string>();
  for (const f of families) {
    f.blocks = f.blocks.filter((id) => {
      const b = blocks[id];
      const ok = b && !placed.has(id) && (isFixed(b.home) || isFixed(f.key) ? b.home === f.key : true);
      if (ok) placed.add(id);
      return ok;
    });
  }
  for (const id of order) if (!placed.has(id)) families.find((f) => f.key === blocks[id].home)!.blocks.push(id);

  const rest = Object.fromEntries(Object.entries(vocab).filter(([k]) => !KNOWN_TOP.has(k)));
  return {
    families,
    blocks,
    categoryPrecedence: Array.isArray(vocab.categoryPrecedence) ? [...vocab.categoryPrecedence] : [],
    namingTemplate: effectiveNamingTemplate(vocab.namingTemplate as string | undefined),
    hideMultiplierWhen: typeof vocab.hideMultiplierWhen === "string" ? vocab.hideMultiplierWhen : "",
    rest,
  };
}

function toItem(b: MasterBlock): Item {
  const item: Item = { key: b.key, label: b.label };
  if (b.home === "addon" || b.home === "grab_landing") item.family = b.home;
  if (b.home !== "direction" && b.home !== "multiplier") item.category = b.category;
  else if (b.category) item.category = b.category;
  item.aliases = [...b.aliases];
  if (b.takesMultiplier && b.home !== "base") item.takesMultiplier = true;
  if (b.rotation !== "none") item.rotation = b.rotation;
  if (!b.defaultOn) item.defaultOn = false;
  if (b.retired) item.retired = true;
  return { ...item, ...b.extra };
}

/** The editor's model → the file. The four lists follow the order shown, so an older reader still sees a sensible order. */
export function toVocabulary(m: MasterModel): VocabularyJson {
  const shown = m.families.flatMap((f) => f.blocks).map((id) => m.blocks[id]).filter(Boolean);
  const of = (home: BuiltInFamily[]) => shown.filter((b) => home.includes(b.home)).map(toItem);
  return {
    ...m.rest,
    families: m.families.map((f) => ({ key: f.key, label: f.label, blocks: [...f.blocks] })),
    directions: of(["direction"]),
    multipliers: of(["multiplier"]),
    baseTricks: of(["base"]),
    modifiers: of(["addon", "grab_landing"]),
    categoryPrecedence: [...m.categoryPrecedence],
    namingTemplate: m.namingTemplate,
    hideMultiplierWhen: m.hideMultiplierWhen,
  } as VocabularyJson;
}

// ------------------------------------------------------------------------------------------------------------------------------------- editing

const patchBlock = (m: MasterModel, id: string, patch: Partial<MasterBlock>): MasterModel => (m.blocks[id] ? { ...m, blocks: { ...m.blocks, [id]: { ...m.blocks[id], ...patch } } } : m);

/** Rename: the label only; the key stays, so existing events and stored attempts keep working. */
export const renameBlock = (m: MasterModel, id: string, label: string): MasterModel => patchBlock(m, id, { label });

export function setBlockField(m: MasterModel, id: string, patch: Partial<Pick<MasterBlock, "category" | "takesMultiplier" | "rotation" | "defaultOn" | "retired">>): MasterModel {
  return patchBlock(m, id, patch);
}

export function addAlias(m: MasterModel, id: string, text: string): MasterModel {
  const b = m.blocks[id];
  const alias = text.trim().replace(/\s+/g, " ");
  if (!b || !alias || b.aliases.some((a) => norm(a) === norm(alias))) return m;
  return patchBlock(m, id, { aliases: [...b.aliases, alias] });
}

export function removeAlias(m: MasterModel, id: string, text: string): MasterModel {
  const b = m.blocks[id];
  return b ? patchBlock(m, id, { aliases: b.aliases.filter((a) => norm(a) !== norm(text)) }) : m;
}

/** A new key (only before the block has been in a published version; the screen locks it afterwards). The block's id follows. */
export function setKey(m: MasterModel, id: string, key: string): MasterModel {
  const b = m.blocks[id];
  if (!b || b.key === key) return m;
  const next = `${b.home}:${key}`;
  if (m.blocks[next]) return m;
  const blocks = { ...m.blocks };
  delete blocks[id];
  blocks[next] = { ...b, key, id: next };
  return { ...m, blocks, families: m.families.map((f) => ({ ...f, blocks: f.blocks.map((x) => (x === id ? next : x)) })) };
}

export const familyOfBlock = (m: MasterModel, id: string): MasterFamily | undefined => m.families.find((f) => f.blocks.includes(id));

/** Puts a block in a family at a position. Direction and Multiplier only hold their own blocks. */
export function moveBlock(m: MasterModel, id: string, family: string, index: number): MasterModel {
  const b = m.blocks[id];
  const target = m.families.find((f) => f.key === family);
  if (!b || !target) return m;
  if ((isFixed(b.home) || isFixed(family)) && b.home !== family) return m;
  const families = m.families.map((f) => ({ ...f, blocks: f.blocks.filter((x) => x !== id) }));
  const list = families.find((f) => f.key === family)!.blocks;
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
  return { ...m, families };
}

/** One place up (-1) or down (+1) inside its family. */
export function nudgeBlock(m: MasterModel, id: string, delta: -1 | 1): MasterModel {
  const f = familyOfBlock(m, id);
  if (!f) return m;
  const at = f.blocks.indexOf(id);
  const to = at + delta;
  if (to < 0 || to >= f.blocks.length) return m;
  return moveBlock(m, id, f.key, to);
}

/** "+ Add block" in a family. A block added to a family of the owner's own behaves like an add-on (it is stored with the add-ons). */
export function addBlock(m: MasterModel, family: string, label: string): { model: MasterModel; id: string } {
  const f = m.families.find((x) => x.key === family) ?? m.families.find((x) => x.key === "base")!;
  const home: BuiltInFamily = f.builtIn ? (f.key as BuiltInFamily) : "addon";
  const keys = new Set(Object.values(m.blocks).map((b) => b.key));
  const stem = slug(label) || "block";
  let key = stem;
  for (let n = 2; keys.has(key); n++) key = `${stem}_${n}`;
  const id = `${home}:${key}`;
  const block: MasterBlock = {
    id,
    home,
    key,
    label: label.trim().replace(/\s+/g, " "),
    aliases: [],
    category: home === "base" ? (m.categoryPrecedence.at(-1) ?? null) : null,
    takesMultiplier: home === "base",
    rotation: "none",
    defaultOn: true,
    retired: false,
    extra: {},
  };
  return { model: { ...m, blocks: { ...m.blocks, [id]: block }, families: m.families.map((x) => (x.key === f.key ? { ...x, blocks: [...x.blocks, id] } : x)) }, id };
}

/** Takes a block out completely. Only for a block that was never published; validation refuses it otherwise. */
export function removeBlock(m: MasterModel, id: string): MasterModel {
  const blocks = { ...m.blocks };
  delete blocks[id];
  return { ...m, blocks, families: m.families.map((f) => ({ ...f, blocks: f.blocks.filter((x) => x !== id) })) };
}

export const renameFamily = (m: MasterModel, key: string, label: string): MasterModel => ({ ...m, families: m.families.map((f) => (f.key === key ? { ...f, label } : f)) });

export function nudgeFamily(m: MasterModel, key: string, delta: -1 | 1): MasterModel {
  const at = m.families.findIndex((f) => f.key === key);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= m.families.length) return m;
  const families = [...m.families];
  [families[at], families[to]] = [families[to], families[at]];
  return { ...m, families };
}

export function addFamily(m: MasterModel, label: string): { model: MasterModel; key: string } {
  const stem = `fam_${slug(label) || "family"}`;
  let key = stem;
  for (let n = 2; m.families.some((f) => f.key === key); n++) key = `${stem}_${n}`;
  return { model: { ...m, families: [...m.families, { key, label: label.trim(), builtIn: false, blocks: [] }] }, key };
}

/** A family of the owner's own that holds no block can be taken out again. */
export function removeFamily(m: MasterModel, key: string): MasterModel {
  const f = m.families.find((x) => x.key === key);
  return f && !f.builtIn && f.blocks.length === 0 ? { ...m, families: m.families.filter((x) => x.key !== key) } : m;
}

export function nudgeCategory(m: MasterModel, category: string, delta: -1 | 1): MasterModel {
  const list = [...m.categoryPrecedence];
  const at = list.indexOf(category);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= list.length) return m;
  [list[at], list[to]] = [list[to], list[at]];
  return { ...m, categoryPrecedence: list };
}

/** "Left ×2 Backroll Board-off", worked out from the draft as it is now. */
export function liveExample(m: MasterModel): string {
  const vocab = buildTrickVocab(toVocabulary(m) as unknown as VocabularyInput);
  const has = (id: string) => vocab.blocks.some((b) => b.id === id);
  const items = [{ id: "base:backroll", multiplier: "x2" }, { id: "addon:board_off" }].filter((i) => has(i.id));
  return composeTrick(vocab, { direction: has("direction:left") ? "left" : null, items }).name;
}

// ------------------------------------------------------------------------------------------------------------------------------------ checking

/** Every block id that was in any published version: their keys are locked and they can only be retired. */
export function publishedIds(versions: VocabularyJson[]): Set<string> {
  return new Set(versions.flatMap((v) => Object.keys(toModel(v).blocks)));
}

const familyLabel = (m: MasterModel, id: string) => familyOfBlock(m, id)?.label ?? FAMILIES.find((f) => f.key === m.blocks[id]?.home)?.label ?? "";

/**
 * Everything wrong with a draft, one sentence each (docs/08 §1I-2). `base` is the version the draft started from: when two blocks share a word, the
 * sentence is about the one the draft changed and names the block that already had it. A word two blocks already shared in `base` does not block a save
 * (the reader settles it, base tricks first); it is listed in `warnings` so the owner can tidy it up.
 */
export function checkModel(m: MasterModel, published: Set<string>, base?: MasterModel): { errors: string[]; warnings: string[] } {
  const E = copy.trickEditor.errors;
  const out: string[] = [];
  const warnings: string[] = [];
  const shown = m.families.flatMap((f) => f.blocks).map((id) => m.blocks[id]).filter(Boolean);

  if (m.families.some((f) => !f.label.trim())) out.push(E.emptyFamily);
  for (const b of shown) if (!b.label.trim()) out.push(E.emptyLabel(familyLabel(m, b.id)));
  for (const b of shown) if (b.label.trim() && !KEY_PATTERN.test(b.key)) out.push(E.badKey(b.label));

  const byKey = new Map<string, MasterBlock>();
  for (const b of shown) {
    const first = byKey.get(b.key);
    if (first) out.push(E.duplicateKey(b.key, first.label, b.label));
    else byKey.set(b.key, b);
  }

  // words: every label and alias is read from typed and spoken text, so each may belong to one block only
  type Word = { text: string; block: MasterBlock; kind: "label" | "alias" };
  const words: Word[] = shown.flatMap((b) => [{ text: norm(b.label), block: b, kind: "label" as const }, ...b.aliases.map((a) => ({ text: norm(a), block: b, kind: "alias" as const }))]).filter((w) => w.text);
  const unchanged = (w: Word) => {
    const was = base?.blocks[w.block.id];
    return Boolean(was && (w.kind === "label" ? norm(was.label) === w.text : was.aliases.some((a) => norm(a) === w.text)));
  };
  const seen = new Map<string, Word>();
  const reported = new Set<string>();
  for (const w of [...words.filter(unchanged), ...words.filter((x) => !unchanged(x))]) {
    const first = seen.get(w.text);
    if (!first) {
      seen.set(w.text, w);
      continue;
    }
    if (first.block.id === w.block.id || reported.has(w.text)) continue;
    reported.add(w.text);
    const sentence = first.kind === "alias" ? E.aliasTaken(w.text, first.block.label) : E.nameTaken(w.text, first.block.label);
    if (unchanged(first) && unchanged(w)) warnings.push(E.alreadyShared(sentence));
    else out.push(sentence);
  }

  for (const b of shown) {
    if (b.category && !m.categoryPrecedence.includes(b.category)) out.push(E.unknownCategory(b.label, b.category));
    if (b.home === "base" && !b.category && b.label.trim()) out.push(E.baseNeedsCategory(b.label));
  }
  for (const id of published) {
    if (!m.blocks[id] && base?.blocks[id]) out.push(E.publishedRemoved(base.blocks[id].label));
  }
  if (!base) for (const id of published) if (!m.blocks[id]) out.push(E.publishedRemoved(id.split(":")[1]));

  const naming = checkNamingTemplate(m.namingTemplate);
  if (naming) out.push(naming.code === "missing_blocks" ? E.namingMissingBlocks : E.namingUnknown(naming.part));
  if (m.hideMultiplierWhen && !shown.some((b) => b.home === "multiplier" && b.key === m.hideMultiplierWhen)) out.push(E.hideNotMultiplier);
  return { errors: out, warnings };
}

/** The sentences that block a save (see checkModel). */
export const validateModel = (m: MasterModel, published: Set<string>, base?: MasterModel): string[] => checkModel(m, published, base).errors;

// ---------------------------------------------------------------------------------------------------------------------------------------- diff

export interface VocabularyDiff {
  summary: string;
  lines: string[];
  empty: boolean;
}

/** What changed between two versions, in words (docs/08 §1I-3): "3 renamed, 1 added, 1 retired" and one line per change. */
export function diffModels(a: MasterModel, b: MasterModel): VocabularyDiff {
  const D = copy.trickEditor.diff;
  const lines: string[] = [];
  const n = { renamed: 0, added: 0, retired: 0, restored: 0, removed: 0, moved: 0, aliases: 0, other: 0 };
  const order = b.families.flatMap((f) => f.blocks).filter((id) => b.blocks[id]);
  const before = (id: string) => a.blocks[id];

  const renamed: string[] = [], added: string[] = [], retired: string[] = [], restored: string[] = [], removed: string[] = [], moved: string[] = [], aliases: string[] = [], other: string[] = [];
  for (const id of order) {
    const now = b.blocks[id];
    const was = before(id);
    if (!was) {
      n.added++;
      added.push(D.addedLine(now.label, familyOfBlock(b, id)?.label ?? ""));
      continue;
    }
    if (was.label !== now.label) {
      n.renamed++;
      renamed.push(D.renamedLine(was.label, now.label));
    }
    if (!was.retired && now.retired) {
      n.retired++;
      retired.push(D.retiredLine(now.label));
    }
    if (was.retired && !now.retired) {
      n.restored++;
      restored.push(D.restoredLine(now.label));
    }
    if (familyOfBlock(a, id)?.key !== familyOfBlock(b, id)?.key) {
      n.moved++;
      moved.push(D.movedLine(now.label, familyOfBlock(b, id)?.label ?? ""));
    }
    if (was.aliases.map(norm).sort().join("|") !== now.aliases.map(norm).sort().join("|")) {
      n.aliases++;
      aliases.push(D.aliasesLine(now.label, now.aliases.join(", ")));
    }
    const fields = (["category", "takesMultiplier", "rotation", "defaultOn"] as const).filter((k) => was[k] !== now[k]);
    if (fields.length) {
      n.other++;
      other.push(D.otherLine(now.label, fields.map((k) => D.fields[k]).join(", ")));
    }
  }
  for (const id of Object.keys(a.blocks)) {
    if (!b.blocks[id]) {
      n.removed++;
      removed.push(D.removedLine(a.blocks[id].label));
    }
  }
  lines.push(...renamed, ...added, ...retired, ...restored, ...removed, ...moved, ...aliases, ...other);

  const famSig = (m: MasterModel) => m.families.map((f) => `${f.key}=${f.label}`).join("|");
  const families = famSig(a) !== famSig(b);
  const precedence = a.categoryPrecedence.join() !== b.categoryPrecedence.join();
  const naming = a.namingTemplate !== b.namingTemplate || a.hideMultiplierWhen !== b.hideMultiplierWhen;
  if (families) lines.push(D.familiesLine(b.families.map((f) => f.label).join(", ")));
  if (precedence) lines.push(D.precedenceLine(b.categoryPrecedence.map((c) => copy.trickBase.categoryLabels[c] ?? c).join(" > ")));
  if (naming) lines.push(D.namingLine(liveExample(b)));

  const parts = [
    n.renamed && D.renamed(n.renamed),
    n.added && D.added(n.added),
    n.retired && D.retired(n.retired),
    n.restored && D.restored(n.restored),
    n.removed && D.removed(n.removed),
    n.moved && D.moved(n.moved),
    n.aliases && D.aliases(n.aliases),
    n.other && D.other(n.other),
    families && D.families,
    precedence && D.precedence,
    naming && D.naming,
  ].filter((x): x is string => Boolean(x));
  return { summary: parts.length ? parts.join(", ") : D.none, lines, empty: parts.length === 0 };
}

export const diffVocabularies = (a: VocabularyJson, b: VocabularyJson): VocabularyDiff => diffModels(toModel(a), toModel(b));

// ------------------------------------------------------------------------------------------------------------------------------------ versions

/** What a save does (docs/08 §1I-4): the next number after every version (drafts included), or nothing when it is the newest version already. */
export function planSave(versions: Array<{ version: number; hash: string }>, hash: string): { action: "insert"; version: number } | { action: "unchanged" } {
  if (versions.length === 0) return { action: "insert", version: 1 };
  const newest = versions.reduce((x, y) => (y.version > x.version ? y : x));
  return newest.hash === hash ? { action: "unchanged" } : { action: "insert", version: newest.version + 1 };
}
