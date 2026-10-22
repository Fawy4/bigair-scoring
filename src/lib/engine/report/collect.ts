import { buildTrickIndex, familyOf, hasLoop, trickKey, trickLabel, type TrickIndex } from "./tricks";
import type { Outcome, ReportAttempt, ReportContext, ReportHeat, ReportResult, ReportRound } from "./types";

/** Everything one rider did in one published heat, with the context the rules need. */
export interface RiderHeat {
  divisionId: string;
  round: ReportRound;
  roundIndex: number;
  heat: ReportHeat;
  heatLabel: string;
  /** "Round 3 · Heat 14" */
  title: string;
  entryId: string;
  result: ReportResult | null;
  outcome: Outcome;
  /** The attempts the result counts (an attempt over the cap is not one). */
  attempts: Attempt[];
  riders: number;
  lengthSec: number;
}

export interface Attempt extends ReportAttempt {
  key: string | null;
  label: string;
  loop: boolean;
  family: string;
}

export const heatNumber = (h: ReportHeat): string => `${h.number}${h.suffix ?? ""}`;
export const roundName = (r: ReportRound): string => r.name;

/** Length of the heat on the clock without the pauses; the planned length when the heat has no start or end. */
export function heatLength(h: ReportHeat): number {
  if (h.started_at && h.ended_at) {
    const s = (Date.parse(h.ended_at) - Date.parse(h.started_at)) / 1000 - (h.paused_total_sec || 0);
    if (s > 0) return Math.round(s);
  }
  return h.duration_sec;
}

function outcomeOf(round: ReportRound, h: ReportHeat, r: ReportResult | null, slotModifier: string | null, withdrawn: boolean): Outcome {
  const st = r?.status ?? null;
  if (st === "WO") return "walkover";
  if (st === "OUT" || (!r && slotModifier === "DNS" && withdrawn)) return "out_of_event";
  if (st === "DNS" || (!r && slotModifier === "DNS")) return withdrawn ? "out_of_event" : "did_not_start";
  if (st === "DNF") return "did_not_finish";
  if (st === "DSQ") return "disqualified";
  const place = r?.place ?? null;
  if (place === null) return "done";
  const rule = (round.advance ?? []).find((a) => a.places === "rest" || (Array.isArray(a.places) && a.places.includes(place)));
  const specific = (round.advance ?? []).find((a) => Array.isArray(a.places) && a.places.includes(place));
  const hit = specific ?? rule;
  if (place === 1 && h.results.filter((x) => !x.status || x.status === "ok").length > 1) return "won";
  if (!hit) return "done";
  if (hit.to === "eliminated") return "out";
  if (hit.to === "final_placing") return "done";
  return "through";
}

const ridden = (o: Outcome): boolean => o === "won" || o === "through" || o === "out" || o === "done" || o === "did_not_finish";

export const didRide = (rh: RiderHeat): boolean => ridden(rh.outcome);

