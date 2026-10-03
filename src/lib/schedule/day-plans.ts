import { shortDay } from "./plans";

/** A stored run order, as much of it as copying and the Day list need. */
export interface DayPlanRow {
  id: string;
  day: string;
  name: string;
  active: boolean;
  items: unknown;
  anchors: unknown;
  actual_starts?: unknown;
  hold?: unknown;
  defaults?: unknown;
  hand_pins?: unknown;
}

/**
 * "Copy ‹other day›'s plan to ‹day›" (Polish 2b, item 6; audit finding A1a-7): only the heats that have not yet ended come across (a heat that was run, published or
 * cancelled on the other day stays there), in their order. Never the other day's breaks, notes or pins, its actual times or a hold: the new day gets its own breaks
 * and its own first-heat pin (those made Friday's 10:00 start slip to 10:20 and the drift badge read hours early).
 */
export function copyPlanToDay(src: DayPlanRow, endedHeatIds: ReadonlySet<string> = new Set()): { items: unknown; anchors: Record<string, string>; actual_starts: Record<string, string>; hold: null; hand_pins: string[]; heats: number } {
  const items = (Array.isArray(src.items) ? src.items : []).filter((it): it is { kind: "heat"; heatId: string } => !!it && typeof it === "object" && (it as { kind?: unknown }).kind === "heat" && typeof (it as { heatId?: unknown }).heatId === "string" && !endedHeatIds.has((it as { heatId: string }).heatId));
  return { items, anchors: {}, actual_starts: {}, hold: null, hand_pins: [], heats: items.length };
}

export type DayStatus = { kind: "active"; name: string } | { kind: "none_active"; count: number } | { kind: "no_plan" };

/** What the Day list says about a day: its active plan, plans but none active, or no plan. */
export function dayStatus(plans: readonly DayPlanRow[], day: string): DayStatus {
  const mine = plans.filter((p) => p.day === day);
  const active = mine.find((p) => p.active);
  if (active) return { kind: "active", name: active.name };
  return mine.length ? { kind: "none_active", count: mine.length } : { kind: "no_plan" };
}

/** The name "Create a plan" starts with: "Plan A – Sat 10 Oct", or the next letter when that name is taken on that day. */
export function defaultPlanName(plans: readonly DayPlanRow[], day: string): string {
  const taken = new Set(plans.filter((p) => p.day === day).map((p) => p.name.trim().toLowerCase()));
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const name = `Plan ${letter} – ${shortDay(day)}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return `Plan – ${shortDay(day)}`;
}

/** The plans "Copy" offers: for each other day that has one, its active plan (else its first). Oldest day first. */
export function copySources(plans: readonly DayPlanRow[], day: string): DayPlanRow[] {
  const days = [...new Set(plans.map((p) => p.day))].filter((d) => d !== day).sort();
  return days.map((d) => plans.find((p) => p.day === d && p.active) ?? plans.find((p) => p.day === d)!);
}
