import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import { computeHeat, judgeTrickScore, roundHalfUp, normaliseTrickName } from "@/lib/engine/scoring";
import type { Attempt, AttemptResult, HeatResult, RiderInput } from "@/lib/engine/scoring";
import { riderLabelModel, type LabelModel, type LabelRider } from "@/lib/identification/rider-label";
import { builtInSchemes, type IdentificationScheme } from "@/lib/schemas/identification";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { blockId, blocksFromVocabulary, type Block, type VocabularyJson } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";
import { formatCell, type CellState, type MatrixCell, type MatrixModel, type MatrixRow, type PanelState } from "./matrix-model";

/**
 * Made-up riders and the real numbers of docs/08 §1A (the KOTA heat: 31.54 = 24.04 + 7.50, 78.85 %).
 * Everything the /design page shows comes from here, so a wrong number shows up in a test, not on the beach.
 * Nothing here touches the database.
 */

export const JUDGE_IDS = ["J1", "J2", "J3"] as const;
const PANEL = [...JUDGE_IDS];

export const KOTA: ScoringModel = parseScoringModel(structuredClone(kotaJson));

const hetx = (h: number, e: number, t: number, x: number) => ({ height: h, extremity: e, technicality: t, execution: x });
const flat = (v: number) => hetx(v, v, v, v);

// ---- docs/08 §1A: Red's heat. Directions and families are added for the summary card (the test document has none).
function redAttempts(): Attempt[] {
  const m = (...values: Array<ReturnType<typeof hetx>>) => values.map((value, i) => ({ judgeId: JUDGE_IDS[i], value }));
  return [
    { seq: 1, status: "landed", trickName: "Kiteloop board-off", direction: "left", categoryKey: "board_off", marks: m(hetx(8.0, 7.5, 7.0, 8.0), hetx(8.5, 8.0, 7.0, 7.5), hetx(8.0, 7.5, 7.5, 8.0)) },
    { seq: 2, status: "landed", trickName: "Double loop", direction: "right", categoryKey: "kiteloop", marks: m(hetx(9.0, 9.0, 8.0, 7.0), hetx(9.0, 8.5, 8.0, 7.5), hetx(8.5, 9.0, 8.5, 7.0)) },
    { seq: 3, status: "landed", trickName: "Late backroll kiteloop", direction: "left", categoryKey: "kiteloop", marks: m(hetx(7.0, 7.0, 6.5, 8.5), hetx(7.5, 7.0, 7.0, 8.0), hetx(7.0, 6.5, 7.0, 8.5)) },
    { seq: 4, status: "crashed", trickName: "Board-off", direction: "right", categoryKey: "board_off", marks: [] },
    { seq: 5, status: "landed", trickName: "Contra loop", direction: "left", categoryKey: "kiteloop", marks: m(hetx(8.5, 8.0, 7.5, 8.5), hetx(8.0, 8.0, 8.0, 8.0), hetx(8.5, 8.5, 7.5, 8.0)) },
  ];
}

const impressionMarks = (values: number[]) => values.map((value, i) => ({ judgeId: JUDGE_IDS[i], value }));

function heatOf(riders: RiderInput[]): HeatResult {
  return computeHeat(KOTA, { panelJudgeIds: PANEL, riders });
}

// ---- Rider labels
/** The three schemes the owner chose to compare: Lycra per heat, bib, name call-out (docs/06 §0). */
export const FIXTURE_SCHEMES: IdentificationScheme[] = (() => {
  const all = builtInSchemes();
  const pick = (id: string, name: string) => ({ ...all.find((s) => s.id === id)!, name });
  return [pick("vests-per-heat", "Lycra colour per heat"), pick("bib-numbers", "Bib / sail number"), pick("name-callout", "Name call-out")];
})();

/** Ten made-up riders; White and Black are in so the outlined Lycras can be judged in sunlight and in the dark theme. */
export function labelRiders(): LabelRider[] {
  const kite = (brand: string, model: string, size: number, colours: string) => ({ brand, model, size, colours });
  return [
    { name: "Sam Rivera", nationality: "EG", slotColour: "red", identifiers: { vest_colour: "red", rashguard_colour: "blue", bib: 14, kite: kite("North", "Orbit", 9, "blue/white") } },
    { name: "Noor Haddad", nationality: "EG", slotColour: "blue", identifiers: { vest_colour: "blue", rashguard_colour: "yellow", bib: 7, kite: kite("Duotone", "Evo", 10, "green") } },
    { name: "Lena Vogt", nationality: "DE", slotColour: "yellow", identifiers: { vest_colour: "yellow", rashguard_colour: "green", bib: 21, kite: kite("Cabrinha", "Switchblade", 8, "orange") } },
    { name: "Omar Fathy", nationality: "EG", slotColour: "white", identifiers: { vest_colour: "white", rashguard_colour: "red", bib: 3, kite: kite("Slingshot", "RPM", 9, "red/black") } },
    { name: "Tariq Boulos", nationality: "EG", slotColour: "black", identifiers: { vest_colour: "black", rashguard_colour: "orange", bib: 88, kite: kite("Core", "XR", 12, "grey") } },
    { name: "Mia Costa", nationality: "BR", slotColour: "green", identifiers: { vest_colour: "green", rashguard_colour: "pink", bib: 45, kite: kite("Naish", "Pivot", 7, "pink") } },
  ];
}

