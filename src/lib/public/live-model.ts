import { computeHeat } from "@/lib/engine/scoring";
import { heatInputFromRows } from "@/lib/live/heat-input";
import type { AttemptRow, ImpressionRow, ScoreRow, SlotRow } from "@/lib/live/types";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { labelFor } from "./schemes";
import type { AttemptDisplay } from "@/lib/live/result-shading";
import { boxOf, formulaLine, type BoxVM, type RiderRowVM, type RiderState } from "./results-model";
import type { PublicEntry, PublicLiveHeat } from "./types";
import type { IdentificationScheme } from "@/lib/schemas/identification";

const seatId = (n: number) => `J${n}`;

/**
 * The running totals of a heat that is on the water, from the public live function (panel positions only, never judge names): the same scoring engine as the head
 * judge's console, so a number here is the number there. Judges who have not scored yet simply have not counted yet. Null when the model cannot be used or the heat
 * cannot be scored; the page then falls back to the seats. `mode` is the division's "What spectators see per attempt": a trick reaches a box only on "trick name +
 * score", only for a landed attempt whose panel score is in (a trick never shows where its score does not), and never for a crash.
 */
export function liveRows(live: PublicLiveHeat, model: ScoringModel | null, entries: Map<string, PublicEntry>, scheme: IdentificationScheme, impressionLabel: string | null, mode: AttemptDisplay = "number_score"): RiderRowVM[] | null {
  if (!live.allowed || !model || !live.slots) return null;
  const decimals = model.panel.decimals;
  const seatNos = [...new Set([...(live.scores ?? []).map((s) => s.seat_no), ...(live.impressions ?? []).map((i) => i.seat_no)])].sort((a, b) => a - b);
  const panel = seatNos.map(seatId);
  const slots = live.slots.map((s, i) => ({ id: `s${i}`, heat_id: "", position: s.position, entry_id: s.entry_id, vest_colour: s.vest_colour, modifier: s.modifier, flagged_out: s.flagged_out, updated_at: "" })) as SlotRow[];
  const attempts = (live.attempts ?? []).map((a) => ({ ...a, heat_id: "", client_key: a.id, trick_parts: null, created_by_seat: null, deleted_at: null, input_method: "", raw_text: null, updated_at: "", seq: a.seq ?? 0, direction: a.direction as never })) as unknown as AttemptRow[];
  const scores = (live.scores ?? []).map((s) => ({ id: "", attempt_id: s.attempt_id, heat_id: "", judge_seat_id: seatId(s.seat_no), score: s.score, missed: s.missed, criteria: s.criteria, client_rev: 0, version: 0 })) as unknown as ScoreRow[];
  const impressions = (live.impressions ?? []).map((i) => ({ entry_id: i.entry_id, judge_seat_id: seatId(i.seat_no), value: i.value, missed: i.missed ?? false, heat_id: "" })) as unknown as ImpressionRow[];
  try {
    const result = computeHeat(model, heatInputFromRows(model, panel, slots, attempts, scores, impressions, (live.penalties ?? []).map((p) => ({ heat_id: "", entry_id: p.entry_id, type: p.type, reason: null }))));
    const place = new Map(result.ranking.map((r) => [r.riderId, r.place]));
    const bySeat = new Map(live.slots.map((s) => [s.entry_id, s]));
    const sides = new Map((live.attempts ?? []).map((a) => [`${a.entry_id}:${a.seq ?? 0}`, a.direction] as const));
    return [...result.riders]
      .sort((a, b) => (place.get(a.riderId) ?? 99) - (place.get(b.riderId) ?? 99))
      .map((r): RiderRowVM => {
        const slot = bySeat.get(r.riderId);
        const counted = new Set(r.counted.map((c) => c.attemptSeq));
        const boxes: BoxVM[] = r.allAttempts.map((a) => boxOf({ seq: a.seq, status: a.status, trickName: a.trickName, direction: sides.get(`${r.riderId}:${a.seq}`), counted: counted.has(a.seq), score: a.panel?.score ?? null }, decimals, mode));
        const none = r.status === "DNS" || r.status === "DSQ";
        const hasAny = boxes.some((b) => b.score !== null) || r.components.impression > 0;
        return {
          entryId: r.riderId,
          place: place.get(r.riderId) ?? null,
          label: labelFor(scheme, entries.get(r.riderId), slot?.vest_colour),
          placeholder: null,
          totalLabel: none ? null : hasAny ? r.totalLabel : null,
          formula: none || !hasAny ? null : formulaLine(r.totalLabel, r.components, impressionLabel, decimals),
          percentLabel: null,
          state: (r.status === "DNS" && entries.get(r.riderId)?.withdrawn ? "OUT" : r.status) as RiderState,
          boxes,
        };
      });
  } catch {
    return null;
  }
}
