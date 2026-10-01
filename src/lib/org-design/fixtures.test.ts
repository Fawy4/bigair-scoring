import { describe, expect, it } from "vitest";
import { describeScoringModel } from "@/lib/scoring-ui/describe";
import { checkDraw } from "@/lib/engine/ladder";
import { DIVISIONS, NOW_NEXT, OFFICIALS, PREVIEW_DRAW, PREVIEW_EVENT, READINESS, RIDERS, RUN_ORDER, DEFAULT_DIALS, SCORING_SENTENCE, STEPS, TIMER, formatEventDates, heatTimer, runOrderFrom, sentenceFor } from "./fixtures";

describe("the made-up event of the organiser preview", () => {
  it("has 3 divisions, 18 riders and 5 officials, and every rider belongs to a division of the event", () => {
    expect(DIVISIONS).toHaveLength(3);
    expect(RIDERS).toHaveLength(18);
    expect(OFFICIALS).toHaveLength(5);
    const ids = new Set(DIVISIONS.map((d) => d.id));
    for (const r of RIDERS) expect(ids.has(r.divisionId)).toBe(true);
    expect(new Set(RIDERS.map((r) => r.bib)).size).toBe(18);
    expect(new Set(RIDERS.map((r) => r.id)).size).toBe(18);
  });

  it("every status a Riders table has to show is in the list (confirmed, waiting, withdrawn)", () => {
    expect(new Set(RIDERS.map((r) => r.status))).toEqual(new Set(["confirmed", "waiting", "withdrawn"]));
  });

  it("the sentence under the scoring dials is the real scoringSentence output, not typed by hand", () => {
    expect(SCORING_SENTENCE).toBe(describeScoringModel(DIVISIONS[0].scoring));
    expect(SCORING_SENTENCE).toBe("Best 3 of 7 attempts + Variety 0–10, 3 judges averaged");
  });
  it("the sentence follows the dials: best 2, five judges with the extremes dropped, no Variety score", () => {
    expect(sentenceFor(DEFAULT_DIALS)).toBe(SCORING_SENTENCE);
    expect(sentenceFor({ ...DEFAULT_DIALS, bestN: 2 })).toMatch(/^Best 2 of 7 attempts/);
    expect(sentenceFor({ ...DEFAULT_DIALS, judges: 5, aggregate: "trimmed_mean" })).toMatch(/5 judges trimmed average$/);
    expect(sentenceFor({ ...DEFAULT_DIALS, impressionOn: false })).toBe("Best 3 of 7 attempts, 3 judges averaged");
  });
});

describe("the drawn ladder", () => {
  it("is built by the real ladder engine from the confirmed riders of the first division", () => {
    const confirmed = RIDERS.filter((r) => r.divisionId === DIVISIONS[0].id && r.status === "confirmed");
    expect(PREVIEW_DRAW.entrants.map((e) => e.id).sort()).toEqual(confirmed.map((r) => r.id).sort());
    expect(PREVIEW_DRAW.rounds.length).toBeGreaterThan(1);
    expect(PREVIEW_DRAW.seedOrder).toHaveLength(confirmed.length);
  });

  it("puts every rider in exactly one heat of round 1 and gives the checker nothing to complain about in round 1", () => {
    const seats = PREVIEW_DRAW.rounds[0].heats.flatMap((h) => h.slots.map((s) => s.entrantId).filter(Boolean));
    expect(new Set(seats).size).toBe(PREVIEW_DRAW.entrants.length);
    expect(seats).toHaveLength(PREVIEW_DRAW.entrants.length);
    expect(checkDraw(PREVIEW_DRAW).filter((w) => w.code === "rider_twice" || w.code === "rider_unplaced")).toEqual([]);
  });
});

describe("the seven steps of the rail", () => {
  it("come in the owner's order, each with a state and a one-line reason", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["Event", "Divisions", "Riders", "Officials", "Draw", "Run order", "Go live"]);
    for (const s of STEPS) {
      expect(["done", "attention", "not_started"]).toContain(s.state);
      expect(s.reason.length).toBeGreaterThan(5);
      expect(s.reason).not.toContain("\n");
    }
  });
  it("show a mix of the three states", () => {
    expect(new Set(STEPS.map((s) => s.state))).toEqual(new Set(["done", "attention", "not_started"]));
  });
});

describe("the readiness checklist", () => {
  it("has two done, two needing attention and one not started, each with a sentence, and a Fix target on everything not done", () => {
    const count = (state: string) => READINESS.filter((c) => c.state === state).length;
    expect([count("done"), count("attention"), count("not_started")]).toEqual([2, 2, 1]);
    for (const c of READINESS) {
      expect(c.sentence.length).toBeGreaterThan(5);
      if (c.state !== "done") expect(c.fixStep).toBeTruthy();
    }
  });
  it("names the same shortfall the Officials step reports", () => {
    const officials = STEPS.find((s) => s.label === "Officials")!;
    const judges = READINESS.find((c) => c.id === "judges")!;
    expect(officials.state).toBe("attention");
    expect(judges.state).toBe("attention");
    expect(judges.sentence).toContain("Pro Women");
  });
});

describe("dates in words", () => {
  it.each([
    ["2026-10-10", "2026-10-12", "10–12 Oct 2026"],
    ["2026-10-10", "2026-10-10", "10 Oct 2026"],
    ["2026-09-30", "2026-10-02", "30 Sep – 2 Oct 2026"],
    ["2026-12-31", "2027-01-01", "31 Dec 2026 – 1 Jan 2027"],
  ])("%s to %s reads %s", (a, b, text) => expect(formatEventDates(a, b)).toBe(text));
  it("the preview event's dates are written that way", () => expect(PREVIEW_EVENT.dates).toBe("10–12 Oct 2026"));
});

describe("run order and the heat timer", () => {
  it("cascades like the spreadsheet: End = Start + length and the next Start = End + break", () => {
    const rows = runOrderFrom([{ label: "A", lengthMin: 10, breakMin: 3 }, { label: "B", lengthMin: 12, breakMin: 5 }, { label: "C", lengthMin: 10, breakMin: 0 }], 10 * 60);
    expect(rows.map((r) => [r.start, r.end])).toEqual([["10:00", "10:10"], ["10:13", "10:25"], ["10:30", "10:40"]]);
  });
  it("the preview's run order starts at 10:00 and comes from the drawn ladder", () => {
    expect(RUN_ORDER.length).toBeGreaterThanOrEqual(5);
    expect(RUN_ORDER[0].start).toBe("10:00");
    expect(RUN_ORDER[0].label).toMatch(/Round 1/);
  });
  it("the timer counts down from the server's time, never below zero", () => {
    expect(heatTimer({ startedAtSec: 37200, lengthMin: 12, serverNowSec: 37478 })).toEqual({ remainingMs: 442_000, text: "7:22" });
    expect(heatTimer({ startedAtSec: 37200, lengthMin: 12, serverNowSec: 40000 }).remainingMs).toBe(0);
  });
  it("the Now card shows heat 2, which started on time at 10:16 and has 4:22 left at the fixed server time; heat 3 is next", () => {
    expect(NOW_NEXT.now.start).toBe("10:16");
    expect(NOW_NEXT.now.label).toMatch(/Heat 2$/);
    expect(TIMER.text).toBe("4:22");
    expect(NOW_NEXT.next.label).toMatch(/Heat 3$/);
  });
});
