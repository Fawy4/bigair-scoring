import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { flagPossibleDuplicates, repeatIndexes } from "./attempts";
import { categoryLimit, selectCounted, type EligibleTrick } from "./counting";
import { judgeTrickScore } from "./judge";
import { panelScore, type PanelInput } from "./panel";
import { rankHeat } from "./rank";
import { formatScore, nearestOnScale, roundHalfUp, ScoringInputError } from "./round";
import type {
  AdjustedMark,
  AttemptResult,
  CriteriaValues,
  HeatInput,
  HeatResult,
  IgnoredMark,
  PanelScore,
  PublishBlocker,
  RiderInput,
  RiderResult,
  RiderStatus,
} from "./types";

/**
 * The maximum possible heat total (for the percentage), or null when there is none
 * (e.g. counting "all" without an attempt cap). Decision log #6.
 */
export function maxRawFor(model: ScoringModel): number | null {
  const { heat, trick } = model;
  if (heat.total.maxRaw !== "auto") return heat.total.maxRaw;

  let countedSlots: number | null;
  switch (heat.counting.type) {
    case "best_n":
      countedSlots = heat.counting.n;
      break;
    case "single_best":
      countedSlots = 1;
      break;
    case "best_per_category": {
      // Best possible combination: the largest limits of the categories that may count (decision 5).
      const c = heat.counting;
      const limits = model.categories.map((cat) => categoryLimit(c, cat.key)).sort((a, b) => b - a);
      countedSlots = limits.slice(0, c.categoriesCounted ?? limits.length).reduce((s, n) => s + n, 0);
      break;
    }
    case "all":
      countedSlots = heat.maxAttemptsPerRider;
      break;
    case "none":
      countedSlots = 0;
      break;
  }
  if (countedSlots === null) return null;

  // countedWeights: Σ weights over the slots (missing = 1) instead of the slot count (decision 5).
  let weightSum = 0;
  for (let i = 0; i < countedSlots; i++) weightSum += heat.countedWeights?.[i] ?? 1;

  let max = weightSum * trick.scale.max * heat.trickWeight;
  if (heat.impression) max += heat.impression.scale.max * heat.impression.weight;
  const hs = model.heightSensor;
  if (hs.enabled && hs.use === "bonus" && hs.bonus) max += hs.bonus.capPoints;
  return max > 0 ? max : null;
}

function riderStatus(rider: RiderInput): RiderStatus {
  const types = new Set((rider.modifiers ?? []).map((m) => m.type));
  if (types.has("DSQ")) return "DSQ";
  if (types.has("DNS")) return "DNS";
  if (types.has("DNF")) return "DNF";
  return "ok";
}

/**
 * The mark as the maths will use it (audit A1a-3): values off the step go to the nearest step, values outside the scale to the nearest end, and each
 * change is written to `adjusted`. Returns null when nothing usable is left (not a number): that judge then counts as not having scored.
 */
function usableTrickMark(model: ScoringModel, judgeId: string, seq: number, value: number | CriteriaValues, adjusted: AdjustedMark[]): number | CriteriaValues | null {
  const { trick } = model;
  const note = (label: string, given: number, scale: { min: number; max: number; step: number }, n: ReturnType<typeof nearestOnScale>) => {
    if (n.problem) adjusted.push({ judgeId, attemptSeq: seq, label, given, used: n.value, problem: n.problem, step: scale.step, min: scale.min, max: scale.max });
  };
  if (typeof value === "number") {
    if (trick.entry !== "single") return value; // the wrong shape for this model: judgeTrickScore decides
    const n = nearestOnScale(value, trick.scale);
    note("Trick score", value, trick.scale, n);
    return n.value;
  }
  if (trick.entry !== "criteria") return value;
  const out: CriteriaValues = { ...value };
  let usable = true;
  for (const c of trick.criteria) {
    const v = value[c.key];
    if (typeof v !== "number") continue; // a missing criterion: judgeTrickScore decides
    const n = nearestOnScale(v, c.scale);
    note(c.label, v, c.scale, n);
    if (n.value === null) usable = false;
    else out[c.key] = n.value;
  }
  return usable ? out : null;
}

