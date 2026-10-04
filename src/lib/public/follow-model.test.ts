import { describe, expect, it } from "vitest";
import { EventFormSchema } from "@/lib/schemas/event-settings";
import type { LadderHeatVM, LadderRoundVM } from "./ladder-model";
import type { BoxVM, HeatVM, RiderRowVM } from "./results-model";
import type { PublicRow } from "./timetable";
import type { TimetableHeat } from "./types";
import { buildFollowPages, followPhase, nextLine, paginateLadder, paginateResults, walkKeyOf, type FollowPage } from "./follow-model";

const NOW = Date.parse("2026-10-10T12:00:00Z"); // 14:00 in Cairo (UTC+2 in October? the model only needs a fixed zone)
const TZ = "Africa/Cairo";

const heat = (id: string, patch: Partial<TimetableHeat> = {}): TimetableHeat => ({
  id, division_id: "d1", round_id: "r1", number: 1, suffix: null, name: null, status: "scheduled", effective_status: "scheduled", held: false,
  started_at: null, ended_at: null, paused_at: null, paused_total_sec: 0, duration_sec: 600, warm_up_sec: 0, rerun_of: null, armed_at: null, prestart_sec: null, armed_paused_at: null,
  time_scale: 1, round_last: false, break_after_heat_min: null, break_after_round_min: null, ...patch,
});
const iso = (offsetSec: number) => new Date(NOW + offsetSec * 1000).toISOString();

describe("which page the Follow screen is on (the page-choosing rule)", () => {
  it("armed (the yellow is up) is the live heat, ahead of any heat waiting for review", () => {
    const heats = [heat("h1", { status: "ended", started_at: iso(-900), ended_at: iso(-300) }), heat("h2", { status: "scheduled", armed_at: iso(-10), prestart_sec: 60 })];
    expect(followPhase(heats, NOW)).toEqual({ kind: "live", heatId: "h2" });
  });
  it("armed with the pre-start frozen is still the live heat", () => {
    expect(followPhase([heat("h2", { armed_at: iso(-500), prestart_sec: 60, armed_paused_at: iso(-400) })], NOW)).toEqual({ kind: "live", heatId: "h2" });
  });
  it("running, paused and the last minute are the live heat, until the head judge ends it (status, not the clock running out)", () => {
    expect(followPhase([heat("h1", { status: "running", started_at: iso(-30) })], NOW).kind).toBe("live");
    expect(followPhase([heat("h1", { status: "paused", started_at: iso(-30), paused_at: iso(-5) })], NOW).kind).toBe("live");
    // the clock is at zero but nobody has pressed End heat yet
    expect(followPhase([heat("h1", { status: "running", effective_status: "ended", started_at: iso(-700) })], NOW)).toEqual({ kind: "live", heatId: "h1" });
  });
  it("an armed heat whose pre-start is over has started: still live", () => {
    expect(followPhase([heat("h1", { status: "scheduled", armed_at: iso(-120), prestart_sec: 60 })], NOW)).toEqual({ kind: "live", heatId: "h1" });
  });
  it("ended or under review and not published: stay on that heat, 'Judges reviewing'", () => {
    expect(followPhase([heat("h1", { status: "ended", started_at: iso(-900), ended_at: iso(-60) })], NOW)).toEqual({ kind: "reviewing", heatId: "h1" });
    expect(followPhase([heat("h1", { status: "under_review", started_at: iso(-900), ended_at: iso(-60) })], NOW)).toEqual({ kind: "reviewing", heatId: "h1" });
  });
  it("published (released or held) and everything quiet: the rotation", () => {
    expect(followPhase([heat("h1", { status: "published", started_at: iso(-900), ended_at: iso(-300) })], NOW)).toEqual({ kind: "rotation" });
    expect(followPhase([heat("h1", { status: "published", held: true, started_at: iso(-900), ended_at: iso(-300) })], NOW)).toEqual({ kind: "rotation" });
  });
  it("before the first heat, between heats, on a hold and after the last: the rotation", () => {
    expect(followPhase([], NOW)).toEqual({ kind: "rotation" });
    expect(followPhase([heat("h1"), heat("h2")], NOW)).toEqual({ kind: "rotation" });
  });
  it("an old heat that was never published does not pin the screen once a later heat has started", () => {
    const heats = [heat("h1", { status: "ended", started_at: iso(-5000), ended_at: iso(-4400) }), heat("h2", { status: "published", started_at: iso(-3000), ended_at: iso(-2400) })];
    expect(followPhase(heats, NOW)).toEqual({ kind: "rotation" });
  });
  it("a cancelled heat is ignored", () => {
    expect(followPhase([heat("h1", { status: "cancelled", armed_at: iso(-10), prestart_sec: 60 })], NOW)).toEqual({ kind: "rotation" });
  });
});

