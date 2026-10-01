import type { RunItem, SchedulePlan } from "@/lib/schemas/schedule";

/** "Heat 3" → suffix R, "Heat 3 re-run"; re-running a re-run → R2, "Heat 3 re-run 2" (docs/08 §1H-10). */
export function rerunName(heat: { number: number; suffix: string | null; name: string | null }): { suffix: string; name: string } {
  const base = (heat.name ?? `Heat ${heat.number}`).replace(/ re-run( \d+)?$/, "");
  const m = /^R(\d*)$/.exec(heat.suffix ?? "");
  const n = heat.suffix === null || !m ? 1 : m[1] === "" ? 2 : Number(m[1]) + 1;
  return n === 1 ? { suffix: "R", name: `${base} re-run` } : { suffix: `R${n}`, name: `${base} re-run ${n}` };
}

/**
 * The run order with the re-run in it: right after the heat that is live now (the original itself when it is being re-run while running);
 * with nothing live, right after the original; a heat that is not on the run order goes at the end. Every other item, pin, break and note stays.
 */
export function insertRerunItem(plan: SchedulePlan, originalHeatId: string, rerunHeatId: string, liveHeatId: string | null): SchedulePlan {
  const next = structuredClone(plan);
  const indexOf = (heatId: string | null) => (heatId === null ? -1 : next.items.findIndex((i) => i.kind === "heat" && i.heatId === heatId));
  const original = indexOf(originalHeatId);
  const live = indexOf(liveHeatId);
  const after = live >= 0 ? live : original;
  const source = original >= 0 ? (next.items[original] as Extract<RunItem, { kind: "heat" }>) : null;
  const item: RunItem = {
    id: `run-${rerunHeatId}`,
    kind: "heat",
    heatId: rerunHeatId,
    ...(source?.durationMin !== undefined ? { durationMin: source.durationMin } : {}),
    ...(source?.warmUpMin !== undefined ? { warmUpMin: source.warmUpMin } : {}),
    ...(source?.breakAfterMin !== undefined ? { breakAfterMin: source.breakAfterMin } : {}),
  };
  next.items.splice(after >= 0 ? after + 1 : next.items.length, 0, item);
  return next;
}
