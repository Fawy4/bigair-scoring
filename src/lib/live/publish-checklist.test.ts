import { describe, expect, it } from "vitest";
import { publishChecklist } from "./publish-checklist";

// docs/08 §1H-7
const judgeWord = (id: string) => ({ J1: "Judge 1", J2: "Judge 2", J3: "Judge 3" })[id as "J1"];
const label = (id: string) => ({ red: "Red", blue: "Blue" })[id] ?? id;
const base = { judgeWord, riderLabel: label, impressionLabel: "Impression / Variety score", unsubmitted: [] as string[] };

describe("1H-7 what blocks Publish, in words", () => {
  it("a missing Impression score", () => {
    const c = publishChecklist({ ...base, blockers: [{ type: "impression_missing", judge: "J3", rider: "red" }] });
    expect(c.items.map((i) => i.text)).toEqual(["Judge 3 has no Impression / Variety score for Red"]);
    expect(c.canOverride).toBe(true);
  });
  it("a missing trick score", () => {
    const c = publishChecklist({ ...base, blockers: [{ type: "score_missing", judge: "J3", rider: "red", attemptSeq: 3 }] });
    expect(c.items[0].text).toBe("Judge 3 has no score for Red, attempt 3");
  });
  it("a judge who has not submitted", () => {
    expect(publishChecklist({ ...base, blockers: [], unsubmitted: ["J2"] }).items[0].text).toBe("Judge 2 has not submitted");
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
});
