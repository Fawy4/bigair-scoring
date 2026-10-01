import { describe, expect, it } from "vitest";
import { buildScreenSlides, nextSlide } from "./screen-model";
import type { HeatVM, RiderRowVM } from "./results-model";
import type { PublicRow, PublicTimetableModel } from "./timetable";

const rider = (n: number): RiderRowVM => ({ entryId: `e${n}`, place: n, label: null, placeholder: null, totalLabel: String(30 - n), formula: null, percentLabel: null, state: "ok", boxes: [] });
const row = (n: number, status: PublicRow["status"]): PublicRow => ({ itemId: `i${n}`, kind: "heat", heatId: `h${n}`, title: `Heat ${n}`, division: "", round: "", heat: `Heat ${n}`, start: "10:00", end: null, startUtc: null, durationMin: 10, status, estimated: status === "est" || status === "next", readyCall: null, readyCallUtc: null, warmUpStart: null, resultHeld: false });
const tt = (rows: PublicRow[]): PublicTimetableModel => ({ day: "2026-10-10", isToday: true, rows, now: rows.find((r) => r.status === "live") ?? null, upNext: [], finish: null, onHold: false, heatsLeft: 0 });
const tab = (id: string, state: HeatVM["state"], publishedAt: string | null): HeatVM => ({ id, divisionId: "d", divisionName: "Pro", roundName: "R1", tab: id, title: `Pro · R1 · ${id}`, state, riders: [1, 2, 3, 4, 5, 6, 7].map(rider), countedScores: [], trickCount: 0, attemptsPerRider: 7, mode: "number_score", publishedAt });

describe("the big screen's pages", () => {
  it("live heat, timetable, latest result, podium, sponsors, in that order", () => {
    const slides = buildScreenSlides({
      tt: tt([row(1, "done"), row(2, "live"), row(3, "next"), row(4, "est")]),
      tabs: [tab("h1", "complete", "2026-10-10T07:00:00Z"), tab("h0", "complete", "2026-10-10T06:00:00Z"), tab("h2", "live", null)],
      liveRiders: [rider(1), rider(2)],
      podiums: [{ division: "Pro Men", places: [{ place: 1, label: "1", shared: false, entryId: "a", name: "Ana", round: "F" }, { place: 2, label: "2", shared: false, entryId: "b", name: "Ben", round: "F" }, { place: 3, label: "3=", shared: true, entryId: "c", name: "Cy", round: "R1" }, { place: 3, label: "3=", shared: true, entryId: "d", name: "Di", round: "R1" }] }],
      sponsors: [{ name: "WOO" }],
    });
    expect(slides.map((s) => s.kind)).toEqual(["live", "timetable", "results", "podium", "sponsors"]);
    expect(slides[0]).toMatchObject({ kind: "live", title: "Heat 2", scoresShown: true });
    expect(slides[1]).toMatchObject({ kind: "timetable", estimates: true });
    expect((slides[1] as { rows: PublicRow[] }).rows.map((r) => r.heat)).toEqual(["Heat 2", "Heat 3", "Heat 4"]);
    expect(slides[2]).toMatchObject({ kind: "results", heatId: "h1" }); // the most recently published
    expect((slides[2] as { riders: RiderRowVM[] }).riders.length).toBe(4);
    expect((slides[3] as { places: unknown[] }).places.length).toBe(3);
  });

  it("with live scores off the live page shows the seats (no totals); an empty page is left out, never shown empty", () => {
    const slides = buildScreenSlides({ tt: tt([row(2, "live")]), tabs: [tab("h2", "live", null)], liveRiders: null, podiums: [], sponsors: [] });
    expect(slides.map((s) => s.kind)).toEqual(["live", "timetable"]);
    expect(slides[0]).toMatchObject({ scoresShown: false });
    expect(buildScreenSlides({ tt: tt([]), tabs: [], liveRiders: null, podiums: [], sponsors: [] })).toEqual([]);
  });

  it("the timetable page holds six rows at most and rotation wraps round", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(n, n === 1 ? "next" : "est"));
    const s = buildScreenSlides({ tt: tt(rows), tabs: [], liveRiders: null, podiums: [], sponsors: [] });
    expect((s[0] as { rows: unknown[] }).rows.length).toBe(6);
    expect([nextSlide(0, 3), nextSlide(2, 3), nextSlide(0, 0)]).toEqual([1, 0, 0]);
  });
});
