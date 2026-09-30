export type Heartbeat = { kind: "never" } | { kind: "recent"; seconds: number } | { kind: "earlier"; minutes: number; at: string };

/** Within the last minute counts as "just now"; older is shown as how long ago. */
export function heartbeatState(lastSeenAt: string | null, now: Date): Heartbeat {
  if (!lastSeenAt) return { kind: "never" };
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(lastSeenAt).getTime()) / 1000));
  if (seconds < 60) return { kind: "recent", seconds };
  return { kind: "earlier", minutes: Math.round(seconds / 60), at: lastSeenAt };
}