const box = (seq: number, patch: Partial<BoxVM> = {}): BoxVM => ({ seq, trick: "Backroll", status: "landed", counted: true, score: 7.5, scoreLabel: "7.50", ...patch });
const rider = (n: number, boxes = 7, patch: Partial<RiderRowVM> = {}): RiderRowVM => ({
  entryId: `e${n}`, place: n, label: null, placeholder: null, totalLabel: "18.20", formula: "18.20 = tricks 13.50 + Impression 4.70", percentLabel: null, state: "ok",
  boxes: Array.from({ length: boxes }, (_, i) => box(i + 1)), ...patch,
});
const tab = (id: string, publishedAt: string | null, state: HeatVM["state"] = "complete", divisionId = "d1", riders = [rider(1), rider(2), rider(3)]): HeatVM => ({
  id, divisionId, divisionName: divisionId === "d1" ? "Pro Men" : "Pro Women", roundName: "R1", tab: `R1 · ${id}`, title: `Pro · R1 · ${id}`, state, riders, countedScores: [], trickCount: 0, attemptsPerRider: 7, mode: "number_score", publishedAt,
});
const ladderHeat = (id: string, riders = 3): LadderHeatVM => ({ id, heatId: id, name: id, state: "complete", riders: Array.from({ length: riders }, (_, i) => ({ entryId: `e${i}`, name: `Rider ${i}`, hex: null, ink: "#111", colourWord: null, totalLabel: "10.00", placeholder: false, pending: false, walkover: false })) });
const round = (id: string, heats: number, ridersPer = 3): LadderRoundVM => ({ id, name: id, heats: Array.from({ length: heats }, (_, i) => ladderHeat(`${id}-H${i + 1}`, ridersPer)) });
const at = (hh: string) => `2026-10-10T${hh}:00Z`;

