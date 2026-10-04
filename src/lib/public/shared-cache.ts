/**
 * Fix 2, item 1: the public pages' walls against the crowd. Pure, no I/O, no Next imports.
 *
 * `createSharedCache` keeps one answer per key for a few seconds and lets every caller that arrives while it is being read share that one read, so 300 phones
 * refreshing cost one set of database calls per page per ttl. A failed read is never kept. `ttl 0` only joins reads already in flight (the Flag view).
 * `createValve` counts public requests in flight: past N the caller shows the calm "Updating…" page instead of starting more work.
 */
interface Entry<T> {
  at: number;
  value?: T;
  pending?: Promise<T>;
}

export function createSharedCache(opts: { ttlMs: number; now?: () => number; maxKeys?: number }) {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 500;
  const map = new Map<string, Entry<unknown>>();
  const sweep = () => {
    if (map.size <= maxKeys) return;
    const t = now();
    for (const [k, e] of map) if (!e.pending && t - e.at >= opts.ttlMs) map.delete(k);
    // still too many (a burst of distinct keys inside one ttl): drop the oldest settled ones
    for (const [k, e] of [...map].sort((a, b) => a[1].at - b[1].at)) {
      if (map.size <= maxKeys) break;
      if (!e.pending) map.delete(k);
    }
  };
  return {
    async get<T>(key: string, load: () => Promise<T>, ttlMs: number = opts.ttlMs): Promise<T> {
      const e = map.get(key) as Entry<T> | undefined;
      if (e?.pending) return e.pending;
      if (e && "value" in e && now() - e.at < ttlMs) return e.value as T;
      const pending = load().then(
        (value) => {
          map.set(key, { at: now(), value });
          sweep();
          return value;
        },
        (err) => {
          map.delete(key);
          throw err;
        },
      );
      map.set(key, { at: e?.at ?? now(), pending });
      return pending;
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}

export function createValve(max: number, onPeak?: (peak: number) => void) {
  let n = 0;
  let peak = 0;
  return {
    /** A place, or null when full. The returned function gives the place back (once). */
    enter(): (() => void) | null {
      if (n >= max) return null;
      n++;
      if (n > peak) {
        peak = n;
        onPeak?.(peak);
      }
      let left = false;
      return () => {
        if (left) return;
        left = true;
        n--;
      };
    },
    inFlight: () => n,
    peak: () => peak,
  };
}
