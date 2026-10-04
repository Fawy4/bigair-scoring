import { impressionNameOf } from "@/lib/schemas/impression-name";
import { buildLadder, buildPlacings } from "@/lib/public/ladder-model";
import { buildHeatTabs, fmt, heatNumberLabel, modelOf, type HeatVM } from "@/lib/public/results-model";
import { entryName, schemeFor } from "@/lib/public/schemes";
import type { PublicDrawPayload, PublicEntry, PublicResults, PublicRules, PublicSite, ResultRow, ResultsDivision, ResultsHeat } from "@/lib/public/types";
import { copy } from "@/lib/ui-copy";
import { toCsv, CSV_BOM, type CsvCell } from "./csv";

const X = copy.exportFiles;

/**
 * Everything a results file is made from. `results`, `site`, `rules` and `draw` are what the database's public functions answer (read as the person pressing the
 * button, so the same visibility rules decide), with the draft heats - and only when asked for - already laid in as ordinary released rows and named in `draftHeatIds`.
 */
export interface ResultsExportInput {
  exportedAt: string;
  site: PublicSite;
  results: PublicResults;
  rules: PublicRules | null;
  draw: PublicDrawPayload | null;
  /** Heats laid in as a draft (under review or held back). Empty unless the organiser ticked the box. */
  draftHeatIds: ReadonlySet<string>;
  includeDraft: boolean;
  /** Heat id → who published it, from the audit log (missing when the log has no name for it). */
  publishers: ReadonlyMap<string, string>;
}

export interface ExportedHeat {
  division: ResultsDivision;
  roundName: string;
  heat: ResultsHeat;
  tab: HeatVM;
  draft: boolean;
}

/**
 * The heats that go into a file, in division, round and heat order: released heats exactly as the public sees them; draft heats only when `includeDraft`. A heat the
 * public cannot read (nothing released, held, cancelled, not started) is never here unless it was laid in as a draft.
 */
export function exportedHeats(input: Pick<ResultsExportInput, "site" | "results" | "rules" | "draftHeatIds" | "includeDraft">): ExportedHeat[] {
  const tabs = new Map(buildHeatTabs(input.results, input.site, input.rules).map((t) => [t.id, t]));
  const out: ExportedHeat[] = [];
  for (const division of input.results.divisions) {
    for (const round of division.rounds) {
      for (const heat of round.heats) {
        const tab = tabs.get(heat.id);
        if (!tab || tab.state !== "complete") continue;
        const draft = input.draftHeatIds.has(heat.id);
        if (draft && !input.includeDraft) continue;
        out.push({ division, roundName: round.short_name ?? round.name, heat, tab, draft });
      }
    }
  }
  return out;
}

