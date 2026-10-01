/** Counters and Undo (docs/08 §1G-6). The counter is worked out from the same attempts list the feed shows; the database's `attempt_counts` is the reconnect check. */
export const UNDO_WINDOW_MS = 10_000;

export interface AttemptLike {
  id: string;
  entryId: string;
  createdAt: string;
  createdBySeat: string | null;
  deletedAt: string | null;
}

export function attemptCount(attempts: Array<Pick<AttemptLike, "entryId" | "deletedAt">>, entryId: string): number {
  return attempts.filter((a) => a.entryId === entryId && !a.deletedAt).length;
}

export function counterFor(attempts: Array<Pick<AttemptLike, "entryId" | "deletedAt">>, entryId: string, cap: number | null): { used: number; max: number | null; out: boolean } {
  const used = attemptCount(attempts, entryId);
  return { used, max: cap, out: cap !== null && used >= cap };
}

/** Milliseconds left in which the spotter may take back an attempt (server time); 0 once the 10 seconds have passed. */
export function undoRemainingMs(createdAt: string | number, nowServer: number): number {
  const at = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Math.max(0, UNDO_WINDOW_MS - (nowServer - at));
}

/** Only the creating seat's last (newest, not deleted) attempt can be undone, and only for 10 seconds. */
export function undoableAttempt<T extends AttemptLike>(attempts: T[], seatId: string | null, nowServer: number): T | null {
  if (!seatId) return null;
  const mine = attempts.filter((a) => !a.deletedAt && a.createdBySeat === seatId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const last = mine[0];
  return last && undoRemainingMs(last.createdAt, nowServer) > 0 ? last : null;
}
