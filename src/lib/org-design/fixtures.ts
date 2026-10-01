import formatJson from "../../../presets/formats/kota-dingle.json";
import legacyJson from "../../../presets/scoring/legacy-kol-best3-variety.json";
import quickJson from "../../../presets/scoring/club-quick-best2.json";
import { expandFormat, type DivisionDraw, type Entrant } from "@/lib/engine/ladder";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { describeScoringModel } from "@/lib/scoring-ui/describe";
import { formatClock } from "@/lib/live/timer";

/**
 * A made-up event for the organiser preview (/design/organiser): "Preview Cup", 3 divisions, 18 riders, 5 officials, a ladder drawn by the real
 * ladder engine, a run order, a readiness list. Pure: it reads nothing from the database and everything the page shows comes from here.
 * The names are invented; no real person or event.
 */

export type StepState = "done" | "attention" | "not_started";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10–12 Oct 2026", "30 Sep – 2 Oct 2026", "31 Dec 2026 – 1 Jan 2027", "10 Oct 2026". Dates are YYYY-MM-DD and need no time zone. */
export function formatEventDates(start: string, end: string): string {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const one = (y: number, m: number, d: number) => `${d} ${MONTHS[m - 1]} ${y}`;
  if (start === end) return one(ys, ms, ds);
  if (ys !== ye) return `${one(ys, ms, ds)} – ${one(ye, me, de)}`;
  if (ms !== me) return `${ds} ${MONTHS[ms - 1]} – ${one(ye, me, de)}`;
  return `${ds}–${de} ${MONTHS[me - 1]} ${ye}`;
}

export const PREVIEW_EVENT = {
  name: "Preview Cup",
  slug: "preview-cup",
  start: "2026-10-10",
  end: "2026-10-12",
  dates: formatEventDates("2026-10-10", "2026-10-12"),
  place: "Preview Bay, Egypt",
  timezone: "Africa/Cairo",
  status: "draft" as "draft" | "published" | "live",
  publicUrl: "https://example.org/e/preview-cup",
  joinUrl: "https://example.org/join/PREV-2026",
} as const;

export const ORGANISATIONS = [
  { id: "arrow-like", name: "Preview Kite Club" },
  { id: "second", name: "Demo Watersports" },
] as const;

export const ACCOUNT = { email: "organiser@example.org" } as const;

// ---- divisions and their scoring
// The owner's default model: best 3 of 7 attempts + Variety, 3 judges averaged.
const KOTA: ScoringModel = parseScoringModel(structuredClone(legacyJson));
const QUICK: ScoringModel = parseScoringModel(structuredClone(quickJson));

export interface PreviewDivision {
  id: string;
  name: string;
  scoring: ScoringModel;
}

export const DIVISIONS: readonly PreviewDivision[] = [
  { id: "pro-men", name: "Pro Men", scoring: KOTA },
  { id: "pro-women", name: "Pro Women", scoring: KOTA },
  { id: "juniors", name: "Juniors", scoring: QUICK },
];

/** The real example sentence of the first division's scoring (never typed by hand). */
export const SCORING_SENTENCE = describeScoringModel(DIVISIONS[0].scoring);
/** The Simple dials of a division's Scoring tab (docs/06 decision 32): what the preview lets the visitor change. */
export interface ScoringDials {
  bestN: number;
  attempts: number;
  judges: number;
  aggregate: "mean" | "trimmed_mean" | "median";
  impressionOn: boolean;
  impressionMax: number;
}

export const DEFAULT_DIALS: ScoringDials = { bestN: 3, attempts: 7, judges: 3, aggregate: "mean", impressionOn: true, impressionMax: 10 };

/** The example sentence for a set of dials, from the real describeScoringModel (never assembled by hand here). */
export function sentenceFor(d: ScoringDials): string {
  const model = structuredClone(DIVISIONS[0].scoring);
  model.heat.counting = { type: "best_n", n: d.bestN, distinctTrickNames: false };
  model.heat.maxAttemptsPerRider = d.attempts;
  model.panel.minJudges = d.judges;
  model.panel.maxJudges = Math.max(model.panel.maxJudges, d.judges);
  model.panel.aggregate = d.aggregate;
  if (!d.impressionOn) model.heat.impression = null;
  else if (model.heat.impression) model.heat.impression.scale.max = d.impressionMax;
  return describeScoringModel(model);
}

// ---- riders and officials
export type RiderStatus = "confirmed" | "waiting" | "withdrawn";

