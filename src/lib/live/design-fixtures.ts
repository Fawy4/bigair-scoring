import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import kotaJson from "../../../presets/scoring/kota-best3-impression.json";
import { computeHeat, heatSummary, judgeTrickScore, roundHalfUp, type SummaryAttempt } from "@/lib/engine/scoring";
import type { Attempt, AttemptResult, HeatResult, RiderInput } from "@/lib/engine/scoring";
import { bestInk } from "@/lib/identification/label-style";
import { riderLabelModel, type LabelModel, type LabelRider } from "@/lib/identification/rider-label";
import { builtInSchemes, type IdentificationScheme } from "@/lib/schemas/identification";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { buildTrickVocab } from "@/lib/engine/tricks";
import { blockId, blocksFromVocabulary, type Block, type VocabularyJson } from "@/lib/trick-base";
import { defaultLayout, resolveLayout } from "@/lib/trick-base/layout";
import { copy } from "@/lib/ui-copy";
import type { QueueItem } from "./queue-model";
import type { LiveRider, RiderSheetModel, SheetAttempt } from "./view-types";
export type { LiveRider, RiderSheetModel, SheetAttempt } from "./view-types";
import { formatClock } from "./timer";
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
  /** Percent of the maximum. Kept for exports; no screen shows it unless a division turns "Show scores as % of maximum" on. */
  percent: number | null;
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
      percent: dns || r.percent === null ? null : roundHalfUp(r.percent, 2),
      percentLabel: dns || r.percent === null ? null : copy.live.result.percent(two(r.percent)),
      formula: dns ? null : copy.live.result.formula(r.totalLabel, two(r.components.tricks), KOTA.heat.impression?.label ?? "", two(r.components.impression)),
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