describe("the pages of the rotation: Results (newest) → Ladder → Results (the one before) → Ladder → …", () => {
  const tabs = [tab("h1", at("09:00")), tab("h2", at("10:00")), tab("h3", at("11:00")), tab("h4", null, "live"), tab("h5", at("11:30"), "held")];
  const ladders = new Map([["d1", [round("R1", 2)]]]);
  const kinds = (p: FollowPage[]) => p.map((x) => (x.kind === "results" ? `R:${x.heatId}` : "L"));

  it("walks back through today's published heats, newest first, with a Ladder after each; never an unpublished or held heat", () => {
    const pages = buildFollowPages({ tabs, ladders, nowMs: NOW, timezone: TZ });
    expect(kinds(pages)).toEqual(["R:h3", "L", "R:h2", "L", "R:h1", "L"]);
  });
  it("then wraps: the walk is a cycle, so after the last Ladder comes the newest again (the rotator wraps the index)", () => {
    const pages = buildFollowPages({ tabs, ladders, nowMs: NOW, timezone: TZ });
    expect(pages.length).toBe(6);
    expect(pages[0]).toMatchObject({ kind: "results", heatId: "h3" });
  });
  it("only today's heats (the event's day, not UTC's): yesterday's results are not walked", () => {
    const old = [tab("h0", "2026-10-09T20:00:00Z"), tab("h1", at("09:00"))];
    expect(kinds(buildFollowPages({ tabs: old, ladders, nowMs: NOW, timezone: TZ }))).toEqual(["R:h1", "L"]);
    // 23:00 UTC is already 02:00 on the 11th in Cairo (UTC+3 in October): 22:00 UTC (01:00 on the 11th) is today there, 20:00 UTC (23:00 on the 10th) is not
    const late = Date.parse("2026-10-10T23:00:00Z");
    const night = [tab("yesterday", "2026-10-10T20:00:00Z"), tab("today", "2026-10-10T22:00:00Z")];
    expect(kinds(buildFollowPages({ tabs: night, ladders, nowMs: late, timezone: TZ }))).toEqual(["R:today", "L"]);
  });
  it("each Results page names its heat and when it was published in the event's time zone", () => {
    const pages = buildFollowPages({ tabs: [tab("h1", "2026-10-10T11:20:00Z")], ladders, nowMs: NOW, timezone: "UTC" });
    expect(pages[0]).toMatchObject({ kind: "results", title: "Pro · R1 · h1", publishedAt: "11:20" });
  });
  it("the Ladder after a result is the ladder of that heat's division, winners already moved on (the model it is given)", () => {
    const two = new Map([["d1", [round("R1", 2)]], ["d2", [round("W1", 1)]]]);
    const pages = buildFollowPages({ tabs: [tab("a", at("09:00"), "complete", "d1"), tab("b", at("10:00"), "complete", "d2")], ladders: two, nowMs: NOW, timezone: TZ });
    const ladderDivisions = pages.filter((p) => p.kind === "ladder").map((p) => (p as { divisionId: string }).divisionId);
    expect(ladderDivisions).toEqual(["d2", "d1"]);
  });
  it("a division without a ladder gives a Results page and no Ladder page", () => {
    expect(kinds(buildFollowPages({ tabs: [tab("h1", at("09:00"))], ladders: new Map(), nowMs: NOW, timezone: TZ }))).toEqual(["R:h1"]);
  });
  it("nothing published today: the ladders alone (one per division); no data at all: no pages", () => {
    const two = new Map([["d1", [round("R1", 2)]], ["d2", [round("W1", 1)]]]);
    expect(buildFollowPages({ tabs: [tab("h4", null, "live")], ladders: two, nowMs: NOW, timezone: TZ }).map((p) => p.kind)).toEqual(["ladder", "ladder"]);
    expect(buildFollowPages({ tabs: [], ladders: new Map(), nowMs: NOW, timezone: TZ })).toEqual([]);
  });
  it("the walk restarts from the newest heat when a new heat is published, and not otherwise", () => {
    const before = buildFollowPages({ tabs, ladders, nowMs: NOW, timezone: TZ });
    const same = buildFollowPages({ tabs: [...tabs].reverse(), ladders, nowMs: NOW, timezone: TZ });
    const after = buildFollowPages({ tabs: [...tabs, tab("h6", at("11:45"))], ladders, nowMs: NOW, timezone: TZ });
    expect(walkKeyOf(before)).toBe(walkKeyOf(same));
    expect(walkKeyOf(after)).not.toBe(walkKeyOf(before));
  });
  it("held results never show: a held heat is not walked even when it is the newest", () => {
    const pages = buildFollowPages({ tabs: [tab("h1", at("09:00")), tab("h2", at("10:00"), "held")], ladders, nowMs: NOW, timezone: TZ });
    expect(JSON.stringify(pages)).not.toContain("h2");
  });
});

describe("a Results page is never shrunk to fit: a heat that does not fit is split across pages", () => {
  it("a heat of 3 with up to 7 attempts each is one page; a 5-rider heat is two (3 + 2), balanced", () => {
    const three = paginateResults([rider(1), rider(2), rider(3)], "number_score");
    expect(three.map((c) => c.length)).toEqual([3]);
    const five = paginateResults([1, 2, 3, 4, 5].map((n) => rider(n)), "number_score");
    expect(five.map((c) => c.length)).toEqual([3, 2]);
  });
  it("riders keep their order and none is lost or repeated", () => {
    const riders = [1, 2, 3, 4, 5, 6, 7].map((n) => rider(n));
    expect(paginateResults(riders, "number_score").flat().map((r) => r.entryId)).toEqual(riders.map((r) => r.entryId));
  });
  it("riders who did not ride (no boxes, no formula) take less room, so a quiet heat fits on one page", () => {
    const quiet = [rider(1), rider(2, 0, { formula: null, totalLabel: null, state: "DNS" }), rider(3, 0, { formula: null, totalLabel: null, state: "DNS" }), rider(4, 0, { formula: null, totalLabel: null, state: "DNS" })];
    expect(paginateResults(quiet, "number_score").length).toBe(1);
  });
  it("more attempts than one line holds wrap onto a second line of boxes, and the page counts that room", () => {
    expect(paginateResults([rider(1, 15), rider(2, 15), rider(3, 15)], "number_score").length).toBeGreaterThan(1);
  });
  it("an empty heat still gives one page", () => {
    expect(paginateResults([], "number_score")).toEqual([[]]);
  });
  it("a heat split in two says so on both pages", () => {
    const pages = buildFollowPages({ tabs: [tab("h1", at("09:00"), "complete", "d1", [1, 2, 3, 4, 5].map((n) => rider(n)))], ladders: new Map(), nowMs: NOW, timezone: TZ });
    expect(pages.map((p) => (p.kind === "results" ? [p.part, p.parts] : null))).toEqual([[1, 2], [2, 2]]);
  });
});