export interface TileRider {
  id: string;
  label: LabelModel;
  attempts: number;
  max: number;
  selected: boolean;
}

/** Spotter and judge strip: Red at 5 / 7 (docs/08 §1A has 5 attempts), a rider out of attempts at 7 / 7 (the legacy vector in §1F: 5 landed + 2 crashed). */
export function tileRiders(scheme: IdentificationScheme = FIXTURE_SCHEMES[0]): TileRider[] {
  const riders = labelRiders();
  const counts: Array<[number, number, boolean]> = [
    [5, 7, true],
    [3, 7, false],
    [7, 7, false],
    [0, 7, false],
  ];
  const pick = [0, 1, 3, 4];
  return counts.map(([attempts, max, selected], i) => ({ id: `t${i}`, label: riderLabelModel(scheme, riders[pick[i]]), attempts, max, selected }));
}

// ---- Result rows
export interface ResultAttempt {
  seq: number;
  trick: string;
  status: "landed" | "crashed";
  counted: boolean;
  scoreLabel: string | null;
}
export interface ResultRowModel {
  id: string;
  place: number;
  label: LabelModel;
  status: "ok" | "DNS";
  totalLabel: string;
  percentLabel: string | null;
  formula: string | null;
  attempts: ResultAttempt[];
}

const lycra = FIXTURE_SCHEMES[0];
const labelOf = (name: string, colour: string) => riderLabelModel(lycra, { name, slotColour: colour });
const two = (n: number) => roundHalfUp(n, 2).toFixed(2);

function attemptsOf(r: HeatResult["riders"][number]): ResultAttempt[] {
  const names = new Map<number, string>();
  return r.allAttempts.map((a) => ({
    seq: a.seq,
    trick: a.trickName ?? names.get(a.seq) ?? "",
    status: a.status,
    counted: a.counted,
    scoreLabel: a.panel?.score === null || a.panel === null ? null : two(a.panel.score),
  }));
}

/** Red (docs/08 §1A, first), Blue (made up, second) and a rider who did not start (docs/08 §1F: DNS gets the last place and no total). */
export function resultRows(): ResultRowModel[] {
  const blue: Attempt[] = [
    { seq: 1, status: "landed", trickName: "Backroll", marks: JUDGE_IDS.map((judgeId) => ({ judgeId, value: flat(7.0) })) },
    { seq: 2, status: "landed", trickName: "Frontroll", marks: JUDGE_IDS.map((judgeId) => ({ judgeId, value: flat(6.5) })) },
    { seq: 3, status: "crashed", trickName: "Double loop", marks: [] },
    { seq: 4, status: "landed", trickName: "Kiteloop", marks: JUDGE_IDS.map((judgeId) => ({ judgeId, value: flat(6.0) })) },
  ];
  const result = heatOf([
    { riderId: "Red", attempts: redAttempts(), impressionMarks: impressionMarks([7.5, 7.0, 8.0]) },
    { riderId: "Blue", attempts: blue, impressionMarks: impressionMarks([6.0, 6.5, 6.0]) },
    { riderId: "Green", attempts: [], modifiers: [{ type: "DNS" }] },
  ]);
  const colourOf: Record<string, [string, string]> = { Red: ["Sam Rivera", "red"], Blue: ["Noor Haddad", "blue"], Green: ["Mia Costa", "green"] };
  return result.ranking.map((rk) => {
    const r = result.riders.find((x) => x.riderId === rk.riderId)!;
    const [name, colour] = colourOf[rk.riderId];
    const dns = r.status === "DNS";
    return {
      id: rk.riderId,
      place: rk.place,
      label: labelOf(name, colour),
      status: dns ? "DNS" : "ok",
      totalLabel: dns ? copy.live.result.noTotal : r.totalLabel,
      percentLabel: dns || r.percent === null ? null : copy.live.result.percent(two(r.percent)),
      formula: dns ? null : copy.live.result.formula(r.totalLabel, two(r.components.tricks), two(r.components.impression)),
      attempts: attemptsOf(r),
    };
  });
}

