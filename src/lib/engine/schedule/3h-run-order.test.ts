// Phase 4b — building the day's run order with the editing functions gives exactly the docs/08 §3 values.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { aboutHours, addBreak, addHeatToPlan, addHeatsToPlan, addNote, changeHeatLength, duplicatePlan, activate, deletePlan, ladderTime, moveItem, nudgeItem, removeItem, RunOrderError, setBreakAfter, setDuration, setPin, setWarmUp, timetableExportRows, unscheduledHeats, type HeatInfo } from "./run-order";
import { activatePlan } from "./actions";
import { computeTimetable } from "./timetable";
import { allHeats, at, day, opts, plan, row, starts, withActuals } from "./fixtures";

const none = [] as never[];
const empty = (): SchedulePlan => ({ id: "x", name: "X", active: true, items: [], anchors: {}, actualStarts: {} });

/** Rebuild a preset plan only with the editing functions (heat by heat, then lengths, breaks and pins). */
function rebuild(source: SchedulePlan): SchedulePlan {
  let p = empty();
  for (const item of source.items) p = addHeatToPlan(p, (item as { heatId: string }).heatId);
  for (const item of source.items) {
    const id = p.items.find((i) => i.kind === "heat" && i.heatId === (item as { heatId: string }).heatId)!.id;
    const src = item as { durationMin?: number; breakAfterMin?: number };
    if (src.durationMin !== undefined) p = setDuration(p, id, src.durationMin, none);
    if (src.breakAfterMin !== undefined) p = setBreakAfter(p, id, src.breakAfterMin, none);
    const pin = source.anchors[item.id];
    if (pin) p = setPin(p, id, pin, none);
  }
  return p;
}

describe("the run order built by hand equals the docs/08 §3 timetables", () => {
  it("3A: the main plan, pins 10:30 and 14:00, finish 16:53", () => {
    const built = rebuild(plan("main"));
    const t = computeTimetable(built, allHeats(), opts());
    expect(starts(t)).toEqual(["10:30", "10:42", "10:56", "11:10", "14:00", "14:20", "14:53", "15:08", "15:23", "15:38", "15:55", "16:14", "16:35"]);
    expect(t.finish).toBe("16:53");
  });

  it("3B: Bad wind finishes 12:20 and 3C: Good wind finishes 13:33", () => {
    expect(computeTimetable(rebuild(plan("plan-a-bad-wind")), allHeats(), opts()).finish).toBe("12:20");
    expect(computeTimetable(rebuild(plan("plan-a-good-wind")), allHeats(), opts()).finish).toBe("13:33");
  });

  it("header: projected finish and heats left; heats left falls as heats finish", () => {
    const heats = withActuals(plan("main"), 4);
    const t = computeTimetable(plan("main"), heats, opts(at("11:30")));
    expect(t.heatsLeft).toBe(9);
    expect(computeTimetable(plan("main"), allHeats(), opts()).heatsLeft).toBe(13);
  });
});

