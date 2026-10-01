import type { QueueEntry } from "./queue";

/** What is saved on the phone but not yet on the server, so the screen shows it at once (the pill says "Pending n"). */
export interface PendingScore {
  attemptId: string;
  score: number | null;
  missed: boolean;
  clientKey: string;
}

export function pendingScores(items: QueueEntry[]): Map<string, PendingScore> {
  const out = new Map<string, PendingScore>();
  for (const i of items) {
    if (i.kind !== "trick_score" || i.state === "refused") continue;
    const p = i.payload as { attemptId: string; score: number | null; missed: boolean };
    out.set(p.attemptId, { attemptId: p.attemptId, score: p.missed ? null : p.score, missed: Boolean(p.missed), clientKey: i.clientKey });
  }
  return out;
}

export function pendingImpressions(items: QueueEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) {
    if (i.kind !== "impression" || i.state === "refused") continue;
    const p = i.payload as { entryId: string; value: number };
    out.set(p.entryId, p.value);
  }
  return out;
}

export interface PendingAttempt {
  clientKey: string;
  entryId: string;
  heatId: string;
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  needsReview: boolean;
  createdAt: number;
}

export function pendingAttempts(items: QueueEntry[]): PendingAttempt[] {
  return items
    .filter((i) => i.kind === "attempt" && i.state !== "refused")
    .map((i) => {
      const p = i.payload as { heatId: string; entryId: string; status: "landed" | "crashed"; trickName: string | null; direction: "left" | "right" | null; needsReview?: boolean };
      return { clientKey: i.clientKey, entryId: p.entryId, heatId: p.heatId, status: p.status, trickName: p.trickName, direction: p.direction, needsReview: Boolean(p.needsReview), createdAt: i.clientRev };
    });
}

export const pendingFlags = (items: QueueEntry[]): Set<string> =>
  new Set(items.filter((i) => i.kind === "flag" && i.state !== "refused").map((i) => (i.payload as { attemptId: string }).attemptId));
