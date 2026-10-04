import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHeat, roundHalfUp, type TieDecision } from "@/lib/engine/scoring";
import { heatInputFromRows } from "@/lib/live/heat-input";
import { ATTEMPT_COLUMNS, IMPRESSION_COLUMNS, SCORE_COLUMNS, SLOT_COLUMNS, type AttemptRow, type ImpressionRow, type ScoreRow, type SlotRow } from "@/lib/live/types";
import { modelOf } from "@/lib/public/results-model";
import type { PublicRules, ResultRow } from "@/lib/public/types";
import { draftRow } from "./public-breakdown";

export interface DraftHeat {
  id: string;
  division_id: string;
  /** "under_review": worked out now from the scores in. "held": a published result the organiser has not released; its stored result is read. */
  kind: "under_review" | "held";
}

/**
 * The draft copy of heats the public cannot see yet, as result rows in the public shape (the panel's scores and the counting, never a single judge's marks).
 * A heat under review has no stored result, so it is scored here with the same engine and the same reader of stored rows that the head console and Publish use;
 * a held heat already has its stored result. Read-only. A heat whose scoring model cannot be read is left out rather than guessed.
 */
export async function draftHeatRows(service: SupabaseClient, heats: DraftHeat[], rules: PublicRules | null): Promise<Map<string, ResultRow[]>> {
  const out = new Map<string, ResultRow[]>();
  await Promise.all(
    heats.map(async (h) => {
      const rows = h.kind === "held" ? await heldRows(service, h.id) : await reviewRows(service, h, rules);
      if (rows) out.set(h.id, rows);
    }),
  );
  return out;
}

async function heldRows(service: SupabaseClient, heatId: string): Promise<ResultRow[] | null> {
  const { data } = await service.from("heat_results").select("entry_id, place, total, percent, breakdown, version").eq("heat_id", heatId);
  const rows = (data ?? []) as Array<{ entry_id: string; place: number | null; total: number | null; percent: number | null; breakdown: never; version: number }>;
  if (!rows.length) return null;
  const latest = Math.max(...rows.map((r) => r.version));
  return rows
    .filter((r) => r.version === latest)
    .map((r) => draftRow(r.entry_id, { place: r.place, total: r.total === null ? null : Number(r.total), percent: r.percent === null ? null : Number(r.percent), breakdown: r.breakdown }, r.version))
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
}

async function reviewRows(service: SupabaseClient, h: DraftHeat, rules: PublicRules | null): Promise<ResultRow[] | null> {
  const model = modelOf(rules, h.division_id);
  if (!model) return null;
  const [{ data: division }, { data: slots }, { data: attempts }, { data: scores }, { data: impressions }, { data: penalties }, { data: decisions }] = await Promise.all([
    service.from("divisions").select("panel_id").eq("id", h.division_id).single(),
    service.from("heat_slots").select(SLOT_COLUMNS).eq("heat_id", h.id),
    service.from("trick_attempts").select(ATTEMPT_COLUMNS).eq("heat_id", h.id),
    service.from("trick_scores").select(SCORE_COLUMNS).eq("heat_id", h.id),
    service.from("impression_scores").select(IMPRESSION_COLUMNS).eq("heat_id", h.id),
    service.from("penalties").select("heat_id, entry_id, type, reason").eq("heat_id", h.id),
    service.from("heat_decisions").select("payload, reason, at").eq("heat_id", h.id).eq("kind", "tie").order("at"),
  ]);
  const { data: members } = division?.panel_id ? await service.from("panel_members").select("judge_seat_id, seat_no").eq("panel_id", division.panel_id).order("seat_no") : { data: [] as Array<{ judge_seat_id: string }> };
  const { data: seats } = await service.from("judge_seats").select("id, active, status").in("id", (members ?? []).map((m) => m.judge_seat_id));
  const live = new Set((seats ?? []).filter((s) => s.active && s.status === "active").map((s) => s.id as string));
  const panelSeatIds = (members ?? []).map((m) => m.judge_seat_id as string).filter((id) => live.has(id));
  const ties: TieDecision[] = (decisions ?? []).flatMap((d) => {
    const ids = (d.payload as { riderIds?: unknown } | null)?.riderIds;
    return Array.isArray(ids) ? [{ riderIds: ids.filter((x): x is string => typeof x === "string"), reason: (d.reason as string | null) ?? "" }] : [];
  });
  let result;
  try {
    result = computeHeat(model, heatInputFromRows(model, panelSeatIds, (slots ?? []) as SlotRow[], (attempts ?? []) as AttemptRow[], (scores ?? []) as ScoreRow[], (impressions ?? []) as ImpressionRow[], (penalties ?? []) as never, ties));
  } catch {
    return null;
  }
  const byId = new Map(result.riders.map((r) => [r.riderId, r]));
  return result.ranking
    .map((x) => {
      const r = byId.get(x.riderId)!;
      const none = x.status === "DNS" || x.status === "DSQ";
      return draftRow(x.riderId, { place: x.place, total: none ? null : x.total, percent: none || r.percent === null ? null : roundHalfUp(r.percent, 2), breakdown: r as never });
    })
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
}
