import { describe, expect, it } from "vitest";
import { handPinsAfter, planActuals } from "./hand-pins";

describe("which pins are hand-set", () => {
  it("an organiser save marks the pins that are new or changed, and keeps the ones already marked", () => {
    const before = { anchors: { i1: "10:00", b1: "12:00" }, hand_pins: ["i1", "b1"] };
    expect(handPinsAfter(before, { i1: "10:00", b1: "12:00", i3: "13:00" }).sort()).toEqual(["b1", "i1", "i3"]);
    expect(handPinsAfter(before, { i1: "10:15", b1: "12:00" }).sort()).toEqual(["b1", "i1"]);
  });
  it("a pin that is removed leaves the list; a pin the console wrote (not in the list) stays out when the organiser saves something else", () => {
    const before = { anchors: { i1: "10:00", i2: "10:41" }, hand_pins: ["i1"] }; // i2: written by Shift
    expect(handPinsAfter(before, { i1: "10:00", i2: "10:41" })).toEqual(["i1"]);
    expect(handPinsAfter(before, { i2: "10:41" })).toEqual([]);
  });
  it("the first organiser save of an older plan (no list) marks every pin it has", () => {
    expect(handPinsAfter({ anchors: { i1: "10:00", i2: "10:41" }, hand_pins: null }, { i1: "10:00", i2: "10:41" }).sort()).toEqual(["i1", "i2"]);
  });
});

describe("what Clear actual times does to a plan", () => {
  it("clears the actual starts and only the pins the console wrote; hand-set pins stay", () => {
    expect(planActuals({ anchors: { i1: "10:00", b1: "12:00", i2: "10:41", i3: "11:07" }, actual_starts: { b1: "2026-11-01T10:00:00Z" }, hand_pins: ["i1", "b1"] })).toEqual({ actualStarts: 1, pinsCleared: 2, pinsKept: 2, known: true, keptTimes: ["10:00", "12:00"] });
  });
  it("a plan made before pins were marked keeps every pin and says it cannot tell", () => {
    expect(planActuals({ anchors: { i1: "10:00", i2: "10:41" }, actual_starts: {}, hand_pins: null })).toEqual({ actualStarts: 0, pinsCleared: 0, pinsKept: 2, known: false, keptTimes: ["10:00", "10:41"] });
    expect(planActuals({ anchors: { i1: "10:00" }, actual_starts: {} })).toMatchObject({ known: false, pinsKept: 1 });
  });
  it("nothing to clear is zero and zero", () => {
    expect(planActuals({ anchors: { i1: "10:00" }, actual_starts: {}, hand_pins: ["i1"] })).toMatchObject({ actualStarts: 0, pinsCleared: 0 });
  });
});
