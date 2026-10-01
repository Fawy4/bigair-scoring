import { computeTimetable, type HeatLive, type RowStatus } from "@/lib/engine/schedule";
import { activePlanFor, type ActivePlan } from "@/lib/live/run-order";
import { rowToPlan, todayIn } from "@/lib/schedule/plans";
import type { PublicTimetable, TimetableHeat } from "./types";

export type PublicRowState = RowStatus;

export interface PublicRow {
  itemId: string;
  kind: "heat" | "break" | "note";
  heatId: string | null;
  /** "Pro Men · R1 · Heat 3" (a break or note shows its own words). */
  title: string;
  division: string;
  round: string;
  heat: string;
  /** Local "HH:MM" in the event's time zone, or null while the run order is on hold. */
  start: string | null;
  end: string | null;
  startUtc: string | null;
  durationMin: number;
  status: PublicRowState;
  /** The time is a projection ("est."): the next or later heat that is not pinned. Done, live and pinned rows are exact (a pin means "not before"). */
  estimated: boolean;
  /** When riders are called to the ready area; null for breaks, notes and rows without a time. */
  readyCall: string | null;
  readyCallUtc: string | null;
  warmUpStart: string | null;
  /** Published but held back: the heat ran, its result will be announced. */
  resultHeld: boolean;
}

export interface PublicTimetableModel {
  day: string | null;
  isToday: boolean;
  rows: PublicRow[];
  /** The heat that is running now. */
  now: PublicRow | null;
  /** The next two heats that have not started (with their estimated times). */
  upNext: PublicRow[];
  finish: string | null;
  /** The run order is on hold (wind): no times until the head judge resumes. */
  onHold: boolean;
  heatsLeft: number;
}

export const heatLabel = (h: Pick<TimetableHeat, "name" | "number" | "suffix">): string => h.name ?? `Heat ${h.number}${h.suffix ?? ""}`;

const EMPTY: PublicTimetableModel = { day: null, isToday: false, rows: [], now: null, upNext: [], finish: null, onHold: false, heatsLeft: 0 };

/** The engine's heat list from the public payload: names from the divisions and rounds, times from the heats' server timestamps, breaks from the draw (done in the database). */
export function livesFromPublic(t: PublicTimetable): HeatLive[] {
  const division = new Map(t.divisions.map((d) => [d.id, d.name]));
  const round = new Map(t.rounds.map((r) => [r.id, r]));
  return t.heats.map((h) => {
    const r = round.get(h.round_id);
    return {
      heatId: h.id,
      division: division.get(h.division_id) ?? "",
      round: r?.short_name ?? r?.name ?? "",
      heat: heatLabel(h),
      startedAt: h.started_at,
      endedAt: h.ended_at,
      pausedMin: h.paused_total_sec / 60,
      roundLast: h.round_last,
      durationMin: h.duration_sec / 60,
      warmUpMin: h.warm_up_sec / 60,
      cancelled: h.status === "cancelled",
      ...(h.break_after_heat_min !== null ? { breakAfterHeatMin: h.break_after_heat_min } : {}),
      ...(h.break_after_round_min !== null ? { breakAfterRoundMin: h.break_after_round_min } : {}),
    };
  });
}

/** The public timetable for "now": today's active run order (or the nearest day that has one), every row in its state, what runs now and the next two. Pure. */
export function buildPublicTimetable(t: PublicTimetable | null, nowIso: string): PublicTimetableModel {
  if (!t) return EMPTY;
  const plans: ActivePlan[] = [];
  for (const p of t.plans) {
    try {
      const { plan, day, defaults } = rowToPlan({ ...p, event_id: "", active: true });
      plans.push({ id: p.id, day, plan, defaults, updatedAt: "" });
    } catch {
      /* a damaged plan is not shown to the public */
    }
  }
  const now = Date.parse(nowIso);
  const chosen = activePlanFor(plans, t.timezone, now);
  if (!chosen) return EMPTY;
  const lives = livesFromPublic(t);
  let table: ReturnType<typeof computeTimetable>;
  try {
    table = computeTimetable(chosen.plan, lives, { timezone: t.timezone, eventDay: chosen.day, defaults: chosen.defaults, now: nowIso });
  } catch {
    return { ...EMPTY, day: chosen.day, isToday: chosen.day === todayIn(t.timezone, now) };
  }
  const heldResult = new Set(t.heats.filter((h) => h.held && h.status === "published").map((h) => h.id));
  const rows: PublicRow[] = table.rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({
      itemId: r.itemId,
      kind: r.kind,
      heatId: r.heatId ?? null,
      title: r.kind === "heat" ? [r.division, r.round, r.heat].filter(Boolean).join(" · ") : r.label,
      division: r.division ?? "",
      round: r.round ?? "",
      heat: r.heat ?? "",
      start: r.start,
      end: r.end,
      startUtc: r.startUtc,
      durationMin: r.durationMin,
      status: r.status,
      estimated: r.kind === "heat" && (r.status === "est" || r.status === "next"),
      readyCall: r.readyCall,
      readyCallUtc: r.readyCallUtc,
      warmUpStart: r.warmUpMin > 0 ? r.warmUpStart : null,
      resultHeld: r.heatId ? heldResult.has(r.heatId) : false,
    }));
  const heats = rows.filter((r) => r.kind === "heat");
  return {
    day: chosen.day,
    isToday: chosen.day === todayIn(t.timezone, now),
    rows,
    now: heats.find((r) => r.status === "live") ?? null,
    upNext: heats.filter((r) => r.status === "next" || r.status === "est" || r.status === "pinned" || r.status === "held").slice(0, 2),
    finish: table.finish,
    onHold: Boolean(chosen.plan.hold),
    heatsLeft: table.heatsLeft,
  };
}
