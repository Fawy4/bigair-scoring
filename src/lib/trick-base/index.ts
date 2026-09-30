import { copy } from "@/lib/ui-copy";

/** The five families of the trick base, in the order the organiser sees them. */
export const FAMILIES = [
  { key: "direction", label: copy.trickBase.families.direction },
  { key: "multiplier", label: copy.trickBase.families.multiplier },
  { key: "base", label: copy.trickBase.families.base },
  { key: "addon", label: copy.trickBase.families.addon },
  { key: "grab_landing", label: copy.trickBase.families.grab_landing },
] as const;
export type FamilyKey = (typeof FAMILIES)[number]["key"];

interface VocabItem {
  key: string;
  label: string;
  category?: string | null;
  aliases?: string[];
  family?: string;
}
export interface VocabularyJson {
  directions: VocabItem[];
  multipliers: VocabItem[];
  baseTricks: VocabItem[];
  modifiers: VocabItem[];
  categoryPrecedence: string[];
  [k: string]: unknown;
}

/** A block the event added itself (stored in the event's own vocabulary). */
export interface LocalBlock {
  family: FamilyKey;
  key: string;
  label: string;
  category?: string | null;
  /** proposed = offered to the owner for the master base; accepted / declined are the owner's answers. */
  status: "proposed" | "accepted" | "declined";
}

export interface Block {
  family: FamilyKey;
  key: string;
  label: string;
  category: string | null;
  local?: boolean;
  proposed?: boolean;
}

export const blockId = (b: { family: string; key: string }) => `${b.family}:${b.key}`;

/** Every block of the master vocabulary, then the event's own, in family order. */
export function blocksFromVocabulary(vocab: VocabularyJson, local: LocalBlock[]): Block[] {
  const fromList = (items: VocabItem[], family: (i: VocabItem) => FamilyKey): Block[] =>
    items.map((i) => ({ family: family(i), key: i.key, label: i.label, category: i.category ?? null }));
  const master: Block[] = [
    ...fromList(vocab.directions, () => "direction"),
    ...fromList(vocab.multipliers, () => "multiplier"),
    ...fromList(vocab.baseTricks, () => "base"),
    ...fromList(vocab.modifiers, (i) => (i.family === "grab_landing" ? "grab_landing" : "addon")),
  ];
  const own: Block[] = local.map((l) => ({ family: l.family, key: l.key, label: l.label, category: l.category ?? null, local: true, proposed: l.status === "proposed" }));
  const all = [...master, ...own];
  return FAMILIES.flatMap((f) => all.filter((b) => b.family === f.key));
}

export interface TrickBase {
  /** `family:key` of every block the organiser unticked. Everything else is on, so new master blocks appear ticked. */
  disabled: string[];
}

export function parseTrickBase(json: unknown): TrickBase {
  const d = json && typeof json === "object" ? (json as { disabled?: unknown }).disabled : undefined;
  return { disabled: Array.isArray(d) ? [...new Set(d.filter((x): x is string => typeof x === "string"))] : [] };
}

export function toggleBlock(base: TrickBase, id: string, on: boolean): TrickBase {
  const rest = base.disabled.filter((d) => d !== id);
  return { disabled: on ? rest : [...rest, id] };
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

const humanise = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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
export function addLocalBlock(vocab: VocabularyJson, existing: LocalBlock[], input: { family: FamilyKey; label: string; category?: string | null }): { ok: true; block: LocalBlock } | { ok: false; error: string } {
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
  return after.disabled.every((d) => was.has(d));
}