// ---- The head judge's table
const redHeat = () => heatOf([{ riderId: "Red", attempts: redAttempts(), impressionMarks: impressionMarks([7.5, 7.0, 8.0]) }]);
const RED_LABEL = labelOf("Sam Rivera", "red");

function farthestJudge(scores: Array<{ judgeId: string; score: number }>): string {
  const sorted = scores.map((s) => s.score).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return [...scores].sort((a, b) => Math.abs(b.score - median) - Math.abs(a.score - median))[0].judgeId;
}

function rowOf(id: string, a: AttemptResult, over: { absent?: string; outlierCell?: boolean; row?: "deleted" | "duplicate"; seq?: number } = {}): MatrixRow {
  const crash = a.status === "crashed";
  const out = a.panel?.outlier && over.outlierCell ? farthestJudge(a.panel.judgeScores) : null;
  const cells: MatrixCell[] = JUDGE_IDS.map((judgeId) => {
    let state: CellState;
    const entry = a.panel?.judgeScores.find((j) => j.judgeId === judgeId);
    if (over.row === "deleted") state = "deleted";
    else if (crash) state = "crash";
    else if (over.absent === judgeId) state = "absent";
    else if (a.panel?.missedBy.includes(judgeId)) state = "missed";
    else if (!entry) state = "missing";
    else if (out === judgeId) state = "outlier";
    else state = "scored";
    const value = entry && state !== "deleted" ? entry.score : null;
    const shown = entry && (state === "scored" || state === "outlier" || state === "deleted");
    return { judgeId, state, value, label: shown ? formatCell(entry!.score) : "—" };
  });
  const panelState: PanelState = crash ? "none" : a.panel?.incomplete ? "incomplete" : a.panel?.outlier ? "outlier" : "ok";
  const panel = crash ? null : (a.panel?.score ?? null);
  return {
    id,
    seq: over.seq ?? a.seq,
    label: RED_LABEL,
    trick: a.trickName ?? "",
    status: a.status,
    state: over.row ?? "ok",
    cells,
    panel,
    panelLabel: panel === null ? "—" : two(panel),
    panelState,
  };
}

/** Docs/08 §1A, all scored: the panel column reads 7.71 / 8.25 / 7.29 / crash / 8.08. */
export function matrixMain(): MatrixModel {
  const attempts = redHeat().riders[0].allAttempts;
  return { judgeIds: [...JUDGE_IDS], rows: attempts.map((a) => rowOf(`a${a.seq}`, a)) };
}

function single(a: Attempt): AttemptResult {
  return heatOf([{ riderId: "Red", attempts: [a], impressionMarks: impressionMarks([7.5, 7.0, 8.0]) }]).riders[0].allAttempts[0];
}

/** One row for each state a cell or row can be in. Values come from docs/08 §1A-i (7.31, incomplete) and §1F (Missed, 7.31); the outlier row is made up. */
export function matrixStates(): MatrixModel {
  const base = redAttempts();
  const attempt = (seq: number) => structuredClone(base.find((a) => a.seq === seq)!);

  const missing = attempt(3);
  missing.marks = missing.marks.filter((m) => m.judgeId !== "J3");
  const missed = attempt(3);
  missed.marks = missed.marks.map((m) => (m.judgeId === "J3" ? { ...m, value: "missed" as const } : m));
  const absent = attempt(2);
  absent.marks = absent.marks.map((m) => (m.judgeId === "J2" ? { ...m, value: "missed" as const } : m));
  const outlier: Attempt = { seq: 6, status: "landed", trickName: "Frontroll", direction: "left", marks: [{ judgeId: "J1", value: flat(7.0) }, { judgeId: "J2", value: flat(7.0) }, { judgeId: "J3", value: flat(8.6) }] };
  const dup = attempt(2);

  return {
    judgeIds: [...JUDGE_IDS],
    rows: [
      rowOf("scored", single(attempt(2))),
      rowOf("missing", single(missing)),
      rowOf("missed", single(missed)),
      rowOf("absent", single(absent), { absent: "J2" }),
      rowOf("outlier", single(outlier), { outlierCell: true }),
      rowOf("crash", single(attempt(4))),
      rowOf("duplicate", single(dup), { row: "duplicate", seq: 7 }),
      rowOf("deleted", single(dup), { row: "deleted", seq: 8 }),
    ],
  };
}

// ---- The impression step
export interface SummaryTrick {
  seq: number;
  trick: string;
  scoreLabel: string;
}
export interface HeatSummary {
  attempts: number;
  landed: number;
  crashed: number;
  different: number;
  repeats: number;
  left: number;
  right: number;
  families: string[];
  landedList: SummaryTrick[];
}
export interface ImpressionRider {
  id: string;
  label: LabelModel;
  summary: HeatSummary;
  /** Judge 1's own Impression / Variety score if already given (docs/08 §1A: 7.5 for Red). */
  initialValue: number | null;
}

