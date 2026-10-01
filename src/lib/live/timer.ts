/** The heat clock, always computed from the server's time (docs/08 §1G-1). Nothing here reads the device clock: callers pass "now" in. */

/** A time left as m:ss. Part seconds round up, so "0:00" only appears when time is really up. Negative times read 0:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** How far the server is ahead of this device (add it to the device clock to get server time). The answer is assumed to take as long to come back as it took to go. */
export function clockOffset(sentAt: number, serverNow: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/** What the clock needs to know about a heat (the heats row, with times as epoch milliseconds or ISO text). */
export interface HeatTiming {
  status: string;
  durationSec: number;
  startedAt: string | number | null;
  pausedAt: string | number | null;
  pausedTotalSec: number;
}

const ms = (t: string | number | null): number | null => (t === null ? null : typeof t === "number" ? t : Date.parse(t));

/** Milliseconds left: the duration minus the time that really ran (paused time does not count). Not started = the whole duration; over = 0. */
export function remainingMs(heat: HeatTiming, nowServer: number): number {
  const total = heat.durationSec * 1000;
  const started = ms(heat.startedAt);
  if (heat.status === "scheduled" || started === null) return heat.status === "scheduled" || heat.status === "cancelled" ? total : 0;
  if (["ended", "under_review", "published", "cancelled"].includes(heat.status)) return 0;
  const pausedAt = ms(heat.pausedAt);
  const sincePause = heat.status === "paused" && pausedAt !== null ? nowServer - pausedAt : 0;
  const ran = nowServer - started - heat.pausedTotalSec * 1000 - sincePause;
  return Math.max(0, total - ran);
}

/** The same rule as the database (`private.heat_effective_status`): a running heat whose time is up is ended. A paused heat never is. */
export function effectiveStatus(heat: HeatTiming, nowServer: number): string {
  return heat.status === "running" && heat.startedAt !== null && remainingMs(heat, nowServer) <= 0 ? "ended" : heat.status;
}