function attemptPanel(
  model: ScoringModel,
  attempt: RiderInput["attempts"][number],
  panelJudgeIds: string[],
  adjusted: AdjustedMark[],
): PanelScore {
  const onPanel = new Set(panelJudgeIds);
  const inputs: PanelInput[] = [];
  for (const m of attempt.marks) {
    if (!onPanel.has(m.judgeId)) continue;
    if (m.value === "missed") {
      if (!model.trick.allowNoScore) {
        throw new ScoringInputError(`Model "${model.id}" does not allow "Missed" (judge ${m.judgeId}, attempt ${attempt.seq})`);
      }
      inputs.push({ judgeId: m.judgeId, score: "missed" });
      continue;
    }
    const mark = usableTrickMark(model, m.judgeId, attempt.seq, m.value, adjusted);
    if (mark === null) continue; // not a number: left out
    try {
      const j = judgeTrickScore(model, mark, { heightM: attempt.heightM });
      inputs.push({ judgeId: m.judgeId, score: j.score, detail: j.detail });
    } catch (e) {
      // A mark the model cannot read at all (a criterion missing, one it does not have): this judge counts as not having scored; the heat still scores.
      if (!(e instanceof ScoringInputError)) throw e;
      adjusted.push({ judgeId: m.judgeId, attemptSeq: attempt.seq, label: "Trick score", given: Number.NaN, used: null, problem: "unreadable", step: 0, min: 0, max: 0 });
    }
  }
  return panelScore(model, inputs, panelJudgeIds);
}

