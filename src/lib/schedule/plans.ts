import { ScheduleDefaultsSchema, SchedulePlanSchema, type ScheduleDefaults, type SchedulePlan } from "@/lib/schemas/schedule";
import { utcToLocalHHMM } from "@/lib/engine/schedule";

/** A `schedule_plans` row as the screens read it. */
export interface PlanRow {
  id: string;
  event_id: string;
  day: string;
  name: string;
  items: unknown;
  anchors: unknown;
  actual_starts: unknown;
  hold: unknown;
  defaults: unknown;
  active: boolean;
}

export interface DayPlan {
  plan: SchedulePlan;
  day: string;
  defaults: ScheduleDefaults;
}

/** The run order's breaks plus the event's Ready call (minutes before a heat): one setting, on the Event step. */
export function defaultsOf(json: unknown, readyCallMin: number): ScheduleDefaults {
  const r = ScheduleDefaultsSchema.safeParse(json ?? {});
  return { ...(r.success ? r.data : ScheduleDefaultsSchema.parse({})), readyCallMin };
}

/** A stored plan, checked. A plan that does not parse (hand-edited data) is reported, not silently emptied. */
export function rowToPlan(row: PlanRow, readyCallMin: number): DayPlan {
  const parsed = SchedulePlanSchema.safeParse({
    id: row.id,
    name: row.name,
    active: row.active,
    items: row.items ?? [],
    anchors: row.anchors ?? {},
    actualStarts: row.actual_starts ?? {},
    ...(row.hold ? { hold: row.hold } : {}),
  });
  if (!parsed.success) throw new Error(`The plan "${row.name}" is damaged: ${parsed.error.issues[0]?.message ?? "unknown problem"}`);
  return { plan: parsed.data, day: row.day, defaults: defaultsOf(row.defaults, readyCallMin) };
}

/** Just the plan (items, pins, hold) for code that does not work out times. */
export const planOfRow = (row: PlanRow): SchedulePlan => rowToPlan(row, 0).plan;

export function planToRow(plan: SchedulePlan): { name: string; items: unknown; anchors: unknown; actual_starts: unknown; hold: unknown } {
  return { name: plan.name, items: plan.items, anchors: plan.anchors, actual_starts: plan.actualStarts, hold: plan.hold ?? null };
}

/** Every day from the first to the last day of the event ("2026-10-02" … "2026-10-04"), at most 14. */
export function eventDays(start: string | null, end: string | null): string[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const days: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (days.length < 14) {
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
    if (iso >= last) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

/** "Today" in the event's time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return parts;
}

/** The clock time now in the event's time zone, "HH:MM". */
export const clockIn = (timeZone: string, now: number) => utcToLocalHHMM(now, timeZone);
