// Doc 08 §3A — main plan, anchors Women H1 = 10:30 and Advanced R2 H4 = 14:00 (Africa/Cairo); Decisions 8, 12.
import { describe, expect, it } from "vitest";
import { computeTimetable } from "./timetable";
import { allHeats, at, opts, plan, row, starts } from "./fixtures";
import type { SchedulePlan } from "@/lib/schemas/schedule";

const main = () => computeTimetable(plan("main"), allHeats(), opts());

describe("3A main plan", () => {
  it("start / duration / end / break after, for all 13 rows", () => {
    const t = main();
    expect(t.rows.map((r) => [r.itemId, r.start, r.durationMin, r.end, r.breakAfterMin])).toEqual([
      ["w-r1-h1", "10:30", 9, "10:39", 3],
      ["w-r1-h2", "10:42", 9, "10:51", 5],
      ["w-r2-h3", "10:56", 9, "11:05", 5],
      ["w-f", "11:10", 15, "11:25", 15],
      ["a-r2-h4", "14:00", 15, "14:15", 5],
      ["a-f", "14:20", 18, "14:38", 15],
      ["p-r1-h1", "14:53", 12, "15:05", 3],
      ["p-r1-h2", "15:08", 12, "15:20", 3],
      ["p-r1-h3", "15:23", 12, "15:35", 3],
      ["p-r1-h4", "15:38", 12, "15:50", 5],
      ["p-r2-h5", "15:55", 16, "16:11", 3],
      ["p-r2-h6", "16:14", 16, "16:30", 5],
      ["p-f", "16:35", 18, "16:53", null],
    ]);
  });

  it("projected finish 16:53 (the last row's break is shown as —)", () => {
    const t = main();
    expect(t.finish).toBe("16:53");
    expect(t.finish).toBe(plan("main").expectedFinish);
    expect(t.finishUtc).toBe(at("16:53"));
    expect(t.rows.at(-1)!.breakAfterMin).toBeNull();
  });

  it("rows before 14:00 are unaffected by the second anchor", () => {
    const without: SchedulePlan = { ...plan("main"), anchors: { "w-r1-h1": "10:30" } };
    const a = computeTimetable(without, allHeats(), opts()).rows.slice(0, 5);
    // Without the 14:00 pin, Advanced simply follows Women (11:25 + 15).
    expect(a.map((r) => r.start)).toEqual(["10:30", "10:42", "10:56", "11:10", "11:40"]);
    expect(starts(main()).slice(0, 4)).toEqual(["10:30", "10:42", "10:56", "11:10"]);
  });

  it("marks pins and the next heat; the rest are estimates", () => {
    const t = main();
    expect(row(t, "w-r1-h1")).toMatchObject({ pinned: true, status: "next" });
    expect(row(t, "a-r2-h4")).toMatchObject({ pinned: true, status: "pinned" });
    expect(row(t, "p-r1-h3")).toMatchObject({ pinned: false, status: "est" });
  });

  it("gives the ready call 15 minutes before the start, in UTC and local", () => {
    const r = row(main(), "p-r1-h3");
    expect(r.readyCall).toBe("15:08");
    expect(r.startUtc).toBe(at("15:23"));
    expect(r.readyCallUtc).toBe(at("15:08"));
  });

  it("explains every start in plain words", () => {
    const t = main();
    expect(row(t, "w-r1-h1").reason).toBe("Pinned at 10:30");
    expect(row(t, "w-r1-h2").reason).toBe("Previous ends 10:39 + 3 min break");
    expect(row(t, "a-r2-h4").reason).toBe("Pinned at 14:00 (previous ends 11:25 + 15 min break)");
  });

  it("stores UTC instants: 10:30 Cairo in October is 07:30Z", () => {
    expect(row(main(), "w-r1-h1").startUtc).toBe("2026-10-03T07:30:00.000Z");
  });
});

describe("3A pins mean 'not before' (Decision 8)", () => {
  it("a pin the previous heat cannot reach is pushed, with a warning", () => {
    const early: SchedulePlan = { ...plan("main"), anchors: { ...plan("main").anchors, "a-r2-h4": "11:30" } };
    const t = computeTimetable(early, allHeats(), opts());
    const r = row(t, "a-r2-h4");
    expect(r.start).toBe("11:40"); // Women final 11:25 + 15 min break
    expect(r.status).toBe("est");
    expect(r.pinned).toBe(true);
    expect(r.warnings).toEqual(["Pinned for 11:30 but the previous heat finishes later, so it starts at 11:40."]);
    expect(t.warnings).toHaveLength(1);
    expect(t.finish).toBe("14:33"); // 16:53 − (14:00 − 11:40)
  });
});

