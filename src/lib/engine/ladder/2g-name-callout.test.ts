import { describe, expect, it } from "vitest";
import { expandFormat } from "./index";
import { loadFormat, makeEntrants } from "./fixtures";

// "Name call-out": the rider's name is the identifier. No lycra colours are assigned, and two riders with the same name in
// one heat are flagged (the spotter could not tell them apart).
describe("name call-out scheme", () => {
  const template = loadFormat("heats4-top2-single-elim");

  it("assigns no lycra colour to any slot", () => {
    const draw = expandFormat(template, makeEntrants(8), { identification: "name-callout" });
    expect(draw.rounds.flatMap((r) => r.heats).flatMap((h) => h.slots).some((s) => s.vestColour !== undefined)).toBe(false);
  });

  it("the default scheme still assigns lycra colours per heat", () => {
    const draw = expandFormat(template, makeEntrants(8));
    expect(draw.rounds[0].heats[0].slots[0].vestColour).toBeDefined();
  });

  it("warns when two riders with the same name land in one heat", () => {
    const entrants = makeEntrants(4, () => ({ name: "Alex Kim" }));
    const draw = expandFormat(template, entrants, { identification: "name-callout" });
    const w = draw.warnings.filter((x) => x.type === "duplicate_identifier");
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].message).toMatch(/same name \(Alex Kim\)/);
  });

  it("different names never clash", () => {
    const draw = expandFormat(template, makeEntrants(8), { identification: "name-callout" });
    expect(draw.warnings.filter((x) => x.type === "duplicate_identifier")).toEqual([]);
  });
});
