// Test fixtures (used only by *.test.ts). Presets are imported as JSON so the engine stays I/O-free.
import clubQuick from "../../../../presets/scoring/club-quick-best2.json";
import gka from "../../../../presets/scoring/gka-category-overall.json";
import kota from "../../../../presets/scoring/kota-best3-impression.json";
import legacy from "../../../../presets/scoring/legacy-kol-best3-variety.json";
import megaloop from "../../../../presets/scoring/megaloop-single-best.json";
import overall from "../../../../presets/scoring/overall-impression.json";
import pukl from "../../../../presets/scoring/pukl-points.json";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import type { Attempt, JudgeMarkValue } from "./types";

const PRESETS = {
  "club-quick-best2": clubQuick,
  "gka-category-overall": gka,
  "kota-best3-impression": kota,
  "legacy-kol-best3-variety": legacy,
  "megaloop-single-best": megaloop,
  "overall-impression": overall,
  "pukl-points": pukl,
} as const;

export type PresetId = keyof typeof PRESETS;

/** A fresh, parsed copy of a preset; `edit` may mutate it before it is returned. */
export function preset(id: PresetId, edit?: (m: ScoringModel) => void): ScoringModel {
  const model = parseScoringModel(structuredClone(PRESETS[id]));
  edit?.(model);
  return model;
}

export const J3 = ["J1", "J2", "J3"];

/** KOTA criteria order: height, extremity, technicality, execution. */
export function hetx(h: number, e: number, t: number, x: number) {
  return { height: h, extremity: e, technicality: t, execution: x };
}

/** PUKL criteria order: height, risk, technicality, ingenuity. */
export function hrti(h: number, r: number, t: number, i: number) {
  return { height: h, risk: r, technicality: t, ingenuity: i };
}

/** Megaloop criteria order: extremity, trick, style, landing. */
export function etsl(e: number, t: number, s: number, l: number) {
  return { extremity: e, trick: t, style: s, landing: l };
}

/** A landed attempt; marks[i] belongs to judges[i]. `undefined` = judge has not scored yet. */
export function landed(
  seq: number,
  marks: Array<JudgeMarkValue | undefined>,
  extra: Partial<Attempt> = {},
  judges: string[] = J3,
): Attempt {
  return {
    seq,
    status: "landed",
    marks: marks.flatMap((value, i) => (value === undefined ? [] : [{ judgeId: judges[i], value }])),
    ...extra,
  };
}

export function crashed(seq: number, extra: Partial<Attempt> = {}): Attempt {
  return { seq, status: "crashed", marks: [], ...extra };
}

/** Same single mark from every judge. */
export function same(value: number, judges: string[] = J3): number[] {
  return judges.map(() => value);
}

export function impressions(values: number[], judges: string[] = J3) {
  return values.map((value, i) => ({ judgeId: judges[i], value }));
}
