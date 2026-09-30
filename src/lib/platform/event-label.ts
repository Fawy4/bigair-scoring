/** Dates and labels for public event lists. Pure: month names are our own table, so output never depends on the machine's locale data. */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(date: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null;
}

/** "10 Oct 2026", "10–12 Oct 2026", "30 Oct – 2 Nov 2026" or "30 Dec 2026 – 2 Jan 2027". Empty when there is no start date. */
export function formatEventDates(start: string | null | undefined, end: string | null | undefined): string {
  const a = parse(start);
  if (!a) return "";
  const b = parse(end);
  const one = (x: { y: number; m: number; d: number }) => `${x.d} ${MONTHS[x.m - 1]} ${x.y}`;
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return one(a);
  if (a.y !== b.y) return `${one(a)} – ${one(b)}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y}`;
  return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y}`;
}

/** "Organisation · Location · Date", leaving out whatever is missing. */
export function eventLabel(e: { organisation: string | null; location: string | null; startDate: string | null; endDate: string | null }): string {
  return [e.organisation, e.location, formatEventDates(e.startDate, e.endDate)].map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");
}

interface Dated {
  status: string;
  start_date: string | null;
  end_date: string | null;
}

/**
 * The organisation page: live (set live by the head judge), past (complete, or the last day has gone), the rest upcoming.
 * `today` is a YYYY-MM-DD date in the organisation's time zone.
 */
export function groupOrgEvents<T extends Dated>(events: readonly T[], today: string): { live: T[]; upcoming: T[]; past: T[] } {
  const live: T[] = [];
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const e of events) {
    const last = e.end_date ?? e.start_date;
    if (e.status === "live") live.push(e);
    else if (e.status === "complete" || (last !== null && last < today)) past.push(e);
    else upcoming.push(e);
  }
  const key = (e: Dated) => e.start_date ?? "9999-99-99";
  upcoming.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  past.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  return { live, upcoming, past };
}

/** "10 Oct 2026, 14:30" in the given time zone (never the machine's zone). Empty when there is no date. */
export function formatWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = (zone: string) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    );
  let p: Record<string, string>;
  try {
    p = parts(timeZone);
  } catch {
    p = parts("UTC"); // a time zone this machine does not know must never break a page
  }
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** Today's date (YYYY-MM-DD) in a time zone, for "is this event upcoming or past" on the organisation page. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