describe("editing rows", () => {
  const heats: HeatInfo[] = ["Pro Men|R1|Heat 1", "Pro Men|R1|Heat 2", "Pro Men|R2|Heat 3", "Women|R1|Heat 1", "Women|F|Final"].map((id, i) => {
    const [division, round, heat] = id.split("|");
    return { heatId: id, division, round, roundOrder: round === "R1" ? 1 : round === "R2" ? 2 : 3, heat, number: i + 1, durationMin: 10, warmUpMin: 5 };
  });

  it("the left list groups unscheduled heats by division and round, and shrinks as heats are added", () => {
    const groups = unscheduledHeats(heats, empty());
    expect(groups.map((g) => [g.division, g.round, g.heats.length])).toEqual([["Pro Men", "R1", 2], ["Pro Men", "R2", 1], ["Women", "R1", 1], ["Women", "F", 1]]);
    const p = addHeatsToPlan(empty(), ["Pro Men|R1|Heat 1", "Pro Men|R1|Heat 2"]);
    expect(unscheduledHeats(heats, p).map((g) => [g.division, g.round, g.heats.length])).toEqual([["Pro Men", "R2", 1], ["Women", "R1", 1], ["Women", "F", 1]]);
  });

  it("a heat can be in the run order only once", () => {
    const p = addHeatToPlan(empty(), "a");
    expect(() => addHeatToPlan(p, "a")).toThrow(RunOrderError);
    expect(addHeatsToPlan(p, ["a", "b"]).items).toHaveLength(2);
  });

  it("insert a break and a note at a position; a break needs a name and a length", () => {
    let p = addHeatsToPlan(empty(), ["a", "b", "c"]);
    p = addBreak(p, { label: "Lunch", durationMin: 30 }, 1);
    p = addNote(p, "Wind call 09:00", 0);
    expect(p.items.map((i) => (i.kind === "heat" ? i.heatId : i.label))).toEqual(["Wind call 09:00", "a", "Lunch", "b", "c"]);
    expect(() => addBreak(p, { label: " ", durationMin: 10 })).toThrow(/name/);
    expect(() => addBreak(p, { label: "Lunch", durationMin: 0 })).toThrow(/length/);
  });

  it("move up / down is the tap alternative to dragging; the ends stay put", () => {
    const p = addHeatsToPlan(empty(), ["a", "b", "c"]);
    const ids = p.items.map((i) => i.id);
    const down = nudgeItem(p, ids[0], 1, none);
    expect(down.items.map((i) => (i.kind === "heat" ? i.heatId : ""))).toEqual(["b", "a", "c"]);
    expect(nudgeItem(p, ids[0], -1, none)).toBe(p);
    expect(nudgeItem(p, ids[2], 1, none)).toBe(p);
    expect(moveItem(p, ids[2], 0, none).items.map((i) => (i.kind === "heat" ? i.heatId : ""))).toEqual(["c", "a", "b"]);
  });

  it("removing a row also removes its pin", () => {
    let p = addHeatsToPlan(empty(), ["a", "b"]);
    p = setPin(p, p.items[1].id, "10:00", none);
    p = removeItem(p, p.items[1].id, none);
    expect(p.anchors).toEqual({});
  });

  it("a start time is HH:MM; a pin can be removed; lengths and breaks are validated", () => {
    let p = addHeatsToPlan(empty(), ["a"]);
    const id = p.items[0].id;
    expect(() => setPin(p, id, "25:00", none)).toThrow(/10:30/);
    p = setPin(p, id, "09:05", none);
    expect(p.anchors[id]).toBe("09:05");
    expect(setPin(p, id, null, none).anchors).toEqual({});
    expect(() => setDuration(p, id, 0, none)).toThrow(/minute/);
    expect(() => setBreakAfter(p, id, -1, none)).toThrow(/negative/);
    expect(setWarmUp(p, id, 5, none).items[0]).toMatchObject({ warmUpMin: 5 });
    expect(setWarmUp(setWarmUp(p, id, 5, none), id, null, none).items[0]).not.toHaveProperty("warmUpMin");
  });

  it("heats that have started or finished never move, change or get pinned", () => {
    const p = addHeatsToPlan(empty(), ["a", "b"]);
    const live = [{ heatId: "a", startedAt: at("10:00") }];
    const a = p.items[0].id;
    for (const f of [() => moveItem(p, a, 1, live), () => removeItem(p, a, live), () => setPin(p, a, "11:00", live), () => setDuration(p, a, 12, live), () => setWarmUp(p, a, 1, live), () => changeHeatLength(p, "a", 12, live)]) {
      expect(f).toThrow(/already started/);
    }
    expect(changeHeatLength(p, "b", 12, live).items[1]).toMatchObject({ durationMin: 12 });
  });

  it("changing one heat's length moves everything after it, nothing before it", () => {
    const base = computeTimetable(plan("main"), allHeats(), opts());
    const changed = computeTimetable(changeHeatLength(plan("main"), "Pros|Round 1|Heat 1", 15, none), allHeats(), opts());
    expect(row(changed, "p-r1-h1")).toMatchObject({ start: "14:53", end: "15:08" });
    expect(row(changed, "p-r1-h2").start).toBe("15:11");
    expect(row(changed, "a-f").start).toBe(row(base, "a-f").start);
  });

  it("an explicit break between two heats replaces the automatic break (Decision 12)", () => {
    let p = addHeatsToPlan(empty(), ["a", "b"]);
    p = setPin(p, p.items[0].id, "10:00", none);
    const hs = [
      { heatId: "a", division: "D", round: "R1", heat: "H1", durationMin: 10, breakAfterHeatMin: 3, roundLast: false },
      { heatId: "b", division: "D", round: "R1", heat: "H2", durationMin: 10, breakAfterHeatMin: 3, roundLast: true },
    ];
    const o = opts();
    expect(computeTimetable(p, hs, o).rows[1].start).toBe("10:13");
    p = addBreak(p, { label: "Briefing", durationMin: 20 }, 1);
    const t = computeTimetable(p, hs, o);
    expect(t.rows.map((r) => [r.label === "Briefing" ? "Briefing" : r.heat, r.start, r.end])).toEqual([["H1", "10:00", "10:10"], ["Briefing", "10:10", "10:30"], ["H2", "10:30", "10:40"]]);
  });
});

