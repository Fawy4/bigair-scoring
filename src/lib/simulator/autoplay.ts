/** What the auto-play does next, from what the database says (pure: the server reads the rows, this decides). */

export interface PlanHeat {
  id: string;
  /** The heat's real state (running, paused, ended, under_review, published, cancelled, scheduled). */
  status: string;
  divisionSort: number;
  roundSort: number;
  number: number;
  suffix: string | null;
  /** The division's draw is locked. */
  locked: boolean;
  /** Every seat that has to ride has a rider (no "1st H2" still waiting). */
  filled: boolean;
}

const byDefault = (a: PlanHeat, b: PlanHeat) => a.divisionSort - b.divisionSort || a.roundSort - b.roundSort || a.number - b.number || (a.suffix ?? "").localeCompare(b.suffix ?? "");

/**
 * The order the day runs in: the active run order's heats in its own order, then any heat it does not list (a re-run made after the run order was built) in division,
 * round and heat order. With no run order, everything in that default order.
 */
export function runOrder(heats: readonly PlanHeat[], planHeatIds: readonly string[] | null): PlanHeat[] {
  const byId = new Map(heats.map((h) => [h.id, h]));
  const listed = (planHeatIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const seen = new Set(listed.map((h) => h.id));
  const rest = heats.filter((h) => !seen.has(h.id)).sort(byDefault);
  return [...listed, ...rest];
}

export type WaitReason = "heat_running" | "review" | "hold" | "not_ready";
export type Next = { kind: "start"; heatId: string } | { kind: "wait"; reason: WaitReason; heatId?: string } | { kind: "finished" };

/** Start the first heat that has not started, in order; wait while another is running, until a finished one is published, while on hold, or while the next one is not ready. */
export function nextStep(input: { ordered: readonly PlanHeat[]; hold: boolean; maxRunning: number }): Next {
  const running = input.ordered.filter((h) => h.status === "running" || h.status === "paused");
  if (running.length >= Math.max(1, input.maxRunning)) return { kind: "wait", reason: "heat_running", heatId: running[0].id };
  const unpublished = input.ordered.find((h) => h.status === "ended" || h.status === "under_review");
  if (unpublished) return { kind: "wait", reason: "review", heatId: unpublished.id };
  const next = input.ordered.find((h) => h.status === "scheduled");
  if (!next) return { kind: "finished" };
  if (input.hold) return { kind: "wait", reason: "hold", heatId: next.id };
  if (!next.locked || !next.filled) return { kind: "wait", reason: "not_ready", heatId: next.id };
  return { kind: "start", heatId: next.id };
}

/** Who plays a seat right now: the simulator, or a person (a phone that joined, or a seat the owner set to real). */
export function whoJoins(seat: { mode: "virtual" | "real"; boundUser: string | null; virtualUser: string | null }): "simulator" | "person" {
  if (seat.mode === "real") return "person";
  if (seat.boundUser && seat.boundUser !== seat.virtualUser) return "person";
  return "simulator";
}
