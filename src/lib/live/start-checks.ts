export type StartRefusal = "DRAW_NOT_LOCKED" | "PANEL_TOO_SMALL" | "SEATS_NOT_FILLED" | "HEAT_ALREADY_RUNNING";

export interface StartFacts {
  drawLocked: boolean;
  panelSize: number;
  minJudges: number;
  /** Seats that still wait for a place ("1st H1"). */
  unfilledSeats: number;
  /** Heats of the event that are running or paused. */
  running: number;
  maxRunning: number;
}

/** Mirrors `start_heat` in the database, in the same order (docs/08 §1G-12). The database is the authority; this is for explaining before pressing. */
export function startRefusal(f: StartFacts): StartRefusal | null {
  if (!f.drawLocked) return "DRAW_NOT_LOCKED";
  if (f.panelSize < f.minJudges) return "PANEL_TOO_SMALL";
  if (f.unfilledSeats > 0) return "SEATS_NOT_FILLED";
  if (f.running >= f.maxRunning) return "HEAT_ALREADY_RUNNING";
  return null;
}
