/** The date filter of the feedback list. Dates are days ("2026-10-03") of the note's saved time, the same day the list's "When" column shows. */
export type QuickRange = "today" | "last7" | "all";

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const day = (d: Date): string => d.toISOString().slice(0, 10);

/** The from / to of a quick pick: Today, Last 7 days (today and the six days before it), All (no limit). */
export function quickRange(kind: QuickRange, now: Date): { from: string; to: string } {
  if (kind === "all") return { from: "", to: "" };
  const to = day(now);
  if (kind === "today") return { from: to, to };
  return { from: day(new Date(now.getTime() - 6 * 86_400_000)), to };
}

/** True when the note's time falls on or between the two days; an empty or invalid end means no limit on that side. */
export function inDateRange(createdAt: string, from?: string, to?: string): boolean {
  const d = createdAt.slice(0, 10);
  if (isDay(from) && d < from) return false;
  if (isDay(to) && d > to) return false;
  return true;
}
