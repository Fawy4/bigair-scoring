import { drawProjection, type DrawProjection } from "@/lib/draw/projection";
import type { DivisionDraw } from "@/lib/engine/ladder";
import { copy } from "@/lib/ui-copy";

const T = copy.reset;

/** What Reset puts a division back to: the draw as it was when it was locked, and the rows (rounds, heats, seats) that draw is made of. Pure. */
export function resetTarget(drawAtLock: DivisionDraw): { draw: DivisionDraw; projection: DrawProjection } {
  const draw: DivisionDraw = structuredClone(drawAtLock);
  const started = Object.keys(draw.results ?? {}).length > 0 || draw.rounds.some((r) => r.heats.some((h) => h.status !== "pending"));
  if (started) throw new Error(T.copyHasResults);
  draw.status = "locked";
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
