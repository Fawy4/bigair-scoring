import { buildTrickVocab, type TrickVocab, type VocabularyInput } from "@/lib/engine/tricks";
import { riderLabelModel, type LabelModel } from "@/lib/identification/rider-label";
import { blocksFromVocabulary, type VocabularyJson } from "@/lib/trick-base";
import { parseLayout, resolveLayout, type FamilyView } from "@/lib/trick-base/layout";
import type { PendingAttempt } from "./pending";
import type { AttemptRow, LiveContext, LiveDivisionContext, SlotRow } from "./types";

export interface HeatRider {
  entryId: string;
  name: string;
  label: LabelModel;
  position: number;
  /** Not riding: did not start, or flagged out. */
  riding: boolean;
}

/** The riders of a heat in seat order, each with the Rider label the division's scheme gives them (the Lycra colour is the seat's). */
export function ridersForHeat(ctx: Pick<LiveContext, "riders">, division: Pick<LiveDivisionContext, "scheme"> | undefined, slots: SlotRow[]): HeatRider[] {
  if (!division) return [];
  return [...slots]
    .filter((s) => s.entry_id)
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => {
      const r = ctx.riders.find((x) => x.entryId === s.entry_id);
      if (!r) return [];
      return [{ entryId: r.entryId, name: r.name, position: s.position, riding: !s.modifier && !s.flagged_out, label: riderLabelModel(division.scheme, { ...r, slotColour: s.vest_colour }) }];
    });
}

/** Attempts used per rider: the saved ones that are not deleted, plus those still waiting on the phone that the server does not have yet. */
export function attemptCounts(attempts: AttemptRow[], pending: PendingAttempt[]): Map<string, number> {
  const out = new Map<string, number>();
  const known = new Set(attempts.map((a) => a.client_key));
  for (const a of attempts) if (!a.deleted_at) out.set(a.entry_id, (out.get(a.entry_id) ?? 0) + 1);
  for (const p of pending) if (!known.has(p.clientKey)) out.set(p.entryId, (out.get(p.entryId) ?? 0) + 1);
  return out;
}

export interface FeedLine {
  key: string;
  entryId: string;
  seq: number | null;
  trick: string;
  status: "landed" | "crashed";
  duplicate: boolean;
  pending: boolean;
  needsReview: boolean;
  createdAt: number;
}

/** The spotter's running list, newest first: the saved attempts and the ones still waiting on the phone. */
export function feedLines(attempts: AttemptRow[], pending: PendingAttempt[]): FeedLine[] {
  const known = new Set(attempts.map((a) => a.client_key));
  const saved: FeedLine[] = attempts
    .filter((a) => !a.deleted_at)
    .map((a) => ({
      key: a.id,
      entryId: a.entry_id,
      seq: a.seq,
      trick: a.trick_name ?? "",
      status: a.status,
      duplicate: Boolean(a.possible_duplicate_of),
      pending: false,
      needsReview: Boolean((a.trick_parts as { needsReview?: boolean } | null)?.needsReview),
      createdAt: Date.parse(a.created_at),
    }));
  const waiting: FeedLine[] = pending
    .filter((p) => !known.has(p.clientKey))
    .map((p) => ({ key: p.clientKey, entryId: p.entryId, seq: null, trick: p.trickName ?? "", status: p.status, duplicate: false, pending: true, needsReview: p.needsReview, createdAt: p.createdAt }));
  return [...saved, ...waiting].sort((a, b) => b.createdAt - a.createdAt);
}

export interface TrickKit {
  vocab: TrickVocab;
  /** The blocks of one division in its spotter layout (unticked blocks left out). */
  viewFor: (division: LiveDivisionContext | undefined) => FamilyView[];
}

/** The trick vocabulary of the event and each division's spotter layout. Null while the master vocabulary is missing. */
export function trickKit(ctx: Pick<LiveContext, "vocabulary" | "localBlocks">): TrickKit | null {
  if (!ctx.vocabulary) return null;
  const json = ctx.vocabulary as unknown as VocabularyInput;
  const vocab = buildTrickVocab(json, ctx.localBlocks);
  const blocks = blocksFromVocabulary(ctx.vocabulary as VocabularyJson, ctx.localBlocks);
  return {
    vocab,
    viewFor: (division) => resolveLayout(blocks, division?.trickBase.disabled ?? [], parseLayout(division?.trickBase.layout)),
  };
}
