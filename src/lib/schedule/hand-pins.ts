/**
 * Which pins did the organiser set by hand? (docs/STATUS.md, Fix – reset per section.) `hand_pins` on the stored plan lists the item ids whose pin the organiser wrote;
 * pins the head console writes while the day runs (Shift, Resume at, +1 min, Pause break) are not in it. `null` = a plan made before this was kept: nobody can tell,
 * so every pin counts as hand-set. The database trigger `plan_hand_pins` does the same as `handPinsAfter`; this copy keeps the screen right between a save and a reload.
 */
export type Anchors = Record<string, string>;

const asAnchors = (x: unknown): Anchors => (x && typeof x === "object" && !Array.isArray(x) ? (x as Anchors) : {});
const asList = (x: unknown): string[] | null => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : null);

/** The hand-set list after the organiser saves `next`: the old list without pins that are gone, plus every pin that is new or changed. An older plan (null) marks all it has. */
export function handPinsAfter(before: { anchors: unknown; hand_pins?: unknown }, next: Anchors): string[] {
  const old = asAnchors(before.anchors);
  const list = asList(before.hand_pins);
  const kept = (list ?? []).filter((id) => id in next);
  const added = Object.keys(next).filter((id) => list === null || old[id] !== next[id]);
  return [...new Set([...kept, ...added])];
}

export interface PlanActuals {
  /** Actual starts of breaks and notes that Clear actual times removes. */
  actualStarts: number;
  /** Pins the console wrote while the day ran: removed. */
  pinsCleared: number;
  /** Pins kept (hand-set, or all of them when the plan cannot tell). */
  pinsKept: number;
  /** The plan records which pins are hand-set. False for a plan made before that: every pin is kept. */
  known: boolean;
}

/** What "Clear actual times" would do to a plan row. */
export function planActuals(row: { anchors: unknown; actual_starts: unknown; hand_pins?: unknown }): PlanActuals {
  const anchors = asAnchors(row.anchors);
  const list = asList(row.hand_pins);
  const ids = Object.keys(anchors);
  const kept = list === null ? ids.length : ids.filter((id) => list.includes(id)).length;
  return { actualStarts: Object.keys(asAnchors(row.actual_starts)).length, pinsCleared: ids.length - kept, pinsKept: kept, known: list !== null };
}