export interface PreviewRider {
  id: string;
  bib: number;
  name: string;
  country: string;
  divisionId: string;
  /** Kite size in square metres. */
  kite: number;
  status: RiderStatus;
}

const rider = (n: number, name: string, country: string, divisionId: string, kite: number, status: RiderStatus = "confirmed"): PreviewRider => ({ id: `rider-${n}`, bib: 100 + n, name, country, divisionId, kite, status });

export const RIDERS: readonly PreviewRider[] = [
  rider(1, "Luca Moretti", "IT", "pro-men", 9),
  rider(2, "Jonas Berg", "SE", "pro-men", 10),
  rider(3, "Karim Nassar", "EG", "pro-men", 9),
  rider(4, "Mateo Silva", "BR", "pro-men", 8),
  rider(5, "Tom Harlow", "GB", "pro-men", 10),
  rider(6, "Ahmed Fathy", "EG", "pro-men", 12),
  rider(7, "Leo Brandt", "DE", "pro-men", 9),
  rider(8, "Noah Lemaire", "FR", "pro-men", 8),
  rider(9, "Idris Cole", "ZA", "pro-men", 10),
  rider(10, "Sami Haddad", "LB", "pro-men", 12, "waiting"),
  rider(11, "Maya Lindqvist", "SE", "pro-women", 8),
  rider(12, "Sofia Reyes", "ES", "pro-women", 9),
  rider(13, "Nour Adel", "EG", "pro-women", 7),
  rider(14, "Clara Weiss", "DE", "pro-women", 8),
  rider(15, "Inês Barros", "PT", "pro-women", 9, "waiting"),
  rider(16, "Omar Said", "EG", "juniors", 7),
  rider(17, "Finn Doyle", "IE", "juniors", 8),
  rider(18, "Yara Mostafa", "EG", "juniors", 7, "withdrawn"),
];

export type OfficialRole = "Judge" | "Head judge" | "Spotter";
export interface PreviewOfficial {
  id: string;
  name: string;
  role: OfficialRole;
  hasPin: boolean;
}
export const OFFICIALS: readonly PreviewOfficial[] = [
  { id: "o1", name: "Ali Rashed", role: "Judge", hasPin: true },
  { id: "o2", name: "Hana Moussa", role: "Judge", hasPin: true },
  { id: "o3", name: "Peter Kane", role: "Judge", hasPin: true },
  { id: "o4", name: "Rosa Idris", role: "Head judge", hasPin: true },
  { id: "o5", name: "Mona Kassem", role: "Spotter", hasPin: false },
];

// ---- the steps (state and one-line reason), in the order of the rail
export interface PreviewStep {
  key: "event" | "divisions" | "riders" | "officials" | "draw" | "schedule" | "golive";
  label: string;
  state: StepState;
  reason: string;
}

export const STEPS: readonly PreviewStep[] = [
  { key: "event", label: "Event", state: "done", reason: "Name, dates and place are set" },
  { key: "divisions", label: "Divisions", state: "done", reason: "3 divisions, each with scoring and format" },
  { key: "riders", label: "Riders", state: "done", reason: "15 riders confirmed in 3 divisions" },
  { key: "officials", label: "Officials", state: "attention", reason: "Pro Women needs 3 judges, 2 assigned (+1 more)" },
  { key: "draw", label: "Draw", state: "attention", reason: "Pro Women is drawn but not locked" },
  { key: "schedule", label: "Run order", state: "not_started", reason: "No run order for Saturday yet" },
  { key: "golive", label: "Go live", state: "not_started", reason: "Starts once the draw is locked" },
];

// ---- the readiness checklist of the dashboard (docs/PLAN-phase-7a.md step 2): two done, two needing attention, one not started
export interface ReadinessCheck {
  id: "riders" | "judges" | "draw" | "pins" | "runOrder";
  state: StepState;
  title: string;
  sentence: string;
  /** The step the "Fix" link opens. */
  fixStep: PreviewStep["key"] | null;
}

export const READINESS: readonly ReadinessCheck[] = [
  { id: "riders", state: "done", title: "Riders confirmed", sentence: "Pro Men: 9 riders confirmed · Pro Women: 4 · Juniors: 2", fixStep: null },
  { id: "judges", state: "attention", title: "Judges for every division", sentence: "Pro Women: 2 of 3 judges", fixStep: "officials" },
  { id: "draw", state: "done", title: "Draw locked", sentence: "All 3 divisions are locked", fixStep: null },
  { id: "pins", state: "attention", title: "PINs issued", sentence: "1 seat has no PIN (Mona Kassem, spotter)", fixStep: "officials" },
  { id: "runOrder", state: "not_started", title: "Run order for today", sentence: "There is no run order for today yet", fixStep: "schedule" },
];

