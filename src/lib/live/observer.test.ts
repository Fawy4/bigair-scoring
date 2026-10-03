import { describe, expect, it } from "vitest";
import { maskFor, observerViews, observedViewer, parseViewKey, viewKey, watchingCount, OBSERVER_SEEN_MS, type ObserverSeat } from "./observer";

const seats: ObserverSeat[] = [
  { id: "h", name: "Hana", role: "head", spotterEntries: [], spotterColours: [] },
  { id: "j1", name: "Fawy", role: "judge", spotterEntries: [], spotterColours: [] },
  { id: "j2", name: "Lina", role: "judge", spotterEntries: [], spotterColours: [] },
  { id: "j3", name: "Off panel", role: "judge", spotterEntries: [], spotterColours: [] },
  { id: "s1", name: "Omar", role: "spotter", spotterEntries: ["e1"], spotterColours: ["red"] },
  { id: "a", name: "Mic", role: "announcer", spotterEntries: [], spotterColours: [] },
  { id: "o", name: "Sponsor", role: "observer", spotterEntries: [], spotterColours: [] },
];
// two divisions: the panel order decides Judge 1, 2, 3 (the head judge who also scores is a judge too)
const panels = [
  ["j2", "j1"],
  ["j1", "j2", "h"],
];

describe("the observer's role switcher", () => {
  const views = observerViews(seats, panels);
  it("lists the head judge console (laptop, phone), Judge 1…n in panel order, every spotter, the announcer, the big screen and the public page", () => {
    expect(views.map((v) => v.label)).toEqual([
      "Head judge console (laptop)",
      "Head judge console (phone)",
      "Judge 1 · Lina",
      "Judge 2 · Fawy",
      "Judge 3 · Hana",
      "Spotter · Omar",
      "Announcer",
      "Big screen",
      "Public page",
    ]);
  });
  it("a seat already named “Judge 1” or “Spotter 2” is not named twice", () => {
    const named = observerViews(
      [
        { id: "a", name: "Judge 1", role: "judge", spotterEntries: [], spotterColours: [] },
        { id: "b", name: "Lina", role: "judge", spotterEntries: [], spotterColours: [] },
        { id: "s", name: "Spotter 2", role: "spotter", spotterEntries: [], spotterColours: [] },
      ],
      [["a", "b"]],
    );
    expect(named.map((v) => v.label)).toEqual(expect.arrayContaining(["Judge 1", "Judge 2 · Lina", "Spotter 2"]));
  });
  it("a judge who is on no panel is not a Judge n, and an observer never appears", () => {
    expect(views.some((v) => v.label.includes("Off panel"))).toBe(false);
    expect(views.some((v) => v.label.includes("Sponsor"))).toBe(false);
  });
  it("frames: laptop for the console and the big screen, phone for the rest", () => {
    expect(views.find((v) => v.key === "head-wide")?.frame).toBe("laptop");
    expect(views.find((v) => v.key === "screen")?.frame).toBe("tv");
    expect(views.filter((v) => v.frame === "phone").length).toBe(7);
  });
  it("every key reads back to its view", () => {
    for (const v of views) expect(viewKey(parseViewKey(v.key)!)).toBe(v.key);
    expect(parseViewKey("judge:")).toBeNull();
    expect(parseViewKey("nonsense")).toBeNull();
  });
});

describe("the viewer an observed screen gets", () => {
  it("a judge's screen is that judge's seat; the observer seat is kept aside", () => {
    expect(observedViewer({ kind: "judge", seatId: "j1" }, seats, "o")).toMatchObject({ kind: "seat", role: "judge", seatId: "j1", name: "Fawy", observer: { seatId: "o", name: "Sponsor" } });
  });
  it("a spotter's screen carries that spotter's riders and lycra colours", () => {
    expect(observedViewer({ kind: "spotter", seatId: "s1" }, seats, "o")).toMatchObject({ role: "spotter", spotterEntries: ["e1"], spotterColours: ["red"] });
  });
  it("the console is the head judge's seat (with its Score tab when the head judge scores); without a head seat, the observer's own seat as a head", () => {
    expect(observedViewer({ kind: "head-wide" }, seats, "o")).toMatchObject({ role: "head", seatId: "h" });
    expect(observedViewer({ kind: "head-phone" }, seats.filter((s) => s.role !== "head"), "o")).toMatchObject({ role: "head", seatId: "o" });
  });
  it("a seat that is not what the view asks for is refused", () => {
    expect(observedViewer({ kind: "judge", seatId: "s1" }, seats, "o")).toBeNull();
    expect(observedViewer({ kind: "spotter", seatId: "j1" }, seats, "o")).toBeNull();
    expect(observedViewer({ kind: "judge", seatId: "o" }, seats, "o")).toBeNull();
  });
});

describe("what each observed screen shows: the same rows the database gives that official", () => {
  const row = (seat: string) => ({ id: seat + Math.random(), judge_seat_id: seat });
  const snap = {
    scores: [row("j1"), row("j2")],
    impressions: [row("j1"), row("j2")],
    flags: [row("j1")],
    sheets: [row("j1"), row("j2")],
    decisions: [{ id: "d" }],
    attempts: [{ id: "a" }],
  };
  it("a judge: only their own scores, Impression / Variety scores, flags and sheet; no decisions", () => {
    const m = maskFor(snap, "judge", "j1");
    expect(m.scores.map((r) => r.judge_seat_id)).toEqual(["j1"]);
    expect(m.impressions.map((r) => r.judge_seat_id)).toEqual(["j1"]);
    expect(m.sheets.map((r) => r.judge_seat_id)).toEqual(["j1"]);
    expect(m.flags).toHaveLength(1);
    expect(m.decisions).toHaveLength(0);
    expect(m.attempts).toHaveLength(1);
  });
  it("a spotter: no scores of any kind", () => {
    const m = maskFor(snap, "spotter", "s1");
    expect([m.scores, m.impressions, m.flags, m.sheets, m.decisions].every((l) => l.length === 0)).toBe(true);
    expect(m.attempts).toHaveLength(1);
  });
  it("the announcer: every score, no sheets, flags or decisions", () => {
    const m = maskFor(snap, "announcer", "a");
    expect(m.scores).toHaveLength(2);
    expect(m.impressions).toHaveLength(2);
    expect([m.flags, m.sheets, m.decisions].every((l) => l.length === 0)).toBe(true);
  });
  it("the head judge: everything", () => {
    expect(maskFor(snap, "head", "h")).toEqual(snap);
  });
});

describe("“2 observers watching”", () => {
  const now = Date.parse("2026-10-10T10:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it("counts observer seats seen within the window, not older ones, not other roles", () => {
    expect(
      watchingCount(
        [
          { role: "observer", last_seen_at: at(5_000) },
          { role: "observer", last_seen_at: at(OBSERVER_SEEN_MS - 1) },
          { role: "observer", last_seen_at: at(OBSERVER_SEEN_MS + 1_000) },
          { role: "observer", last_seen_at: null },
          { role: "judge", last_seen_at: at(1_000) },
        ],
        now,
      ),
    ).toBe(2);
  });
});
