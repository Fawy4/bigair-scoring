import type { PublicBreakdown, PublicBreakdownAttempt, ResultRow } from "@/lib/public/types";

/** What a stored result breakdown (the engine's rider result, judge seats already scrubbed) looks like to this file: only the fields the public shape needs. */
interface StoredBreakdown {
  status: string;
  total: number;
  totalLabel: string;
  components: PublicBreakdown["components"];
  counted?: Array<{ attemptSeq: number; score: number }>;
  allAttempts?: Array<{
    seq: number;
    status: "landed" | "crashed";
    trickName: string | null;
    categoryKey: string | null;
    score: number | null;
    counted: boolean;
    panel?: { score: number } | null;
    ignored?: string | null;
    repeatIndex?: number;
  }>;
  impression?: { score: number } | null;
  landedCount: number;
  attemptCount: number;
  attemptCap: number | null;
  modifiers?: unknown[];
}

/**
 * The public shape of a result's breakdown, in TypeScript: the panel's scores and the counting, never an individual judge's mark, who missed, or who was an outlier.
 * It mirrors `private.public_breakdown` in the database (supabase/migrations/20261006100000_phase6_public.sql) and is used only for heats the database has not
 * released (the draft copy of a heat under review or held), so those pages and files can never carry more than a released heat does.
 */
export function toPublicBreakdown(b: StoredBreakdown): PublicBreakdown {
  const attempts: PublicBreakdownAttempt[] = [...(b.allAttempts ?? [])]
    .sort((x, y) => x.seq - y.seq)
    .map((a) => ({
      seq: a.seq,
      status: a.status,
      trickName: a.trickName ?? null,
      categoryKey: a.categoryKey ?? null,
      score: a.score ?? null,
      counted: a.counted,
      panelScore: a.panel?.score ?? null,
      ignored: a.ignored ?? null,
      repeatIndex: a.repeatIndex ?? 0,
    }));
  return {
    status: b.status,
    total: b.total,
    totalLabel: b.totalLabel,
    components: b.components,
    counted: (b.counted ?? []).map((c) => ({ attemptSeq: c.attemptSeq, score: c.score })),
    allAttempts: attempts,
    impression: b.impression && typeof b.impression === "object" ? { score: b.impression.score ?? null } : null,
    landedCount: b.landedCount,
    attemptCount: b.attemptCount,
    attemptCap: b.attemptCap,
    modifiers: b.modifiers ?? [],
  };
}

/** One result row the way the public function returns it (version 0 = not published yet). */
export function draftRow(entryId: string, x: { place: number | null; total: number | null; percent: number | null; breakdown: StoredBreakdown }, version = 0): ResultRow {
  return { entry_id: entryId, place: x.place, total: x.total, percent: x.percent, breakdown: toPublicBreakdown(x.breakdown), version };
}