describe("3A break items and notes (Decision 12)", () => {
  const withLunch = (extra: Partial<SchedulePlan> = {}): SchedulePlan => {
    const p = plan("plan-a-bad-wind");
    const items = [...p.items];
    items.splice(6, 0, { id: "lunch", kind: "break", label: "Lunch", durationMin: 60 }); // after Pros R1 H4
    return { ...p, items, ...extra };
  };

  it("an explicit break replaces the previous heat's automatic break instead of adding to it", () => {
    const t = computeTimetable(withLunch(), allHeats(), opts());
    expect(row(t, "p-r1-h4").end).toBe("11:20");
    expect(row(t, "lunch")).toMatchObject({ kind: "break", start: "11:20", end: "12:20", label: "Lunch" });
    expect(row(t, "w-r1-h1").start).toBe("12:20"); // not 12:25
    expect(t.finish).toBe("13:15"); // the plain plan finishes 12:20 → +55 min (60 lunch − 5 break)
  });

  it("a pinned break waits for its pin", () => {
    const p = withLunch();
    const t = computeTimetable({ ...p, anchors: { ...p.anchors, lunch: "12:00" } }, allHeats(), opts());
    expect(row(t, "lunch")).toMatchObject({ start: "12:00", end: "13:00", status: "pinned" });
    expect(row(t, "w-r1-h1").start).toBe("13:00");
  });

  it("a note takes no time and does not move anything", () => {
    const p = plan("plan-a-bad-wind");
    const plain = computeTimetable(p, allHeats(), opts());
    const noted = computeTimetable(
      { ...p, items: [{ id: "wind-call", kind: "note", label: "Wind call 09:00" }, ...p.items], anchors: { ...p.anchors, "wind-call": "09:00" } },
      allHeats(),
      opts(),
    );
    expect(row(noted, "wind-call")).toMatchObject({ kind: "note", start: "09:00", end: "09:00", durationMin: 0 });
    expect(noted.rows.filter((r) => r.kind === "heat").map((r) => r.start)).toEqual(plain.rows.map((r) => r.start));
    expect(noted.finish).toBe(plain.finish);
  });
});

describe("3A input checks", () => {
  it("refuses an unresolved heatRef", () => {
    const p = JSON.parse(JSON.stringify(plan("main")));
    delete p.items[0].heatId;
    expect(() => computeTimetable(p, allHeats(), opts())).toThrow(/no heatId/);
  });

  it("refuses a heat with no duration anywhere", () => {
    const p = JSON.parse(JSON.stringify(plan("main")));
    delete p.items[0].durationMin;
    expect(() => computeTimetable(p, allHeats(), opts())).toThrow(/no duration/);
  });

  it("uses the round's duration and breaks when the run item has none", () => {
    const p = JSON.parse(JSON.stringify(plan("main")));
    for (const i of p.items) {
      delete i.durationMin;
      delete i.breakAfterMin;
    }
    const heats = allHeats().map((h) => ({ ...h, durationMin: 10, breakAfterHeatMin: 2, breakAfterRoundMin: 6 }));
    const t = computeTimetable(p, heats, opts());
    expect(starts(t).slice(0, 5)).toEqual(["10:30", "10:42", "10:54", "11:06", "14:00"]); // Final (round last) uses 6 min
    expect(row(t, "w-f").breakAfterMin).toBe(6);
    expect(row(t, "w-r1-h1").breakAfterMin).toBe(2);
  });

  it("does not need a clock: the same inputs always give the same rows", () => {
    expect(JSON.stringify(main())).toBe(JSON.stringify(main()));
  });

  it("an un-anchored first item has no time and says so", () => {
    const p = { ...plan("main"), anchors: {} };
    const t = computeTimetable(p, allHeats(), opts());
    expect(t.rows[0]).toMatchObject({ start: null, end: null });
    expect(t.rows[0].warnings[0]).toMatch(/pin the first item/);
    expect(t.finish).toBeNull();
  });
});
