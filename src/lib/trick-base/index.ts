import { copy } from "@/lib/ui-copy";

/** The five families of the trick base, in the order the organiser sees them. */
export const FAMILIES = [
  { key: "direction", label: copy.trickBase.families.direction },
  { key: "multiplier", label: copy.trickBase.families.multiplier },
  { key: "base", label: copy.trickBase.families.base },
  { key: "addon", label: copy.trickBase.families.addon },
  { key: "grab_landing", label: copy.trickBase.families.grab_landing },
] as const;
/** One of the five lists a block is stored in; its identity (`family:key`) never changes. */
export type BuiltInFamily = (typeof FAMILIES)[number]["key"];
/** A family on the spotter's screen: one of the five, or one the owner added in the master base (`fam_…`). */
export type FamilyKey = string;

interface VocabItem {
  key: string;
  label: string;
  category?: string | null;
  aliases?: string[];
  family?: string;
  takesMultiplier?: boolean;
  /** Off for new events until an organiser ticks it (docs/08 §1I-5). */
  defaultOn?: boolean;
  /** Hidden from every spotter, kept so stored attempts keep their names. */
  retired?: boolean;
  rotation?: "backward" | "forward";
}
export interface VocabularyJson {
  /** The families in order, each with the blocks it shows (master editor). Absent in older versions: the five built-in families. */
  families?: Array<{ key: string; label: string; blocks?: string[] }>;
  directions: VocabItem[];
  multipliers: VocabItem[];
  baseTricks: VocabItem[];
  modifiers: VocabItem[];
  categoryPrecedence: string[];
  [k: string]: unknown;
}

/** A block the event added itself (stored in the event's own vocabulary). */
export interface LocalBlock {
  family: BuiltInFamily;
  key: string;
  label: string;
  category?: string | null;
  /** proposed = offered to the owner for the master base; accepted / declined are the owner's answers. */
  status: "proposed" | "accepted" | "declined";
  /** The owner's reason when a proposal was dismissed (shown to the organiser). */
  reason?: string;
}

export interface Block {
  /** Where the block is stored: part of its identity. */
  family: BuiltInFamily;
  key: string;
  label: string;
  category: string | null;
  /** The family the master base shows it in, when that is not its own. */
  shownIn?: FamilyKey;
  defaultOn?: boolean;
  retired?: boolean;
  local?: boolean;
  proposed?: boolean;
  declined?: boolean;
  reason?: string;
}

export const blockId = (b: { family: string; key: string }) => `${b.family}:${b.key}`;

/** The families of a vocabulary in their order and with the owner's names (older versions: the five built-in ones). */
export function familiesOf(vocab: Pick<VocabularyJson, "families"> | null | undefined): Array<{ key: FamilyKey; label: string }> {
  const out: Array<{ key: FamilyKey; label: string }> = [];
  for (const f of Array.isArray(vocab?.families) ? vocab.families : []) {
    if (f && typeof f.key === "string" && !out.some((x) => x.key === f.key)) out.push({ key: f.key, label: typeof f.label === "string" && f.label.trim() ? f.label : (FAMILIES.find((b) => b.key === f.key)?.label ?? f.key) });
  }
  for (const f of FAMILIES) if (!out.some((x) => x.key === f.key)) out.push({ key: f.key, label: f.label });
  return out;
}