function rowOf(id: string, a: AttemptResult, over: { absent?: string; outlierCell?: boolean; row?: "deleted" | "duplicate"; seq?: number; label?: LabelModel } = {}): MatrixRow {
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
    label: over.label ?? RED_LABEL,
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
export type { HeatSummary, SummaryTrick } from "@/lib/engine/scoring/summary";
import type { HeatSummary } from "@/lib/engine/scoring/summary";
export interface ImpressionRider {
  id: string;
  label: LabelModel;
  summary: HeatSummary;
  /** Judge 1's own Impression / Variety score if already given (docs/08 §1A: 7.5 for Red). */
  initialValue: number | null;
}

/** The numbers on the summary card: the real `heatSummary` of the engine, fed with Judge 1's own scores. */
function summarise(attempts: Attempt[], judgeId = "J1"): HeatSummary {
  const mine: Record<string, number | null> = {};
  const rows: SummaryAttempt[] = attempts.map((a) => {
    const m = a.marks.find((x) => x.judgeId === judgeId)?.value;
    mine[`a${a.seq}`] = typeof m === "object" ? judgeTrickScore(KOTA, m).score : null;
    return { id: `a${a.seq}`, seq: a.seq, status: a.status, trickName: a.trickName ?? null, direction: a.direction ?? null };
  });
  return heatSummary(rows, mine, formatCell);
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

/** The master vocabulary as the real composer and reader take it. */
export function previewVocab() {
  return buildTrickVocab(VOCAB);
}

/** The spotter's blocks in the default layout (the vocabulary's own order); the real screen uses the division's layout. */
export function previewView() {
  return resolveLayout(previewBlocks(), [], defaultLayout());
}

/** Category word for the builder (from the copy file's existing labels). */
export function categoryLabel(key: string | null): string {
  return key ? (copy.trickBase.categoryLabels[key] ?? key) : "";
}

// ---- The judge's phone: a scoring queue
export interface QueueAttempt extends QueueItem {
  id: number;
  riderKey: string;
  riderName: string;
  label: LabelModel;
  /** The rider's own attempt number. */
  seq: number;
  trick: string;
  direction: "left" | "right" | null;
  repeat?: { nth: string; previous: string };
}

const lycraLabel = (name: string, colour: string) => riderLabelModel(FIXTURE_SCHEMES[0], { name, nationality: "EG", slotColour: colour });

/** A made-up rider's sheet: the best three landed scores count (the owner's default model). */
function sheetOf(name: string, label: LabelModel, rows: Array<{ trick: string; direction: "left" | "right"; status: "landed" | "crashed" | "pending"; my?: number }>, max = 7): RiderSheetModel {
  const best = rows.map((r, i) => ({ i, my: r.status === "landed" ? (r.my ?? 0) : -1 })).sort((x, y) => y.my - x.my).slice(0, 3).filter((x) => x.my >= 0).map((x) => x.i);
  const attempts: SheetAttempt[] = rows.map((r, i) => ({ seq: i + 1, trick: r.trick, direction: r.direction, status: r.status, myScoreLabel: r.my !== undefined ? formatCell(r.my) : null, counted: best.includes(i) }));
  return {
    name,
    label,
    attempts,
    left: attempts.filter((a) => a.status === "landed" && a.direction === "left").length,
    right: attempts.filter((a) => a.status === "landed" && a.direction === "right").length,
    counter: `${rows.length} / ${max}`,
  };
}

/**
 * What the judge's phone shows mid-heat. Red's attempts 1 to 5 are docs/08 §1A (the judge is Judge 1: 7.625, 8.25, 7.25, crash, 8.125);
 * the 6th attempt, Blue, Yellow and Green are made up. The spotter logged three attempts the judge has not scored yet: Red 6 (in front), then Blue 4 and Green 3.
 */
export function judgeQueue() {
  const base = redAttempts();
  const red = lycraLabel("Sam Rivera", "red");
  const blue = lycraLabel("Noor Haddad", "blue");
  const green = lycraLabel("Mia Costa", "green");
  const yellow = lycraLabel("Lena Vogt", "yellow");
  const mine = (a: Attempt) => {
    const v = a.marks.find((m) => m.judgeId === "J1")?.value;
    return typeof v === "object" ? judgeTrickScore(KOTA, v).score : null;
  };
  const redItems: QueueAttempt[] = base.map((a, i) => ({
    id: i + 1,
    riderKey: "red",
    riderName: "Sam Rivera",
    label: red,
    seq: a.seq,
    trick: a.trickName ?? "",
    direction: a.direction ?? null,
    status: a.status,
    score: mine(a),
  }));
  const items: QueueAttempt[] = [
    ...redItems,
    { id: 6, riderKey: "red", riderName: "Sam Rivera", label: red, seq: 6, trick: "Left ×2 Backroll", direction: "left", status: "landed", score: null },
    { id: 7, riderKey: "blue", riderName: "Noor Haddad", label: blue, seq: 4, trick: "Right Frontroll", direction: "right", status: "landed", score: null, repeat: { nth: "2nd", previous: "6.5" } },
    { id: 8, riderKey: "green", riderName: "Mia Costa", label: green, seq: 3, trick: "Left Kiteloop", direction: "left", status: "landed", score: null },
  ];
  const heat = redHeat().riders[0];
  const countedSeqs = new Set(heat.counted.map((c) => c.attemptSeq));
  const redSheet: RiderSheetModel = {
    name: "Sam Rivera",
    label: red,
    attempts: [
      ...redItems.map((r) => ({ seq: r.seq, trick: r.trick, direction: r.direction, status: r.status, myScoreLabel: typeof r.score === "number" ? formatCell(r.score) : null, counted: countedSeqs.has(r.seq) })),
      { seq: 6, trick: "Left ×2 Backroll", direction: "left" as const, status: "pending" as const, myScoreLabel: null, counted: false },
    ],
    left: 3,
    right: 1,
    counter: "6 / 7",
  };
  const sheets: Record<string, RiderSheetModel> = {
    red: redSheet,
    blue: sheetOf("Noor Haddad", blue, [
      { trick: "Backroll", direction: "left", status: "landed", my: 7.0 },
      { trick: "Frontroll", direction: "right", status: "landed", my: 6.5 },
      { trick: "Double loop", direction: "left", status: "crashed" },
      { trick: "Right Frontroll", direction: "right", status: "pending" },
    ]),
    yellow: sheetOf("Lena Vogt", yellow, [
      { trick: "Kiteloop", direction: "left", status: "landed", my: 6.0 },
      { trick: "Backroll", direction: "right", status: "landed", my: 7.5 },
      { trick: "Megaloop", direction: "left", status: "crashed" },
      { trick: "Frontroll", direction: "right", status: "landed", my: 6.5 },
      { trick: "Contra loop", direction: "left", status: "crashed" },
      { trick: "Backroll", direction: "left", status: "landed", my: 7.0 },
      { trick: "Straight jump", direction: "right", status: "landed", my: 5.0 },
    ]),
    green: sheetOf("Mia Costa", green, [
      { trick: "Kiteloop", direction: "right", status: "landed", my: 8.0 },
      { trick: "Handle pass", direction: "left", status: "landed", my: 8.5 },
      { trick: "Left Kiteloop", direction: "left", status: "pending" },
    ]),
  };
  const riders: LiveRider[] = [
    { id: "red", label: red, attempts: 6, max: 7 },
    { id: "blue", label: blue, attempts: 4, max: 7 },
    { id: "yellow", label: yellow, attempts: 7, max: 7 },
    { id: "green", label: green, attempts: 3, max: 7 },
  ];
  return { heatName: "Pro Men · R1 · Heat 3", seat: "Judge 1", remainingMs: 330_000, items, riders, sheets };
}

// ---- The head judge who also scores: one login, two tabs (Score = a judge's queue, Control)
function nameOfJudge(id: string): string {
  return copy.live.matrix.judge((PANEL as string[]).indexOf(id) + 1);
}

/** What the head judge's Control tab shows behind Details: the rider totals and the list of what blocks Publish. */
export function headPhone() {
  const rows = resultRows();
  const blockers = [copy.live.head.blockerScore(nameOfJudge("J3"), "BLUE", 2), copy.live.head.blockerImpression(nameOfJudge("J2"), "BLUE", "Impression")];
  return {
    heatName: "Pro Men · R1 · Heat 3",
    state: "running" as const,
    remainingMs: 330_000,
    next: { heat: "Pro Men · R1 · Heat 4", time: "15:23" },
    totals: rows.map((r) => ({ place: r.place, label: r.label, totalLabel: r.totalLabel, status: r.status })),
    blockers,
  };
}

// ---- The head judge's laptop console
export interface ConsoleRow extends MatrixRow {
  riderKey: string;
}

/** Red (docs/08 §1A) plus a possible duplicate of attempt 2 logged by a second spotter, and two attempts of Blue whose Impression score Judge 2 still owes. */
export function headConsole() {
  const blueLabel = lycraLabel("Noor Haddad", "blue");
  const blueAttempts: Attempt[] = [
    // the judges disagree: panel scores stay 7.0 and 6.5, but the cells show the distance colours (red / green / orange and yellow / yellow)
    { seq: 1, status: "landed", trickName: "Backroll", direction: "left", marks: [{ judgeId: "J1", value: flat(3.5) }, { judgeId: "J2", value: flat(8.5) }, { judgeId: "J3", value: flat(9.0) }] },
    { seq: 2, status: "landed", trickName: "Frontroll", direction: "right", marks: [{ judgeId: "J1", value: flat(4.8) }, { judgeId: "J2", value: flat(8.2) }] },
  ];
  const impression = { red: [7.5, 7.0, 8.0], blue: [6.0, null, 6.0] } as Record<string, Array<number | null>>;
  const result = heatOf([
    { riderId: "Red", attempts: redAttempts(), impressionMarks: impressionMarks([7.5, 7.0, 8.0]) },
    { riderId: "Blue", attempts: blueAttempts, impressionMarks: [{ judgeId: "J1", value: 6.0 }, { judgeId: "J3", value: 6.0 }] },
  ]);
  const redRes = result.riders.find((r) => r.riderId === "Red")!;
  const blueRes = result.riders.find((r) => r.riderId === "Blue")!;
  const rows: ConsoleRow[] = [
    ...redRes.allAttempts.map((a) => ({ ...rowOf(`red-${a.seq}`, a), riderKey: "red" })),
    { ...rowOf("red-6", single(structuredClone(redAttempts()[1])), { row: "duplicate", seq: 6 }), riderKey: "red" },
    ...blueRes.allAttempts.map((a) => ({ ...rowOf(`blue-${a.seq}`, a, { label: blueLabel }), riderKey: "blue" })),
  ];
  const totals = [
    { riderKey: "red", label: RED_LABEL, totalLabel: redRes.totalLabel, tricks: two(redRes.components.tricks), impression: two(redRes.components.impression), incomplete: redRes.flags.incomplete },
    { riderKey: "blue", label: blueLabel, totalLabel: blueRes.totalLabel, tricks: two(blueRes.components.tricks), impression: two(blueRes.components.impression), incomplete: true },
  ];
  const owes = result.publishBlockers.flatMap((b) => (b.type === "impression_missing" ? [{ judge: nameOfJudge(b.judge), rider: (b.rider === "Blue" ? blueLabel : RED_LABEL).primary.text }] : []));
  return { judgeIds: [...JUDGE_IDS], rows, totals, owes, impression, blueLabel, labels: { red: "RED", blue: "BLUE" } as Record<string, string>, heatName: "Pro Men · R1 · Heat 3", remaining: formatClock(330_000) };
}

// ---- Public results: the heat summary and the ladder
export interface PublicBox {
  seq: number;
  trick: string;
  status: "landed" | "crashed";
  counted: boolean;
  score: number | null;
  scoreLabel: string | null;
}
export interface PublicRider {
  place: number;
  label: LabelModel;
  hex: string;
  totalLabel: string;
  formula: string | null;
  status: "ok" | "DNS";
  boxes: PublicBox[];
}
export interface PublicHeat {
  id: string;
  name: string;
  status: "complete" | "live" | "scheduled";
  /** The cap per rider (shown as "7 attempts per rider"); null when the heat has no cap. */
  attemptsPerRider: number | null;
  trickCount: number;
  riders: PublicRider[];
  /** Every counted score of the heat, for the yellow-to-green grading across the heat. */
  countedScores: number[];
}

interface Spec {
  name: string;
  colour: string;
  tricks: Array<[string, number | null]>;
  impression: number;
}

/** A made-up heat run through the real engine: every judge gives the same score; best three count; the Impression score is the same from every judge. */
function madeUpHeat(id: string, name: string, status: PublicHeat["status"], cap: number | null, specs: Spec[]): PublicHeat {
  const colourHex = (c: string) => FIXTURE_SCHEMES[0].palette.find((p) => p.key === c)!.hex;
  const riders: RiderInput[] = specs.map((s) => ({
    riderId: s.name,
    attempts: s.tricks.map(([trick, v], i): Attempt => (v === null ? { seq: i + 1, status: "crashed", trickName: trick, marks: [] } : { seq: i + 1, status: "landed", trickName: trick, marks: JUDGE_IDS.map((judgeId) => ({ judgeId, value: flat(v) })) })),
    impressionMarks: impressionMarks([s.impression, s.impression, s.impression]),
  }));
  const result = heatOf(riders);
  const out = result.ranking.map((rk): PublicRider => {
    const r = result.riders.find((x) => x.riderId === rk.riderId)!;
    const spec = specs.find((s) => s.name === rk.riderId)!;
    const countedSeqs = new Set(r.counted.map((c) => c.attemptSeq));
    return {
      place: rk.place,
      label: labelOf(spec.name, spec.colour),
      hex: colourHex(spec.colour),
      totalLabel: r.totalLabel,
      formula: copy.live.result.formula(r.totalLabel, two(r.components.tricks), KOTA.heat.impression?.label ?? "", two(r.components.impression)),
      status: "ok",
      boxes: r.allAttempts.map((a) => ({ seq: a.seq, trick: a.trickName ?? "", status: a.status, counted: countedSeqs.has(a.seq), score: a.panel?.score ?? null, scoreLabel: a.panel?.score == null ? null : two(a.panel.score) })),
    };
  });
  return { id, name, status, attemptsPerRider: cap, trickCount: out.reduce((n, r) => n + r.boxes.length, 0), riders: out, countedScores: out.flatMap((r) => r.boxes.filter((b) => b.counted && b.score !== null).map((b) => b.score as number)) };
}

/** Four heats for the public tabs. Heat 3 is the docs/08 §1A heat (Red 31.54); the others are made up and run through the engine. */
export function publicHeats(): PublicHeat[] {
  const h3rows = resultRows();
  const colour: Record<string, string> = { Red: "red", Blue: "blue", Green: "green" };
  const hex = (c: string) => FIXTURE_SCHEMES[0].palette.find((p) => p.key === c)!.hex;
  const heat3: PublicHeat = {
    id: "h3",
    name: "Heat 3",
    status: "complete",
    attemptsPerRider: 7,
    trickCount: h3rows.reduce((n, r) => n + r.attempts.length, 0),
    riders: h3rows.map((r) => ({
      place: r.place,
      label: r.label,
      hex: hex(colour[r.id]),
      totalLabel: r.totalLabel,
      formula: r.formula,
      status: r.status,
      boxes: r.attempts.map((a) => ({ seq: a.seq, trick: a.trick, status: a.status, counted: a.counted, score: a.scoreLabel === null ? null : Number(a.scoreLabel), scoreLabel: a.scoreLabel })),
    })),
    countedScores: h3rows.flatMap((r) => r.attempts.filter((a) => a.counted && a.scoreLabel !== null).map((a) => Number(a.scoreLabel))),
  };
  return [
    madeUpHeat("h1", "Heat 1", "complete", 7, [
      { name: "Noor Haddad", colour: "pink", tricks: [["Backroll", 7.0], ["Frontroll", 6.5], ["Kiteloop", 6.0], ["Megaloop", null], ["Double loop", 5.5]], impression: 6.5 },
      { name: "Mia Costa", colour: "blue", tricks: [["Kiteloop", 6.5], ["Backroll", 6.0], ["Frontroll", 5.0], ["Handle pass", 5.5]], impression: 5.5 },
      { name: "Lena Vogt", colour: "yellow", tricks: [["Backroll", 5.0], ["Kiteloop", null], ["Frontroll", 4.5]], impression: 5.0 },
    ]),
    madeUpHeat("h2", "Heat 2", "complete", 7, [
      { name: "Omar Fathy", colour: "yellow", tricks: [["Double loop", 8.0], ["Backroll", 7.5], ["Megaloop", 7.0], ["Frontroll", 6.0]], impression: 7.0 },
      { name: "Tariq Boulos", colour: "blue", tricks: [["Kiteloop", 5.5], ["Backroll", null], ["Frontroll", 5.0]], impression: 4.5 },
    ]),
    heat3,
    madeUpHeat("h4", "Heat 4", "live", 7, [
      { name: "Lena Vogt", colour: "yellow", tricks: [["Double loop", 5.3], ["Backroll", 4.5], ["Kiteloop", 3.7], ["Frontroll", 3.3], ["Straight jump", 1.8], ["Megaloop", null], ["Backroll", null]], impression: 4.7 },
      { name: "Noor Haddad", colour: "blue", tricks: [["Backroll", 4.3], ["Kiteloop", 2.8], ["Frontroll", 2.7], ["Handle pass", 2.3], ["Megaloop", null], ["Double loop", null], ["Backroll", null]], impression: 3.3 },
      { name: "Mia Costa", colour: "pink", tricks: [["Kiteloop", 3.7], ["Backroll", 2.2], ["Frontroll", 2.0], ["Straight jump", 2.0], ["Megaloop", null], ["Double loop", null], ["Backroll", null]], impression: 2.2 },
    ]),
  ];
}

export interface LadderRider {
  name: string;
  hex: string;
  ink: string;
  totalLabel: string;
  placeholder: boolean;
}
export interface LadderHeat {
  name: string;
  status: "complete" | "live" | "scheduled";
  riders: LadderRider[];
}
/** The ladder (bracket) view: rounds of heat cards, each rider on a row in their Lycra colour with their total; later seats wait as "1st H1". */
export function ladderView(): { rounds: Array<{ name: string; heats: LadderHeat[] }> } {
  const heats = publicHeats();
  const toRider = (r: PublicRider): LadderRider => ({ name: r.label.secondary.find((x) => x.key === "name")?.text ?? r.label.primary.text, hex: r.hex, ink: bestInk(r.hex), totalLabel: r.totalLabel, placeholder: false });
  const wait = (name: string): LadderRider => ({ name, hex: "#d5dadc", ink: "#111111", totalLabel: copy.live.result.noTotal, placeholder: true });
  const winner = (h: PublicHeat): LadderRider => ({ ...toRider(h.riders[0]), totalLabel: copy.live.result.noTotal });
  return {
    rounds: [
      { name: "Round 1", heats: [{ name: "Heat 1", status: "complete", riders: heats[0].riders.map(toRider) }, { name: "Heat 2", status: "complete", riders: heats[1].riders.map(toRider) }] },
      { name: "Finals", heats: [{ name: "Heat 3", status: "scheduled", riders: [winner(heats[0]), winner(heats[1])] }, { name: "Heat 4", status: "scheduled", riders: [wait("2nd Heat 1"), wait("2nd Heat 2")] }] },
    ],
  };
}