/** Scores one rider in one heat (doc 03 §4). */
export function computeRider(
  model: ScoringModel,
  rider: RiderInput,
  panelJudgeIds: string[],
  maxRaw: number | null = maxRawFor(model),
): RiderResult {
  const d = model.panel.decimals;
  const status = riderStatus(rider);
  const modifiers = rider.modifiers ?? [];
  const keepsScores = status === "ok" || (status === "DNF" && model.modifiers.dnf.keepScores);

  const adjusted: AdjustedMark[] = [];
  const live = rider.attempts.filter((a) => !a.deleted).sort((a, b) => a.seq - b.seq);
  const cap = model.heat.maxAttemptsPerRider;
  const repeats = repeatIndexes(live);
  const dupes = new Map<number, number>();
  for (const a of flagPossibleDuplicates(live, model.heat.duplicateWindowSec)) {
    if (a.possibleDuplicateOf !== undefined) dupes.set(a.seq, a.possibleDuplicateOf);
  }

  const eligible: EligibleTrick[] = [];
  const uncategorised: number[] = [];
  const perCategory = model.heat.counting.type === "best_per_category";

  const allAttempts: AttemptResult[] = live.map((a, i) => {
    const r: AttemptResult = {
      seq: a.seq,
      status: a.status,
      trickName: a.trickName ?? null,
      categoryKey: a.categoryKey ?? null,
      panel: null,
      score: null,
      counted: false,
      repeatIndex: repeats.get(a.seq)?.repeatIndex ?? 0,
      priorCrashesSameTrick: repeats.get(a.seq)?.priorCrashesSameTrick ?? 0,
    };
    if (dupes.has(a.seq)) r.possibleDuplicateOf = dupes.get(a.seq);

    if (cap !== null && i >= cap) {
      r.ignored = "over_cap";
      return r;
    }
    if (a.status === "crashed") {
      if (model.trick.crash === "zero") {
        r.score = 0;
        eligible.push({ seq: a.seq, score: 0, categoryKey: r.categoryKey, trickName: r.trickName, landed: false });
      }
      r.ignored = "crashed";
      return r;
    }
    if (model.trick.entry === "none") {
      r.ignored = "no_score";
      return r;
    }
    r.panel = attemptPanel(model, a, panelJudgeIds, adjusted);
    if (r.panel.judgeScores.some((j) => j.detail?.sensorMissing)) r.sensorMissing = true;
    r.score = r.panel.score;
    if (r.score === null) {
      r.ignored = "no_score";
      return r;
    }
    if (perCategory && r.categoryKey === null) uncategorised.push(a.seq);
    eligible.push({ seq: a.seq, score: r.score, categoryKey: r.categoryKey, trickName: r.trickName, landed: true });
    r.ignored = "not_selected";
    return r;
  });

  // Counting and interference.
  const interference = model.modifiers.interference;
  const intCount = modifiers.filter((m) => m.type === "INT").length;
  const effectiveInt = interference.allowMultiple ? intCount : Math.min(1, intCount);

  let counted = keepsScores ? selectCounted(model, eligible) : [];
  // countedWeights apply in rank order (best first); rounding happens on the weighted sum (decision 1).
  const weights = model.heat.countedWeights;
  const sumScores = (list: EligibleTrick[]) => roundHalfUp(list.reduce((s, t, i) => s + t.score * (weights?.[i] ?? 1), 0), d);
  const tricks = roundHalfUp(model.heat.trickWeight * sumScores(counted), d);

  const dropped: number[] = [];
  if (interference.penalty === "drop_best_trick") {
    let pool = eligible;
    for (let k = 0; k < effectiveInt && counted.length > 0; k++) {
      const best = counted[0].seq;
      dropped.push(best);
      pool = pool.filter((t) => t.seq !== best);
      counted = selectCounted(model, pool);
    }
  }
  const tricksAfterDrop = roundHalfUp(model.heat.trickWeight * sumScores(counted), d);

  // Impression.
  let impression: PanelScore | null = null;
  let impressionPts = 0;
  const imp = model.heat.impression;
  if (imp) {
    const onPanel = new Set(panelJudgeIds);
    const marks: Array<{ judgeId: string; score: number | "missed" }> = [];
    for (const m of rider.impressionMarks ?? []) {
      if (!onPanel.has(m.judgeId)) continue;
      if (m.value === "missed") {
        marks.push({ judgeId: m.judgeId, score: "missed" });
        continue;
      }
      const n = nearestOnScale(m.value, imp.scale);
      if (n.problem) adjusted.push({ judgeId: m.judgeId, attemptSeq: null, label: imp.label, given: m.value, used: n.value, problem: n.problem, step: imp.scale.step, min: imp.scale.min, max: imp.scale.max });
      if (n.value !== null) marks.push({ judgeId: m.judgeId, score: n.value });
    }
    impression = panelScore(model, marks, panelJudgeIds, imp.scale);
    if (keepsScores) impressionPts = roundHalfUp(imp.weight * (impression.score ?? 0), d);
  }

  // Height bonus.
  let bonus = 0;
  const hs = model.heightSensor;
  if (keepsScores && hs.enabled && hs.use === "bonus" && hs.bonus) {
    const heights = live
      .slice(0, cap ?? undefined)
      .filter((a) => a.status === "landed" && typeof a.heightM === "number")
      .map((a) => a.heightM as number);
    const maxH = rider.maxHeightM ?? (heights.length > 0 ? Math.max(...heights) : null);
    if (maxH !== null) {
      bonus = roundHalfUp(Math.min(hs.bonus.capPoints, hs.bonus.perMetreAbove * Math.max(0, maxH - hs.bonus.thresholdM)), d);
    }
  }

  // Penalty.
  let penalty = 0;
  if (keepsScores && effectiveInt > 0) {
    if (interference.penalty === "drop_best_trick") {
      penalty = roundHalfUp(tricks - tricksAfterDrop, d);
    } else if (interference.penalty === "percent") {
      penalty = roundHalfUp((effectiveInt * (interference.value ?? 0) * (tricks + impressionPts + bonus)) / 100, d);
    } else if (interference.penalty === "points") {
      penalty = roundHalfUp(effectiveInt * (interference.value ?? 0), d);
    }
  }

  const unroundedTotal = keepsScores ? tricks + impressionPts + bonus - penalty : 0;
  const total = Math.max(0, roundHalfUp(unroundedTotal, d)); // decision 5: never below 0

  // Mark counted / dropped / rider-status attempts.
  const countedSeqs = new Set(counted.map((t) => t.seq));
  for (const a of allAttempts) {
    if (countedSeqs.has(a.seq)) {
      a.counted = true;
      delete a.ignored;
    } else if (dropped.includes(a.seq)) {
      a.ignored = "interference_dropped";
    } else if (!keepsScores && a.ignored !== "over_cap") {
      a.ignored = "rider_status";
    }
  }

  const noScore = status === "DNS" || status === "DSQ";
  const withinCap = allAttempts.filter((a) => a.ignored !== "over_cap");

  return {
    riderId: rider.riderId,
    status,
    total,
    unroundedTotal,
    totalLabel: noScore ? "—" : formatScore(total, d),
    percent:
      !noScore && maxRaw !== null && model.heat.total.display !== "raw" ? roundHalfUp((total / maxRaw) * 100, d) : null,
    components: { tricks, impression: impressionPts, bonus, penalty },
    counted: counted.map((t) => ({ attemptSeq: t.seq, score: t.score, categoryKey: t.categoryKey })),
    allAttempts,
    impression,
    landedCount: withinCap.filter((a) => a.status === "landed").length,
    attemptCount: live.length,
    attemptCap: cap,
    interferenceCount: intCount,
    flags: {
      incomplete: withinCap.some((a) => a.panel?.incomplete) || (impression?.incomplete ?? false),
      outliers: allAttempts.filter((a) => a.panel?.outlier).map((a) => a.seq),
      extraAttemptsIgnored: allAttempts.some((a) => a.ignored === "over_cap"),
      sensorMissing: allAttempts.filter((a) => a.sensorMissing).map((a) => a.seq),
      uncategorised,
    },
    modifiers,
    adjustedMarks: adjusted,
  };
}

