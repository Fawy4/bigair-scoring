import { nextHeatInOrder, type HeatLive } from "@/lib/engine/schedule";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import type { HeatRow } from "./types";

/**
 * HE1: after Publish the console selects the next heat in the run order (the first heat that has not started and is not cancelled), whichever division it is in; after the
 * last heat there is none. With no run order the next heat is the next one that has not started, division by division in their order, by heat number.
 */
export function nextAfterPublish(i: { plan: SchedulePlan | null; lives: HeatLive[]; heats: HeatRow[]; divisionOrder: string[]; publishedId: string }): { heatId: string; divisionId: string } | null {
  const byRun = i.plan ? nextHeatInOrder(i.plan, i.lives) : null;
  const pick = byRun ? i.heats.find((h) => h.id === byRun.heatId) : null;
  if (pick && pick.id !== i.publishedId) return { heatId: pick.id, divisionId: pick.division_id };
  if (i.plan) return null; // a run order that has nothing left to start: that was the last heat
  const rank = (d: string) => {
    const at = i.divisionOrder.indexOf(d);
    return at < 0 ? i.divisionOrder.length : at;
  };
  const left = i.heats
    .filter((h) => h.id !== i.publishedId && h.status === "scheduled")
    .sort((a, b) => rank(a.division_id) - rank(b.division_id) || a.number - b.number || (a.number_suffix ?? "").localeCompare(b.number_suffix ?? ""));
  return left[0] ? { heatId: left[0].id, divisionId: left[0].division_id } : null;
}