/** Every block of the master vocabulary, then the event's own, in the master's family order (and its order inside each family). */
export function blocksFromVocabulary(vocab: VocabularyJson, local: LocalBlock[]): Block[] {
  const fromList = (items: VocabItem[], family: (i: VocabItem) => BuiltInFamily): Block[] =>
    items.map((i) => ({
      family: family(i),
      key: i.key,
      label: i.label,
      category: i.category ?? null,
      ...(i.defaultOn === false ? { defaultOn: false } : {}),
      ...(i.retired === true ? { retired: true } : {}),
    }));
  const master: Block[] = [
    ...fromList(vocab.directions, () => "direction"),
    ...fromList(vocab.multipliers, () => "multiplier"),
    ...fromList(vocab.baseTricks, () => "base"),
    ...fromList(vocab.modifiers, (i) => (i.family === "grab_landing" ? "grab_landing" : "addon")),
  ];
  const masterIds = new Set(master.map(blockId));
  const own: Block[] = local
    .filter((l) => !masterIds.has(blockId(l)))
    .map((l) => ({ family: l.family, key: l.key, label: l.label, category: l.category ?? null, local: true, proposed: l.status === "proposed", ...(l.status === "declined" ? { declined: true, ...(l.reason ? { reason: l.reason } : {}) } : {}) }));
  const all = [...master, ...own];
  // where the master base shows each block: the family whose list holds it (docs/08 §1I)
  const placed: Block[] = [];
  const families = familiesOf(vocab);
  const lists = Array.isArray(vocab.families) ? vocab.families : [];
  const fixed = (f: string) => f === "direction" || f === "multiplier";
  for (const f of families) {
    const ids = lists.find((l) => l.key === f.key)?.blocks ?? [];
    for (const id of ids) {
      const b = all.find((x) => blockId(x) === id);
      if (!b || placed.includes(b) || ((fixed(b.family) || fixed(f.key)) && b.family !== f.key)) continue;
      placed.push(f.key === b.family ? b : { ...b, shownIn: f.key });
    }
  }
  const rest = all.filter((b) => !placed.some((p) => blockId(p) === blockId(b)));
  return families.flatMap((f) => [...placed.filter((b) => (b.shownIn ?? b.family) === f.key), ...rest.filter((b) => b.family === f.key)]);
}

export interface TrickBase {
  /** `family:key` of every block the organiser unticked. Everything else is on, so new master blocks appear ticked. */
  disabled: string[];
  /** Blocks the master base has off for new events that the organiser ticked (docs/08 §1I-5). Stored only when there are some. */
  enabled?: string[];
  /** How the spotter's screen is laid out (docs/08 §1G-5). Absent = the vocabulary's own order. */
  layout?: unknown;
}

const strings = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string"))] : []);

export function parseTrickBase(json: unknown): TrickBase {
  const obj = json && typeof json === "object" ? (json as { disabled?: unknown; enabled?: unknown; layout?: unknown }) : {};
  const enabled = strings(obj.enabled);
  return { disabled: strings(obj.disabled), ...(enabled.length ? { enabled } : {}), ...(obj.layout !== undefined ? { layout: obj.layout } : {}) };
}

/** Ticks or unticks a block. A block the master base has off by default is remembered in `enabled` when ticked. */
export function toggleBlock(base: TrickBase, id: string, on: boolean, defaultOn = true): TrickBase {
  const disabled = base.disabled.filter((d) => d !== id);
  const enabled = (base.enabled ?? []).filter((d) => d !== id);
  if (on) return { ...base, disabled, enabled: defaultOn ? enabled : [...enabled, id] };
  return { ...base, disabled: [...disabled, id], enabled };
}

/**
 * The blocks that are off in a division, all reasons together: unticked by the organiser, retired in the master base, or off by default and never
 * ticked. Everything that shows or reads blocks (spotter, typed text, categories) uses this list.
 */
export function effectiveDisabled(blocks: Block[], base: TrickBase): string[] {
  const enabled = new Set(base.enabled ?? []);
  const off = new Set(base.disabled);
  for (const b of blocks) {
    const id = blockId(b);
    if (b.retired || (b.defaultOn === false && !enabled.has(id))) off.add(id);
  }
  return [...off].sort();
}

export function enabledBlocks(blocks: Block[], disabled: string[]): Block[] {
  const off = new Set(disabled);
  return blocks.filter((b) => !off.has(blockId(b)));
}

