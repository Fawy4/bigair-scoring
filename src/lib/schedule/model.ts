import type { DivisionDraw, DrawHeat } from "@/lib/engine/ladder";
import type { HeatInfo } from "@/lib/engine/schedule";
import type { HeatLive } from "@/lib/engine/schedule";

export interface DivisionRowDb {
  id: string;
  name: string;
  sort_order: number;
  draw: unknown;
}

export interface RoundRowDb {
  id: string;
  division_id: string;
  name: string;
  short_name: string | null;
  sort_order: number;
}

export interface HeatRowDb {
  id: string;
  division_id: string;
  round_id: string;
  draw_uid: string | null;
  number: number;
  name: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number;
  warm_up_sec: number;
  paused_total_sec: number;
}

export interface HeatModel {
  infos: HeatInfo[];
  lives: HeatLive[];
}

function drawHeatOf(draw: DivisionDraw | null, uid: string | null): DrawHeat | undefined {
  if (!draw || !uid) return undefined;
  for (const r of draw.rounds) for (const h of r.heats) if ((h.uid ?? h.id) === uid) return h;
  return undefined;
}

/**
 * Every heat of the event as the run order screen needs it: the list entry (name, length, warm-up) and what the timetable engine reads
 * (server start and end times, break defaults of the heat's round, whether it is the last heat of its round). Breaks come from the stored
 * draw (the format's timing); a heat without a stored draw falls back to the plan's defaults.
 */
export function buildHeatModel(divisions: readonly DivisionRowDb[], rounds: readonly RoundRowDb[], heats: readonly HeatRowDb[]): HeatModel {
  const divisionOrder = new Map(divisions.map((d, i) => [d.id, i]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const lastNumberOfRound = new Map<string, number>();
  for (const h of heats) lastNumberOfRound.set(h.round_id, Math.max(lastNumberOfRound.get(h.round_id) ?? 0, h.number));
  const infos: HeatInfo[] = [];
  const lives: HeatLive[] = [];
  for (const h of [...heats].sort((a, b) => (divisionOrder.get(a.division_id) ?? 0) - (divisionOrder.get(b.division_id) ?? 0) || (roundById.get(a.round_id)?.sort_order ?? 0) - (roundById.get(b.round_id)?.sort_order ?? 0) || a.number - b.number)) {
    const division = divisions.find((d) => d.id === h.division_id);
    const round = roundById.get(h.round_id);
    const draw = (division?.draw ?? null) as DivisionDraw | null;
    const dh = drawHeatOf(draw, h.draw_uid);
    const label = h.name ?? `Heat ${h.number}`;
    const durationMin = h.duration_sec / 60;
    const warmUpMin = h.warm_up_sec / 60;
    infos.push({
      heatId: h.id,
      division: division?.name ?? "",
      divisionId: h.division_id,
      round: round?.name ?? "",
      roundOrder: round?.sort_order ?? 0,
      heat: label,
      number: h.number,
      durationMin,
      warmUpMin,
    });
    lives.push({
      heatId: h.id,
      division: division?.name ?? "",
      round: round?.name ?? "",
      heat: label,
      startedAt: h.started_at,
      endedAt: h.ended_at,
      pausedMin: h.paused_total_sec / 60,
      roundLast: dh ? dh.roundLast : h.number === lastNumberOfRound.get(h.round_id),
      durationMin,
      warmUpMin,
      cancelled: h.status === "cancelled",
      ...(dh ? { breakAfterHeatMin: dh.breakAfterHeatMin, breakAfterRoundMin: dh.breakAfterRoundMin } : {}),
    });
  }
  return { infos, lives };
}