// ---- the draw: the real ladder engine on the confirmed riders of the first division
const entrantsOf = (divisionId: string): Entrant[] => RIDERS.filter((r) => r.divisionId === divisionId && r.status === "confirmed").map((r) => ({ id: r.id, name: r.name }));

export const PREVIEW_DRAW: DivisionDraw = expandFormat(parseFormatTemplate(structuredClone(formatJson)), entrantsOf(DIVISIONS[0].id));

// ---- run order: End = Start + length, next Start = End + break (docs/06 §13)
export interface RunOrderInput {
  label: string;
  lengthMin: number;
  breakMin: number;
}
export interface RunOrderRow {
  label: string;
  start: string;
  end: string;
  lengthMin: number;
  breakMin: number;
}

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function runOrderFrom(heats: RunOrderInput[], startMin: number): RunOrderRow[] {
  let t = startMin;
  return heats.map((h) => {
    const row = { label: h.label, start: clock(t), end: clock(t + h.lengthMin), lengthMin: h.lengthMin, breakMin: h.breakMin };
    t += h.lengthMin + h.breakMin;
    return row;
  });
}

export const RUN_ORDER: readonly RunOrderRow[] = runOrderFrom(
  PREVIEW_DRAW.rounds
    .flatMap((r) => r.heats.filter((h) => !h.bye).map((h) => ({ label: `Pro Men · ${r.name} · Heat ${h.index}`, lengthMin: h.durationMin, breakMin: h.roundLast ? h.breakAfterRoundMin : h.breakAfterHeatMin })))
    .slice(0, 6),
  10 * 60,
);

// ---- the Now / Next card: a fixed fake server time (10:24:38), so the timer does not tick on the preview
export function heatTimer({ startedAtSec, lengthMin, serverNowSec }: { startedAtSec: number; lengthMin: number; serverNowSec: number }): { remainingMs: number; text: string } {
  const remainingMs = Math.max(0, (startedAtSec + lengthMin * 60 - serverNowSec) * 1000);
  return { remainingMs, text: formatClock(remainingMs) };
}

export const SERVER_TIME = "10:24:38";
/** Heat 2 started at its planned 10:16, so at 10:24:38 it has 4:22 left; heat 3 is next and the second-chance round follows. */
export const NOW_NEXT = { now: RUN_ORDER[1], next: RUN_ORDER[2], after: RUN_ORDER[3] } as const;
export const TIMER = heatTimer({ startedAtSec: 10 * 3600 + 16 * 60, lengthMin: NOW_NEXT.now.lengthMin, serverNowSec: 10 * 3600 + 24 * 60 + 38 });

// ---- the Advanced fold of a Scoring panel (docs/PLAN-phase-7a.md step 3): every setting has a label, one line and an example, and a default taken from the real model
export interface AdvancedSetting {
  id: "trickWeight" | "impressionWeight" | "duplicateWindow" | "outlier" | "trimMin" | "maxJudges" | "decimals" | "distinct" | "requireAll" | "ratio";
  kind: "number" | "toggle";
  value: number | boolean;
  min?: number;
  max?: number;
  step?: number;
}

const model = DIVISIONS[0].scoring;
export const ADVANCED_SETTINGS: readonly AdvancedSetting[] = [
  { id: "trickWeight", kind: "number", value: model.heat.trickWeight, min: 0, max: 10, step: 0.1 },
  { id: "impressionWeight", kind: "number", value: model.heat.impression?.weight ?? 1, min: 0, max: 10, step: 0.1 },
  { id: "duplicateWindow", kind: "number", value: model.heat.duplicateWindowSec, min: 0, max: 600, step: 1 },
  { id: "outlier", kind: "number", value: model.panel.outlierWarnPct, min: 0, max: 100, step: 1 },
  { id: "trimMin", kind: "number", value: model.panel.trimMinJudges, min: 3, max: 9, step: 1 },
  { id: "maxJudges", kind: "number", value: model.panel.maxJudges, min: 1, max: 9, step: 1 },
  { id: "decimals", kind: "number", value: model.panel.decimals, min: 0, max: 2, step: 1 },
  { id: "distinct", kind: "toggle", value: model.heat.counting.type === "best_n" ? model.heat.counting.distinctTrickNames : false },
  { id: "requireAll", kind: "toggle", value: model.panel.requireAllJudges },
  { id: "ratio", kind: "toggle", value: model.heat.landedRatioHint },
];
