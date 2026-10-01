import { describe, expect, it } from "vitest";
import { chooseDivision, liveDivisionIds } from "./division-pick";

const divisions = [{ id: "men" }, { id: "women" }, { id: "jun" }];
const heat = (id: string, division_id: string, status: string) => ({ id, division_id, status });
const base = { divisions, heats: [] as ReturnType<typeof heat>[], upcomingDivisionId: null as string | null, stored: null as string | null, canSeeAll: false };

describe("which division the head console shows (docs/PLAN-phase-7a.md step 8e)", () => {
  it("a running heat wins", () => {
    expect(chooseDivision({ ...base, heats: [heat("1", "women", "running")], upcomingDivisionId: "men" })).toBe("women");
  });
  it("a paused heat comes next", () => {
    expect(chooseDivision({ ...base, heats: [heat("1", "jun", "paused"), heat("2", "men", "scheduled")], upcomingDivisionId: "men" })).toBe("jun");
  });
  it("otherwise the division of the next heat on the run order", () => {
    expect(chooseDivision({ ...base, heats: [heat("1", "men", "published")], upcomingDivisionId: "women" })).toBe("women");
  });
  it("otherwise the first division", () => {
    expect(chooseDivision(base)).toBe("men");
  });
  it("a stored choice is kept, even when another division has a heat running (no automatic switching)", () => {
    expect(chooseDivision({ ...base, stored: "men", heats: [heat("1", "women", "running")] })).toBe("men");
  });
  it("a stored choice that no longer exists falls back to the rule", () => {
    expect(chooseDivision({ ...base, stored: "gone", heats: [heat("1", "women", "running")] })).toBe("women");
  });
  it("“All divisions” is only for organisers", () => {
    expect(chooseDivision({ ...base, stored: "all", canSeeAll: true })).toBe("all");
    expect(chooseDivision({ ...base, stored: "all", canSeeAll: false, heats: [heat("1", "women", "running")] })).toBe("women");
  });
  it("no divisions at all: all", () => {
    expect(chooseDivision({ ...base, divisions: [] })).toBe("all");
  });
  it("the live tabs: every division with a running heat", () => {
    expect([...liveDivisionIds([heat("1", "women", "running"), heat("2", "men", "paused"), heat("3", "jun", "scheduled")])]).toEqual(["women"]);
  });
});
