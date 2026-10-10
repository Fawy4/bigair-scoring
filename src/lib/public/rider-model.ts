import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import type { HeatVM, RiderRowVM } from "./results-model";
import { entryName, labelFor, schemeFor } from "./schemes";
import type { PublicTimetableModel, PublicRow } from "./timetable";
import type { PublicResults, PublicSite } from "./types";

const T = copy.pub.rider;

export interface RiderHeatVM {
  heatId: string;
  title: string;
  state: HeatVM["state"] | "live";
  /** Local time of the heat, "15:23"; null when the run order has no time for it. */
  start: string | null;
  estimated: boolean;
  readyCall: string | null;
  place: number | null;
  totalLabel: string | null;
  /** In words when the rider did not ride this heat: "Walkover", "Did not start", "Out of the event". */
  note?: string | null;
}

export interface RiderPageVM {
  entryId: string;
  name: string;
  divisionId: string;
  divisionName: string;
  label: LabelModel;
  /** "Your next heat: R2 H1 — est. 15:23 — be ready 15:08", or null when nothing is left to ride. */
  nextLine: string | null;
  heats: RiderHeatVM[];
  /** The rider's released results (best story first: latest published). */
  results: Array<{ heat: HeatVM; row: RiderRowVM }>;
  /** One line to share: "Sam Rivera: 1st · Pro Men · R1 · Heat 2 · 18.20". */
  shareText: string;
  /** The line the link preview shows. */
  ogDescription: string;
}

const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** The page of one rider: their heats with ready-call times from the timetable, their released results and a share line. Null when the rider is not on the public list. */
export function buildRiderPage(entryId: string, results: PublicResults | null, site: PublicSite | null, tabs: HeatVM[], tt: PublicTimetableModel): RiderPageVM | null {
  if (!results || !site) return null;
  const entry = results.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const division = results.divisions.find((d) => d.id === entry.division_id);
  const scheme = schemeFor(site, entry.division_id);
  const rowOf = (heatId: string): PublicRow | undefined => tt.rows.find((r) => r.heatId === heatId);
  const mine = tabs.filter((t) => t.riders.some((r) => r.entryId === entryId));
  const heats: RiderHeatVM[] = mine.map((t) => {
    const r = rowOf(t.id);
    const me = t.riders.find((x) => x.entryId === entryId)!;
    return { heatId: t.id, title: t.title, state: t.state, start: r?.start ?? null, estimated: Boolean(r?.estimated), readyCall: r?.readyCall ?? null, place: me.place, totalLabel: me.totalLabel, note: me.state === "WO" || me.state === "DNS" || me.state === "OUT" ? copy.pub.results.notRiding[me.state] : null };
  });
  const order = new Map(tt.rows.map((r, i) => [r.heatId, i]));
  const upcoming = heats.filter((h) => h.state !== "complete" && rowOf(h.heatId) && !["done", "live"].includes(rowOf(h.heatId)!.status)).sort((a, b) => (order.get(a.heatId) ?? 99) - (order.get(b.heatId) ?? 99));
  const next = upcoming[0];
  let nextLine: string | null = null;
  if (next) {
    const row = rowOf(next.heatId)!;
    nextLine = !next.start ? T.nextHeatNoTime(next.title) : row.status === "pinned" ? T.nextHeatPinned(next.title, next.start, next.readyCall ?? next.start) : T.nextHeat(next.title, next.start, next.readyCall ?? next.start);
  }
  const done = tabs
    .filter((t) => t.state === "complete" && t.riders.some((r) => r.entryId === entryId))
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""))
    .map((heat) => ({ heat, row: heat.riders.find((r) => r.entryId === entryId)! }));
  const name = entryName(entry);
  const last = done[0];
  const where = last ? [last.row.place ? ordinal(last.row.place) : "", last.heat.title, last.row.totalLabel ?? ""].filter(Boolean).join(" · ") : (division?.name ?? "");
  return {
    entryId,
    name,
    divisionId: entry.division_id,
    divisionName: division?.name ?? "",
    label: (next ? tabs.find((t) => t.id === next.heatId)?.riders.find((r) => r.entryId === entryId)?.label : null) ?? last?.row.label ?? mine[0]?.riders.find((r) => r.entryId === entryId)?.label ?? labelFor(scheme, entry, null),
    nextLine,
    heats,
    results: done,
    shareText: T.shareText(name, where),
    ogDescription: copy.pub.og.riderDescription(last?.row.place ? ordinal(last.row.place) : "", last?.heat.title ?? (division?.name ?? ""), last?.row.totalLabel ?? ""),
  };
}
