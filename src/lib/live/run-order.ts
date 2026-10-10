import type { HeatLive, TimetableOptions } from "@/lib/engine/schedule";
import { isWalkoverHeat } from "./walkover";
import { todayIn } from "@/lib/schedule/plans";
import type { ScheduleDefaults, SchedulePlan } from "@/lib/schemas/schedule";
import type { HeatRow, LiveContext } from "./types";

/** What does not change while a heat runs, worked out once on the server from the stored draw (breaks, last heat of a round). */
export interface HeatMeta {
  roundLast: boolean;
  breakAfterHeatMin?: number;
  breakAfterRoundMin?: number;
}

export const heatLabel = (h: Pick<HeatRow, "name" | "number" | "number_suffix">): string => h.name ?? `Heat ${h.number}${h.number_suffix ?? ""}`;

/** "Pro Men · R1 · Heat 3": division, round (short name when it has one) and heat. */
export function heatTitle(ctx: Pick<LiveContext, "divisions" | "rounds">, h: HeatRow): string {
  const division = ctx.divisions.find((d) => d.id === h.division_id)?.name ?? "";
  const round = ctx.rounds.find((r) => r.id === h.round_id);
  return [division, round?.short_name ?? round?.name ?? "", heatLabel(h)].filter(Boolean).join(" · ");
}

/** The heats as the timetable engine reads them: names from the divisions and rounds, times from the heats row (server timestamps). */
export function livesFor(ctx: Pick<LiveContext, "divisions" | "rounds">, heats: HeatRow[], meta: Record<string, HeatMeta>): HeatLive[] {
  return heats.map((h) => {
    const m = meta[h.id];
    const round = ctx.rounds.find((r) => r.id === h.round_id);
    return {
      heatId: h.id,
      division: ctx.divisions.find((d) => d.id === h.division_id)?.name ?? "",
      round: round?.name ?? "",
      heat: heatLabel(h),
      startedAt: h.started_at,
      endedAt: h.ended_at,
      pausedMin: h.paused_total_sec / 60,
      roundLast: m?.roundLast ?? false,
      durationMin: h.duration_sec / 60,
      warmUpMin: h.warm_up_sec / 60,
      cancelled: h.status === "cancelled",
      ...(isWalkoverHeat(h) ? { walkover: true } : {}),
      ...(m?.breakAfterHeatMin !== undefined ? { breakAfterHeatMin: m.breakAfterHeatMin } : {}),
      ...(m?.breakAfterRoundMin !== undefined ? { breakAfterRoundMin: m.breakAfterRoundMin } : {}),
    };
  });
}

export interface ActivePlan {
  id: string;
  day: string;
  plan: SchedulePlan;
  defaults: ScheduleDefaults;
  updatedAt: string;
}

/** Today's active run order (in the event's time zone); failing that the nearest day with one. */
export function activePlanFor(plans: ActivePlan[], timezone: string, nowServer: number): ActivePlan | null {
  if (!plans.length) return null;
  const today = todayIn(timezone, nowServer);
  const sorted = [...plans].sort((a, b) => Math.abs(Date.parse(a.day) - Date.parse(today)) - Math.abs(Date.parse(b.day) - Date.parse(today)));
  return plans.find((p) => p.day === today) ?? sorted[0];
}

export const timetableOptions = (p: ActivePlan, timezone: string, nowServer: number): TimetableOptions => ({ timezone, eventDay: p.day, defaults: p.defaults, now: new Date(nowServer).toISOString() });
