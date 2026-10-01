import { describe, expect, it } from "vitest";
import { queueView, type QueueItem } from "./queue-model";

// The judge's scoring queue (owner, round 3): each attempt the spotter logs is the next card; one tap scores it and the next unscored attempt comes in;
// the rest wait behind ("2 waiting"); a scored card drops into a thin history row, and a tap on it corrects it.
const item = (id: number, over: Partial<QueueItem> = {}): QueueItem => ({ id, status: "landed", score: null, ...over });
const attempts = [item(1, { score: 7.6 }), item(2, { score: 8.2 }), item(3, { status: "crashed" }), item(4), item(5), item(6)];

describe("the queue", () => {
  it("the current card is the first unscored landed attempt; the others wait", () => {
    const v = queueView(attempts, null);
    expect(v.current?.id).toBe(4);
    expect(v.waiting).toBe(2);
    expect(v.waitingIds).toEqual([5, 6]);
  });
  it("scored and crashed attempts form the history, newest first", () => {
    expect(queueView(attempts, null).history.map((h) => h.id)).toEqual([3, 2, 1]);
  });
  it("a crashed attempt never needs a score, so it never becomes the current card", () => {
    expect(queueView([item(1, { status: "crashed" }), item(2)], null).current?.id).toBe(2);
  });
  it("Missed counts as an answer", () => {
    const v = queueView([item(1, { score: "missed" }), item(2)], null);
    expect(v.current?.id).toBe(2);
    expect(v.history.map((h) => h.id)).toEqual([1]);
  });
  it("scoring the current card brings the next one in and the waiting count drops", () => {
    const after = attempts.map((a) => (a.id === 4 ? { ...a, score: 7.0 } : a));
    const v = queueView(after, null);
    expect(v.current?.id).toBe(5);
    expect(v.waiting).toBe(1);
    expect(v.history[0].id).toBe(4);
  });
  it("tapping a history row corrects it: it becomes the current card and nothing else is lost from the queue", () => {
    const v = queueView(attempts, 2);
    expect(v.current?.id).toBe(2);
    expect(v.correcting).toBe(true);
    expect(v.waiting).toBe(3);
    expect(v.history.map((h) => h.id)).toEqual([3, 1]);
  });
  it("when everything is scored there is no current card", () => {
    const v = queueView([item(1, { score: 7 }), item(2, { score: 6 })], null);
    expect(v.current).toBeNull();
    expect(v.waiting).toBe(0);
  });
  it("a crashed attempt cannot be opened for correction (the judge flags it instead)", () => {
    expect(queueView(attempts, 3).current?.id).toBe(4);
  });
  it("an empty heat is calm", () => {
    expect(queueView([], null)).toMatchObject({ current: null, waiting: 0, history: [] });
  });
});

describe("an attempt picked from a rider's sheet", () => {
  const items = [
    { id: "a", status: "landed" as const, score: null },
    { id: "b", status: "landed" as const, score: null },
    { id: "c", status: "landed" as const, score: 7 },
  ];
  it("an unscored one jumps the queue without being called a correction", () => {
    const v = queueView(items, "b");
    expect(v.current?.id).toBe("b");
    expect(v.correcting).toBe(false);
    expect(v.waitingIds).toEqual(["a"]);
  });
  it("a scored one comes back as a correction", () => {
    const v = queueView(items, "c");
    expect(v.current?.id).toBe("c");
    expect(v.correcting).toBe(true);
  });
});
