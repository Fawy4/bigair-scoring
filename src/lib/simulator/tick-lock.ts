/** How long a step may hold the lock if it dies half-way (a step that finishes gives it back at once). */
export const TICK_LOCK_MS = 30_000;

/** The two database calls of the lock (sim_tick_begin, sim_tick_end), so the rule can be tested without a database. */
export interface LockRpc {
  /** A token when this step holds the lock now; null when another step holds it. */
  begin(ms: number): Promise<string | null>;
  end(token: string): Promise<boolean>;
}

/**
 * One step at a time per simulation (Polish 2, item 4b): takes the lock, runs the step, and always gives the lock back — also when the step fails — so the
 * page's next step two seconds later runs. Only a step that asks while another is still working is told "busy" (a genuine second tab).
 */
export async function withTickLock<T>(db: LockRpc, run: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  const token = await db.begin(TICK_LOCK_MS);
  if (!token) return { busy: true };
  try {
    return { busy: false, value: await run() };
  } finally {
    await db.end(token).catch(() => false);
  }
}
