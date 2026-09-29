// Doc 08 §3D — Pros R1 Heat 2 actually starts at 15:10 instead of 15:08 (Decision 9: actuals come from the heats).
import { describe, expect, it } from "vitest";
import { computeTimetable } from "./timetable";
import { allHeats, at, idOf, opts, patch, plan, row, starts, withActuals } from "./fixtures";

const main = plan("main");
// The first seven heat rows (Women ×4, Advanced ×2, Pros R1 H1) ran exactly to plan.
const upToH1 = () => withActuals(main, 7);

describe("3D actual-start cascade", () => {
  const heats = patch(upToH1(), idOf("p-r1-h2"), { startedAt: at("15:10") });
  const t = computeTimetable(main, heats, opts(at("15:11")));

  it("Heat 3 15:25, Heat 4 15:40, Heat 5 15:57, Heat 6 16:16, Final 16:37", () => {
    expect(t.rows.slice(8).map((r) => [r.itemId, r.start])).toEqual([
      ["p-r1-h3", "15:25"],
      ["p-r1-h4", "15:40"],
      ["p-r2-h5", "15:57"],
      ["p-r2-h6", "16:16"],
      ["p-f", "16:37"],
    ]);
  });

  it("finishes 16:55", () => {
    expect(t.finish).toBe("16:55");
  });

  it("earlier rows are unchanged", () => {
    const plain = computeTimetable(main, allHeats(), opts());
    expect(starts(t).slice(0, 7)).toEqual(starts(plain).slice(0, 7));
  });

  it("the running heat is live with the real start, the finished ones are done", () => {
    expect(row(t, "p-r1-h2")).toMatchObject({ start: "15:10", end: "15:22", status: "live" });
    expect(row(t, "p-r1-h1").status).toBe("done");
    expect(row(t, "p-r1-h3").status).toBe("next");
    expect(row(t, "p-r1-h2").reason).toBe("Started 15:10; ends about 15:22");
  });

  it("ending a heat early (End heat) pulls the rest forward", () => {
    const early = patch(heats, idOf("p-r1-h2"), { endedAt: at("15:18") });
    const t2 = computeTimetable(main, early, opts(at("15:19")));
    expect(row(t2, "p-r1-h2")).toMatchObject({ end: "15:18", status: "done" });
    expect(row(t2, "p-r1-h3").start).toBe("15:21"); // 15:18 + 3 min break
  });

  it("an early start is real too: 15:05 instead of 15:08 pulls everything forward by 3", () => {
    const earlyStart = patch(upToH1(), idOf("p-r1-h2"), { startedAt: at("15:05") });
    const t3 = computeTimetable(main, earlyStart, opts(at("15:06")));
    expect(row(t3, "p-r1-h3").start).toBe("15:20");
    expect(t3.finish).toBe("16:50");
  });

  it("a wrong 'now' before the actual start does not move started heats", () => {
    const t4 = computeTimetable(main, heats, opts(at("15:09")));
    expect(row(t4, "p-r1-h2").start).toBe("15:10");
  });
});
