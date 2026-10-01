// docs/08 §1G-8 (queue and Repeat badge), §1G-6 (counters and Undo).
import { describe, expect, it } from "vitest";
import { attemptCount, counterFor, undoableAttempt, undoRemainingMs } from "./attempt-state";
import { buildJudgeItems, type LiveAttemptRow } from "./judge-items";
import { queueView } from "./queue-model";
import { startRefusal } from "./start-checks";

const at = (s: number) => new Date(Date.UTC(2026, 9, 1, 10, 0, s)).toISOString();
const row = (seq: number, trick: string, status: "landed" | "crashed", s = seq, entry = "red"): LiveAttemptRow => ({ id: `${entry}${seq}`, entryId: entry, seq, status, trickName: trick, direction: "left", createdAt: at(s), deletedAt: null });
const write = (n: number) => n.toFixed(1);

describe("the judge's queue", () => {
  it("Red lands Left Backroll at attempt 2 (I gave 7.0) and again at attempt 5 → Repeat, 2nd time, you gave 7.0 before", () => {
    const attempts = [row(1, "Left Frontroll", "landed"), row(2, "Left Backroll", "landed"), row(3, "Left Kiteloop", "landed"), row(4, "Left Frontroll", "landed"), row(5, "Left Backroll", "landed")];
    const items = buildJudgeItems(attempts, [{ attemptId: "red2", score: 7.0, missed: false }], write);
    expect(items.find((i) => i.seq === 5)?.repeat).toEqual({ nth: "2nd", previous: "7.0" });
    expect(items.find((i) => i.seq === 2)?.repeat).toBeUndefined();
    expect(items.find((i) => i.seq === 4)?.repeat).toEqual({ nth: "2nd", previous: null });
  });
  it("a crash at attempt 3, then a landing of the same trick at attempt 4 has no badge", () => {
    const items = buildJudgeItems([row(3, "Left Backroll", "crashed"), row(4, "Left Backroll", "landed")], [], write);
    expect(items.find((i) => i.seq === 4)?.repeat).toBeUndefined();
  });
  it("a third landing is the 3rd time", () => {
    const items = buildJudgeItems([row(1, "Left Backroll", "landed"), row(2, "Left Backroll", "landed"), row(3, "Left Backroll", "landed")], [], write);
    expect(items.find((i) => i.seq === 3)?.repeat?.nth).toBe("3rd");
  });
  it("attempts come in the order they were logged, across riders; deleted ones never appear", () => {
    const a = [row(1, "A", "landed", 5, "red"), row(1, "B", "landed", 3, "blue"), { ...row(2, "C", "landed", 9, "red"), deletedAt: at(10) }];
    expect(buildJudgeItems(a, [], write).map((i) => i.id)).toEqual(["blue1", "red1"]);
  });
  it("a crash never needs a score: the queue skips it and the history lists it; a Missed answer counts", () => {
    const items = buildJudgeItems([row(1, "A", "crashed", 1), row(2, "B", "landed", 2), row(3, "C", "landed", 3)], [{ attemptId: "red2", score: null, missed: true }], write);
    const view = queueView(items, null);
    expect(view.current?.id).toBe("red3");
    expect(view.waiting).toBe(0);
    expect(view.history.map((h) => h.id)).toEqual(["red2", "red1"]);
  });
  it("an attempt switched back to Landed joins the queue", () => {
    const before = queueView(buildJudgeItems([row(1, "A", "crashed", 1)], [], write), null);
    expect(before.current).toBeNull();
    const after = queueView(buildJudgeItems([row(1, "A", "landed", 1)], [], write), null);
    expect(after.current?.id).toBe("red1");
  });
});

describe("counters and Undo (docs/08 §1G-6)", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ entryId: "red", deletedAt: null as string | null, id: `a${i}` }));
  it("6 attempts of cap 7 is 6 / 7 and Log is on; 7 is out; a deleted one frees it again", () => {
    expect(counterFor(six, "red", 7)).toEqual({ used: 6, max: 7, out: false });
    const seven = [...six, { entryId: "red", deletedAt: null, id: "a6" }];
    expect(counterFor(seven, "red", 7)).toEqual({ used: 7, max: 7, out: true });
    const freed = seven.map((a, i) => (i === 2 ? { ...a, deletedAt: at(0) } : a));
    expect(counterFor(freed, "red", 7)).toEqual({ used: 6, max: 7, out: false });
    expect(attemptCount(freed, "blue")).toBe(0);
    expect(counterFor(six, "red", null).out).toBe(false);
  });
  it("Undo is open for exactly 10 s of server time", () => {
    const created = at(0);
    expect(undoRemainingMs(created, Date.parse(created) + 9_900)).toBe(100);
    expect(undoRemainingMs(created, Date.parse(created) + 10_100)).toBe(0);
  });
  it("only the creating seat's newest attempt can be undone", () => {
    const list = [
      { id: "a", entryId: "red", createdAt: at(0), createdBySeat: "s1", deletedAt: null },
      { id: "b", entryId: "blue", createdAt: at(2), createdBySeat: "s1", deletedAt: null },
      { id: "c", entryId: "red", createdAt: at(3), createdBySeat: "s2", deletedAt: null },
    ];
    const now = Date.parse(at(5));
    expect(undoableAttempt(list, "s1", now)?.id).toBe("b");
    expect(undoableAttempt(list, "s2", now)?.id).toBe("c");
    expect(undoableAttempt(list, "s3", now)).toBeNull();
    expect(undoableAttempt(list, "s1", Date.parse(at(13)))).toBeNull();
  });
});

describe("start refusals (docs/08 §1G-12)", () => {
  const ok = { drawLocked: true, panelSize: 3, minJudges: 3, unfilledSeats: 0, running: 0, maxRunning: 1 };
  it("is quiet when everything is in place", () => expect(startRefusal(ok)).toBeNull());
  it("refuses in the documented order", () => {
    expect(startRefusal({ ...ok, drawLocked: false, panelSize: 1, unfilledSeats: 2, running: 1 })).toBe("DRAW_NOT_LOCKED");
    expect(startRefusal({ ...ok, panelSize: 2, unfilledSeats: 2, running: 1 })).toBe("PANEL_TOO_SMALL");
    expect(startRefusal({ ...ok, unfilledSeats: 1, running: 1 })).toBe("SEATS_NOT_FILLED");
    expect(startRefusal({ ...ok, running: 1 })).toBe("HEAT_ALREADY_RUNNING");
    expect(startRefusal({ ...ok, running: 1, maxRunning: 2 })).toBeNull();
  });
});
