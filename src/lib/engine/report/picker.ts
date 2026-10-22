import { didRide, indexOf, riderHeats, roundName } from "./collect";
import type { PickerItem, ReportContext } from "./types";

/**
 * The rider picker at the top of the report: every rider whose report is open (not under 18, with a ridden published heat), best first: the finalists by place, then the others
 * by how far they got. The line says the place for a rider of the last round and "reached ‹round›" for everybody else.
 */
export function pickerOf(ctx: ReportContext): PickerItem[] {
  const idx = indexOf(ctx);
  const out: Array<PickerItem & { sort: [number, number] }> = [];
  for (const e of ctx.data.entries) {
    if (e.report_withheld) continue;
    const rhs = riderHeats(ctx, e.id, idx).filter(didRide);
    if (!rhs.length) continue;
    const division = ctx.data.divisions.find((d) => d.id === e.division_id);
    const rounds = [...(division?.rounds ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const last = rhs[rhs.length - 1];
    const placing = ctx.placings[e.id];
    const rodeLast = rounds.length > 0 && last.round.id === rounds[rounds.length - 1].id;
    const place = rodeLast && placing ? placing.place : null;
    out.push({
      entryId: e.id,
      name: [e.first_name, e.last_name].filter(Boolean).join(" ").trim(),
      divisionName: division?.name ?? "",
      place,
      shared: place !== null && Boolean(placing?.shared),
      lastRound: roundName(last.round),
      sort: [place ?? 1000, -last.roundIndex],
    });
  }
  return out.sort((a, b) => a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1] || a.name.localeCompare(b.name)).map((x) => ({ entryId: x.entryId, name: x.name, divisionName: x.divisionName, place: x.place, shared: x.shared, lastRound: x.lastRound }));
}
