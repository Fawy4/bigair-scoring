/**
 * The judge's scoring queue (owner, round 3). Judges mostly watch the water, so the phone asks for almost nothing: each attempt the spotter logs is the
 * next card, one tap scores it and the next unscored attempt comes in, the others wait ("2 waiting"), and a scored card drops into a thin history row
 * (tap it to correct). Pure: the screen only draws what this says.
 */
export interface QueueItem {
  id: number;
  status: "landed" | "crashed";
  /** The judge's own score; "missed" counts as an answer; null = not scored yet. */
  score: number | "missed" | null;
}

export interface QueueView<T extends QueueItem> {
  /** The card in front of the judge: the attempt being corrected, else the first unscored landed attempt. */
  current: T | null;
  correcting: boolean;
  waiting: number;
  waitingIds: number[];
  /** Scored, missed and crashed attempts, newest first (without the card being corrected). */
  history: T[];
}

export function queueView<T extends QueueItem>(items: T[], editing: number | null): QueueView<T> {
  const answered = (i: T) => i.status === "crashed" || i.score !== null;
  const edited = editing === null ? undefined : items.find((i) => i.id === editing && i.status === "landed" && i.score !== null);
  const unscored = items.filter((i) => i.status === "landed" && i.score === null);
  const current = edited ?? unscored[0] ?? null;
  const waiting = unscored.filter((i) => i !== current);
  const history = items.filter((i) => answered(i) && i !== current).reverse();
  return { current, correcting: !!edited, waiting: waiting.length, waitingIds: waiting.map((i) => i.id), history };
}