/** Marks from judges not on the panel (attempts and impressions, deleted attempts excluded). */
function marksFromOffPanel(input: HeatInput): IgnoredMark[] {
  const onPanel = new Set(input.panelJudgeIds);
  const out: IgnoredMark[] = [];
  for (const r of input.riders) {
    for (const a of [...r.attempts].sort((x, y) => x.seq - y.seq)) {
      if (a.deleted) continue;
      for (const m of a.marks) {
        if (!onPanel.has(m.judgeId)) out.push({ judgeId: m.judgeId, riderId: r.riderId, attemptSeq: a.seq });
      }
    }
    for (const m of r.impressionMarks ?? []) {
      if (!onPanel.has(m.judgeId)) out.push({ judgeId: m.judgeId, riderId: r.riderId, attemptSeq: null });
    }
  }
  return out;
}

function publishBlockers(model: ScoringModel, riders: RiderResult[]): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  for (const r of riders) {
    if (r.status === "DNS" || r.status === "DSQ") continue;
    if (model.panel.requireAllJudges) {
      for (const a of r.allAttempts) {
        if (a.status !== "landed" || a.ignored === "over_cap" || !a.panel) continue;
        for (const judge of a.panel.missing) {
          out.push({ type: "score_missing", judge, rider: r.riderId, attemptSeq: a.seq });
        }
      }
    }
    if (model.heat.impression?.required && r.impression) {
      for (const judge of r.impression.missing) out.push({ type: "impression_missing", judge, rider: r.riderId });
    }
  }
  return out;
}

/**
 * Scores and ranks a whole heat. Totals are always returned (live scores keep flowing);
 * `publishBlockers` lists what must be fixed (or overridden by the head judge) before publishing;
 * `ignoredMarksFrom` lists marks from judges not on the panel (excluded from the maths).
 */
export function computeHeat(model: ScoringModel, input: HeatInput): HeatResult {
  const maxRaw = maxRawFor(model);
  const riders = input.riders.map((r) => computeRider(model, r, input.panelJudgeIds, maxRaw));
  const ranking = rankHeat(model, riders, input.headJudgeDecisions ?? []);

  const blockers = publishBlockers(model, riders);
  const tiedPlaces = new Map<number, string[]>();
  for (const r of ranking) {
    if (r.tieUnresolved) tiedPlaces.set(r.place, [...(tiedPlaces.get(r.place) ?? []), r.riderId]);
  }
  for (const ids of tiedPlaces.values()) blockers.push({ type: "tie_unresolved", riders: ids });

  return { riders, ignoredMarksFrom: marksFromOffPanel(input), ranking, publishBlockers: blockers, maxRaw };
}
