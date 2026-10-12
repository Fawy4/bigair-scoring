import { drawProjection } from "@/lib/draw/projection";
import { applyHeatStatuses } from "@/lib/draw/entrants";
import { applyHeatResult, type DivisionDraw, type DrawHeat, type HeatResultInput } from "@/lib/engine/ladder";
import { copy } from "@/lib/ui-copy";

export interface SeatChange {
  uid: string;
  slots: Array<{ position: number; entry_id: string | null; modifier: string | null }>;
}

export type LadderStep =
  | { ok: true; draw: DivisionDraw | null; projection: SeatChange[]; roundIsLast: boolean }
  | { ok: false; code: "DRAW_MISMATCH" | "DOWNSTREAM_STARTED"; message: string | undefined };

/**
 * The ladder after a heat's result is in: places into the draw, the seats of the next heats from the result (a heat that has started is never changed: that comes back
 * as DOWNSTREAM_STARTED and nothing is written). Publish and Walkover both use it, so a walkover fills the next seats exactly as a normal publish does. Pure.
 */
export function ladderStep(draw: DivisionDraw | null, drawUid: string | null, divisionHeats: ReadonlyArray<{ draw_uid: string | null; status: string; started_at?: string | null }>, result: HeatResultInput): LadderStep {
  const drawHeat = draw && drawUid ? draw.rounds.flatMap((r) => r.heats).find((h: DrawHeat) => (h.uid ?? h.id) === drawUid) : undefined;
  if (!draw || !drawHeat) return { ok: true, draw: null, projection: [], roundIsLast: false };
  const synced = applyHeatStatuses(draw, divisionHeats);
  let applied;
  try {
    applied = applyHeatResult(synced, drawHeat.id, result);
  } catch (e) {
    return { ok: false, code: "DRAW_MISMATCH", message: e instanceof Error ? e.message : undefined };
  }
  if (applied.conflict) {
    const names = applied.conflict.affectedHeats.map((a) => {
      const h = applied.draw.rounds.flatMap((r) => r.heats).find((x) => x.id === a.heatId);
      return h?.name ?? (h?.number ? `Heat ${h.number}` : a.heatId);
    });
    return { ok: false, code: "DOWNSTREAM_STARTED", message: copy.publish.downstream(names) };
  }
  const before = new Map(drawProjection(synced).heats.map((h) => [h.uid, h]));
  const key = (s: { entry_id: string | null; modifier: string | null }) => `${s.entry_id ?? ""}|${s.modifier ?? ""}`;
  const projection = drawProjection(applied.draw).heats
    .filter((h) => h.uid !== (drawHeat.uid ?? drawHeat.id))
    .filter((h) => (before.get(h.uid)?.slots ?? []).map(key).join(",") !== h.slots.map(key).join(","))
    .map((h) => ({ uid: h.uid, slots: h.slots.map((s) => ({ position: s.position, entry_id: s.entry_id, modifier: s.modifier })) }));
  return { ok: true, draw: applied.draw, projection, roundIsLast: draw.rounds[draw.rounds.length - 1]?.id === drawHeat.round };
}
