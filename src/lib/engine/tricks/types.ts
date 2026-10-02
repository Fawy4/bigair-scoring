import { effectiveNamingTemplate } from "./naming";

/** The pieces of a trick (docs/08 §1G-3). No I/O: nothing here imports Supabase or React. */
export type BlockFamily = "direction" | "multiplier" | "base" | "addon" | "grab_landing";

export interface TrickBlock {
  /** `family:key`, where family is where the block comes from (a layout never changes it). */
  id: string;
  family: BlockFamily;
  key: string;
  label: string;
  aliases: string[];
  category: string | null;
  /** Base tricks and blocks marked takesMultiplier (Late rotations) can carry a multiplier. */
  takesMultiplier: boolean;
}

export interface TrickVocab {
  blocks: TrickBlock[];
  categoryPrecedence: string[];
  /** Key of the multiplier that is not written ("x1"). */
  hideMultiplierWhen: string | null;
  /** Where the direction and the blocks go in the name (docs/08 §1I-1); "{direction} {blocks}" by default. */
  namingTemplate: string;
}

/** One block of the sequence, with the key of its multiplier ("x2") when it has one. */
export interface TrickItem {
  id: string;
  multiplier?: string | null;
}

/** What is stored in `trick_attempts.trick_parts`. */
export interface TrickParts {
  /** Key of the direction ("left" | "right"), or null. */
  direction: string | null;
  items: TrickItem[];
  /** Words nobody recognised, kept for the head judge. */
  freeText?: string;
  needsReview?: boolean;
}

interface VocabItemJson {
  key: string;
  label: string;
  category?: string | null;
  aliases?: string[];
  family?: string;
  takesMultiplier?: boolean;
}

/** The master vocabulary file, as far as the engine reads it. */
export interface VocabularyInput {
  directions: VocabItemJson[];
  multipliers: VocabItemJson[];
  baseTricks: VocabItemJson[];
  modifiers: VocabItemJson[];
  categoryPrecedence: string[];
  hideMultiplierWhen?: string | null;
  namingTemplate?: string;
}

/** A block an event added itself (stored in the event's own vocabulary). */
export interface LocalBlockInput {
  family: BlockFamily;
  key: string;
  label: string;
  category?: string | null;
}

export const blockIdOf = (family: string, key: string): string => `${family}:${key}`;

/** The master vocabulary plus the event's own blocks, in family order. Local blocks only have their label to be read by. */
export function buildTrickVocab(json: VocabularyInput, local: LocalBlockInput[] = []): TrickVocab {
  const mk = (family: BlockFamily, i: VocabItemJson, takes = false): TrickBlock => ({
    id: blockIdOf(family, i.key),
    family,
    key: i.key,
    label: i.label,
    aliases: i.aliases ?? [],
    category: i.category ?? null,
    takesMultiplier: takes || i.takesMultiplier === true,
  });
  const master: TrickBlock[] = [
    ...json.directions.map((i) => mk("direction", i)),
    ...json.multipliers.map((i) => mk("multiplier", i)),
    ...json.baseTricks.map((i) => mk("base", i, true)),
    ...json.modifiers.map((i) => mk(i.family === "grab_landing" ? "grab_landing" : "addon", i)),
  ];
  const have = new Set(master.map((b) => b.id));
  const own = local
    .filter((l) => !have.has(blockIdOf(l.family, l.key)))
    .map((l) => mk(l.family, { key: l.key, label: l.label, category: l.category ?? null }, l.family === "base"));
  return { blocks: [...master, ...own], categoryPrecedence: json.categoryPrecedence, hideMultiplierWhen: json.hideMultiplierWhen || null, namingTemplate: effectiveNamingTemplate(json.namingTemplate) };
}
