import { computeTimetable, type HeatLive, type TimetableOptions } from "@/lib/engine/schedule";
import type { SchedulePlan } from "@/lib/schemas/schedule";

export interface NextHeat {
  heatId: string;
  /** "Pro Men · R1 · Heat 3" */
  title: string;
  /** Local "HH:MM" in the event's time zone; null while the plan is on hold or the row has no time. */
  startsAt: string | null;
  held: boolean;
}

/** The first heat row that has not started, from the active plan (docs/08 §1G-13). Between heats the spotter and judge read "Next: … — est. 15:23". */
export function nextHeat(plan: SchedulePlan | null, heats: HeatLive[], opts: TimetableOptions): NextHeat | null {
  if (!plan) return null;
  const table = computeTimetable(plan, heats, opts);
  const row = table.rows.find((r) => r.kind === "heat" && (r.status === "next" || r.status === "est" || r.status === "held" || r.status === "pinned"));
  if (!row || !row.heatId) return null;
  return { heatId: row.heatId, title: [row.division, row.round, row.heat].filter(Boolean).join(" · "), startsAt: row.start, held: row.status === "held" };
}