describe("a ladder that does not fit is shown in pages, round by round, never shrunk", () => {
  it("a small ladder is one page", () => {
    expect(paginateLadder([round("R1", 2), round("Final", 1)]).length).toBe(1);
  });
  it("a big ladder is split into pages; every heat appears exactly once and in order", () => {
    const rounds = [round("R1", 8), round("R2", 4), round("R3", 2), round("Final", 1)];
    const pages = paginateLadder(rounds);
    expect(pages.length).toBeGreaterThan(1);
    const names = pages.flatMap((p) => p.flatMap((col) => col.flatMap((b) => b.heats.map((h) => h.name))));
    expect(names).toEqual(rounds.flatMap((r) => r.heats.map((h) => h.name)));
  });
  it("a round that is split keeps its name above each piece", () => {
    const pages = paginateLadder([round("R1", 12)]);
    for (const p of pages) for (const col of p) for (const b of col) expect(b.name).toBe("R1");
  });
  it("no page and no column is empty", () => {
    for (const p of paginateLadder([round("R1", 9), round("R2", 5)])) {
      expect(p.length).toBeGreaterThan(0);
      for (const col of p) expect(col.length).toBeGreaterThan(0);
    }
  });
  it("no ladder, no pages", () => {
    expect(paginateLadder([])).toEqual([]);
  });
  it("a ladder page says which part it is when there are several", () => {
    const pages = buildFollowPages({ tabs: [tab("h1", at("09:00"))], ladders: new Map([["d1", [round("R1", 20)]]]), nowMs: NOW, timezone: TZ });
    const ladderParts = pages.filter((p) => p.kind === "ladder").map((p) => [(p as { part: number }).part, (p as { parts: number }).parts]);
    expect(ladderParts.length).toBeGreaterThan(1);
    expect(ladderParts[0]).toEqual([1, ladderParts.length]);
  });
});

const row = (patch: Partial<PublicRow>): PublicRow => ({ itemId: "i", kind: "heat", heatId: "h", title: "Pro · R1 · Heat 7", division: "", round: "", heat: "Heat 7", start: "14:40", end: null, startUtc: null, durationMin: 10, status: "next", estimated: true, readyCall: null, readyCallUtc: null, warmUpStart: null, resultHeld: false, ...patch });

describe("the thin line at the bottom: Next: <heat name> · est. <time>", () => {
  it("names the next heat from the run order with its estimated time", () => {
    expect(nextLine([row({})])).toBe("Next: Pro · R1 · Heat 7 · est. 14:40");
  });
  it("a time that is fixed (a pin) is not called an estimate", () => {
    expect(nextLine([row({ estimated: false, status: "pinned" })])).toBe("Next: Pro · R1 · Heat 7 · 14:40");
  });
  it("on a hold there is no time to promise", () => {
    expect(nextLine([row({ start: null })])).toBe("Next: Pro · R1 · Heat 7");
  });
  it("nothing left: no line", () => {
    expect(nextLine([])).toBeNull();
  });
});

describe("the Follow screen's seconds per page setting", () => {
  const base = { name: "Arrow", slug: "arrow", start_date: "2026-10-02", end_date: "2026-10-04", timezone: "Africa/Cairo", branding: {}, settings: {} };
  it("defaults to 15 and accepts 5 to 120", () => {
    expect(EventFormSchema.parse(base).settings.followRotateSec).toBe(15);
    expect(EventFormSchema.parse({ ...base, settings: { followRotateSec: 5 } }).settings.followRotateSec).toBe(5);
    expect(EventFormSchema.parse({ ...base, settings: { followRotateSec: 120 } }).settings.followRotateSec).toBe(120);
  });
  it("refuses 4 and 121", () => {
    expect(EventFormSchema.safeParse({ ...base, settings: { followRotateSec: 4 } }).success).toBe(false);
    const refused = EventFormSchema.safeParse({ ...base, settings: { followRotateSec: 121 } });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error?.issues)).toContain("Use a whole number of seconds from 5 to 120 for the pages of the Follow the heat screen");
  });
  it("is separate from the existing big screen's setting", () => {
    const s = EventFormSchema.parse({ ...base, settings: { screenRotateSec: 30 } }).settings;
    expect(s.screenRotateSec).toBe(30);
    expect(s.followRotateSec).toBe(15);
  });
});
