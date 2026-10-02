import { parseFormatTemplate, type FormatTemplate } from "@/lib/schemas/format-template";
import { perRoundRows } from "./per-round";

/**
 * "Timing per round" (Polish 2, item 10): one table for the heat timing of a division — warm-up, heat length and break after each heat, round by round — with an
 * "Every round" line for the division's own numbers. A generated ladder stores a round's own numbers beside the generator (roundWarmUpMin, roundDurationMin,
 * roundBreakAfterHeatMin); a fixed format writes them on the round itself. Only real differences are stored: a round's number equal to the division's clears it.
 * These are the starting plan: the run order can still change each heat.
 */
export type TimingField = "warmUp" | "length" | "breakAfter";
export interface TimingCell {
  value: number;
  /** The round has its own number (not the division's). */
  own: boolean;
}
export interface TimingRow {
  id: string;
  shortName: string;
  name: string;
  warmUp: TimingCell;
  length: TimingCell;
  breakAfter: TimingCell;
  /** The division's numbers for this round (what a blank box falls back to). */
  defaults: Record<TimingField, number>;
}
type Working = Record<string, unknown>;

const MAP_KEY: Record<TimingField, "roundWarmUpMin" | "roundDurationMin" | "roundBreakAfterHeatMin"> = { warmUp: "roundWarmUpMin", length: "roundDurationMin", breakAfter: "roundBreakAfterHeatMin" };
const ROUND_KEY: Record<TimingField, "warmUpMin" | "durationMin" | "breakAfterHeatMin"> = { warmUp: "warmUpMin", length: "durationMin", breakAfter: "breakAfterHeatMin" };
/** The generators' own heat lengths (minutes): the same numbers as the table, so they are written by its "Every round" line and not shown twice. */
export const GENERATOR_LENGTH_PARAMS = ["earlyMin", "semiMin", "finalMin", "r1Min", "repMin", "koMin", "poolMin", "mainMin", "secondMin", "qualifyingMin", "smallFinalMin", "heatMin"] as const;

const TIMING_KEY = { warmUp: "warmUpBeforeHeatMin", length: "defaultHeatMin", breakAfter: "defaultBreakAfterHeatMin", breakAfterRound: "defaultBreakAfterRoundMin" } as const;

