import { orgCopy } from "@/lib/ui-copy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

/** "10–12 Oct 2026". Dates are plain calendar days (no time zone involved). */
export function eventDatesInWords(start: string | null, end: string | null): string {
  const a = start ? parts(start) : null;
  const b = end ? parts(end) : null;
  if (!a && !b) return orgCopy.shell.datesNotSet;
  if (!a || !b || (a.y === b.y && a.m === b.m && a.d === b.d)) {
    const x = (a ?? b)!;
    return `${x.d} ${MONTHS[x.m]} ${x.y}`;
  }
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}
