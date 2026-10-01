import { liveRows } from "./live-model";
import { loadLive } from "./load";
import type { loadCore } from "./page-data";
import { modelOf, type HeatVM, type RiderRowVM } from "./results-model";
import { schemeFor } from "./schemes";

type Core = NonNullable<Awaited<ReturnType<typeof loadCore>>>;

/**
 * The riders of a heat that is not released yet, with running totals when the division allows live scores (the database decides: it answers "not allowed" and
 * nothing else otherwise). Returns the seats alone, and `live: false`, when scores are not shown live.
 */
export async function ridersForView(core: Core, tab: HeatVM): Promise<{ riders: RiderRowVM[]; live: boolean }> {
  if (tab.state === "complete" || tab.state === "held" || !core.results) return { riders: tab.riders, live: false };
  const live = await loadLive(tab.id);
  if (!live) return { riders: tab.riders, live: false };
  const model = modelOf(core.rules, tab.divisionId);
  const rows = liveRows(live, model, new Map(core.results.entries.map((e) => [e.id, e])), schemeFor(core.site, tab.divisionId), model?.heat.impression?.label ?? null);
  return rows ? { riders: rows, live: true } : { riders: tab.riders, live: false };
}
