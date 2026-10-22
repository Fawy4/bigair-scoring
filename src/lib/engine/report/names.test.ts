import { describe, expect, it } from "vitest";
import { buildRiderReport } from "./build";
import { scenario } from "./scenario";
import type { RiderReport } from "./types";

const rep = (id: string, ctx = scenario()): RiderReport => {
  const r = buildRiderReport(ctx, id);
  if (r.status !== "ok") throw new Error("no report");
  return r;
};

describe("report: names come from the event, never written out (item 3)", () => {
  it("an event with 'Impression' and In / Out: the report carries exactly those words", () => {
    const r = rep("a");
    expect(r.scoreName).toBe("Impression");
    expect(r.sideWords).toEqual({ left: "In", right: "Out" });
  });
  it("another event with 'Variety' and Left / Right: the words change, nothing else has to", () => {
    const c = scenario();
    c.impressionName = "Variety";
    c.sideWords = { left: "Left", right: "Right" };
    const r = rep("a", c);
    expect(r.scoreName).toBe("Variety");
    expect(r.sideWords).toEqual({ left: "Left", right: "Right" });
  });
  it("the division's own name is used when the event gives none", () => {
    const c = scenario();
    c.impressionName = "";
    c.divisionRules.div.impressionName = "Flow";
    expect(rep("a", c).scoreName).toBe("Flow");
  });
  it("the report holds no sentence: only numbers, codes and the trick names as logged, so the words of the page can never disagree with the event", () => {
    const text = JSON.stringify(rep("a"));
    for (const word of ["Variety", "Left", "Right", "Impression score"]) expect(text).not.toContain(word);
  });
});

describe("report: goals for next time (item 4i)", () => {
  it("two or three goals taken from the takeaways, the thing to train first", () => {
    const g = rep("a").goals;
    expect(g.length).toBeGreaterThanOrEqual(2);
    expect(g.length).toBeLessThanOrEqual(3);
    expect(g[0]).toMatchObject({ from: "train", code: "repeat_same_side", trick: "Kiteloop" });
    expect(g[1]).toMatchObject({ from: "strategy", code: "unused_attempts" });
  });
  it("a rider with nothing to train gets his strategy point and a strength to keep", () => {
    const g = rep("d").goals;
    expect(g.map((x) => x.from)).toEqual(["strategy", "strength"]);
  });
});

describe("report: nothing private can be in it (item 2)", () => {
  it("no key of the report names a judge, a hint, a pending row or a contact", () => {
    const text = JSON.stringify(rep("a"));
    for (const word of ["judge", "J1", "Ref", "pending", "email", "phone", "dob", "missed", "outlier"]) expect(text.toLowerCase()).not.toContain(word.toLowerCase());
  });
});