export interface DerivedCategory {
  key: string;
  label: string;
  [k: string]: unknown;
}

const humanise = (key: string) => copy.trickBase.categoryLabels[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * The scoring categories a division needs, worked out from its ticked blocks: every category named by a ticked base trick or
 * add-on, ordered by the vocabulary's precedence (handle pass > board-off > kiteloop > rotation > other). A category keeps
 * the scoring model's own settings where the keys match.
 */
export function deriveCategories(blocks: Block[], disabled: string[], precedence: string[], modelCategories: Array<{ key: string; label: string }>): DerivedCategory[] {
  const used = new Set(
    enabledBlocks(blocks, disabled)
      .filter((b) => b.family === "base" || b.family === "addon" || b.family === "grab_landing")
      .map((b) => b.category)
      .filter((c): c is string => Boolean(c)),
  );
  const ordered = [...precedence.filter((k) => used.has(k)), ...[...used].filter((k) => !precedence.includes(k)).sort()];
  return ordered.map((key) => {
    const model = modelCategories.find((c) => c.key === key);
    return model ? { ...model } : { key, label: humanise(key) };
  });
}

const MAX_LABEL = 40;
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Adds a block of the event's own. Refuses an empty name, a name that already exists in that family, or one that is too long. */
export function addLocalBlock(vocab: VocabularyJson, existing: LocalBlock[], input: { family: BuiltInFamily; label: string; category?: string | null }): { ok: true; block: LocalBlock } | { ok: false; error: string } {
  const T = copy.trickBase;
  if (!FAMILIES.some((f) => f.key === input.family)) return { ok: false, error: T.errors.family };
  const label = input.label.trim().replace(/\s+/g, " ");
  if (!label) return { ok: false, error: T.errors.empty };
  if (label.length > MAX_LABEL) return { ok: false, error: T.errors.tooLong(MAX_LABEL) };
  const key = `local_${slug(label)}`;
  if (key === "local_") return { ok: false, error: T.errors.empty };
  const taken = blocksFromVocabulary(vocab, existing).some((b) => b.family === input.family && (b.key === key || b.label.toLowerCase() === label.toLowerCase()));
  if (taken) return { ok: false, error: T.errors.exists(label) };
  return { ok: true, block: { family: input.family, key, label, category: input.category ?? null, status: "proposed" } };
}

/** After a heat has started a block can be ticked on but never unticked: the new list of unticked blocks may only be shorter. */
export function changeAllowedAfterStart(before: TrickBase, after: TrickBase): boolean {
  const was = new Set(before.disabled);
  const now = new Set(after.enabled ?? []);
  return after.disabled.every((d) => was.has(d)) && (before.enabled ?? []).every((e) => now.has(e));
}

/** The master vocabulary with one proposed block added (the owner accepted it). Returns a new object; the master copy wins from then on. */
export function addBlockToVocabulary(vocab: VocabularyJson, block: LocalBlock): { ok: true; vocabulary: VocabularyJson } | { ok: false; error: string } {
  const existing = blocksFromVocabulary(vocab, []);
  if (existing.some((b) => b.family === block.family && (b.key === block.key || b.label.toLowerCase() === block.label.toLowerCase()))) {
    return { ok: false, error: copy.trickBase.admin.clash };
  }
  const item = { key: block.key, label: block.label, aliases: [] as string[] };
  const next = structuredClone(vocab);
  switch (block.family) {
    case "direction":
      next.directions.push(item);
      break;
    case "multiplier":
      next.multipliers.push(item);
      break;
    case "base":
      next.baseTricks.push({ ...item, category: block.category ?? "other" });
      break;
    case "addon":
      next.modifiers.push({ ...item, family: "addon", category: block.category ?? null });
      break;
    case "grab_landing":
      next.modifiers.push({ ...item, family: "grab_landing", category: block.category ?? null });
      break;
  }
  return { ok: true, vocabulary: next };
}
