import { describe, expect, it } from "vitest";
import type { AttemptRow, FlagRow } from "./types";
import { heatEndedAtMs, judgesWithLines, newAttemptIds, noOpenWork, openFlagsOf, openWorkCount, openWorkParts, sheetReopenedByNewAttempt, SPOTTER_QUIET_MS, spotterStillLogging } from "./heat-end";

const T0 = Date.parse("2026-10-21T12:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const attempt = (id: string, created: number, updated = created, over: Partial<AttemptRow> = {}): AttemptRow =>
  ({ id, heat_id: "h", entry_id: "e1", seq: 1, client_key: id, direction: null, category_key: null, trick_name: "Backroll", trick_parts: {}, status: "landed", created_by_seat: "s", created_at: at(created), deleted_at: null, possible_duplicate_of: null, input_method: "builder", raw_text: null, updated_at: at(updated), ...over });
const flag = (id: string, attemptId: string, over: Partial<FlagRow> = {}): FlagRow => ({ id, heat_id: "h", attempt_id: attemptId, judge_seat_id: "j2", kind: "crash", note: null, created_at: at(0), resolved_at: null, updated_at: at(0), ...over });

describe("when the heat ended", () => {
  it("End heat: its ended_at; the clock at 0: started plus length plus the time paused; not started: none", () => {
    expect(heatEndedAtMs({ ended_at: at(5), started_at: at(-600), duration_sec: 600, paused_total_sec: 0 })).toBe(T0 + 5000);
    expect(heatEndedAtMs({ ended_at: null, started_at: at(-700), duration_sec: 600, paused_total_sec: 30 })).toBe(T0 + (-700 + 630) * 1000);
    expect(heatEndedAtMs({ ended_at: null, started_at: null, duration_sec: 600, paused_total_sec: 0 })).toBeNull();
  });
});

describe("Spotter still logging", () => {
  const base = { endedAtMs: T0, spotterSeenMsAgo: [] as Array<number | null>, seenWithinMs: 90_000 };
  it("a line a spotter logged in the last 45 seconds: yes", () => {
    expect(spotterStillLogging({ ...base, nowMs: T0 + 60_000, attempts: [attempt("a", 40)] })).toBe(true); // logged 20 s ago
  });
  it("quiet for more than 45 seconds: no — and a correction of an old line (the head judge's edits too) does not count", () => {
    expect(spotterStillLogging({ ...base, nowMs: T0 + 120_000, attempts: [attempt("a", 10, 60)] })).toBe(false);
    expect(spotterStillLogging({ ...base, nowMs: T0 + 120_000, attempts: [attempt("a", 10, 100)] })).toBe(false); // changed 20 s ago, logged 110 s ago
    expect(SPOTTER_QUIET_MS).toBe(45_000);
  });
  it("just after the horn, with a spotter's phone connected: yes, even before the first late line; with no spotter connected: no", () => {
    expect(spotterStillLogging({ ...base, nowMs: T0 + 20_000, attempts: [], spotterSeenMsAgo: [30_000] })).toBe(true);
    expect(spotterStillLogging({ ...base, nowMs: T0 + 20_000, attempts: [], spotterSeenMsAgo: [null, 200_000] })).toBe(false);
    expect(spotterStillLogging({ ...base, nowMs: T0 + 100_000, attempts: [], spotterSeenMsAgo: [5_000] })).toBe(false); // the horn was long ago and nothing was logged
  });
  it("a heat with no end time and no lines: no", () => {
    expect(spotterStillLogging({ ...base, endedAtMs: null, nowMs: T0, attempts: [], spotterSeenMsAgo: [1000] })).toBe(false);
  });
});

describe("open flags", () => {
  const attempts = [attempt("a1", 0), attempt("a2", 0, 0, { deleted_at: at(30) })];
  it("an unresolved flag of this heat on an attempt that is still there, oldest first, with the judge's note", () => {
    const list = openFlagsOf([flag("f2", "a1", { created_at: at(20), note: "  wrong rider, it was Red  " }), flag("f1", "a1", { created_at: at(10) })], attempts, "h");
    expect(list.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(list[1].note).toBe("wrong rider, it was Red");
    expect(list[0].note).toBeNull();
  });
  it("resolved flags, other heats' flags and flags on an attempt that was taken out are not open", () => {
    expect(openFlagsOf([flag("f1", "a1", { resolved_at: at(5) }), flag("f2", "a1", { heat_id: "other" }), flag("f3", "a2")], attempts, "h")).toEqual([]);
  });
});

describe("who still has lines to score", () => {
  const attempts = [attempt("a1", 0), attempt("a2", 0, 0, { entry_id: "e2" }), attempt("a3", 0, 0, { status: "crashed" }), attempt("a4", 0, 0, { deleted_at: at(5) }), attempt("a5", 0, 0, { entry_id: "e3" })];
  it("counts each judge's landed lines with no score from him, in the panel's order (a Missed counts as scored; a crash and a deleted line owe nothing)", () => {
    const scores = [{ attempt_id: "a1", judge_seat_id: "j1" }, { attempt_id: "a2", judge_seat_id: "j1" }, { attempt_id: "a1", judge_seat_id: "j2" }];
    expect(judgesWithLines({ panelSeatIds: ["j1", "j2", "j3"], attempts, scores })).toEqual([{ seatId: "j1", lines: 1 }, { seatId: "j2", lines: 2 }, { seatId: "j3", lines: 3 }]);
  });
  it("a rider who does not ride owes no lines; nobody owes anything when everything is scored", () => {
    expect(judgesWithLines({ panelSeatIds: ["j1"], attempts, scores: [], notRiding: new Set(["e3", "e2"]) })).toEqual([{ seatId: "j1", lines: 1 }]);
    const all = ["a1", "a2", "a5"].map((attempt_id) => ({ attempt_id, judge_seat_id: "j1" }));
    expect(judgesWithLines({ panelSeatIds: ["j1"], attempts, scores: all })).toEqual([]);
  });
});

describe("what Publish asks about", () => {
  const words = { spotter: "Spotter still logging", judge: (id: string, n: number) => `${id}: ${n} line${n === 1 ? "" : "s"} to score`, flags: (n: number) => `${n} open flag${n === 1 ? "" : "s"}` };
  it("nothing open: nothing to say", () => {
    expect(openWorkCount(noOpenWork)).toBe(0);
    expect(openWorkParts(noOpenWork, words)).toEqual([]);
  });
  it("the spotter, each judge and the flags, in that order", () => {
    const w = { spotter: true, judges: [{ seatId: "Judge 2", lines: 1 }, { seatId: "Judge 3", lines: 3 }], flags: openFlagsOf([flag("f1", "a1"), flag("f2", "a1")], [attempt("a1", 0)], "h") };
    expect(openWorkCount(w)).toBe(5);
    expect(openWorkParts(w, words)).toEqual(["Spotter still logging", "Judge 2: 1 line to score", "Judge 3: 3 lines to score", "2 open flags"]);
  });
});

describe("a line logged after a judge has submitted", () => {
  const attempts = [attempt("a1", -100), attempt("a2", 50), attempt("a3", 60, 60, { status: "crashed" }), attempt("a4", 70, 70, { deleted_at: at(80) }), attempt("a5", 90)];
  it("the new lines are the landed ones, logged after his Submit, with no score from him", () => {
    expect(newAttemptIds({ attempts, submittedAtMs: T0, scoredIds: new Set(["a5"]) })).toEqual(new Set(["a2"]));
    expect(newAttemptIds({ attempts, submittedAtMs: T0, scoredIds: new Set() })).toEqual(new Set(["a2", "a5"]));
  });
  it("a judge who has not submitted has no new lines (every line is just a line)", () => {
    expect(newAttemptIds({ attempts, submittedAtMs: null, scoredIds: new Set() })).toEqual(new Set());
  });
  it("his sheet counts as reopened when reopened_at is not before submitted_at", () => {
    expect(sheetReopenedByNewAttempt({ submitted_at: at(0), reopened_at: at(10) })).toBe(true);
    expect(sheetReopenedByNewAttempt({ submitted_at: at(10), reopened_at: at(0) })).toBe(false);
    expect(sheetReopenedByNewAttempt({ submitted_at: at(0), reopened_at: null })).toBe(false);
    expect(sheetReopenedByNewAttempt(undefined)).toBe(false);
  });
});
