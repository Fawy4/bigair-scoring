import { buildPlacings } from "@/lib/public/ladder-model";
import { modelOf } from "@/lib/public/results-model";
import type { DivisionRules, Placing, ReportContext, ReportData } from "@/lib/engine/report";
import type { PublicDrawPayload, PublicEntry, PublicRules } from "@/lib/public/types";

/**
 * What the database function `get_rider_report` answers, with the few things the page already knows from the rules and the draw (the way the public pages read them):
 * the sides as the event words them, each division's attempt limit and counting, the event's name for the separate score, and the final places the Placings page shows.
 */
export function reportContextFrom(data: ReportData, rules: PublicRules | null, draw: PublicDrawPayload | null): ReportContext {
  const dir = (key: string, fallback: string) => data.blocks.find((b) => b.family === "direction" && b.key === key)?.label.trim() || fallback;
  const divisionRules: Record<string, DivisionRules> = {};
  const familyLabels: Record<string, string> = {};
  for (const d of data.divisions) {
    const m = modelOf(rules, d.id);
    const counting = m?.heat.counting;
    const plain = counting?.type === "best_n" || counting?.type === "single_best";
    divisionRules[d.id] = {
      attemptCap: m?.heat.maxAttemptsPerRider ?? null,
      countedN: counting?.type === "best_n" ? counting.n : counting?.type === "single_best" ? 1 : null,
      impressionName: m?.heat.impression?.label ?? null,
      weighted: !plain || Boolean(m?.heat.countedWeights?.length) || (counting?.type === "best_n" && counting.distinctTrickNames),
    };
    for (const c of m?.categories ?? []) familyLabels[c.key] ??= c.label;
  }
  const entries: PublicEntry[] = data.entries.map((e) => ({ id: e.id, division_id: e.division_id, first_name: e.first_name, last_name: e.last_name, nationality: null, identifiers: null, withdrawn: e.withdrawn }));
  const placings: Record<string, Placing> = {};
  for (const d of draw?.divisions ?? []) for (const p of buildPlacings(d.draw, entries)) placings[p.entryId] = { place: p.place, shared: p.shared, round: p.round };
  return {
    data,
    sideWords: { left: dir("left", "Left"), right: dir("right", "Right") },
    impressionName: data.impression_name ?? "",
    divisionRules,
    placings,
    familyLabels,
    loopCategories: ["kiteloop"],
  };
}

/** Does this rider have a report to open? Cheap (no report is built): the rider is on the list, his record does not say under 18, and a heat of his is published. */
export function reportAvailable(data: ReportData | null, entryId: string): boolean {
  if (!data) return false;
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry || entry.report_withheld) return false;
  return data.divisions.some((d) => d.rounds.some((r) => r.heats.some((h) => h.results.some((x) => x.entry_id === entryId))));
}
