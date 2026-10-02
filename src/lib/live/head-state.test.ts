import { describe, expect, it } from "vitest";
import { controlsFor, nextHeatState, resetHeatControl, type ControlId } from "./head-state";

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

// docs/08 §1H-13 — the Control tab on the real page: every disabled control says why in one sentence
describe("1H-13 why a control is off", () => {
  const reason = (state: Parameters<typeof controlsFor>[0], id: ControlId, opts: Parameters<typeof controlsFor>[2] = { hasPlan: true }) => controlsFor(state, 0, opts).find((c) => c.id === id)!;
  it("Hold, Resume at and Shift without an active run order say so", () => {
    for (const id of ["hold", "resumeAt", "shift5", "shift10"] as const) {
      const c = reason("running", id, { hasPlan: false });
      expect(c.enabled).toBe(false);
      expect(c.reason).toBe("No active run order — create one in Run order & timetable.");
    }
  });
  it("Hold while nothing is live: available while a heat is running or paused", () => {
    expect(reason("scheduled", "hold").reason).toBe("Available while a heat is running or paused.");
  });
  it("one sentence for every other control that is off", () => {
    expect(reason("running", "start").reason).toBe("Only a heat that has not started can be started.");
    expect(reason("paused", "pause").reason).toBe("Only a running heat can be paused.");
    expect(reason("running", "resume").reason).toBe("Only a paused heat can be resumed.");
    expect(reason("scheduled", "end").reason).toBe("Only a running or paused heat can be ended.");
    expect(reason("scheduled", "publish").reason).toBe("Available once the heat has ended.");
    expect(reason("running", "reopen").reason).toBe("Only a published heat can be re-opened.");
    expect(reason("scheduled", "cancel").reason).toBe("Available while the heat is running, paused, ended or under review.");
    expect(reason("published", "rerun").reason).toBe("Re-open the heat instead.");
  });
  it("a control that is on has no reason", () => {
    expect(reason("running", "pause").reason).toBeUndefined();
  });
  it("Publish is on when the heat has ended or is under review, even with blockers (pressing it shows the list)", () => {
    const on = (state: Parameters<typeof controlsFor>[0], blockers: number) => controlsFor(state, blockers, { hasPlan: true, publishOpensList: true }).find((c) => c.id === "publish")!.enabled;
    expect(on("ended", 3)).toBe(true);
    expect(on("under_review", 0)).toBe(true);
    expect(on("running", 0)).toBe(false);
  });
  it("under review: Cancel, Re-run and Publish are on; published: only Re-open", () => {
    const onIds = (s: Parameters<typeof controlsFor>[0]) => controlsFor(s, 0, { hasPlan: true, publishOpensList: true }).filter((c) => c.enabled).map((c) => c.id);
    expect(onIds("under_review")).toEqual(["publish", "cancel", "rerun"]);
    expect(onIds("published")).toEqual(["reopen"]);
    expect(onIds("cancelled")).toEqual(["rerun"]);
  });
  // Console v2 §3 and §4: a cancelled heat cannot be started, but it can be re-run (once)
  it("a cancelled heat: Start is off and says why, Re-run is on", () => {
    expect(reason("cancelled", "start")).toMatchObject({ enabled: false, reason: "A cancelled heat cannot be started. Re-run it instead." });
    expect(reason("cancelled", "rerun").enabled).toBe(true);
    expect(controlsFor("cancelled", 0, { hasPlan: true }).filter((c) => c.enabled).map((c) => c.id)).toEqual(["rerun"]);
  });
  it("a cancelled heat that already has its re-run cannot be re-run again, and says so", () => {
    const c = reason("cancelled", "rerun", { hasPlan: true, alreadyRerun: true });
    expect(c).toMatchObject({ enabled: false, reason: "This heat has already been re-run." });
  });
  it("Cancel is off on a cancelled heat; every state still lists the same controls in the same order", () => {
    expect(reason("cancelled", "cancel").enabled).toBe(false);
    expect(controlsFor("cancelled", 0).map((c) => c.id)).toEqual(controlsFor("running", 0).map((c) => c.id));
  });
  it("a heat that has not started cannot be re-run", () => {
    expect(reason("scheduled", "rerun").enabled).toBe(false);
  });
});

describe("Reset this heat in the heat menu", () => {
  it("is on for ended, under-review, cancelled and published heats", () => {
    for (const state of ["ended", "under_review", "cancelled", "published"] as const) expect(resetHeatControl(state, false).enabled, state).toBe(true);
  });
  it("is off, with a sentence, for a heat not started and a heat on the water", () => {
    for (const state of ["scheduled", "running", "paused"] as const) {
      const r = resetHeatControl(state, false);
      expect(r.enabled, state).toBe(false);
      expect(r.reason).toBeTruthy();
    }
  });
  it("a cancelled heat that was already re-run is off and points to the re-run; the re-run itself can be reset", () => {
    expect(resetHeatControl("cancelled", true)).toMatchObject({ enabled: false, reason: expect.stringMatching(/re-run/i) });
    expect(resetHeatControl("ended", false).enabled).toBe(true);
  });
});
