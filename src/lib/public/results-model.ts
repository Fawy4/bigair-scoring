import type { LabelModel } from "@/lib/identification/rider-label";
import { mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { withImpressionName } from "@/lib/schemas/impression-name";
import { copy } from "@/lib/ui-copy";
import { toAttemptDisplay, type AttemptDisplay } from "@/lib/live/result-shading";
import { labelFor, schemeFor } from "./schemes";
import type { PublicBreakdown, PublicEntry, PublicResults, PublicRules, PublicSite, ResultsHeat, SlotRowPublic } from "./types";

const R = copy.pub.results;

export interface BoxVM {
  seq: number;
  trick: string;
  status: "landed" | "crashed";
  counted: boolean;
  score: number | null;
  scoreLabel: string | null;
}

export type RiderState = "ok" | "DNS" | "DSQ" | "DNF";

export interface RiderRowVM {
  entryId: string | null;
  place: number | null;
  label: LabelModel | null;
  /** Shown when the seat has no rider yet. */
  placeholder: string | null;
  totalLabel: string | null;
  formula: string | null;
  percentLabel: string | null;
  state: RiderState;
  boxes: BoxVM[];
}

export type HeatState = "complete" | "live" | "scheduled" | "held";

export interface HeatVM {
  id: string;
  divisionId: string;
  divisionName: string;
  roundName: string;
  /** The tab: "R1 · Heat 3". */
  tab: string;
  /** "Pro Men · R1 · Heat 3". */
  title: string;
  state: HeatState;
  riders: RiderRowVM[];
  /** Every counted score of the heat, for the yellow-to-green grading across the heat. */
  countedScores: number[];
  trickCount: number;
  attemptsPerRider: number | null;
  mode: AttemptDisplay;
  publishedAt: string | null;
}

/** The division's scoring model as the engine reads it (the organiser's overrides applied); null when it cannot be read. */
export function modelOf(rules: PublicRules | null, divisionId: string): ScoringModel | null {
  const d = rules?.divisions.find((x) => x.id === divisionId);
  if (!d?.scoring_model) return null;
  try {
    return withImpressionName(parseScoringModel(mergeOverrides(d.scoring_model as never, d.scoring_overrides, SCORING_NULLABLE)), rules?.impression_name);
  } catch {
    return null;
  }
}

export const fmt = (n: number, decimals: number): string => n.toFixed(decimals);

/** "18.20 = tricks 13.50 + Impression 4.70" (with "+ bonus" or "− penalty" only when there is one). No percentages here. */
export function formulaLine(totalLabel: string, components: { tricks: number; impression: number; bonus: number; penalty: number }, impressionLabel: string | null, decimals: number): string {
  let line = impressionLabel ? copy.live.result.formula(totalLabel, fmt(components.tricks, decimals), impressionLabel, fmt(components.impression, decimals)) : R.formulaNoImpression(totalLabel, fmt(components.tricks, decimals));
  if (components.bonus) line += R.formulaBonus(fmt(components.bonus, decimals));
  if (components.penalty) line += R.formulaPenalty(fmt(Math.abs(components.penalty), decimals));
  return line;
}

export const heatNumberLabel = (h: Pick<ResultsHeat, "name" | "number" | "suffix">): string => h.name ?? `Heat ${h.number}${h.suffix ?? ""}`;

function boxesOf(b: PublicBreakdown | null, decimals: number): BoxVM[] {
  return (b?.allAttempts ?? [])
    .filter((a) => !a.ignored || a.ignored !== "over_cap")
    .map((a) => ({
      seq: a.seq,
      trick: a.trickName ?? "",
      status: a.status,
      counted: Boolean(a.counted),
      score: a.panelScore ?? null,
      scoreLabel: a.panelScore === null || a.panelScore === undefined ? null : fmt(a.panelScore, decimals),
    }));
}

function stateOf(h: ResultsHeat): HeatState {
  if (h.status === "published") return h.held ? "held" : "complete";
  if (h.status === "running" || h.status === "paused") return "live";
  return "scheduled";
}

const entryMap = (r: PublicResults) => new Map(r.entries.map((e) => [e.id, e]));

/** One row per seat for a heat whose result is not out yet: Rider labels, no totals. */
function seatRows(slots: SlotRowPublic[], entries: Map<string, PublicEntry>, scheme: ReturnType<typeof schemeFor>): RiderRowVM[] {
  return [...slots]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      entryId: s.entry_id,
      place: null,
      label: s.entry_id ? labelFor(scheme, entries.get(s.entry_id), s.vest_colour) : null,
      placeholder: s.entry_id ? null : copy.pub.live.waiting,
      totalLabel: null,
      formula: null,
      percentLabel: null,
      state: s.modifier === "DNS" ? "DNS" : "ok",
      boxes: [],
    }));
}

