// Time-zone maths with the built-in Intl only (no dependencies). Explicit offsets, DST-safe.

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function partsAt(ms: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Offset of `timeZone` from UTC at the instant `ms`, in milliseconds (Cairo in summer = +3 h). */
export function tzOffsetMs(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-10-03" + "10:30" in `timeZone` → epoch milliseconds (UTC). */
export function localToUtc(eventDay: string, hhmm: string, timeZone: string): number {
  const [y, mo, d] = eventDay.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - tzOffsetMs(wall, timeZone);
  const second = wall - tzOffsetMs(first, timeZone); // correct when the guess crossed a DST change
  return second;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Epoch ms or ISO instant → "HH:MM" in `timeZone` (seconds are dropped). */
export function utcToLocalHHMM(at: number | string, timeZone: string): string {
  const ms = typeof at === "string" ? Date.parse(at) : at;
  const p = partsAt(ms, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export const toIso = (ms: number) => new Date(ms).toISOString();

export function addMinutes(at: number | string, minutes: number): string {
  const ms = typeof at === "string" ? Date.parse(at) : at;
  return toIso(ms + minutes * 60_000);
}
