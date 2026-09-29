import type { ScoringModel } from "@/lib/schemas/scoring-model";
import type { Attempt } from "./types";

/** Case- and whitespace-insensitive trick name; null when there is no name. */
export function normaliseTrickName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.trim().replace(/\s+/g, " ").toLowerCase();
  return n === "" ? null : n;
}

/**
 * repeatIndex per attempt: how many earlier non-deleted attempts (by seq) share its normalised
 * trick name. 0 = first time. Unnamed attempts are always 0. Deleted attempts are skipped.
 */
export function repeatIndexes(attempts: Attempt[]): Map<number, number> {
  const seen = new Map<string, number>();
  const out = new Map<number, number>();
  for (const a of [...attempts].filter((x) => !x.deleted).sort((x, y) => x.seq - y.seq)) {
    const key = normaliseTrickName(a.trickName);
    if (key === null) {
      out.set(a.seq, 0);
      continue;
    }
    const n = seen.get(key) ?? 0;
    out.set(a.seq, n);
    seen.set(key, n + 1);
  }
  return out;
}

/**
 * Flags a rider's attempt as a possible duplicate of the latest earlier non-deleted attempt that was
 * logged from a different seat within `windowSec` seconds. Attempts without createdAt/createdBy are
 * never flagged. Returns copies; input is not mutated.
 */
export function flagPossibleDuplicates<T extends Pick<Attempt, "seq" | "createdAt" | "createdBy" | "deleted">>(
  attempts: T[],
  windowSec: number,
): Array<T & { possibleDuplicateOf?: number }> {
  const live = attempts
    .filter((a) => !a.deleted && a.createdAt && a.createdBy)
    .map((a) => ({ a, t: Date.parse(a.createdAt!) }))
    .sort((x, y) => x.t - y.t || x.a.seq - y.a.seq);

  const flags = new Map<number, number>();
  live.forEach(({ a, t }, i) => {
    for (let j = i - 1; j >= 0; j--) {
      const prev = live[j];
      if ((t - prev.t) / 1000 > windowSec) break;
      if (prev.a.createdBy !== a.createdBy) {
        flags.set(a.seq, prev.a.seq);
        break;
      }
    }
  });

  return attempts.map((a) => (flags.has(a.seq) ? { ...a, possibleDuplicateOf: flags.get(a.seq)! } : { ...a }));
}

/** Server-side guard for logging a new attempt (the cap counts non-deleted attempts). */
export function checkCanAddAttempt(
  model: ScoringModel,
  liveAttemptCount: number,
): { ok: true } | { ok: false; message: string } {
  const cap = model.heat.maxAttemptsPerRider;
  if (cap !== null && liveAttemptCount >= cap) {
    return {
      ok: false,
      message: `This rider has already used ${liveAttemptCount} of ${cap} attempts in this heat.`,
    };
  }
  return { ok: true };
}
