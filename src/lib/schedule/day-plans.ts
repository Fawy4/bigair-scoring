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

const asAnchors = (x: unknown): Record<string, string> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, string>) : {});

/**
 * "Copy ‹other day›'s plan to ‹day›" (Polish 2, item 14): the heats, breaks and notes, and the pins the organiser set by hand. Not the actual start times, the
 * pins the head console wrote while that day ran (Shift, Resume at, +1 min), or a hold. A plan from before hand-set pins were recorded keeps every pin.
 */
export function copyPlanToDay(src: DayPlanRow): { items: unknown; anchors: Record<string, string>; actual_starts: Record<string, string>; hold: null; hand_pins: string[] } {
  const anchors = asAnchors(src.anchors);
  const hand = Array.isArray(src.hand_pins) ? (src.hand_pins as unknown[]).filter((x): x is string => typeof x === "string") : null;
  const kept = Object.fromEntries(Object.entries(anchors).filter(([id]) => hand === null || hand.includes(id)));
  return { items: src.items, anchors: kept, actual_starts: {}, hold: null, hand_pins: Object.keys(kept) };
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