/** "2026-10-04 14:32" in the event's own time zone (never the device's). */
export function localStamp(iso: string | null | undefined, timezone: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** The name of the impression score the file uses: the event's own name when it has one, otherwise what the divisions' scoring calls it (joined when they differ). */
export function impressionColumnName(rules: PublicRules | null, divisions: ResultsDivision[]): string {
  const own = (rules?.impression_name ?? "").trim();
  if (own) return own;
  const names = [...new Set(divisions.map((d) => impressionNameOf(modelOf(rules, d.id))))];
  return names.length ? names.join(" / ") : impressionNameOf(null);
}

const yesNo = (v: boolean) => (v ? X.sheet.values.yes : X.sheet.values.no);

/**
 * The results CSV: one row per rider per released heat, then the division placings and the ladder seats. Built from the same heat rows the public results page
 * draws (`buildHeatTabs`), so a number in the file is the number on the page.
 */
export function buildResultsCsv(input: ResultsExportInput): { csv: string; heatCount: number } {
  const heats = exportedHeats(input);
  const tz = input.site.event.timezone || "Africa/Cairo";
  const entries = new Map(input.results.entries.map((e) => [e.id, e] as const));
  const maxAttempts = Math.max(1, ...heats.flatMap((h) => h.tab.riders.map((r) => r.boxes.length)));
  const C = X.sheet.columns;

  const header: CsvCell[] = [C.division, C.round, C.heat, C.draft, C.riderLabel, C.riderName, C.lycra, C.riderStatus];
  for (let n = 1; n <= maxAttempts; n++) header.push(C.attempt(n, "trick"), C.attempt(n, "result"), C.attempt(n, "score"), C.attempt(n, "counted"));
  header.push(C.impression(impressionColumnName(input.rules, input.results.divisions)), C.total, C.place, C.version, C.publishedBy, C.publishedAt);

  const rows: CsvCell[][] = [header];
  for (const h of heats) {
    const scheme = schemeFor(input.site, h.division.id);
    const raw = new Map<string, ResultRow>(h.heat.results.map((r) => [r.entry_id, r] as const));
    const decimals = modelOf(input.rules, h.division.id)?.panel.decimals ?? 2;
    for (const r of h.tab.riders) {
      const result = r.entryId ? raw.get(r.entryId) : undefined;
      const slot = h.heat.slots.find((s) => s.entry_id === r.entryId);
      const lycra = slot?.vest_colour ? (scheme.palette.find((c) => c.key === slot.vest_colour)?.label ?? slot.vest_colour) : "";
      const row: CsvCell[] = [h.division.name, h.roundName, heatNumberLabel(h.heat), h.draft ? X.sheet.values.draft : "", r.label?.primary.text ?? "", entryName(r.entryId ? entries.get(r.entryId) : undefined), lycra, X.sheet.riderStatus[r.state] ?? r.state];
      for (let i = 0; i < maxAttempts; i++) {
        const b = r.boxes[i];
        row.push(b ? b.trick : "", b ? (b.status === "landed" ? X.sheet.values.landed : X.sheet.values.crashed) : "", b?.scoreLabel ?? "", b ? yesNo(b.counted) : "");
      }
      const impression = result?.breakdown?.impression?.score;
      row.push(
        impression === null || impression === undefined ? "" : fmt(Number(impression), decimals),
        r.totalLabel ?? "",
        r.place ?? "",
        h.draft || !result ? "" : result.version,
        h.draft ? "" : (input.publishers.get(h.heat.id) ?? ""),
        h.draft ? "" : localStamp(h.heat.published_at, tz),
      );
      rows.push(row);
    }
  }

  // placings and ladder seats of every division that has a drawn ladder (the draw is the public one: only released heats feed it)
  const P = X.sheet.placings;
  const placingRows: CsvCell[][] = [];
  const L = X.sheet.ladder;
  const ladderRows: CsvCell[][] = [];
  for (const d of input.results.divisions) {
    const draw = input.draw?.divisions.find((x) => x.id === d.id)?.draw ?? null;
    if (!draw) continue;
    for (const p of buildPlacings(draw, input.results.entries as PublicEntry[])) placingRows.push([d.name, p.label, p.name, p.round]);
    const decimals = modelOf(input.rules, d.id)?.panel.decimals ?? 2;
    for (const round of buildLadder(draw, d, schemeFor(input.site, d.id), decimals)) {
      for (const heat of round.heats) {
        heat.riders.forEach((rd, i) => ladderRows.push([d.name, round.name, heat.name, X.sheet.heatState[heat.state] ?? heat.state, i + 1, rd.name, rd.colourWord ?? "", rd.totalLabel]));
      }
    }
  }
  if (placingRows.length) rows.push([], [P.title], [P.columns.division, P.columns.place, P.columns.rider, P.columns.wentOut], ...placingRows);
  if (ladderRows.length) rows.push([], [L.title], [L.columns.division, L.columns.round, L.columns.heat, L.columns.state, L.columns.seat, L.columns.rider, L.columns.lycra, L.columns.total], ...ladderRows);

  const I = X.sheet.info;
  rows.push([], [I.title], [I.event, input.site.event.name], [I.exportedAt, localStamp(input.exportedAt, tz)], [I.timezone, tz], [I.includesDraft, input.includeDraft ? I.yes : I.no], [I.heats, heats.length]);
  return { csv: CSV_BOM + toCsv(rows), heatCount: heats.length };
}

/** The file name of a download: "<event slug>-results-2026-10-04-1432.csv". Local time of the event, digits only, safe on every system. */
export function exportFileName(slug: string, kind: "results" | "backup", ext: "csv" | "json", iso: string, timezone: string): string {
  const stamp = localStamp(iso, timezone).replace(" ", "-").replace(":", "");
  return `${slug}-${kind}-${stamp}.${ext}`;
}

export interface PrintDivision {
  division: ResultsDivision;
  heats: ExportedHeat[];
}

/** The printable page's order: division by division (as on the results page), each division's heats newest first (a draft heat, not published yet, is the newest of all). */
export function printOrder(heats: ExportedHeat[]): PrintDivision[] {
  const out: PrintDivision[] = [];
  for (const h of heats) {
    let group = out.find((g) => g.division.id === h.division.id);
    if (!group) out.push((group = { division: h.division, heats: [] }));
    group.heats.push(h);
  }
  const at = (h: ExportedHeat) => (h.heat.published_at ? Date.parse(h.heat.published_at) : Number.POSITIVE_INFINITY);
  for (const g of out) g.heats = g.heats.map((h, i) => ({ h, i })).sort((a, b) => at(b.h) - at(a.h) || b.i - a.i).map((x) => x.h);
  return out;
}
