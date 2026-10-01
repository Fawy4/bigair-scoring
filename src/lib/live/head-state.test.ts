import { describe, expect, it } from "vitest";
import { controlsFor, nextHeatState, type ControlId } from "./head-state";

// The head judge's Control tab (owner, round 3). There is no timer reset: the equivalent is Cancel heat with a reason, or Re-run heat.
const on = (state: Parameters<typeof controlsFor>[0], blockers = 0) => controlsFor(state, blockers).filter((c) => c.enabled).map((c) => c.id);

describe("which controls are on", () => {
  it("before the start only Start heat is on", () => expect(on("scheduled")).toEqual(["start"]));
  it("while running: Pause, End, Hold, Resume at, Shift, Cancel, Re-run", () =>
    expect(on("running")).toEqual(["pause", "end", "hold", "resumeAt", "shift5", "shift10", "cancel", "rerun"]));
  it("while paused: Resume instead of Pause", () => expect(on("paused")).toEqual(["resume", "end", "hold", "resumeAt", "shift5", "shift10", "cancel", "rerun"]));
  it("after the end: Publish (when nothing blocks it), Cancel, Re-run", () => expect(on("ended")).toEqual(["publish", "cancel", "rerun"]));
  it("Publish is off while the blocker list is not empty (the head judge overrides it with a reason on the laptop console)", () => expect(on("ended", 2)).toEqual(["cancel", "rerun"]));
  it("once published only Re-open is on", () => expect(on("published")).toEqual(["reopen"]));
  it("there is no Reset timer control at all", () => {
    for (const s of ["scheduled", "running", "paused", "ended", "published"] as const) expect(controlsFor(s, 0).map((c) => c.id as string)).not.toContain("reset");
  });
  it("every state lists the same controls in the same order, so buttons never jump about", () => {
    const ids = (s: Parameters<typeof controlsFor>[0]) => controlsFor(s, 0).map((c) => c.id);
    expect(ids("running")).toEqual(ids("ended"));
  });
});

describe("what a press does", () => {
  const press = (s: Parameters<typeof nextHeatState>[0], c: ControlId) => nextHeatState(s, c);
  it("Start → running; Pause → paused; Resume → running; End → ended; Publish → published; Re-open → ended", () => {
    expect(press("scheduled", "start")).toBe("running");
    expect(press("running", "pause")).toBe("paused");
    expect(press("paused", "resume")).toBe("running");
    expect(press("running", "end")).toBe("ended");
    expect(press("ended", "publish")).toBe("published");
    expect(press("published", "reopen")).toBe("ended");
  });
  it("Cancel and Re-run leave the state to the dialog (they need a reason)", () => {
    expect(press("running", "cancel")).toBe("running");
    expect(press("running", "rerun")).toBe("running");
  });
  it("Hold and Shift change the timetable, not the heat", () => {
    expect(press("running", "hold")).toBe("running");
    expect(press("running", "shift5")).toBe("running");
  });
});
