import { describe, expect, it } from "vitest";
import { checklistFromLog, isFinalHeat, pickCapRider, pickDnsRider, pickTieRiders, SCENARIO_KEYS, SCENARIOS, type LogRow, type RiderNow } from "./scenarios";

const at = (n: number) => `2026-10-16T10:0${n}:00Z`;
const row = (scenario: string | null, kind: LogRow["kind"], n: number, text = "x", run = 1): LogRow => ({ scenario, kind, at: at(n), text, runNo: run });
const rider = (entryId: string, used: number, riding = true, position = 1): RiderNow => ({ entryId, used, riding, position });

describe("the scenario list", () => {
  it("is the twelve scenarios (the eleven of the brief and Abort the start), each once", () => {
    expect(SCENARIO_KEYS.length).toBe(12);
    expect(new Set(SCENARIO_KEYS).size).toBe(12);
    expect(SCENARIO_KEYS).toEqual(expect.arrayContaining(["wind_hold", "dns", "duplicate", "judge_dies", "tie", "past_cap", "reopen", "plan_b", "out_of_attempts", "hold_final", "rerun", "abort_start"]));
  });
  it("says which need a heat that is running", () => {
    expect(SCENARIOS.plan_b.needsRunningHeat).toBe(false);
    expect(SCENARIOS.reopen.needsRunningHeat).toBe(false);
    for (const k of ["dns", "duplicate", "judge_dies", "past_cap", "out_of_attempts", "rerun"] as const) expect(SCENARIOS[k].needsRunningHeat).toBe(true);
  });
  it("a tie must be set before riders have ridden", () => expect(SCENARIOS.tie.needsFreshHeat).toBe(true));
});

describe("the checklist", () => {
  it("lists every scenario, ticked when it has been exercised", () => {
    const rows = checklistFromLog([row("dns", "scenario", 1, "Rider Red did not show up"), row("tie", "scenario_failed", 2, "no heat")]);
    expect(rows.length).toBe(12);
    expect(rows.find((r) => r.key === "dns")).toMatchObject({ done: true, count: 1, lastText: "Rider Red did not show up" });
    expect(rows.find((r) => r.key === "tie")).toMatchObject({ done: false, count: 0, failedText: "no heat" });
    expect(rows.find((r) => r.key === "rerun")).toMatchObject({ done: false, count: 0 });
  });
  it("keeps the ticks after a reset (it is the record of what was tried), counts every run, shows the latest line", () => {
    const rows = checklistFromLog([row("dns", "scenario", 1, "first", 1), row("dns", "scenario", 5, "second", 2)]);
    expect(rows.find((r) => r.key === "dns")).toMatchObject({ done: true, count: 2, lastText: "second", lastAt: at(5) });
  });
  it("a failure after a success does not take the tick away", () => {
    const rows = checklistFromLog([row("dns", "scenario", 1), row("dns", "scenario_failed", 2, "later failure")]);
    expect(rows.find((r) => r.key === "dns")?.done).toBe(true);
  });
  it("ignores other lines and unknown scenarios", () => {
    const rows = checklistFromLog([row(null, "info", 1), row("nonsense", "scenario", 2), row("dns", "heat", 3)]);
    expect(rows.every((r) => !r.done)).toBe(true);
  });
});

describe("choosing riders for a scenario", () => {
  it("DNS: the rider with the fewest attempts who is riding", () => {
    expect(pickDnsRider([rider("a", 3), rider("b", 1), rider("c", 0, false), rider("d", 2)])).toBe("b");
    expect(pickDnsRider([rider("a", 3, false)])).toBeNull();
  });
  it("tie: two riders who have not ridden yet, in seat order", () => {
    expect(pickTieRiders([rider("a", 0, true, 1), rider("b", 0, true, 2), rider("c", 0, true, 3)])).toEqual(["a", "b"]);
    expect(pickTieRiders([rider("a", 2, true, 1), rider("b", 0, true, 2), rider("c", 0, true, 3)])).toEqual(["b", "c"]);
  });
  it("tie: refused when fewer than two riders are fresh", () => {
    expect(pickTieRiders([rider("a", 1, true, 1), rider("b", 0, true, 2)])).toBeNull();
    expect(pickTieRiders([rider("a", 0, false, 1), rider("b", 0, true, 2)])).toBeNull();
  });
  it("cap: a rider already at the cap, else the one closest to it", () => {
    expect(pickCapRider([rider("a", 3), rider("b", 7), rider("c", 5)], 7)).toEqual({ entryId: "b", atCap: true });
    expect(pickCapRider([rider("a", 3), rider("c", 5)], 7)).toEqual({ entryId: "c", atCap: false });
  });
  it("cap: nothing when the division has no cap or nobody is riding", () => {
    expect(pickCapRider([rider("a", 3)], null)).toBeNull();
    expect(pickCapRider([rider("a", 3, false)], 7)).toBeNull();
  });
});

describe("which heat is the final", () => {
  const rounds = [
    { id: "r1", sort: 1 },
    { id: "r2", sort: 2 },
    { id: "r3", sort: 3 },
  ];
  it("the last heat of the last round", () => {
    const heats = [
      { id: "h1", roundId: "r1", number: 1 },
      { id: "h2", roundId: "r3", number: 5 },
      { id: "h3", roundId: "r3", number: 6 },
    ];
    expect(isFinalHeat("h3", heats, rounds)).toBe(true);
    expect(isFinalHeat("h2", heats, rounds)).toBe(false);
    expect(isFinalHeat("h1", heats, rounds)).toBe(false);
  });
});
