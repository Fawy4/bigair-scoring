import { copy } from "@/lib/ui-copy";

/** The head judge's Control tab: which buttons are on in which state of the heat. There is no timer reset: use Cancel heat (with a reason) or Re-run heat. A cancelled heat cannot be started, but it can be re-run once. */
export type HeatState = "scheduled" | "running" | "paused" | "ended" | "under_review" | "published" | "cancelled";
export type ControlId = "start" | "pause" | "resume" | "end" | "hold" | "resumeAt" | "shift5" | "shift10" | "publish" | "cancel" | "rerun" | "reopen";

/** Every control, always in this order, so buttons never jump about when the state changes. */
export const CONTROL_ORDER: ControlId[] = ["start", "pause", "resume", "end", "hold", "resumeAt", "shift5", "shift10", "publish", "cancel", "rerun", "reopen"];

export interface Control {
  id: ControlId;
  enabled: boolean;
  /** One plain sentence saying why the control is off (never a silent grey button). */
  reason?: string;
}

export interface ControlOptions {
  /** Is there an active run order? Hold, Resume at and Shift change it. Default true. */
  hasPlan?: boolean;
  /** On the real page Publish is on whenever the heat can be published; pressing it shows the blocker list first. */
  publishOpensList?: boolean;
  /** A cancelled heat whose re-run already exists cannot be re-run again. */
  alreadyRerun?: boolean;
}

const WHY = copy.controlWhy;

function reasonFor(id: ControlId, state: HeatState, o: ControlOptions, blockers: number): string {
  switch (id) {
    case "start":
      return state === "cancelled" ? WHY.startCancelled : WHY.start;
    case "pause":
      return WHY.pause;
    case "resume":
      return WHY.resume;
    case "end":
      return WHY.end;
    case "hold":
    case "resumeAt":
    case "shift5":
    case "shift10":
      return o.hasPlan === false ? WHY.noPlan : WHY.live;
    case "publish":
      return state === "ended" || state === "under_review" ? WHY.blockers(blockers) : WHY.publish;
    case "cancel":
      return WHY.cancel;
    case "rerun":
      return state === "published" ? WHY.rerunPublished : state === "cancelled" ? WHY.rerunDone : WHY.cancel;
    case "reopen":
      return WHY.reopen;
  }
}

export function controlsFor(state: HeatState, blockers: number, options: ControlOptions = {}): Control[] {
  const live = state === "running" || state === "paused";
  const reviewable = state === "ended" || state === "under_review";
  const on = (id: ControlId): boolean => {
    switch (id) {
      case "start":
        return state === "scheduled";
      case "pause":
        return state === "running";
      case "resume":
        return state === "paused";
      case "end":
        return live;
      case "hold":
      case "resumeAt":
      case "shift5":
      case "shift10":
        return live && options.hasPlan !== false;
      case "publish":
        return reviewable && (blockers === 0 || options.publishOpensList === true);
      case "cancel":
        return live || reviewable;
      case "rerun":
        return live || reviewable || (state === "cancelled" && !options.alreadyRerun);
      case "reopen":
        return state === "published";
    }
  };
  return CONTROL_ORDER.map((id) => {
    const enabled = on(id);
    return enabled ? { id, enabled } : { id, enabled, reason: reasonFor(id, state, options, blockers) };
  });
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

/**
 * "Reset this heat" in the heat menu: on for ended, under-review, cancelled and published heats (also a re-run); off, with the sentence of why, for a heat that has not
 * started, one that is on the water, and a cancelled heat that was already re-run (reset the re-run instead). The database checks the same rules and refuses a reset
 * while any heat of the event runs, or when a later heat that depends on this one has started.
 */
export function resetHeatControl(state: HeatState, alreadyRerun: boolean): { enabled: boolean; reason?: string } {
  const W = copy.resetParts;
  if (state === "scheduled") return { enabled: false, reason: W.heat.scheduledWhy };
  if (state === "running" || state === "paused") return { enabled: false, reason: copy.reset.errors.HEAT_RUNNING(copy.resetParts.heat.thisHeat) };
  if (state === "cancelled" && alreadyRerun) return { enabled: false, reason: W.errors.HEAT_ALREADY_RERUN };
  return { enabled: true };
}
