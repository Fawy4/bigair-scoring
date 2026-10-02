/** A run order as the simulator reads it from schedule_plans. */
export interface PlanLite {
  day: string;
  active: boolean;
  hold: unknown;
  items: unknown;
}

/**
 * "Run the whole event" (Polish 2, item 7): every day's active run order, day after day, as one list of heats (breaks and notes left out). A plan on hold holds
 * only its own heats. Null when the event has no active plan: the auto-play then uses the default order of divisions, rounds and heats.
 */
export function eventOrder(plans: readonly PlanLite[]): { heatIds: string[] | null; held: Set<string> } {
  const active = plans.filter((p) => p.active).sort((a, b) => a.day.localeCompare(b.day));
  if (!active.length) return { heatIds: null, held: new Set() };
  const heatIds: string[] = [];
  const held = new Set<string>();
  for (const p of active) {
    const items = (Array.isArray(p.items) ? p.items : []) as Array<{ kind?: string; heatId?: string }>;
    for (const i of items) {
      if (i.kind !== "heat" || !i.heatId || heatIds.includes(i.heatId)) continue;
      heatIds.push(i.heatId);
      if (p.hold) held.add(i.heatId);
    }
  }
  return { heatIds, held };
}
