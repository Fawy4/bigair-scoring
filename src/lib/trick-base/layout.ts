import { blockId, FAMILIES, type Block, type FamilyKey } from ".";

type FamilyList = ReadonlyArray<{ key: FamilyKey; label: string }>;

/**
 * The spotter's layout of one division (owner, 1 Oct 2026). Families only organise the spotter's screen: they decide where a block is shown, never how a
 * trick is built. Stored in `divisions.trick_base.layout`. Direction and Multiplier keep their own rows (they can be reordered inside them); Base trick,
 * Add-ons and Grabs & landings exchange blocks freely.
 */
export interface TrickLayout {
  /** The order of the families on the spotter's screen (the five, plus any the owner added in the master base). */
  families: FamilyKey[];
  /** Where a block is shown when that is not its own family (`family:key` → family). */
  moved: Record<string, FamilyKey>;
  /** The blocks of a family, in the order shown. Blocks not listed follow in vocabulary order. */
  order: Partial<Record<FamilyKey, string[]>>;
  /** Blocks pinned to the top of their family. */
  favourites: string[];
}

/** The built-in families blocks can be moved between; a family the owner adds is movable too. Direction and Multiplier keep their own. */
export const MOVABLE: FamilyKey[] = ["base", "addon", "grab_landing"];
const FAMILY_KEYS: FamilyKey[] = FAMILIES.map((f) => f.key);
export const isMovable = (f: FamilyKey) => f !== "direction" && f !== "multiplier";

export const defaultLayout = (familyKeys: readonly FamilyKey[] = FAMILY_KEYS): TrickLayout => ({ families: [...familyKeys], moved: {}, order: {}, favourites: [] });

/** Reads whatever is stored, forgiving anything that is not well formed. Every family of the vocabulary appears exactly once, in the stored order first. */
export function parseLayout(json: unknown, familyKeys: readonly FamilyKey[] = FAMILY_KEYS): TrickLayout {
  const raw = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const out = defaultLayout(familyKeys);
  const isFamily = (x: unknown): x is FamilyKey => typeof x === "string" && familyKeys.includes(x);
  const fams = Array.isArray(raw.families) ? raw.families.filter(isFamily) : [];
  out.families = [...new Set([...fams, ...familyKeys])];
  if (raw.moved && typeof raw.moved === "object") {
    for (const [id, f] of Object.entries(raw.moved as Record<string, unknown>)) if (isFamily(f)) out.moved[id] = f;
  }
  if (raw.order && typeof raw.order === "object") {
    for (const [f, ids] of Object.entries(raw.order as Record<string, unknown>)) {
      if (isFamily(f) && Array.isArray(ids)) out.order[f] = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
    }
  }
  out.favourites = Array.isArray(raw.favourites) ? [...new Set(raw.favourites.filter((x): x is string => typeof x === "string"))] : [];
  return out;
}

/** Where the master base shows a block (its own family unless the owner moved it). */
const masterFamily = (block: Block): FamilyKey => block.shownIn ?? block.family;

/** The family a block is shown in: the master's, unless this division moved it to another movable family. */
export function displayFamily(block: Block, layout: TrickLayout): FamilyKey {
  const to = layout.moved[blockId(block)];
  return to && isMovable(block.family) && isMovable(to) ? to : masterFamily(block);
}

export interface FamilyView {
  family: FamilyKey;
  label: string;
  blocks: Block[];
}

/**
 * What the spotter (or the organiser's panel) shows: the families in the chosen order, each with its blocks in the chosen order and its favourites on top.
 * Unticked blocks are left out unless `includeUnticked` (the organiser's panel shows them so they can be ticked again).
 */
export function resolveLayout(blocks: Block[], disabled: string[], layout: TrickLayout, includeUnticked = false, families: FamilyList = FAMILIES): FamilyView[] {
  const off = new Set(disabled);
  const live = blocks.filter((b) => !b.retired && (includeUnticked || !off.has(blockId(b))));
  const fav = new Set(layout.favourites);
  const known = families.map((f) => f.key);
  const order = [...layout.families.filter((f) => known.includes(f)), ...known.filter((f) => !layout.families.includes(f))];
  return order.map((family) => {
    const mine = live.filter((b) => displayFamily(b, layout) === family);
    const listed = (layout.order[family] ?? []).flatMap((id) => mine.filter((b) => blockId(b) === id));
    const rest = mine.filter((b) => !listed.includes(b));
    const ordered = [...listed, ...rest];
    return { family, label: families.find((f) => f.key === family)!.label, blocks: [...ordered.filter((b) => fav.has(blockId(b))), ...ordered.filter((b) => !fav.has(blockId(b)))] };
  });
}

const without = (ids: string[] | undefined, id: string) => (ids ?? []).filter((x) => x !== id);

/** Puts a block in a family at a position (0 = first). Direction and Multiplier only accept their own blocks; the others exchange freely. */
export function placeBlock(view: FamilyView[], layout: TrickLayout, block: Block, family: FamilyKey, index: number): TrickLayout {
  const id = blockId(block);
  const target = displayFamily(block, layout) === family ? family : isMovable(block.family) && isMovable(family) ? family : null;
  if (!target) return layout;
  const next: TrickLayout = { ...layout, moved: { ...layout.moved }, order: { ...layout.order } };
  for (const v of view) next.order[v.family] = v.blocks.map(blockId); // pin the order as it is shown now
  for (const f of Object.keys(next.order)) next.order[f] = without(next.order[f], id);
  const list = [...(next.order[target] ?? [])];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
  next.order[target] = list;
  if (target === masterFamily(block)) delete next.moved[id];
  else next.moved[id] = target;
  return next;
}

/** One place up (-1) or down (+1) inside its family; at the end of the list nothing happens. */
export function nudgeBlock(view: FamilyView[], layout: TrickLayout, block: Block, delta: -1 | 1): TrickLayout {
  const family = view.find((v) => v.blocks.some((b) => blockId(b) === blockId(block)));
  if (!family) return layout;
  const at = family.blocks.findIndex((b) => blockId(b) === blockId(block));
  const to = at + delta;
  if (to < 0 || to >= family.blocks.length) return layout;
  return placeBlock(view, layout, block, family.family, to);
}

export function toggleFavourite(layout: TrickLayout, id: string): TrickLayout {
  return { ...layout, favourites: layout.favourites.includes(id) ? layout.favourites.filter((x) => x !== id) : [...layout.favourites, id] };
}

/** One place earlier or later in the order of families. */
export function nudgeFamily(layout: TrickLayout, family: FamilyKey, delta: -1 | 1): TrickLayout {
  const at = layout.families.indexOf(family);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= layout.families.length) return layout;
  const families = [...layout.families];
  [families[at], families[to]] = [families[to], families[at]];
  return { ...layout, families };
}

/** A layout with nothing set is stored as nothing. */
export function isDefaultLayout(layout: TrickLayout, familyKeys: readonly FamilyKey[] = FAMILY_KEYS): boolean {
  const d = defaultLayout(familyKeys);
  return layout.families.join() === d.families.join() && Object.keys(layout.moved).length === 0 && Object.values(layout.order).every((o) => !o?.length) && layout.favourites.length === 0;
}
