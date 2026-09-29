import type { RunItem, ScheduleDay } from "@/lib/schemas/schedule";
import type { HeatLookup } from "./actions";

/** Replaces `heatRef {division, round, heat}` by `heatId` (preset/test files reference heats by name). */
export function resolveHeatRefs(day: ScheduleDay, lookup: HeatLookup): ScheduleDay {
  const resolve = (item: RunItem): RunItem => {
    if (item.kind !== "heat" || !item.heatRef) return item;
    const heatId = lookup(item.heatRef);
    if (!heatId) throw new Error(`No heat found for ${item.heatRef.division} / ${item.heatRef.round} / ${item.heatRef.heat}.`);
    const resolved = { ...item, heatId };
    delete resolved.heatRef;
    return resolved;
  };
  return { ...day, plans: day.plans.map((p) => ({ ...p, items: p.items.map(resolve) })) };
}