/**
 * Every heat of the event as a tab: for a released heat one compact row per rider in rank order with the formula in words and the attempts as boxes in attempt
 * order; for a heat that is live, held or still to come the seats only (live totals come from the live function, when the division allows them). Cancelled heats
 * are left out: their re-run takes the place. Heats come in division, round, number order.
 */
export function buildHeatTabs(results: PublicResults | null, site: PublicSite | null, rules: PublicRules | null): HeatVM[] {
  if (!results || !site) return [];
  const entries = entryMap(results);
  const out: HeatVM[] = [];
  for (const d of results.divisions) {
    const scheme = schemeFor(site, d.id);
    const model = modelOf(rules, d.id);
    const decimals = model?.panel.decimals ?? 2;
    const impressionLabel = model?.heat.impression?.label ?? null;
    const mode = toAttemptDisplay(d.attempt_display);
    for (const r of d.rounds) {
      for (const h of r.heats) {
        if (h.status === "cancelled") continue;
        const state = stateOf(h);
        const roundName = r.short_name ?? r.name;
        let riders: RiderRowVM[];
        if (state === "complete") {
          riders = [...h.results]
            .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
            .map((x) => {
              const bd = x.breakdown;
              const status = (bd?.status ?? "ok") as RiderState;
              const none = status === "DNS" || status === "DSQ";
              const slot = h.slots.find((s) => s.entry_id === x.entry_id);
              return {
                entryId: x.entry_id,
                place: x.place,
                label: labelFor(scheme, entries.get(x.entry_id), slot?.vest_colour),
                placeholder: null,
                totalLabel: none ? null : (bd?.totalLabel ?? (x.total === null ? null : fmt(Number(x.total), decimals))),
                formula: bd && !none ? formulaLine(bd.totalLabel, bd.components, impressionLabel, decimals) : null,
                percentLabel: d.show_percent && x.percent !== null && !none ? R.percent(fmt(Number(x.percent), 0)) : null,
                state: status,
                boxes: boxesOf(bd, decimals),
              };
            });
        } else riders = seatRows(h.slots, entries, scheme);
        const counted = riders.flatMap((x) => x.boxes.filter((b) => b.counted && b.score !== null).map((b) => b.score as number));
        out.push({
          id: h.id,
          divisionId: d.id,
          divisionName: d.name,
          roundName,
          tab: `${roundName} · ${heatNumberLabel(h)}`,
          title: [d.name, roundName, heatNumberLabel(h)].join(" · "),
          state,
          riders,
          countedScores: counted,
          trickCount: riders.reduce((n, x) => n + x.boxes.length, 0),
          attemptsPerRider: model?.heat.maxAttemptsPerRider ?? null,
          mode,
          publishedAt: h.published_at,
        });
      }
    }
  }
  return out;
}

/** The leaderboard opens on the live heat, otherwise the last released one, otherwise the first heat. */
export function defaultHeatId(tabs: HeatVM[], liveHeatId: string | null): string | null {
  if (liveHeatId && tabs.some((t) => t.id === liveHeatId)) return liveHeatId;
  const live = tabs.find((t) => t.state === "live");
  if (live) return live.id;
  const done = tabs.filter((t) => t.state === "complete" && t.publishedAt).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  return done[0]?.id ?? tabs[0]?.id ?? null;
}
