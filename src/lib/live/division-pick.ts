/** The pure rule behind the head console's division selector (docs/PLAN-phase-7a.md step 8e). */
export interface PickHeat {
  id: string;
  division_id: string;
  status: string;
}

export interface PickInput {
  divisions: Array<{ id: string }>;
  heats: PickHeat[];
  /** The division of the next heat on the run order, if there is one. */
  upcomingDivisionId: string | null;
  /** What this device chose last time: a division id or "all". */
  stored: string | null;
  /** "All divisions" is offered to organisers only. */
  canSeeAll: boolean;
}

/**
 * The division to show. A choice stored on this device wins while it still exists (a heat starting in another division never switches it).
 * Otherwise: the division with a running heat, else one with a paused heat, else the division of the next heat on the run order, else the first division.
 */
export function chooseDivision(i: PickInput): string {
  if (i.divisions.length === 0) return "all";
  if (i.stored === "all" && i.canSeeAll) return "all";
  if (i.stored && i.divisions.some((d) => d.id === i.stored)) return i.stored;
  const known = (id: string) => i.divisions.some((d) => d.id === id);
  const running = i.heats.find((h) => h.status === "running" && known(h.division_id));
  if (running) return running.division_id;
  const paused = i.heats.find((h) => h.status === "paused" && known(h.division_id));
  if (paused) return paused.division_id;
  if (i.upcomingDivisionId && known(i.upcomingDivisionId)) return i.upcomingDivisionId;
  return i.divisions[0].id;
}

/** The divisions that have a heat running right now: their tabs say "Live". */
export function liveDivisionIds(heats: PickHeat[]): Set<string> {
  return new Set(heats.filter((h) => h.status === "running").map((h) => h.division_id));
}
