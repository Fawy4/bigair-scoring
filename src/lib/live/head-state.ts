/** The head judge's Control tab: which buttons are on in which state of the heat. There is no timer reset: use Cancel heat (with a reason) or Re-run heat. */
export type HeatState = "scheduled" | "running" | "paused" | "ended" | "published";
export type ControlId = "start" | "pause" | "resume" | "end" | "hold" | "resumeAt" | "shift5" | "shift10" | "publish" | "cancel" | "rerun" | "reopen";

/** Every control, always in this order, so buttons never jump about when the state changes. */
export const CONTROL_ORDER: ControlId[] = ["start", "pause", "resume", "end", "hold", "resumeAt", "shift5", "shift10", "publish", "cancel", "rerun", "reopen"];

export interface Control {
  id: ControlId;
  enabled: boolean;
}

export function controlsFor(state: HeatState, blockers: number): Control[] {
  const live = state === "running" || state === "paused";
  const on = (id: ControlId): boolean => {
    switch (id) {
      case "start":
        return state === "scheduled";
      case "pause":
        return state === "running";
      case "resume":
        return state === "paused";
      case "end":
      case "hold":
      case "resumeAt":
      case "shift5":
      case "shift10":
        return live;
      case "publish":
        return state === "ended" && blockers === 0;
      case "cancel":
      case "rerun":
        return live || state === "ended";
      case "reopen":
        return state === "published";
    }
  };
  return CONTROL_ORDER.map((id) => ({ id, enabled: on(id) }));
}

/** The heat after a press. Cancel, Re-run, Hold and Shift do not change this heat's state here: the first two ask for a reason first, the others change the timetable. */
export function nextHeatState(state: HeatState, id: ControlId): HeatState {
  if (id === "start" && state === "scheduled") return "running";
  if (id === "pause" && state === "running") return "paused";
  if (id === "resume" && state === "paused") return "running";
  if (id === "end" && (state === "running" || state === "paused")) return "ended";
  if (id === "publish" && state === "ended") return "published";
  if (id === "reopen" && state === "published") return "ended";
  return state;
}
