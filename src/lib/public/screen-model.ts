import { latestComplete } from "./og";
import type { PlacingVM } from "./ladder-model";
import type { HeatVM, RiderRowVM } from "./results-model";
import type { PublicRow, PublicTimetableModel } from "./timetable";
import type { Sponsor } from "./types";

export type ScreenSlide =
  | { kind: "live"; heatId: string; title: string; riders: RiderRowVM[]; scoresShown: boolean }
  | { kind: "timetable"; rows: PublicRow[]; estimates: boolean }
  | { kind: "results"; heatId: string; title: string; riders: RiderRowVM[] }
  | { kind: "podium"; division: string; places: Array<{ label: string; name: string }> }
  | { kind: "sponsors"; sponsors: Sponsor[] };

export interface ScreenInput {
  tt: PublicTimetableModel;
  tabs: HeatVM[];
  /** Running totals of the heat on the water; null when the division does not show live scores (the seats are shown instead). */
  liveRiders: RiderRowVM[] | null;
  /** Divisions whose final has been released, newest first, with their top places. */
  podiums: Array<{ division: string; places: PlacingVM[] }>;
  sponsors: Sponsor[];
}

/** How many rows of the timetable and riders of a heat one slide holds: few, so the digits can be huge. */
export const SLIDE_ROWS = { timetable: 6, riders: 4, results: 4 };

/**
 * The pages the big screen cycles through, in order: the live heat (while one runs), the timetable (next six rows), the latest released result, the podium of a final
 * once it is released, then the sponsors. A page with nothing to say is left out, so the screen never shows an empty slide. Pure.
 */
export function buildScreenSlides(i: ScreenInput): ScreenSlide[] {
  const slides: ScreenSlide[] = [];
  if (i.tt.now?.heatId) {
    const tab = i.tabs.find((t) => t.id === i.tt.now!.heatId);
    const riders = i.liveRiders ?? tab?.riders ?? [];
    slides.push({ kind: "live", heatId: i.tt.now.heatId, title: i.tt.now.title, riders: riders.slice(0, SLIDE_ROWS.riders), scoresShown: Boolean(i.liveRiders) });
  }
  const upcoming = i.tt.rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
  if (upcoming.length) slides.push({ kind: "timetable", rows: upcoming.slice(0, SLIDE_ROWS.timetable), estimates: upcoming.some((r) => r.estimated) });
  const last = latestComplete(i.tabs);
  if (last) slides.push({ kind: "results", heatId: last.id, title: last.title, riders: last.riders.slice(0, SLIDE_ROWS.results) });
  const podium = i.podiums[0];
  if (podium && podium.places.length) slides.push({ kind: "podium", division: podium.division, places: podium.places.slice(0, 6).map((p) => ({ label: p.label, name: p.name })) });
  if (i.sponsors.length) slides.push({ kind: "sponsors", sponsors: i.sponsors });
  return slides;
}

/** The index of the next page, wrapping round. */
export const nextSlide = (current: number, count: number): number => (count <= 0 ? 0 : (current + 1) % count);