/** The division's own numbers: warm-up, heat length, break after each heat, break after the last heat of a round. */
export function timingDefaults(working: Working): { warmUp: number; length: number; breakAfterHeat: number; breakAfterRound: number } {
  const t = (working.timing ?? {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  return { warmUp: n(t.warmUpBeforeHeatMin, 0), length: n(t.defaultHeatMin, 10), breakAfterHeat: n(t.defaultBreakAfterHeatMin, 0), breakAfterRound: n(t.defaultBreakAfterRoundMin, 0) };
}

function parse(working: Working): FormatTemplate | null {
  try {
    return parseFormatTemplate(working);
  } catch {
    return null;
  }
}

/** The table's rows: the preview's rounds (a generated ladder) or the format's rounds (a fixed format); none for a custom ladder (its builder has them). */
export function timingRows(working: Working, riders: number): TimingRow[] {
  const template = parse(working);
  if (!template) return [];
  const d = timingDefaults(working);
  if (template.kind === "generator") {
    const own = (k: TimingField) => ((working[MAP_KEY[k]] as Record<string, number> | undefined) ?? {});
    return perRoundRows(template, riders).map((r) => {
      const defaults = { warmUp: d.warmUp, length: r.defaultMin, breakAfter: d.breakAfterHeat };
      const cell = (k: TimingField): TimingCell => (own(k)[r.id] !== undefined ? { value: own(k)[r.id], own: true } : { value: defaults[k], own: false });
      return { id: r.id, shortName: r.shortName, name: r.name, warmUp: cell("warmUp"), length: cell("length"), breakAfter: cell("breakAfter"), defaults };
    });
  }
  if (template.kind === "fixed") {
    return (template.rounds ?? []).map((spec) => {
      const raw = ((working.rounds as Array<Record<string, unknown>> | undefined) ?? []).find((x) => x.id === spec.id) ?? {};
      const defaults = { warmUp: d.warmUp, length: d.length, breakAfter: d.breakAfterHeat };
      const cell = (k: TimingField): TimingCell => (typeof raw[ROUND_KEY[k]] === "number" ? { value: raw[ROUND_KEY[k]] as number, own: true } : { value: defaults[k], own: false });
      return { id: spec.id, shortName: spec.shortName, name: spec.name, warmUp: cell("warmUp"), length: cell("length"), breakAfter: cell("breakAfter"), defaults };
    });
  }
  return [];
}

/** One box of a round. Blank, or the division's own number, clears it. `fallback` is what the box shows when it has no number of its own. */
export function withTimingCell(working: Working, roundId: string, field: TimingField, value: number | "", fallback?: number): Working {
  const d = timingDefaults(working);
  const def = fallback ?? (field === "warmUp" ? d.warmUp : field === "length" ? d.length : d.breakAfterHeat);
  const clear = value === "" || value === def;
  if (working.kind === "fixed" && Array.isArray(working.rounds)) {
    const rounds = (working.rounds as Array<Record<string, unknown>>).map((r) => {
      if (r.id !== roundId) return r;
      const { [ROUND_KEY[field]]: _old, ...rest } = r;
      void _old;
      return clear ? rest : { ...rest, [ROUND_KEY[field]]: value };
    });
    return { ...working, rounds };
  }
  const key = MAP_KEY[field];
  const current = { ...((working[key] as Record<string, number> | undefined) ?? {}) };
  if (clear) delete current[roundId];
  else current[roundId] = value as number;
  const { [key]: _old, ...rest } = working;
  void _old;
  return Object.keys(current).length > 0 ? { ...rest, [key]: current } : rest;
}

/** The "Every round" line: the division's own number, which every round without its own follows. */
export function withTimingDefault(working: Working, field: TimingField | "breakAfterRound", value: number | ""): Working {
  const timing = { ...((working.timing as Record<string, unknown> | undefined) ?? {}) };
  const key = TIMING_KEY[field];
  if (value === "") {
    if (key === "warmUpBeforeHeatMin") delete timing[key];
    else return working; // the division's heat length and breaks cannot be blank
  } else timing[key] = value;
  // a generated ladder's heat length lives in its generator too: "Every round" sets them all
  const g = working.generator as { params?: Record<string, unknown> } | undefined;
  if (field === "length" && value !== "" && g?.params) {
    const params = { ...g.params };
    for (const k of GENERATOR_LENGTH_PARAMS) if (k in params) params[k] = value;
    return { ...working, timing, generator: { ...g, params } };
  }
  return { ...working, timing };
}

/** Forget every round's own numbers: every round follows the division's again. */
export function withoutRoundTiming(working: Working): Working {
  if (working.kind === "fixed" && Array.isArray(working.rounds)) {
    return { ...working, rounds: (working.rounds as Array<Record<string, unknown>>).map(({ durationMin: _a, warmUpMin: _b, breakAfterHeatMin: _c, ...r }) => (void _a, void _b, void _c, r)) };
  }
  const { roundDurationMin: _a, roundWarmUpMin: _b, roundBreakAfterHeatMin: _c, ...rest } = working;
  void _a;
  void _b;
  void _c;
  return rest;
}

/** What More settings leaves out because the table holds it: the division's timing and each round's own numbers (fixed formats), the generators' lengths. */
export const TIMING_MORE_HIDDEN: string[] = [
  "timing",
  "rounds.*.durationMin",
  "rounds.*.warmUpMin",
  "rounds.*.breakAfterHeatMin",
  ...GENERATOR_LENGTH_PARAMS.map((k) => `generator.params.${k}`),
];