describe("plans: duplicate, activate, switch mid-day", () => {
  it("Duplicate plan: same rows, pins and lengths under a new name, inactive, nothing started", () => {
    const plans = duplicatePlan(day.plans, "main", "Plan B – Bad wind");
    const copy = plans[plans.length - 1];
    expect(copy).toMatchObject({ name: "Plan B – Bad wind", active: false, id: "plan-b-bad-wind" });
    expect(copy.items).toEqual(plan("main").items);
    expect(copy.anchors).toEqual(plan("main").anchors);
    expect(copy.actualStarts).toEqual({});
  });

  it("a plan needs a name, and the name must be new", () => {
    expect(() => duplicatePlan(day.plans, "main", "  ")).toThrow(/Name/);
    expect(() => duplicatePlan(day.plans, "main", "day 2 – main plan")).toThrow(/already/);
  });

  it("Activate: exactly one plan of the day is active; the active one cannot be deleted", () => {
    const plans = activate(day.plans, "plan-a-bad-wind");
    expect(plans.filter((p) => p.active).map((p) => p.id)).toEqual(["plan-a-bad-wind"]);
    expect(() => deletePlan(plans, "plan-a-bad-wind")).toThrow(/active/);
    expect(deletePlan(plans, "main").map((p) => p.id)).not.toContain("main");
  });

  it("switching plans mid-day: finished heats stay where they ran, pins stay with their own plan", () => {
    const womenDone = withActuals(plan("main"), 4);
    const switched = activatePlan(day, "plan-a-bad-wind").plans.find((p) => p.active)!;
    const t = computeTimetable(switched, womenDone, opts(at("11:30")));
    expect(t.rows.slice(0, 4).map((r) => [r.itemId, r.start, r.status])).toEqual([["w-r1-h1", "10:30", "done"], ["w-r1-h2", "10:42", "done"], ["w-r2-h3", "10:56", "done"], ["w-f", "11:10", "done"]]);
    expect(t.rows.filter((r) => r.status !== "done").every((r) => r.start! >= "11:30")).toBe(true);
  });
});

describe("numbers for the header, the preview and the exports", () => {
  it("15 heats of 5 + 10 min with 2-minute breaks: 253 minutes, about 4 h", () => {
    const r = ladderTime(Array.from({ length: 15 }, () => ({ warmUpMin: 5, durationMin: 10, breakAfterMin: 2 })));
    expect(r).toEqual({ heats: 15, totalMin: 253, breaksMin: 28 });
    expect(aboutHours(r.totalMin)).toBe("4 h");
  });

  it("about … h rounds to the nearest half hour", () => {
    expect(aboutHours(100)).toBe("1.5 h");
    expect(aboutHours(253)).toBe("4 h");
    expect(aboutHours(280)).toBe("4.5 h");
    expect(aboutHours(10)).toBe("0.5 h");
  });

  it("export rows: Division / Session / Start / Duration / End / Break, as the spreadsheet", () => {
    const t = computeTimetable(plan("main"), allHeats(), opts());
    const { showWarmUp, rows } = timetableExportRows(t);
    expect(showWarmUp).toBe(false);
    expect(rows[0]).toMatchObject({ division: "Women", session: "Round 1 · Heat 1", start: "10:30", duration: "9", end: "10:39", break: "3" });
    expect(rows[12]).toMatchObject({ division: "Pros", start: "16:35", end: "16:53", break: "" });
  });

  it("the Warm-up column appears only when some heat has a warm-up", () => {
    const hs = [{ heatId: "a", division: "D", round: "R1", heat: "H1", durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 2 }];
    const p = setPin(addHeatToPlan(empty(), "a"), "r1", "10:00", none);
    const { showWarmUp, rows } = timetableExportRows(computeTimetable(p, hs, opts()));
    expect(showWarmUp).toBe(true);
    expect(rows[0]).toMatchObject({ warmUp: "09:55", start: "10:00", end: "10:10" });
  });
});

describe("the format preview's time sentence", () => {
  it("15 heats of 5 + 10 min with 2-minute breaks: '15 heats · 5 + 10 min · about 4 h with 2-minute breaks'", async () => {
    const { timeText } = await import("@/lib/format-ui/preview");
    const heats = Array.from({ length: 15 }, (_, i) => ({ warmUpMin: 5, durationMin: 10, breakAfterHeatMin: 2, breakAfterRoundMin: 2, roundLast: i === 14 }));
    expect(timeText(heats)).toBe("15 heats · 5 + 10 min · about 4 h with 2-minute breaks");
  });
  it("without warm-up nothing is added; different lengths show a range", async () => {
    const { timeText } = await import("@/lib/format-ui/preview");
    expect(timeText([{ durationMin: 10, breakAfterHeatMin: 3, breakAfterRoundMin: 5, roundLast: false }, { durationMin: 15, breakAfterHeatMin: 3, breakAfterRoundMin: 5, roundLast: true }])).toBe("2 heats · 10–15 min · about 0.5 h with 3-minute breaks");
  });
});
