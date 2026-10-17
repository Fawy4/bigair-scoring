import { z } from "zod";

/**
 * The reference scores shown to judges as a hint (never a score): what an average version of a trick is worth, and what each variation adds.
 * It lives in the trick base (the `reference` part of the vocabulary file), so the owner edits and publishes it with the tricks themselves.
 * Blocks are named by their id (`family:key`), the same ids a logged trick is stored with.
 */
const Value = z.number().min(0).max(50);

export const ReferenceTrickSchema = z.object({
  /** Shown in the breakdown ("Boogie 4"). */
  label: z.string().trim().min(1).max(60),
  /** The blocks that make this trick, in any order. The trick must be exactly these (plus variations), or no hint is shown. */
  blocks: z.array(z.string().min(3).max(100)).min(1).max(6),
  value: Value,
});

export const ReferenceAdderSchema = z.object({
  /** The variation block (an add-on or a landing). */
  block: z.string().min(3).max(100),
  value: Value,
  /** Variations in one group do not add up: only the highest of them counts (Board Off, Board Flip, Osmosis). */
  group: z.string().trim().min(1).max(40).optional(),
});

export const ReferenceTableSchema = z.object({
  tricks: z.array(ReferenceTrickSchema).max(300).default([]),
  adders: z.array(ReferenceAdderSchema).max(100).default([]),
});

export type ReferenceTrick = z.infer<typeof ReferenceTrickSchema>;
export type ReferenceAdder = z.infer<typeof ReferenceAdderSchema>;
export type ReferenceTable = z.infer<typeof ReferenceTableSchema>;

/** The reference part of a vocabulary file; null when it has none or it does not read (the judge then simply sees no hint). */
export function parseReferenceTable(raw: unknown): ReferenceTable | null {
  const p = ReferenceTableSchema.safeParse(raw);
  return p.success && (p.data.tricks.length > 0 || p.data.adders.length > 0) ? p.data : null;
}