/** Every published heat the entry has a seat in, in the order they were ridden. */
export function riderHeats(ctx: ReportContext, entryId: string, idx: TrickIndex): RiderHeat[] {
  const entry = ctx.data.entries.find((e) => e.id === entryId);
  const out: RiderHeat[] = [];
  for (const d of ctx.data.divisions) {
    const rounds = [...d.rounds].sort((a, b) => a.sort_order - b.sort_order);
    rounds.forEach((round, roundIndex) => {
      for (const heat of round.heats) {
        const slot = heat.slots.find((s) => s.entry_id === entryId);
        const result = heat.results.find((r) => r.entry_id === entryId) ?? null;
        if (!slot && !result) continue;
        const outcome = outcomeOf(round, heat, result, slot?.modifier ?? null, Boolean(entry?.withdrawn));
        const attempts: Attempt[] = (result?.attempts ?? [])
          .filter((a) => a.ignored !== "over_cap")
          .map((a) => ({ ...a, key: trickKey(idx, a), label: trickLabel(idx, a), loop: hasLoop(idx, a), family: familyOf(a) }));
        out.push({
          divisionId: d.id,
          round,
          roundIndex,
          heat,
          heatLabel: `Heat ${heatNumber(heat)}`,
          title: `${roundName(round)} · Heat ${heatNumber(heat)}`,
          entryId,
          result,
          outcome,
          attempts: ridden(outcome) ? attempts : [],
          riders: heat.results.filter((r) => !r.status || r.status === "ok").length,
          lengthSec: heatLength(heat),
        });
      }
    });
  }
  return out.sort((a, b) => a.roundIndex - b.roundIndex || a.heat.number - b.heat.number || (a.heat.suffix ?? "").localeCompare(b.heat.suffix ?? ""));
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------
// one rider's figures over his ridden heats

export interface Agg {
  entryId: string;
  heats: RiderHeat[];
  jumps: number;
  landed: number;
  crashed: number;
  different: Set<string>;
  differentPerHeat: number | null;
  loopsTried: number;
  loopsLanded: number;
  loopJumps: number;
  left: number;
  right: number;
  withDirection: number;
  heatsWon: number;
  totals: number[];
  impressions: number[];
  landedScores: number[];
  bestTrick: { score: number; label: string; key: string | null } | null;
}

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
export function spread(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

export function aggregate(entryId: string, all: RiderHeat[]): Agg {
  const heats = all.filter(didRide);
  const a: Agg = { entryId, heats, jumps: 0, landed: 0, crashed: 0, different: new Set(), differentPerHeat: null, loopsTried: 0, loopsLanded: 0, loopJumps: 0, left: 0, right: 0, withDirection: 0, heatsWon: 0, totals: [], impressions: [], landedScores: [], bestTrick: null };
  const perHeat: number[] = [];
  for (const rh of heats) {
    const keys = new Set<string>();
    for (const t of rh.attempts) {
      a.jumps++;
      if (t.status === "landed") {
        a.landed++;
        if (t.key) {
          a.different.add(t.key);
          keys.add(t.key);
        }
        if (t.score !== null) {
          a.landedScores.push(t.score);
          if (!a.bestTrick || t.score > a.bestTrick.score) a.bestTrick = { score: t.score, label: t.label, key: t.key };
        }
      } else a.crashed++;
      if (t.loop) {
        a.loopsTried++;
        a.loopJumps++;
        if (t.status === "landed") a.loopsLanded++;
      }
      if (t.direction === "left") {
        a.left++;
        a.withDirection++;
      } else if (t.direction === "right") {
        a.right++;
        a.withDirection++;
      }
    }
    perHeat.push(keys.size);
    if (rh.outcome === "won") a.heatsWon++;
    if (rh.result?.total !== null && rh.result?.total !== undefined) a.totals.push(Number(rh.result.total));
    if (rh.result?.impression !== null && rh.result?.impression !== undefined) a.impressions.push(Number(rh.result.impression));
  }
  a.differentPerHeat = mean(perHeat);
  return a;
}

/** Every rider of every division with at least one ridden heat. */
export function everyone(ctx: ReportContext, idx: TrickIndex): Map<string, Agg & { divisionId: string }> {
  const m = new Map<string, Agg & { divisionId: string }>();
  for (const e of ctx.data.entries) {
    const hs = riderHeats(ctx, e.id, idx);
    const g = aggregate(e.id, hs);
    if (g.heats.length) m.set(e.id, { ...g, divisionId: e.division_id });
  }
  return m;
}

export const indexOf = (ctx: ReportContext): TrickIndex => buildTrickIndex(ctx.data.blocks, ctx.loopCategories);

/** The entries that rode the division's last round (published): the finalists. Null when that round has no published heat. */
export function finalistIds(ctx: ReportContext, divisionId: string): Set<string> | null {
  const d = ctx.data.divisions.find((x) => x.id === divisionId);
  if (!d) return null;
  const rounds = [...d.rounds].sort((a, b) => a.sort_order - b.sort_order);
  const last = rounds[rounds.length - 1];
  if (!last || !last.heats.length) return null;
  const ids = new Set<string>();
  for (const h of last.heats) for (const r of h.results) if (!r.status || r.status === "ok") ids.add(r.entry_id);
  return ids.size ? ids : null;
}
