import { describe, expect, it } from "vitest";
import { publishChecklist } from "./publish-checklist";

// docs/08 §1H-7 (wording changed by the owner in Polish 2, item 1: "<judge>: <what> missing", each line with the place to fix it)
const judgeWord = (id: string) => ({ J1: "Judge 1", J2: "Judge 2", J3: "Judge 3" })[id as "J1"];
const label = (id: string) => ({ red: "Red", blue: "Blue" })[id] ?? id;
const attemptIdOf = (rider: string, seq: number) => `${rider}-${seq}`;
const base = { judgeWord, riderLabel: label, impressionLabel: "Impression / Variety score", unsubmitted: [] as string[], attemptIdOf };

describe("1H-7 what blocks Publish, in words", () => {
  it("a missing Impression score: the judge, the rider, and where to fix it", () => {
    const c = publishChecklist({ ...base, blockers: [{ type: "impression_missing", judge: "J3", rider: "red" }] });
    expect(c.items.map((i) => i.text)).toEqual(["Judge 3: Impression / Variety score for Red missing"]);
    expect(c.items[0]).toMatchObject({ judge: "J3", target: { kind: "impression", seatId: "J3", entryId: "red" } });
    expect(c.canOverride).toBe(true);
  });
  it("a missing trick score opens that judge's cell of that attempt", () => {
    const c = publishChecklist({ ...base, blockers: [{ type: "score_missing", judge: "J3", rider: "red", attemptSeq: 3 }] });
    expect(c.items[0].text).toBe("Judge 3: score for Red, attempt 3 missing");
    expect(c.items[0].target).toEqual({ kind: "score", seatId: "J3", attemptId: "red-3" });
  });
  it("a judge who has not submitted, with nothing missing: 'every score is in', the target is the judge", () => {
    const c = publishChecklist({ ...base, blockers: [], unsubmitted: ["J2"] });
    expect(c.items[0].text).toBe("Judge 2: sheet not submitted — every score is in");
    expect(c.items[0].target).toEqual({ kind: "sheet", seatId: "J2" });
  });
  it("a judge who has not submitted with 3 attempts unscored: the count, and the button goes to the first missing score", () => {
    const c = publishChecklist({
      ...base,
      unsubmitted: ["J2"],
      blockers: [1, 2, 3].map((seq) => ({ type: "score_missing" as const, judge: "J2", rider: "red", attemptSeq: seq })),
    });
    expect(c.items[0].text).toBe("Judge 2: sheet not submitted — 3 attempts unscored");
    expect(c.items[0].target).toEqual({ kind: "score", seatId: "J2", attemptId: "red-1" });
  });
  it("attempts and Impression scores both missing: both counted, one attempt in the singular", () => {
    const c = publishChecklist({
      ...base,
      unsubmitted: ["J1"],
      blockers: [
        { type: "score_missing", judge: "J1", rider: "red", attemptSeq: 2 },
        { type: "impression_missing", judge: "J1", rider: "red" },
        { type: "impression_missing", judge: "J1", rider: "blue" },
      ],
    });
    expect(c.items[0].text).toBe("Judge 1: sheet not submitted — 1 attempt unscored, 2 Impression / Variety scores missing");
  });
  it("an unresolved tie cannot be overridden", () => {
    const c = publishChecklist({ ...base, blockers: [{ type: "tie_unresolved", riders: ["red", "blue"] }] });
    expect(c.items[0].text).toBe("Red and Blue are tied — choose the order");
    expect(c.canOverride).toBe(false);
    expect(c.items[0].kind).toBe("tie");
  });
  it("order: submitted sheets, scores, Impression scores, ties", () => {
    const c = publishChecklist({
      ...base,
      unsubmitted: ["J2"],
      blockers: [
        { type: "tie_unresolved", riders: ["red", "blue"] },
        { type: "impression_missing", judge: "J3", rider: "red" },
        { type: "score_missing", judge: "J3", rider: "red", attemptSeq: 3 },
      ],
    });
    expect(c.items.map((i) => i.kind)).toEqual(["sheet", "score", "impression", "tie"]);
  });
  it("nothing blocks: empty list, publishable", () => {
    const c = publishChecklist({ ...base, blockers: [] });
    expect(c.items).toEqual([]);
    expect(c.canOverride).toBe(true);
  });
  it("without a way to find the attempt, a score line has no target (the words stay)", () => {
    const c = publishChecklist({ ...base, attemptIdOf: undefined, blockers: [{ type: "score_missing", judge: "J3", rider: "red", attemptSeq: 3 }] });
    expect(c.items[0].text).toBe("Judge 3: score for Red, attempt 3 missing");
    expect(c.items[0].target).toBeUndefined();
  });
});
