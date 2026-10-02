import { drawProjection, type DrawProjection } from "@/lib/draw/projection";
import { unpublishHeat, type DivisionDraw } from "@/lib/engine/ladder";
import { recompute } from "@/lib/engine/ladder/recompute";
import { copy } from "@/lib/ui-copy";

const T = copy.reset;

/** What Reset puts a division back to: the draw as it was when it was locked, and the rows (rounds, heats, seats) that draw is made of. Pure. */
export function resetTarget(drawAtLock: DivisionDraw): { draw: DivisionDraw; projection: DrawProjection } {
  const draw: DivisionDraw = structuredClone(drawAtLock);
  const started = Object.keys(draw.results ?? {}).length > 0 || draw.rounds.some((r) => r.heats.some((h) => h.status !== "pending"));
  if (started) throw new Error(T.copyHasResults);
  draw.results = {};
  return { draw, projection: drawProjection(draw) };
}

export interface CopyFacts {
  name: string;
  /** The division has a draw. */
  drawn: boolean;
  /** `draw_at_lock` is stored. */
  hasCopy: boolean;
  /** A heat of the division has left "scheduled" (started, or was cancelled after it started). */
  heatLeftScheduled: boolean;
}

/** Every drawn division must have its starting draw. A division without it is named, with the one thing that helps (or the plain fact that nothing can). */
export function copyProblems(divisions: CopyFacts[]): string[] {
  return divisions.filter((d) => d.drawn && !d.hasCopy).map((d) => (d.heatLeftScheduled ? T.copyUnknown(d.name) : T.copyRelock(d.name)));
}

export interface HeatFacts {
  /** `heat_results` rows exist for the heat. */
  hasResults: boolean;
  /** `publish_hold` is on now. */
  heldNow: boolean;
  /** The audit log has a release (`publish_release`) for the heat. */
  everReleased: boolean;
  started: boolean;
  /** The head judge's per-heat switch: true, false, or null = follow the setting. */
  publicLive: boolean | null;
  /** The division's or event's "live scores" setting is on. */
  liveSettingOn: boolean;
}

/**
 * "Ever shown publicly": a result was published and not held (or released since), or a heat ran while live scores were on (its own switch, else the setting).
 * A written reason is required for a Reset only then. The database function works this out itself; this is the same rule, for the screen and the tests.
 */
export function everPublic(heats: HeatFacts[]): boolean {
  return heats.some((h) => {
    const resultShown = h.hasResults && (!h.heldNow || h.everReleased);
    const liveShown = h.started && (h.publicLive === true || (h.publicLive === null && h.liveSettingOn));
    return resultShown || liveShown;
  });
}

/**
 * A division with no saved starting draw (locked before Reset existed, or re-locked after its first heat): the starting draw is rebuilt from the current one.
 * Round 1 keeps the seats it has, results and heat states go, and the ladder deals again, so every later seat is back to its placeholder ("1st H1").
 * It is a rebuild, not the saved copy: a seat changed by hand in a later round is not remembered. Pure.
 */
export function rebuildTarget(current: DivisionDraw): { draw: DivisionDraw; projection: DrawProjection } {
  const draw: DivisionDraw = structuredClone(current);
  draw.results = {};
  for (const r of draw.rounds) for (const h of r.heats) h.status = "pending";
  if (recompute(draw).length > 0) throw new Error(T.rebuildArranged);
  return { draw, projection: drawProjection(draw) };
}

/** What Reset puts a division back to: the saved copy when there is one, else the rebuild from the current draw. `rebuilt` says which, for the confirmation. */
export function startingTarget(copyOfDraw: DivisionDraw | null, current: DivisionDraw): { draw: DivisionDraw; projection: DrawProjection; rebuilt: boolean } {
  return copyOfDraw ? { ...resetTarget(copyOfDraw), rebuilt: false } : { ...rebuildTarget(current), rebuilt: true };
}

export interface SeatChange {
  uid: string;
  slots: Array<{ position: number; entry_id: string | null; modifier: string | null }>;
}

/**
 * "Reset this heat" on a heat whose result was published: takes the result back out of the draw and lists the later heats whose seats change (the winner's
 * seat in the next round goes back to its placeholder). `statuses` are the stored heats of the division, so a later heat that has started is seen.
 * A published result that later heats already depend on cannot be taken back: `conflict` names the heats.
 */
export function heatResetPlan(synced: DivisionDraw, heatUid: string): { ok: true; draw: DivisionDraw; seats: SeatChange[] } | { ok: false; heats: string[] } {
  const drawHeat = synced.rounds.flatMap((r) => r.heats).find((h) => (h.uid ?? h.id) === heatUid);
  if (!drawHeat) return { ok: true, draw: synced, seats: [] };
  const out = unpublishHeat(synced, drawHeat.id);
  if (out.conflict) {
    return { ok: false, heats: out.conflict.affectedHeats.map((a) => { const h = synced.rounds.flatMap((r) => r.heats).find((x) => x.id === a.heatId); return h?.name ?? (h?.number ? `Heat ${h.number}` : a.heatId); }) };
  }
  const key = (s: { entry_id: string | null; modifier: string | null }) => `${s.entry_id ?? ""}|${s.modifier ?? ""}`;
  const before = new Map(drawProjection(synced).heats.map((h) => [h.uid, h]));
  const seats = drawProjection(out.draw)
    .heats.filter((h) => h.uid !== heatUid)
    .filter((h) => (before.get(h.uid)?.slots ?? []).map(key).join(",") !== h.slots.map(key).join(","))
    .map((h) => ({ uid: h.uid, slots: h.slots.map((s) => ({ position: s.position, entry_id: s.entry_id, modifier: s.modifier })) }));
  return { ok: true, draw: out.draw, seats };
}

/**
 * The division's saved starting draw, as the database counts it: the copy taken at lock time, or an unlocked draw that has not been played (it is its own start).
 * Anything else has no copy and is rebuilt (`rebuildTarget`).
 */
export function startingCopy(row: { draw: DivisionDraw | null; draw_at_lock: DivisionDraw | null; draw_locked_at: string | null }): DivisionDraw | null {
  if (row.draw_at_lock) return row.draw_at_lock;
  if (row.draw_locked_at || !row.draw) return null;
  const untouched = Object.keys(row.draw.results ?? {}).length === 0 && row.draw.rounds.every((r) => r.heats.every((h) => h.status === "pending"));
  return untouched ? row.draw : null;
}