/** The numbers on the summary card. Preview only: the engine's heatSummary() is written in 5b and replaces this. */
function summarise(attempts: Attempt[], judgeId = "J1"): HeatSummary {
  const landed = attempts.filter((a) => a.status === "landed");
  const names = landed.map((a) => normaliseTrickName(a.trickName ?? ""));
  const mine = landed
    .map((a) => {
      const m = a.marks.find((x) => x.judgeId === judgeId)?.value;
      const score = typeof m === "object" ? judgeTrickScore(KOTA, m).score : 0;
      return { seq: a.seq, trick: a.trickName ?? "", score };
    })
    .sort((x, y) => y.score - x.score || x.seq - y.seq);
  const families = [...new Set(landed.map((a) => a.categoryKey).filter((k): k is string => Boolean(k)))].map((k) => KOTA.categories.find((c) => c.key === k)?.label ?? k);
  return {
    attempts: attempts.length,
    landed: landed.length,
    crashed: attempts.length - landed.length,
    different: new Set(names).size,
    repeats: names.length - new Set(names).size,
    left: landed.filter((a) => a.direction === "left").length,
    right: landed.filter((a) => a.direction === "right").length,
    families,
    landedList: mine.map((x) => ({ seq: x.seq, trick: x.trick, scoreLabel: formatCell(x.score) })),
  };
}

export function impressionRiders(): ImpressionRider[] {
  const solo = (seq: number, trick: string, v: number, direction: "left" | "right", categoryKey: string): Attempt => ({
    seq,
    status: "landed",
    trickName: trick,
    direction,
    categoryKey,
    marks: JUDGE_IDS.map((judgeId) => ({ judgeId, value: flat(v) })),
  });
  const blue = [solo(1, "Backroll", 7.0, "left", "rotation"), solo(2, "Frontroll", 6.5, "right", "rotation"), { seq: 3, status: "crashed" as const, trickName: "Double loop", direction: "left" as const, categoryKey: "kiteloop", marks: [] }, solo(4, "Backroll", 6.0, "left", "rotation")];
  const green = [solo(1, "Kiteloop", 8.0, "right", "kiteloop"), solo(2, "Handle pass", 8.5, "left", "handle_pass")];
  return [
    { id: "red", label: labelOf("Sam Rivera", "red"), summary: summarise(redAttempts()), initialValue: 7.5 },
    { id: "blue", label: labelOf("Noor Haddad", "blue"), summary: summarise(blue), initialValue: null },
    { id: "green", label: labelOf("Mia Costa", "green"), summary: summarise(green), initialValue: null },
  ];
}

// ---- The spotter's builder
const VOCAB = vocabularyJson as unknown as VocabularyJson & { namingTemplate: string; hideMultiplierWhen: string };

/** Every block of the master vocabulary, in family order. */
export function previewBlocks(): Block[] {
  return blocksFromVocabulary(VOCAB, []);
}
export function blockIdsFor(): string[] {
  return previewBlocks().map(blockId);
}

export interface PreviewParts {
  direction?: string | null;
  multiplier?: string | null;
  base?: string | null;
  /** Add-ons and grabs, in any order. */
  addons: string[];
}

/**
 * The name and category for the builder's preview. Preview only: the real composer and parser (src/lib/engine/tricks) are built in 5b.
 * Rules shown here, from docs/08 §1F: the template is "{direction} {multiplier} {base} {modifiers}", "×1" is hidden,
 * add-ons are written in vocabulary order (not tap order), and the category is the first of the precedence list present.
 */
export function previewCompose(parts: PreviewParts): { name: string; categoryKey: string | null } {
  const blocks = previewBlocks();
  const find = (family: string, key?: string | null) => (key ? blocks.find((b) => b.family === family && b.key === key) : undefined);
  const dir = find("direction", parts.direction);
  const mult = parts.multiplier === VOCAB.hideMultiplierWhen ? undefined : find("multiplier", parts.multiplier);
  const base = find("base", parts.base);
  const mods = blocks.filter((b) => (b.family === "addon" || b.family === "grab_landing") && parts.addons.includes(b.key));
  const name = [dir?.label, mult?.label, base?.label, ...mods.map((m) => m.label)].filter(Boolean).join(" ");
  const present = new Set([base?.category, ...mods.map((m) => m.category)].filter((c): c is string => Boolean(c)));
  const categoryKey = VOCAB.categoryPrecedence.find((k) => present.has(k)) ?? null;
  return { name, categoryKey };
}

/** Category word for the builder (from the copy file's existing labels). */
export function categoryLabel(key: string | null): string {
  return key ? (copy.trickBase.categoryLabels[key] ?? key) : "";
}
